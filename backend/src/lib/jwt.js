// Minimal HS256 JWT sign/verify built on node:crypto — no external dependency.
// Tokens are short-lived (config.jwtExpiresIn) and carry only identity claims.

import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signJwt(payload, secret, expiresIn = "8h") {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + parseDuration(expiresIn), ...payload };
  const head = b64url(JSON.stringify(header));
  const data = `${head}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseDuration(s) {
  const m = /^(\d+)([smh])?$/.exec(String(s).trim());
  if (!m) return 8 * 3600;
  const n = Number(m[1]);
  return { s: n, m: n * 60, h: n * 3600 }[m[2] ?? "s"];
}
