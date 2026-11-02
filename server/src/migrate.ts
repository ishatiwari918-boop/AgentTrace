import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
  if (!sql.trim()) throw new Error("schema.sql is empty");
  await pool.query(sql);
  console.log("Schema applied");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});