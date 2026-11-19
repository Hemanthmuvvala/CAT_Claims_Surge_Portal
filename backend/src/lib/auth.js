import { verifyJwt } from "./jwt.js";
import { config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * Auth middleware.
 *
 * Preferred: `Authorization: Bearer <jwt>` (issued by POST /api/auth/login).
 * The token is verified, the user reloaded from the database so revoked/changed
 * roles take effect, and `req.caller` is populated.
 *
 * Prototype fallback (kept so the test harness and scripted demos work without
 * logging in): `x-demo-role` / `x-demo-user` / `x-demo-policy` headers.
 *
 * req.caller = { id, role, policyId, name, email, adjusterId }
 */
export async function authMiddleware(req, res, next) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (token) {
    const claims = verifyJwt(token, config.jwtSecret);
    if (claims?.sub) {
      const { db } = await import("../lib/db.js");
      const user = await db("users").where("id", claims.sub).first();
      if (user) {
        req.caller = {
          id: user.id,
          role: user.role,
          policyId: user.policy_id ?? claims.policyId ?? null,
          name: user.name,
          email: user.email,
          adjusterId: user.resource_id ?? claims.adjusterId ?? null,
        };
        req.authToken = token;
        return next();
      }
    }
    // A bearer token was presented but is invalid/expired/unknown: reject
    // rather than silently degrading to a privileged demo identity. The demo
    // header path stays available when scripts opt in explicitly.
    if (!req.header("x-demo-role") && !req.header("x-demo-user")) {
      return next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
    }
  }
  // Demo-header fallback (same shape the JWT path produces).
  const role = (req.header("x-demo-role") || process.env.DEMO_DEFAULT_ROLE || "manager").toLowerCase();
  const id = req.header("x-demo-user") || "demo-user";
  const policyId = req.header("x-demo-policy") || "POL-77341-A";
  req.caller = {
    id,
    role: ["manager", "adjuster", "policyholder"].includes(role) ? role : "manager",
    policyId,
    name: id,
    email: null,
    adjusterId: req.header("x-demo-adjuster") || null,
  };
  next();
}

/** Route guard: requireRole('manager'). */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.caller?.role)) {
      return next(new AppError(403, "FORBIDDEN", `Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}
