import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export function runMigrations(connection) {
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  let current = Number(
    connection.prepare("PRAGMA user_version").get().user_version,
  );

  for (const file of files) {
    const version = Number.parseInt(file.split("_")[0], 10);

    if (!Number.isInteger(version) || version <= current) {
      continue;
    }

    connection.exec("BEGIN IMMEDIATE;");

    try {
      connection.exec(readFileSync(join(migrationsDir, file), "utf8"));
      connection.exec(`PRAGMA user_version = ${version};`);
      connection.exec("COMMIT;");
      current = version;
    } catch (error) {
      connection.exec("ROLLBACK;");
      throw error;
    }
  }

  return current;
}
