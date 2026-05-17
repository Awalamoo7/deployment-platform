import pg from "pg";
import { randomUUID } from "node:crypto";

const pool = new pg.Pool({
  host: process.env["DB_HOST"] ?? "localhost",
  port: Number(process.env["DB_PORT"] ?? 5432),
  user: process.env["DB_USER"] ?? "postgres",
  password: process.env["DB_PASSWORD"] ?? "postgres",
  database: process.env["DB_NAME"] ?? "deployments",
});

export function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export function uuid(): string {
  return randomUUID();
}

export async function initDB(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id UUID PRIMARY KEY,
      repo_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      container_id TEXT,
      port INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS logs (
      id UUID PRIMARY KEY,
      deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}
