// Structured errors: every failure leaves the API as { code, message, details }.

export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new AppError(401, "UNAUTHORIZED", message);
export const notFound = (message = "Resource not found") => new AppError(404, "NOT_FOUND", message);
export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "FORBIDDEN", message);
export const conflict = (message, details) => new AppError(409, "CONFLICT", message, details);
export const serviceUnavailable = (message, details) =>
  new AppError(503, "SERVICE_UNAVAILABLE", message, details);

export function notFoundMiddleware(req, res) {
  res.status(404).json({ code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
  }
  // Zod validation errors → 400 with field details.
  if (err?.name === "ZodError") {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  // Never leak stack traces to clients.
  console.error("[unhandled]", err);
  return res.status(500).json({ code: "INTERNAL_ERROR", message: "Something went wrong on our side" });
}
