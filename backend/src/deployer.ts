import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { query, uuid } from "./db.js";

const execAsync = promisify(exec);

async function addLog(deploymentId: string, message: string): Promise<void> {
  await query(
    "INSERT INTO logs (id, deployment_id, message) VALUES ($1, $2, $3)",
    [uuid(), deploymentId, message]
  );
}

async function updateStatus(
  deploymentId: string,
  status: string,
  containerId?: string,
  port?: number
): Promise<void> {
  await query(
    `UPDATE deployments
     SET status = $1, container_id = $2, port = $3, updated_at = NOW()
     WHERE id = $4`,
    [status, containerId ?? null, port ?? null, deploymentId]
  );
}

const PORT_RANGE_START = parseInt(process.env["PORT_RANGE_START"] ?? "3001", 10);
const PORT_RANGE_END = parseInt(process.env["PORT_RANGE_END"] ?? "4999", 10);

async function findFreePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
    if (available) return port;
  }
  throw new Error(`No free port available in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

export async function deployRepo(
  deploymentId: string,
  repoUrl: string
): Promise<void> {
  let tmpDir: string | undefined;

  try {
    await updateStatus(deploymentId, "building");
    await addLog(deploymentId, `Starting deployment for ${repoUrl}`);

    tmpDir = await mkdtemp(join(tmpdir(), "deploy-"));
    const repoDir = join(tmpDir, "repo");

    await addLog(deploymentId, "Cloning repository...");
    await execAsync(`git clone ${repoUrl} ${repoDir}`);
    await addLog(deploymentId, "Repository cloned");

    const imageName = `deploy-${deploymentId}`;
    await addLog(deploymentId, "Building Docker image...");
    await execAsync(`docker build -t ${imageName} ${repoDir}`);
    await addLog(deploymentId, "Docker image built");

    const port = await findFreePort();
    await addLog(deploymentId, `Starting container on port ${port}...`);
    const { stdout } = await execAsync(
      `docker run -d -p ${port}:3000 --name ${imageName} ${imageName}`
    );
    const containerId = stdout.trim();

    await updateStatus(deploymentId, "running", containerId, port);
    await addLog(deploymentId, `Container running: ${containerId} on port ${port}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateStatus(deploymentId, "failed");
    await addLog(deploymentId, `Deployment failed: ${message}`);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function stopDeployment(deploymentId: string): Promise<void> {
  const result = await query(
    "SELECT container_id FROM deployments WHERE id = $1",
    [deploymentId]
  );

  const row = result.rows[0] as { container_id: string | null } | undefined;
  if (!row?.container_id) {
    throw new Error("No running container found for this deployment");
  }

  const containerId = row.container_id;
  await execAsync(`docker stop ${containerId}`);
  await execAsync(`docker rm ${containerId}`);
  await updateStatus(deploymentId, "stopped");
  await addLog(deploymentId, "Container stopped and removed");
}
