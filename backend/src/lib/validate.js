// Zod validation helper: parses req.body / req.params / req.query against the
// given schemas and attaches parsed values, or throws a structured 400.
export function validate({ body, params, query } = {}) {
  return (req, _res, next) => {
    try {
      if (body) req.validatedBody = body.parse(req.body ?? {});
      if (params) req.validatedParams = params.parse(req.params ?? {});
      if (query) req.validatedQuery = query.parse(req.query ?? {});
      next();
    } catch (err) {
      err.status = 400;
      next(err); // errorMiddleware converts ZodError into {code: VALIDATION_ERROR}
    }
  };
}
