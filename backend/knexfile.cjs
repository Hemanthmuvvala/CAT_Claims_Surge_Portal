// Knex CLI configuration (CommonJS so the knex CLI can load it directly).
require("dotenv").config();

module.exports = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: "./src/db/migrations", tableName: "knex_migrations" },
    seeds: { directory: "./src/db/seeds" },
  },
  production: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: "./src/db/migrations", tableName: "knex_migrations" },
    seeds: { directory: "./src/db/seeds" },
  },
};
