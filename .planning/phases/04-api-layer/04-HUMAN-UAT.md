---
status: partial
phase: 04-api-layer
source: [04-VERIFICATION.md]
started: 2026-04-11T23:59:27Z
updated: 2026-04-11T23:59:27Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live server start/stop verification

expected: Start `cibi-api`, verify:
- `POST /check` with `{"amount": -1}` returns 400 `{"error":"..."}` (not 500, not HTML)
- `POST /check` with `{bad json}` returns 400 `{"error":"..."}` (not 500)
- `GET /docs` returns 200 with OpenAPI YAML content
- Sending SIGTERM causes server to exit cleanly within 10 seconds with "Server stopped cleanly." in log

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
