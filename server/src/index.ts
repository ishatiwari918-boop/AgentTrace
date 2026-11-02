import "dotenv/config";
import express from "express";
import { pool } from "./db";
import ingest from "./ingest";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(500).json({ status: "error", db: "down" });
  }
});

app.use(ingest);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`AgentTrace server on :${port}`));