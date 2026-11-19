import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { db, closeDb } from "./lib/db.js";
import { errorMiddleware, notFoundMiddleware } from "./lib/errors.js";
import { authMiddleware } from "./lib/auth.js";
import { api } from "./routes/api.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger, redact: { paths: ["req.body.contactEmail", "req.body.contactName", "req.body.description"], censor: "[PII redacted]" } }));
app.use(authMiddleware);

app.use("/api", api);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const server = app.listen(config.port, () => {
  logger.info(`CAT Claims API listening on http://localhost:${config.port} (${config.env})`);
});

async function shutdown() {
  logger.info("Shutting down…");
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app, db };
