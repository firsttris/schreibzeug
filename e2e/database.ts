/**
 * The database the E2E server runs on: created fresh by server.ts, read by the screenshots to pin
 * the dates they show. E2E_DATABASE_URL is a PostgreSQL user that may create databases.
 */
export const adminUrl = process.env.E2E_DATABASE_URL ?? "postgres://stapel:stapel@localhost:5432/stapel";

export const E2E_DATABASE = "stapel_e2e";

export const e2eDatabaseUrl = (): string => {
  const url = new URL(adminUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
};
