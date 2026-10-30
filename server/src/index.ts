import "dotenv/config";
import express from "express";
import { Pool } from "pg";

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(500).json({ status: "error", db: "down" });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`AgentTrace server on :${port}`));