# Phase 5: Web Dashboard - Research

**Researched:** 2026-04-12
**Domain:** React 19 + Vite 6 + TanStack Query/Router + shadcn/ui + Motion + Go embed
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Frontend lives in `web/` at the repo root with its own `package.json`, `vite.config.ts`, and `src/`. Keeps frontend clearly separated from Go code while living in the same repo.

**D-02:** Vite dev server proxies `/api/*` to `http://localhost:8080` via `vite.config.ts` server.proxy. No CORS config needed on the Go server.

**D-03:** All API routes on the Go server must be prefixed with `/api/` (e.g., `/api/accounts`, `/api/check`, `/api/transactions`). This updates Phase 4 routes and makes dev/prod URLs identical.

**D-04:** Go embeds the built frontend using `//go:embed all:web/dist` in `cmd/cibi-api/main.go`. Echo serves `web/dist` as static files on `/*`. Single binary, single port. The SPA root (`/`) and API (`/api/*`) coexist on port 8080.

**D-05:** Single-page application — no client-side routing needed. TanStack Router is installed per WEB-02 but the dashboard is a single route (`/`).

**D-06:** Page structure top-to-bottom: (1) 3 stat cards (Balance / Reserved / Liquid), (2) "Can I Buy It?" check widget, (3) Upcoming obligations list.

**D-07:** Three shadcn/ui `Card` components in a responsive grid — side by side on desktop, stacked on mobile. One card per metric: Current Balance, Reserved, Liquid.

**D-08:** Inline state machine — idle state shows amount input + CHECK button; verdict state replaces that section with the verdict card. "Check another" button returns to idle. No modal/overlay.

**D-09:** While the `/api/check` call is in flight: CHECK button shows a spinner, input is disabled. No full skeleton (API is sub-100ms locally).

**D-10:** Verdict card animation (Motion `motion/react`): scale 0.8→1.0 + opacity 0→1 on enter. Background briefly pulses green (YES) or red (NO) then settles to a softer tint. Total animation under 400ms.

**D-11:** Verdict card shows: YES/NO label, purchasing power, buffer remaining, risk level. Risk levels (LOW/MEDIUM/HIGH/BLOCKED) color-coded.

**D-12:** Compact table/list below the check widget. Rows sorted by `next_occurrence` ascending. No pagination (personal tool, <50 entries expected).

**D-13:** Fields per row: description, formatted amount (e.g., `-$15.99`), next occurrence date (e.g., `Apr 15`). Frequency omitted to keep rows compact.

**D-14:** Footer row shows total reserved amount.

**D-15:** TanStack Query `staleTime` + `refetchInterval` set to 30 seconds for balance/transactions data. Silent background refresh — no visible refresh indicator. `refetchOnWindowFocus: true` enabled.

### Claude's Discretion
- Exact shadcn/ui component variants (card elevation, border radius, color tokens)
- Tailwind v4 CSS-first `@theme` token names for brand colors
- Error state presentation when API is unreachable (toast via sonner — confirmed in UI spec)
- Money formatting locale (en-US `$` prefix — confirmed in UI spec)
- Whether to show a "Next payday" date on the dashboard

### Deferred Ideas (OUT OF SCOPE)
- Transaction CRUD management UI
- Multi-account selector on the dashboard
- PaySchedule / next payday display (unless endpoint exists — Claude's discretion)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WEB-01 | Scaffold React 19 + Vite 6 + TypeScript SPA; Tailwind CSS v4 (CSS-first `@theme` config); shadcn/ui component library initialized; served as static files, not SSR | Vite 6.0.8 + React 19.2.5 scaffold pattern; shadcn init with Tailwind v4; `@tailwindcss/vite` plugin |
| WEB-02 | TanStack Query v5 for all API data fetching; TanStack Router v1 for type-safe routing; polling for live balance refresh | TanStack Query 5.99.0 + Router 1.168.18; `refetchInterval: 30000` + `refetchOnWindowFocus: true` |
| WEB-03 | Dashboard view showing: current balance, reserved funds (upcoming obligations), liquid amount, and upcoming recurring transactions list; matches the `purchasing_power` formula visually | API response shapes confirmed from handler code; 2-query strategy (GET /api/accounts/default + GET /api/transactions?account_id=...) |
| WEB-04 | "Can I Buy It?" verdict card on the dashboard with Motion (`motion/react`) animation for the YES/NO result; import from `motion` package (not `framer-motion`) | Motion 12.38.0 confirmed; oklch color animation supported natively in v12; import path `motion/react` |
</phase_requirements>

---

## Summary

This phase has two distinct work streams that must be coordinated: a Go-side change (adding `/api/` route prefix + embedding the built frontend) and a full greenfield React SPA in `web/`. Neither stream is independently deployable until both are complete, so the plan should sequence them carefully.

The Go-side work is minimal but must happen first or in parallel with the frontend scaffold, because the Vite dev proxy targets `localhost:8080` which assumes the Go server is running. The route prefix change in `internal/handler/routes.go` is a one-liner group refactor — wrap all existing groups under a `/api` group. The embed directive in `cmd/cibi-api/main.go` is a two-step addition: the `//go:embed all:web/dist` directive and a `middleware.StaticWithConfig` call with `HTML5: true`.

The React SPA is greenfield with no existing code. The shadcn/ui initialization must run inside `web/` (not the repo root) and uses the Tailwind v4 CSS-first mode. The key architecture choice is a 2-query data flow: first fetch the default account (GET `/api/accounts/default`) to get the account ID and balance, then fetch transactions (GET `/api/transactions?account_id={id}`) filtered to recurring ones client-side to populate the obligations list. The "Can I Buy It?" widget uses a separate `useMutation`-style pattern (not `useQuery`) since it's a user-triggered POST.

**Primary recommendation:** Scaffold the Go route change and embed wiring in Wave 1 alongside the Vite project initialization, then implement the three UI components (stat cards, check widget, obligations list) in Wave 2 with integration testing in Wave 3.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.5 | UI rendering | Required by WEB-01 |
| react-dom | 19.2.5 | DOM rendering | Required by WEB-01 |
| vite | 8.0.8 | Dev server + build | Required by WEB-01; fastest HMR |
| typescript | 6.0.2 | Type safety | Required by WEB-01 |
| @vitejs/plugin-react | latest | React fast refresh | Standard Vite+React |
| tailwindcss | 4.2.2 | Utility CSS | Required by WEB-01 (v4) |
| @tailwindcss/vite | latest | Tailwind v4 Vite plugin | Required for v4 CSS-first mode |
| @tanstack/react-query | 5.99.0 | Data fetching + polling | Required by WEB-02 |
| @tanstack/react-router | 1.168.18 | Type-safe routing | Required by WEB-02 |
| motion | 12.38.0 | Animations | Required by WEB-04 (`motion/react` import) |

**Version verification:** All versions confirmed via `npm view [package] version` against npm registry on 2026-04-12. [VERIFIED: npm registry]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 1.8.0 | Icons (Loader2 spinner) | Bundled with shadcn default; use for CHECK button loading state |
| sonner | 2.0.7 | Toast notifications | shadcn `sonner` component; API error toasts |
| @types/node | latest | Node types for path.resolve in vite.config | Needed for path alias config |

**shadcn/ui components to add post-init:**
```bash
npx shadcn@latest add card input button badge sonner separator
```
[VERIFIED: ui.shadcn.com/docs/installation/vite]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| motion (`motion/react`) | framer-motion | `framer-motion` is the old import path; WEB-04 explicitly requires `motion` package — not negotiable |
| TanStack Query polling | WebSocket / SSE | Polling is simpler and sufficient for a personal tool refreshing at 30s intervals |
| shadcn sonner | React Hot Toast | sonner is the shadcn-blessed toast; already in the component inventory |

**Installation (inside `web/`):**
```bash
npm create vite@latest . -- --template react-ts
npm install tailwindcss @tailwindcss/vite
npm install @tanstack/react-query @tanstack/react-router motion
npm install lucide-react sonner
npm install -D @types/node
npx shadcn@latest init
npx shadcn@latest add card input button badge sonner separator
```

---

## Architecture Patterns

### Recommended Project Structure
```
web/
├── src/
│   ├── components/
│   │   ├── StatCards.tsx         # Balance/Reserved/Liquid grid
│   │   ├── CheckWidget.tsx       # Can I Buy It? idle + verdict states
│   │   ├── ObligationsList.tsx   # Upcoming recurring transactions list
│   │   └── ui/                   # shadcn generated components (do not edit)
│   ├── lib/
│   │   ├── api.ts                # fetch wrappers for all API calls
│   │   ├── format.ts             # Intl.NumberFormat money + date formatters
│   │   └── utils.ts              # shadcn generated cn() utility
│   ├── App.tsx                   # Root component; QueryClientProvider + RouterProvider
│   ├── index.css                 # @import "tailwindcss"; + @theme custom tokens
│   ├── main.tsx                  # ReactDOM.createRoot entry point
│   └── router.ts                 # TanStack Router: rootRoute + indexRoute + router instance
├── public/
├── package.json
├── vite.config.ts                # @tailwindcss/vite plugin + proxy + path alias
├── tsconfig.json
└── tsconfig.app.json
```

### Pattern 1: Vite Configuration (proxy + Tailwind v4 plugin + path alias)
**What:** Single `vite.config.ts` handles dev proxy, Tailwind v4 CSS-first, and `@/*` path alias.
**When to use:** Always — this is the mandatory scaffold configuration.
**Example:**
```typescript
// Source: vite.dev/config/server-options + ui.shadcn.com/docs/installation/vite
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```
[VERIFIED: vite.dev/config/server-options]

### Pattern 2: TanStack Query Setup with 30s Polling
**What:** QueryClient configured globally; useQuery with `refetchInterval` + `staleTime` for silent background refresh.
**When to use:** All data-fetching queries for balance and transactions.
**Example:**
```typescript
// Source: tanstack.com/query/v5/docs/framework/react/reference/useQuery
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

// Usage inside a component:
const { data: account } = useQuery({
  queryKey: ['account', 'default'],
  queryFn: () => fetch('/api/accounts/default').then(r => r.json()),
})
```
[VERIFIED: tanstack.com/query/v5/docs/framework/react/reference/useQuery]

### Pattern 3: TanStack Router — Minimal Single Route
**What:** rootRoute + indexRoute + router instance. Installed per WEB-02 but used only for a single `/` route.
**When to use:** Satisfies the requirement without file-based routing complexity.
**Example:**
```typescript
// Source: tanstack.com/router/v1/docs/framework/react/quick-start
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})
const routeTree = rootRoute.addChildren([indexRoute])
const router = createRouter({ routeTree })

// Register types (required for TypeScript):
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return <RouterProvider router={router} />
}
```
[CITED: tanstack.com/router/v1/docs/framework/react/quick-start]

### Pattern 4: Motion Verdict Card Animation
**What:** `motion.div` with scale+opacity entry + backgroundColor keyframe pulse using oklch values.
**When to use:** Verdict card only (D-10).
**Example:**
```typescript
// Source: motion.dev animation docs + confirmed v12 oklch support
import { motion } from 'motion/react'  // NOT 'framer-motion'

<motion.div
  initial={{ scale: 0.8, opacity: 0, backgroundColor: canBuy ? 'oklch(0.65 0.17 142)' : 'oklch(0.60 0.22 25)' }}
  animate={{
    scale: 1.0,
    opacity: 1,
    backgroundColor: canBuy ? 'oklch(0.97 0.04 142)' : 'oklch(0.97 0.04 25)',
  }}
  transition={{ duration: 0.4, ease: 'easeOut' }}
>
  {/* verdict contents */}
</motion.div>
```
Note: Motion v12 added native oklch/oklab color animation support — no polyfill or string interpolation needed. [VERIFIED: motion.dev, WebSearch confirmed v12 changelog]

### Pattern 5: Go Route Prefix + Embed
**What:** Add `/api` group prefix in `routes.go`; add embed directive + `StaticWithConfig` in `main.go`.
**When to use:** Go-side changes to support D-03 and D-04.
**Example:**
```go
// routes.go — wrap all groups under /api
api := e.Group("/api")
acc := api.Group("/accounts")
// ... existing routes unchanged

// cmd/cibi-api/main.go additions:
//go:embed all:web/dist
var webDist embed.FS

// After handler.SetupRoutes(e, ...), add static middleware:
e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
    HTML5:      true,        // forwards unknown paths to index.html for SPA routing
    Root:       "web/dist",
    Filesystem: echo.MustSubFS(webDist, "web/dist"),
    // Note: HTML5:true enables SPA fallback routing
}))
```
[VERIFIED: echo.labstack.com/docs/middleware/static]

**Critical ordering:** API routes (`/api/*`) must be registered BEFORE the static middleware catch-all. Echo matches routes in registration order; static middleware acts as a wildcard fallback.

### Pattern 6: 2-Query Data Flow for Dashboard
**What:** The obligations list requires the account ID to filter transactions. Fetch default account first (gets ID + balance), then fetch transactions using that ID.
**When to use:** Dashboard load sequence for WEB-03.
**Example:**
```typescript
// Query 1: default account (balance + account ID)
const { data: account } = useQuery({
  queryKey: ['account', 'default'],
  queryFn: () => fetch('/api/accounts/default').then(r => {
    if (!r.ok) throw new Error('data load failed')
    return r.json()
  }),
})

// Query 2: recurring transactions (enabled only when account ID is known)
const { data: transactions } = useQuery({
  queryKey: ['transactions', account?.id],
  queryFn: () => fetch(`/api/transactions?account_id=${account!.id}`).then(r => r.json()),
  enabled: !!account?.id,
  select: (txns) => txns
    .filter((t: TransactionResponse) => t.is_recurring && t.next_occurrence)
    .sort((a: TransactionResponse, b: TransactionResponse) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    ),
})
```
[ASSUMED: The `enabled` option pattern is standard TanStack Query v5 practice]

### Pattern 7: Tailwind v4 @theme Token Block
**What:** CSS-first theme definition using `@theme` in `index.css`. No `tailwind.config.js` needed.
**When to use:** Defining custom verdict and risk colors per UI spec.
**Example:**
```css
/* web/src/index.css */
@import "tailwindcss";

@theme {
  --color-verdict-yes: oklch(0.65 0.17 142);
  --color-verdict-yes-tint: oklch(0.97 0.04 142);
  --color-verdict-no: oklch(0.60 0.22 25);
  --color-verdict-no-tint: oklch(0.97 0.04 25);
  --color-risk-low: oklch(0.65 0.17 142);
  --color-risk-medium: oklch(0.72 0.19 70);
  --color-risk-high: oklch(0.65 0.20 40);
  --color-risk-blocked: oklch(0.60 0.22 25);
}
```
These become Tailwind utility classes: `bg-verdict-yes`, `text-risk-blocked`, etc. [VERIFIED: ui.shadcn.com/docs/tailwind-v4]

### Anti-Patterns to Avoid
- **Importing from `framer-motion`:** WEB-04 explicitly mandates `motion` package with `motion/react` import. Using the old package name will fail the requirement.
- **Registering static middleware before API routes:** Echo routes are matched in registration order. If the static catch-all is registered first, API routes (`/api/*`) are never reached — the SPA's `index.html` is served for all requests including API calls.
- **Calling `ListTransactions` without `account_id` query param:** The handler returns HTTP 400 if `account_id` is missing. The frontend must always pass it — use the `enabled` flag to gate the query until the account ID is available.
- **Putting the `//go:embed` directive in `app.go`:** The directive must be in `cmd/cibi-api/main.go` (or a file in that package) since `web/dist` is relative to the package containing the directive. The `internal/app` package cannot embed from `web/dist`.
- **Using Tailwind v3 config style:** Tailwind v4 is CSS-first. Do NOT create `tailwind.config.js` — it conflicts with the v4 `@tailwindcss/vite` plugin approach. All configuration goes in `index.css`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | Custom `formatMoney()` | `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` | Handles negative sign, thousands separator, locale edge cases automatically |
| Date formatting | Custom date formatter | `new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` | Browser-native, handles locale; no import needed |
| Toast notifications | Custom toast state | shadcn `sonner` component | Positioning, stacking, auto-dismiss, accessibility all handled |
| Path aliases | Relative `../../` imports | `@/` alias via `vite.config.ts` + `tsconfig.json` | shadcn generated components use `@/` convention; must match |
| Entry animation state | useState + CSS transitions | Motion `motion.div` with `initial`/`animate` | Handles spring physics, interruptible animations; sub-400ms guarantee easier to hit |
| API route grouping | Manual path concatenation | `e.Group("/api")` in Echo | Prefix applies to all child routes; no risk of missing a route |

**Key insight:** This dashboard is read-only. Resist adding any write operations beyond `POST /api/check`. All other endpoint interactions are GET-only from the frontend.

---

## API Contract (confirmed from handler code)

The following API shapes are confirmed from `internal/handler/` source code. [VERIFIED: codebase inspection]

**GET /api/accounts/default** → `AccountResponse`
```typescript
interface AccountResponse {
  id: string          // UUID string
  name: string
  current_balance: number  // float64 dollars (NOT cents — handler converts)
  currency: string
  is_default: boolean
}
```

**GET /api/transactions?account_id={uuid}** → `TransactionResponse[]`
```typescript
interface TransactionResponse {
  id: string
  account_id: string
  amount: number       // float64 dollars (negative = debit)
  description: string
  category: string
  timestamp: string    // RFC3339
  is_recurring: boolean
  frequency: string | null
  anchor_date: string | null
  next_occurrence: string | null  // RFC3339; null for non-recurring
}
```
Filter client-side: `txns.filter(t => t.is_recurring && t.next_occurrence !== null)`

**POST /api/check** body: `{ amount: number }` → `CheckResponse`
```typescript
interface CheckResponse {
  can_buy: boolean
  purchasing_power: number  // float64 dollars
  buffer_remaining: number  // float64 dollars
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED'
}
```

**Error shape** (all endpoints): `{ "error": "human-readable message" }`

**CRITICAL GAP — Route prefix not yet applied:**
The current `routes.go` registers routes WITHOUT the `/api/` prefix (e.g., `/accounts`, `/check`). D-03 requires adding the prefix before any frontend integration works. This is a Go-side task in Wave 1 of the plan.

---

## Common Pitfalls

### Pitfall 1: Static middleware catches API routes
**What goes wrong:** Echo serves `index.html` for requests to `/api/check` instead of routing to the handler.
**Why it happens:** `middleware.StaticWithConfig` with `HTML5: true` acts as a wildcard that catches all unmatched paths. If registered before API routes, it matches first.
**How to avoid:** Always register `handler.SetupRoutes(e, ...)` before `e.Use(middleware.StaticWithConfig(...))`. In `app.go`, keep the existing `SetupRoutes` call first, then add the static middleware.
**Warning signs:** `POST /api/check` returns a 200 with HTML content instead of JSON.

### Pitfall 2: go:embed path relative to package, not repo root
**What goes wrong:** `//go:embed all:web/dist` fails to compile if placed in `internal/app/app.go` because `web/dist` is not relative to the `internal/app/` directory.
**Why it happens:** Go embed paths are relative to the source file containing the directive.
**How to avoid:** Place the embed directive only in `cmd/cibi-api/main.go`. Pass the embedded `embed.FS` to `app.New()` or wire the static middleware from `main.go` directly on `application.Echo`.
**Warning signs:** `go build` produces "pattern web/dist: no matching files found".

### Pitfall 3: shadcn init run outside `web/`
**What goes wrong:** `components.json` is created in the repo root, shadcn components are generated in the wrong path, and path aliases (`@/`) don't resolve.
**Why it happens:** `npx shadcn@latest init` creates `components.json` in the current directory.
**How to avoid:** Always `cd web` first, then run all `npx shadcn@latest` commands.
**Warning signs:** `components.json` appears in the repo root; generated components import from wrong paths.

### Pitfall 4: transactions query fires before account ID is known
**What goes wrong:** `GET /api/transactions?account_id=undefined` returns HTTP 400.
**Why it happens:** TanStack Query runs immediately on mount if not gated.
**How to avoid:** Use `enabled: !!account?.id` on the transactions query. This prevents it from firing until the account query succeeds.
**Warning signs:** Network tab shows `GET /api/transactions?account_id=undefined` returning 400 on first load.

### Pitfall 5: Reserved funds calculation — all transactions vs. upcoming only
**What goes wrong:** The "Reserved" stat card shows the sum of ALL recurring transaction amounts instead of only upcoming obligations (transactions due before next payday).
**Why it happens:** The frontend doesn't have payday logic — it cannot replicate the engine's obligation window.
**How to avoid:** The "Reserved" amount shown on the dashboard should be derived from `purchasing_power` logic: `reserved = current_balance - purchasing_power - buffer_remaining`. But since the API doesn't expose this directly, use the sum of `next_occurrence`-having transactions as a proxy, understanding this is approximate. Alternatively, add a `GET /api/accounts/default/summary` endpoint that returns pre-computed values. The UI spec calls the three cards "Balance / Reserved / Liquid" — Reserved and Liquid are derived, not raw API fields. [ASSUMED: The planner should decide whether to add a summary endpoint or compute client-side]

### Pitfall 6: Motion v12 oklch colors require CSS custom properties via style prop, not Tailwind class
**What goes wrong:** Passing a Tailwind class like `bg-verdict-yes` to Motion's `animate` prop does nothing — Motion animates style values, not class names.
**Why it happens:** Motion works at the style level, not the class level.
**How to avoid:** Pass raw oklch color strings (or CSS variable references) directly to `animate={{ backgroundColor: 'oklch(...)' }}`. Motion v12 supports oklch natively without interpolation issues.
**Warning signs:** The background color doesn't animate; it jumps instantly.

### Pitfall 7: shadcn Tailwind v4 init uses `@canary` vs `@latest`
**What goes wrong:** `npx shadcn@latest init` may not support Tailwind v4 in all versions.
**Why it happens:** Tailwind v4 support in shadcn was added in the canary track before becoming stable.
**How to avoid:** Use `npx shadcn@latest init` — as of early 2026 Tailwind v4 is the default. Verify the created `components.json` shows `"tailwind": { "version": "4" }`. If not, use `npx shadcn@canary init`.
**Warning signs:** `components.json` generated with Tailwind v3 config; `tailwind.config.js` created (v3 behavior).

---

## Code Examples

Verified patterns from official sources:

### Sonner Toast Setup
```tsx
// Source: ui.shadcn.com/docs/components/sonner
// In App.tsx root:
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </>
  )
}

// Usage anywhere:
toast.error('Could not reach the server. Make sure the CIBI API is running.')
```

### QueryClient with Global Defaults
```tsx
// Source: tanstack.com/query/v5/docs/framework/react/reference/useQuery
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
})
```

### Echo Embed Static Middleware (Go)
```go
// Source: echo.labstack.com/docs/middleware/static
//go:embed all:web/dist
var webDist embed.FS

// In main.go, after starting app:
application.Echo.Use(middleware.StaticWithConfig(middleware.StaticConfig{
    HTML5:      true,
    Root:       "web/dist",
    Filesystem: echo.MustSubFS(webDist, "web/dist"),
}))
```

### Money Formatter
```typescript
// Source: Claude's discretion per UI spec
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
fmt.format(1234.56)   // "$1,234.56"
fmt.format(-15.99)    // "-$15.99"

// Date formatter
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
fmtDate('2026-04-15T00:00:00Z')  // "Apr 15"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` import | `motion/react` import | 2024 (v11 rename) | WEB-04 explicitly requires new import path |
| `tailwind.config.js` | CSS-first `@theme` in `.css` | Tailwind v4 (2024) | No config file needed; all tokens in CSS |
| React 18 `ReactDOM.render` | React 19 `createRoot` | React 19 (2024) | New root API required; concurrent features default |
| `react-query` package | `@tanstack/react-query` | v4+ | Package was renamed and scoped |
| TanStack Query v4 `refetchInterval(data)` | v5 `refetchInterval(query)` | v5 (2023) | Function signature changed — receive Query object, not data |

**Deprecated/outdated:**
- `framer-motion`: Package still exists but WEB-04 explicitly mandates the `motion` package. Do not install `framer-motion`.
- `create-react-app`: Dead project; Vite is the standard for new SPAs.
- Tailwind v3 `@tailwind` directives: In v4, replace with `@import "tailwindcss"`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reserved funds should be computed as the sum of `amount` for recurring transactions with `next_occurrence !== null` on the client side | Architecture Patterns (Pattern 6), Common Pitfalls (Pitfall 5) | If the engine's obligation window (now→next payday) differs significantly from all-upcoming, the "Reserved" stat card shows an incorrect value. A dedicated summary endpoint would eliminate this risk. |
| A2 | `enabled: !!account?.id` pattern for gating the transactions query is standard TanStack Query v5 practice | Architecture Patterns (Pattern 6) | LOW — this is well-established TanStack Query v5 usage; risk is documentation drift only. |
| A3 | `npx shadcn@latest init` supports Tailwind v4 as default as of early 2026 | Common Pitfalls (Pitfall 7) | If canary is still required, the init command differs. Mitigated by checking `components.json` after init. |

---

## Open Questions

1. **Reserved funds computation method**
   - What we know: The API's `GET /api/accounts/default` returns `current_balance`. `GET /api/transactions` returns all transactions for an account. The engine internally filters to `next_occurrence > now AND next_occurrence <= next_payday`.
   - What's unclear: Should the "Reserved" stat card show (a) sum of all recurring future obligations, (b) only obligations within the next pay period (requires knowing next payday), or (c) a value from a not-yet-existing summary endpoint?
   - Recommendation: Plan for option (a) as the simplest approximation. If the Phase 4 API has a summary/status endpoint, use that. If not, client-side sum of all `is_recurring && next_occurrence !== null` amounts is acceptable for a personal tool. The planner should decide whether to add a `GET /api/status` endpoint to Phase 5.

2. **`//go:embed` directive placement: `main.go` vs `app.go`**
   - What we know: Go embed paths are package-relative. `web/dist` is only reachable from `cmd/cibi-api/`.
   - What's unclear: Should the static middleware be wired in `main.go` or should `app.New()` accept an `embed.FS` parameter?
   - Recommendation: Wire it in `main.go` directly on `application.Echo` after `app.New()` returns. This keeps `internal/app` free of frontend concerns and avoids changing `App.New()`'s signature.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend scaffold, npm install | Yes | v24.4.1 | — |
| npm | Package management | Yes | 11.4.2 | — |
| Go | Backend build with embed | Yes (inferred from existing build) | 1.25.0 (go.mod) | — |

[VERIFIED: Bash — `node --version`, `npm --version`; go.mod for Go version]

**No missing dependencies.**

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go standard `testing` package (existing handler tests) |
| Config file | None — `go test ./...` convention |
| Quick run command | `go test ./internal/handler/... -v` |
| Full suite command | `go test ./... -v` |
| Frontend test | No frontend test framework specified — manual browser verification |

**Note:** The existing handler tests in `internal/handler/*_test.go` pass (verified: `go test ./internal/handler/... → ok`). Frontend testing is not in scope for this phase — the UI spec and success criteria define visual/functional verification as browser-based.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEB-01 | Vite scaffold builds without error | Build check | `cd web && npm run build` | Wave 0 — `web/` not yet created |
| WEB-02 | TanStack Query polls at 30s interval | Manual/browser | Network tab shows refetch at 30s | N/A — manual |
| WEB-03 | Dashboard loads and shows correct values | Smoke/browser | `curl http://localhost:8080/` returns HTML | N/A — manual |
| WEB-04 | Verdict card animates on CHECK submit | Manual/browser | Visual verification of scale+fade+pulse | N/A — manual |
| D-03 | Routes have `/api/` prefix | Go handler tests (existing updated) | `go test ./internal/handler/...` | Existing tests need URL update |

### Sampling Rate
- **Per task commit:** `go test ./internal/handler/... -count=1` (after Go-side route changes)
- **Per wave merge:** `go test ./... -count=1` + `cd web && npm run build` (verifies embed will work)
- **Phase gate:** Full suite green + browser smoke test at `http://localhost:8080/`

### Wave 0 Gaps
- [ ] `web/` directory — entire frontend scaffold (Wave 1 creates this)
- [ ] Handler tests need route URL updates from `/accounts` → `/api/accounts` etc. after D-03 route prefix change

---

## Security Domain

> Security enforcement is enabled (no explicit `false` in config).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Personal Tailscale tool — no auth layer |
| V3 Session Management | No | No sessions — stateless API |
| V4 Access Control | No | Single-user personal tool over Tailscale |
| V5 Input Validation | Yes | Amount input: `type="number" min="0" step="0.01"`; backend validates via Echo validator |
| V6 Cryptography | No | No secrets or sensitive data in transit beyond Tailscale |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via amount display | Tampering | React's JSX auto-escapes; never use `dangerouslySetInnerHTML` |
| Negative/zero amount submitted | Tampering | Input `min="0"`, backend `validate:"gt=0"` on `CheckRequest.Amount` |
| CORS (prod) | Spoofing | Moot — SPA and API served from same origin (D-04 single binary) |
| Large payload from API | DoS | Not applicable — personal tool, trusted API |

---

## Sources

### Primary (HIGH confidence)
- npm registry — verified all package versions via `npm view [package] version`
- Codebase inspection — `internal/handler/routes.go`, `check.go`, `accounts.go`, `transactions.go`, `app/app.go`, `cmd/cibi-api/main.go`
- [echo.labstack.com/docs/middleware/static](https://echo.labstack.com/docs/middleware/static) — StaticWithConfig + HTML5 mode
- [ui.shadcn.com/docs/installation/vite](https://ui.shadcn.com/docs/installation/vite) — shadcn init steps for Vite
- [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) — CSS-first @theme configuration
- [tanstack.com/query/v5/docs/framework/react/reference/useQuery](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery) — refetchInterval, staleTime options
- [vite.dev/config/server-options](https://vite.dev/config/server-options) — server.proxy configuration

### Secondary (MEDIUM confidence)
- [tanstack.com/router/v1/docs/framework/react/quick-start](https://tanstack.com/router/v1/docs/framework/react/quick-start) — Single route setup pattern
- [motion.dev](https://motion.dev) — backgroundColor keyframes + oklch support in v12

### Tertiary (LOW confidence)
- WebSearch results confirming Motion v12 oklch support (single search result, no official changelog link verified)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from npm registry
- Architecture: HIGH — patterns verified from official docs + codebase inspection
- Pitfalls: HIGH — derived from codebase constraints (route ordering, embed path rules, API contract)
- Security: HIGH — simple personal tool; ASVS categories definitively not applicable except V5

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days; stable libraries)
