import { Router } from "express";
import { query, uuid } from "./db.js";
import { deployRepo, stopDeployment } from "./deployer.js";

const router = Router();

router.post("/api/deploy", async (req, res) => {
  const { repo_url } = req.body as { repo_url?: string };

  if (!repo_url) {
    res.status(400).json({ error: "repo_url is required" });
    return;
  }

  const id = uuid();
  await query(
    "INSERT INTO deployments (id, repo_url, status) VALUES ($1, $2, 'queued')",
    [id, repo_url]
  );

  deployRepo(id, repo_url).catch(() => {});

  res.status(201).json({ id, status: "queued" });
});

router.get("/api/deployments", async (_req, res) => {
  const result = await query(
    "SELECT * FROM deployments ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

router.get("/api/deployments/:id/logs", async (req, res) => {
  const result = await query(
    "SELECT * FROM logs WHERE deployment_id = $1 ORDER BY created_at ASC",
    [req.params["id"]]
  );
  res.json(result.rows);
});

router.delete("/api/deployments/:id", async (req, res) => {
  const id = req.params["id"]!;

  try {
    await stopDeployment(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
    return;
  }

  const result = await query("SELECT * FROM deployments WHERE id = $1", [id]);
  res.json(result.rows[0]);
});

export default router;
