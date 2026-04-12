# Phase 5: Web Dashboard - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

React 19 + Vite 6 + TypeScript SPA scaffolded in `web/` at the repo root. Shows current balance, reserved funds, liquid amount, and upcoming recurring transactions pulled live from the API. Includes an animated "Can I Buy It?" check widget. No CRUD management views — read + check only. No auth (personal Tailscale use).

</domain>

<decisions>
## Implementation Decisions

### Scaffold Location
- **D-01:** Frontend lives in `web/` at the repo root with its own `package.json`, `vite.config.ts`, and `src/`. Keeps frontend clearly separated from Go code while living in the same repo.

### API Integration — Dev
- **D-02:** Vite dev server proxies `/api/*` to `http://localhost:8080` via `vite.config.ts` server.proxy. No CORS config needed on the Go server.
- **D-03:** All API routes on the Go server must be prefixed with `/api/` (e.g., `/api/accounts`, `/api/check`, `/api/transactions`). This updates Phase 4 routes and makes dev/prod URLs identical.

### API Integration — Production
- **D-04:** Go embeds the built frontend using `//go:embed all:web/dist` in `cmd/cibi-api/main.go`. Echo serves `web/dist` as static files on `/*`. Single binary, single port. The SPA root (`/`) and API (`/api/*`) coexist on port 8080.

### Dashboard Layout
- **D-05:** Single-page application — no client-side routing needed. TanStack Router is installed per WEB-02 but the dashboard is a single route (`/`).
- **D-06:** Page structure top-to-bottom: (1) 3 stat cards (Balance / Reserved / Liquid), (2) "Can I Buy It?" check widget, (3) Upcoming obligations list.

### Balance Display
- **D-07:** Three shadcn/ui `Card` components in a responsive grid — side by side on desktop, stacked on mobile. One card per metric: Current Balance, Reserved, Liquid.

### "Can I Buy It?" Check Widget
- **D-08:** Inline state machine — idle state shows amount input + CHECK button; verdict state replaces that section with the verdict card. "Check another" button returns to idle. No modal/overlay.
- **D-09:** While the `/api/check` call is in flight: CHECK button shows a spinner, input is disabled. No full skeleton (API is sub-100ms locally).
- **D-10:** Verdict card animation (Motion `motion/react`): scale 0.8→1.0 + opacity 0→1 on enter. Background briefly pulses green (YES) or red (NO) then settles to a softer tint. Total animation under 400ms.
- **D-11:** Verdict card shows: YES/NO label, purchasing power, buffer remaining, risk level. Risk levels (LOW/MEDIUM/HIGH/BLOCKED) color-coded.

### Recurring Transactions Display
- **D-12:** Compact table/list below the check widget. Rows sorted by `next_occurrence` ascending. No pagination (personal tool, <50 entries expected).
- **D-13:** Fields per row: description, formatted amount (e.g., `-$15.99`), next occurrence date (e.g., `Apr 15`). Frequency omitted to keep rows compact.
- **D-14:** Footer row shows total reserved amount.

### Data Polling
- **D-15:** TanStack Query `staleTime` + `refetchInterval` set to 30 seconds for balance/transactions data. Silent background refresh — no visible refresh indicator. `refetchOnWindowFocus: true` enabled.

### Claude's Discretion
- Exact shadcn/ui component variants (card elevation, border radius, color tokens)
- Tailwind v4 CSS-first `@theme` token names for brand colors
- Error state presentation when API is unreachable (toast vs inline message)
- Money formatting locale (assume en-US `$` prefix)
- Whether to show a "Next payday" date on the dashboard (pulls from `PaySchedule` via API if endpoint exists)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Read WEB-01, WEB-02, WEB-03, WEB-04 (Phase 5 requirements)
- `CIBI_SPEC.md` — Domain guidelines, reserved funds concept, purchasing power formula

### Prior Phase Context
- `.planning/phases/04-api-layer/04-CONTEXT.md` — API route shapes, error format `{"error": "..."}`, money encoding (float64), graceful shutdown
- `.planning/phases/01-foundation/01-CONTEXT.md` — App struct wiring, DB path

### Existing Code (read before planning)
- `internal/handler/` — Existing handlers; routes being updated to `/api/*` prefix in this phase
- `cmd/cibi-api/main.go` — Bootstrap file where `//go:embed web/dist` will be added

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield React scaffolding. No existing frontend code.

### Established Patterns (Go side)
- Echo HTTP server at port 8080 (from Phase 4)
- Money as float64 in JSON (D-06 from Phase 4 context)
- Error shape: `{"error": "human-readable message"}`
- `POST /check` body: `{"amount": 75.00}` → returns `CanBuy`, `PurchasingPower`, `BufferRemaining`, `RiskLevel`

### Integration Points
- `cmd/cibi-api/main.go` — Add `//go:embed all:web/dist` and Echo static file handler for `/*`
- `internal/handler/routes.go` (or equivalent) — Add `/api/` prefix to all existing routes
- `web/vite.config.ts` — Proxy `/api` → `http://localhost:8080`

</code_context>

<specifics>
## Specific Ideas

- The layout mockup confirmed during discussion: stat cards → check widget → obligations list (top to bottom)
- Verdict card animation: scale + fade + color pulse, under 400ms
- "Check another" button to return to idle state (not auto-dismiss)
- Total reserved footer in the obligations list

</specifics>

<deferred>
## Deferred Ideas

- Transaction CRUD management UI — belongs in a future phase if needed
- Multi-account selector on the dashboard
- PaySchedule / next payday display (can be added if the endpoint exists; Claude's discretion)

</deferred>

---

*Phase: 05-web-dashboard*
*Context gathered: 2026-04-12*
