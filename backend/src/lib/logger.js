import pino from "pino";
import { config } from "./config.js";

// Structured logging. PII (contact name/email, descriptions) is redacted so it
// never lands in logs — the brief requires PII masking.
const redactPaths = [
  "req.body.contactEmail",
  "req.body.contact_email",
  "req.body.contactName",
  "req.body.contact_name",
  "req.body.description",
  "*.contactEmail",
  "*.contact_email",
];

export const logger = pino({
  level: config.isProd ? "info" : "debug",
  redact: { paths: redactPaths, censor: "[PII redacted]" },
  base: { service: "cat-claims-api" },
});
