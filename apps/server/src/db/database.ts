import { Database as SQLite } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * A transaction or the database itself: repository functions accept either. bun:sqlite is
 * synchronous, and so are its transactions (drizzle-orm/bun-sqlite session.js): what runs in one
 * must not await anything.
 */
export type Queryable = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Connection = { db: Database; close: () => void };

/**
 * Opens the SQLite file, creating it and its folder if needed. WAL lets reads go on while one
 * write runs; SQLite checks foreign keys only when asked to.
 */
export const connect = (path: string): Connection => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new SQLite(path, { create: true, strict: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
};

const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");

/** Brings the schema up to date; drizzle records applied migrations in its own table. */
export const migrateDatabase = (db: Database): void => migrate(db, { migrationsFolder });
