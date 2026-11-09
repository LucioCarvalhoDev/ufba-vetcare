import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

export function openConnection(filename) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const connection = new DatabaseSync(filename);
  connection.exec("PRAGMA foreign_keys = ON;");
  connection.exec("PRAGMA busy_timeout = 5000;");
  connection.exec("PRAGMA synchronous = NORMAL;");

  if (filename !== ":memory:") {
    connection.exec("PRAGMA journal_mode = WAL;");
  }

  runMigrations(connection);

  return connection;
}
