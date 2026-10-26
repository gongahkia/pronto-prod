import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../src/lib/db";

async function main() {
  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const pool = getPool();
  const db = await pool.connect();
  try {
    // All statements in a transaction must use one checked-out connection.
    // Serialize migration processes without involving web/worker startup.
    await db.query("select pg_advisory_lock(hashtextextended('pronto:migrations',0))");
    await db.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of files) {
      const exists = await db.query(
        "select 1 from schema_migrations where filename = $1",
        [file],
      );
      if (exists.rowCount) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into schema_migrations (filename) values ($1)", [
          file,
        ]);
        await db.query("commit");
        console.log(`applied ${file}`);
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }

  } finally {
    await db.query("select pg_advisory_unlock(hashtextextended('pronto:migrations',0))").catch(() => {});
    db.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
