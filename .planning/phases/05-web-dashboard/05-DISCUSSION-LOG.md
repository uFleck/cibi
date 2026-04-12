# Phase 5: Web Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 05-web-dashboard
**Areas discussed:** Scaffold location & serving, Dashboard layout, Verdict card interaction, Recurring transactions display

---

## Scaffold location & serving

| Option | Description | Selected |
|--------|-------------|----------|
| `web/` at repo root | web/package.json, web/src/, web/vite.config.ts. Go serves built dist/ as static files. | ✓ |
| Separate repo | Frontend in its own git repo (cibi-web). | |

**User's choice:** `web/` at repo root

---

## Dev API connection

| Option | Description | Selected |
|--------|-------------|----------|
| Vite proxy | vite.config.ts proxies /api/* to localhost:8080. No CORS needed. | ✓ |
| Direct fetch + CORS | Frontend calls http://localhost:8080 directly. Requires CORS middleware. | |
| VITE_API_URL env var | Frontend reads import.meta.env.VITE_API_URL. | |

**User's choice:** Vite proxy

---

## Production serving

| Option | Description | Selected |
|--------|-------------|----------|
| Go serves dist/ as static files | //go:embed web/dist in cmd/cibi-api. One binary, one port. | ✓ |
| Vite preview / nginx | Run on a separate port. | |

**User's choice:** Go embeds and serves `web/dist`

---

## API route prefix

| Option | Description | Selected |
|--------|-------------|----------|
| Add /api prefix to Go routes | All routes become /api/accounts, /api/check, etc. Frontend uses same URLs in dev + prod. | ✓ |
| Keep routes as-is, use proxy rewrite | Vite rewrites /api/accounts → /accounts in dev. Messier in prod. | |

**User's choice:** Add `/api/` prefix to all Go routes

---

## Dashboard structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single page, everything visible | Balance summary → check widget → transactions list. No nav. | ✓ |
| Two routes: dashboard + transactions | / for summary, /transactions for full list. | |

**User's choice:** Single page

---

## Balance display

| Option | Description | Selected |
|--------|-------------|----------|
| 3 stat cards side by side | shadcn/ui Card, responsive grid, one per metric. | ✓ |
| Single hero number with breakdown | Large liquid amount up top, smaller secondary info. | |

**User's choice:** 3 stat cards

---

## Verdict card appearance

| Option | Description | Selected |
|--------|-------------|----------|
| Replaces input section inline | Input animates out, verdict card animates in. "Check another" returns to idle. | ✓ |
| Verdict overlays as modal/sheet | Input stays visible, verdict slides up as sheet. | |

**User's choice:** Inline state machine (idle ↔ verdict)

---

## Verdict animation

| Option | Description | Selected |
|--------|-------------|----------|
| Scale + fade in, color flash | 0.8→1.0 scale, 0→1 opacity, brief green/red pulse, under 400ms. | ✓ |
| Slide up from bottom | Card slides up into position. | |
| Flip / reveal | Card flips like a coin. | |

**User's choice:** Scale + fade + color flash

---

## Loading state

| Option | Description | Selected |
|--------|-------------|----------|
| Button spinner, input disabled | CHECK button shows spinner. Simple, appropriate for <100ms API. | ✓ |
| Full card skeleton | Skeleton placeholder animates in. Overengineers a sub-100ms call. | |

**User's choice:** Button spinner

---

## Recurring transactions display

| Option | Description | Selected |
|--------|-------------|----------|
| Compact table/list | Rows: description, amount, next date. Sorted by next_occurrence. Total footer. | ✓ |
| Cards per transaction | shadcn Card per transaction. More space, shows frequency. | |
| Grouped by pay period | Grouped under 'Before next payday' / 'Next period'. | |

**User's choice:** Compact table/list with total footer

---

## Transaction row fields

| Option | Description | Selected |
|--------|-------------|----------|
| Description + amount + next date | Minimum useful info. Compact rows. | ✓ |
| Description + amount + next date + frequency | Adds '(monthly)' label. Longer rows. | |

**User's choice:** Description + amount + next date

---

## Polling interval

| Option | Description | Selected |
|--------|-------------|----------|
| 30 seconds | Frequent enough to catch CLI changes. Silent. | ✓ |
| 5 seconds | Near-realtime. Unnecessary for personal local tool. | |
| On focus only | refetchOnWindowFocus only. No background polling. | |

**User's choice:** 30 seconds with refetchOnWindowFocus: true
