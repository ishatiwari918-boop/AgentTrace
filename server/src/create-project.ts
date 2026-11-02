import "dotenv/config";
import { randomBytes, createHash } from "crypto";
import { Pool } from "pg";

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('Usage: npm run create-project -- "Project name"');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const key = "at_" + randomBytes(24).toString("hex");
  const keyHash = createHash("sha256").update(key).digest("hex");

  const project = await pool.query(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  );
  const projectId = project.rows[0].id;

  await pool.query(
    "INSERT INTO api_keys (project_id, key_hash, key_prefix) VALUES ($1, $2, $3)",
    [projectId, keyHash, key.slice(0, 7)]
  );

  console.log(`Project "${name}" created (id ${projectId})`);
  console.log(`API key (shown once, save it): ${key}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});