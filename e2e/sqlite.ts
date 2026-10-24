/**
 * Runs the statements on stdin ([{ sql, params }] as JSON) on the SQLite file named in the first
 * argument, in one transaction. Used by database.ts runSql.
 */
import { Database } from "bun:sqlite";

const [path] = process.argv.slice(2);
if (!path) throw new Error("Usage: bun sqlite.ts <database>");
const statements = JSON.parse(await Bun.stdin.text()) as {
  sql: string;
  params: Array<string | number | null>;
}[];
const db = new Database(path);
db.exec("PRAGMA busy_timeout = 5000;");
db.transaction(() => {
  for (const { sql, params } of statements) db.query(sql).run(...params);
})();
db.close();
