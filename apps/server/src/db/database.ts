import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** A transaction or the database itself: repository functions accept either. */
export type Queryable = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Connection = { db: Database; close: () => Promise<void> };

export const connect = (url: string): Connection => {
  const client = postgres(url, { onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
};

const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");

/** Brings the schema up to date; drizzle records applied migrations in its own table. */
export const migrateDatabase = (db: Database): Promise<void> => migrate(db, { migrationsFolder });
