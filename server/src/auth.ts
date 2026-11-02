import { createHash } from "crypto";
import { Request, Response, NextFunction } from "express";
import { pool } from "./db";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!key) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const keyHash = createHash("sha256").update(key).digest("hex");
  const result = await pool.query(
    "SELECT project_id FROM api_keys WHERE key_hash = $1",
    [keyHash]
  );

  if (result.rowCount === 0) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  res.locals.projectId = result.rows[0].project_id;
  next();
}