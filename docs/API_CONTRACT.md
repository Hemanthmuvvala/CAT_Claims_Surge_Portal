# API contract — INS-04 · CAT Claims Surge Portal
<!-- Contract-first. Define this BEFORE writing endpoints. Expand well beyond this stub. -->

```yaml
openapi: 3.0.3
info:
  title: INS-04 — CAT Claims Surge Portal
  version: 0.1.0
servers:
  - url: http://localhost:3000/api
# All non-auth routes require a Bearer JWT. Enforce per-user/per-tenant isolation.
security:
  - bearerAuth: []
paths:
  /auth/login:
    post:
      summary: Get a JWT
      security: []
      responses:
        '200': { description: OK }
  /events:
    get:
      summary: List events (scoped to the caller)
      responses:
        '200': { description: OK }
        '401': { description: Unauthorized }
    post:
      summary: Create a event
      responses:
        '201': { description: Created }
        '400': { description: Validation error }
  /events/{id}:
    get:
      summary: Get one event
      responses:
        '200': { description: OK }
        '403': { description: Forbidden (not yours) }
        '404': { description: Not found }
  # TODO: add the endpoints your functional requirements need
  #       (the AI endpoint(s), status/decision routes, review/override, etc.)
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    Event:
      type: object
      properties:
        id: { type: string }
        type: { type: string }
        region: { type: string }
        declaredAt: { type: string }
```

## Contract rules
- Validate every input; return **structured** errors (code + message), never a raw stack trace.
- Any operation that moves money or changes a record must be **idempotent** (no double-submit).
- Decide **sync vs async** on purpose and say why in `ARCHITECTURE` notes.
