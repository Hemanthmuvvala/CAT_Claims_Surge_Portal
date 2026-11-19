// Password hashing with node:crypto scrypt — no external dependency.
// Stored format: scrypt$N$r$p$<salt-hex>$<hash-hex>.

import crypto from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  try {
    const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), hashHex.length / 2, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const expected = Buffer.from(hashHex, "hex");
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
