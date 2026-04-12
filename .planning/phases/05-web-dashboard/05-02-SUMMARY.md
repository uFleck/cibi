---
phase: 05-web-dashboard
plan: 02
status: complete
---

## Plan 05-02 Summary

**Objective**: Bootstrap the React 19 + Vite 6 + TypeScript SPA in `web/`, configure all tooling, and create the complete data-layer foundation.

### Tasks Completed

**Task 1: Scaffold web/ — Vite project, dependencies, shadcn init**
- React 19 + Vite 6 + TypeScript scaffold
- Dependencies: `@tanstack/react-query`, `@tanstack/react-router`, `motion`, `lucide-react`, `sonner`, `vitest`
- Tailwind v4 via `@tailwindcss/vite`
- shadcn components: `card`, `input`, `button`, `badge`, `separator`, `sonner`
- `vite.config.ts`: dev proxy `/api` → `localhost:8080`, `@` alias, Tailwind plugin
- `index.css`: `@theme` block with all 8 verdict/risk color tokens
- `vitest.config.ts`: jsdom environment, globals

**Task 2: Data layer — api.ts, format.ts, router.ts, App.tsx, test stubs**
- `lib/api.ts`: `AccountResponse`, `TransactionResponse`, `CheckResponse` interfaces + `fetchDefaultAccount`, `fetchTransactions`, `postCheck` fetch wrappers
- `lib/format.ts`: `formatMoney` (Intl.NumberFormat en-US currency), `formatDate` (toLocaleDateString short)
- `router.tsx`: TanStack Router with single `/` index route (placeholder)
- `App.tsx`: `QueryClientProvider` with `staleTime: 30_000`, `refetchInterval: 30_000`, `refetchOnWindowFocus: true` + `RouterProvider` + `Toaster`
- Wave 0 test stubs: 9 passing tests

### Artifacts Created
- `web/src/lib/api.ts`, `web/src/lib/format.ts`, `web/src/router.tsx`
- `web/src/App.tsx`, `web/src/main.tsx`
- `web/src/__tests__/dashboard.test.tsx`, `web/src/__tests__/verdict.test.tsx`
- `web/src/components/ui/` (all shadcn components)

### Verification
- `cd web && npm run build` → success
- `cd web && npm run test -- --run` → 9 tests passed

### Deviations
- Removed `test` config from `vite.config.ts` (moved to `vitest.config.ts`) — TypeScript type conflict
- Added `ignoreDeprecations: "6.0"` to `tsconfig.app.json` — `baseUrl` deprecation warning
