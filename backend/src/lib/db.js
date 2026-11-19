import knex from "knex";
import { config } from "./config.js";

export const db = knex({
  client: "pg",
  connection: config.databaseUrl,
  pool: { min: 2, max: 10 },
  acquireConnectionTimeout: 8000,
});

export async function closeDb() {
  await db.destroy();
}
