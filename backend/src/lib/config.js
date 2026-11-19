import "dotenv/config";

const required = (key, fallback) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
};

export const config = {
  port: Number(required("PORT", 3001)),
  env: process.env.NODE_ENV ?? "development",
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/cat_claims"
  ),
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 70000),
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  demoDefaultRole: process.env.DEMO_DEFAULT_ROLE ?? "manager",
  isProd: process.env.NODE_ENV === "production",
};
