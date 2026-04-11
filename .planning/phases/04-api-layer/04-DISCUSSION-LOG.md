# Phase 4: API Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 04-api-layer
**Areas discussed:** Legacy cleanup, Handler location, OpenAPI docs, Error shape

---

## Legacy Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Delete + rewrite | Remove legacy packages entirely; new handlers use only internal/service | ✓ |
| Keep + extend | Leave legacy handlers, add new handlers for missing routes; two stacks coexist | |
| Migrate in place | Update legacy handlers to call internal/service; keep handlers/ package | |

**User's choice:** Delete + rewrite
**Notes:** handlers/, repos/, services/ root packages deleted; app.go legacy wiring removed.

---

## Handler Location

| Option | Description | Selected |
|--------|-------------|----------|
| internal/handler/ | Dedicated package, reusable by any cmd/*, consistent with internal/ layering | ✓ |
| cmd/cibi-api/ inline | Handler files alongside main.go; simpler but tightly coupled to one binary | |

**User's choice:** internal/handler/
**Notes:** Consistent with internal/service and internal/repo pattern.

---

## OpenAPI Docs

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-authored YAML | Write openapi.yaml once, embed and serve at /docs; no codegen step | ✓ |
| swaggo/swag annotations | Annotate handlers, run swag init; spec auto-syncs but adds build step and clutter | |

**User's choice:** Hand-authored YAML
**Notes:** Web dashboard (Phase 5) reads the file for type generation.

---

## Error Shape

| Option | Description | Selected |
|--------|-------------|----------|
| {"error":"msg"} simple | Minimal flat error; HTTP status carries semantic | ✓ |
| {"code":"...","message":"..."} | Machine-readable error code + human message | |
| {"error":"msg","field":"..."} | Flat error + optional field name for validation errors | |

**User's choice:** {"error":"msg"} simple
**Notes:** Sufficient for a personal tool; consistent error handler on Echo.

---

## Claude's Discretion

- Exact JSON field names in request/response structs
- Specific validator tags
- HTTP status codes for edge cases
- Whether GET /accounts/default endpoint is included

## Deferred Ideas

- Route versioning (/v1/ prefix)
- Pagination on list endpoints
- Authentication middleware
