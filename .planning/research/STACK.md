# Technology Stack Research: CIBI

**Project:** CIBI — Can I Buy It? Personal Finance Decision Engine
**Researched:** 2026-04-11
**Overall confidence:** HIGH (all major claims verified against official docs or multiple sources)

---

## 1. Go CLI Framework: Cobra

**Recommendation: Cobra v1.10.x + Viper v2.x**

### Verdict

Use **Cobra**. Not urfave/cli, not bubbletea alone.

CIBI's CLI needs to mirror the API surface — multiple subcommands with a consistent interface (`cibi check 50`, `cibi tx add`, `cibi balance`, `cibi config set`). Cobra is purpose-built for exactly this pattern. It is the de facto standard for Go CLI tools at scale (kubectl, helm, gh, Hugo all use Cobra).

### Cobra v1.10.2 (December 2024)

- Latest stable: **v1.10.2** (released 2024-12-04, actively maintained)
- The December 2024 release migrated from `gopkg.in/yaml.v3` to `go.yaml.in/yaml/v3` for supply chain hygiene — relevant if you depend on YAML config files
- Shell autocompletion (bash/zsh/fish/powershell) is built-in, zero extra work
- `PersistentPreRunE` on the root command is the correct hook for loading config before any subcommand runs

### Why Not the Others

| Option | Verdict | Reason |
|--------|---------|--------|
| **urfave/cli v3** | Skip | Better ergonomics for single-binary scripts; subcommand nesting is clunkier than Cobra; smaller ecosystem |
| **bubbletea** | Complement, not replace | A TUI *rendering* framework, not a CLI *routing* framework. Use it inside a Cobra command if you want interactive prompts (e.g., `cibi check` with an amount picker). Do not replace Cobra with it. |
| **kong** | Viable alternative | Struct-tag-based flag parsing; less boilerplate than Cobra but far smaller adoption; Cobra wins on ecosystem and examples |

### Cobra + Viper Integration Pattern

```go
// cmd/root.go
var cfgFile string

func init() {
    cobra.OnInitialize(initConfig)
    rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default $HOME/.cibi.yaml)")
}

func initConfig() {
    if cfgFile != "" {
        viper.SetConfigFile(cfgFile)
    } else {
        viper.AddConfigPath("$HOME")
        viper.SetConfigName(".cibi")
    }
    viper.AutomaticEnv()
    viper.ReadInConfig()
}
```

Precedence is: CLI flags > `CIBI_*` env vars > `~/.cibi.yaml` > defaults. This gives CIBI's CLI the same 12-factor configurability as the API.

**Known issue:** Do NOT use the global `viper.GetViper()` singleton in tests — it causes state leakage between test runs. Instantiate a `viper.New()` per test or per command where testability matters.

### Bubbletea as a Complement

**github.com/charmbracelet/bubbletea** (v1.x, actively maintained, ~28k stars) is appropriate for the `cibi check` interactive flow — a pager-style result with color-coded Yes/No verdict. Use **lipgloss** (same org) for styling output. This is the Charm ecosystem stack and it pairs cleanly with Cobra.

```
go get github.com/spf13/cobra@latest
go get github.com/spf13/viper@latest
go get github.com/charmbracelet/lipgloss@latest  # for styled terminal output
```

---

## 2. MCP Server in Go: Official SDK Over mcp-go

**Recommendation: `modelcontextprotocol/go-sdk` (official)**

### The Landscape Has Shifted

When Milestone 3 was originally spec'd, `mark3labs/mcp-go` was the *only* serious Go MCP option. That is no longer the case.

| Library | Version | Stars | Status | Backing |
|---------|---------|-------|--------|---------|
| **modelcontextprotocol/go-sdk** | **v1.5.0** (April 7, 2026) | Growing fast | Stable, production-ready | Official MCP project + Google |
| mark3labs/mcp-go | v0.47.1 (April 8, 2025) | 8.6k | Actively maintained | Community |
| metoro-io/mcp-golang | ~v0.x | Smaller | Active | Community |

### Official SDK (`modelcontextprotocol/go-sdk`)

- Released v1.5.0 on April 7, 2026 — one week before this research was written
- 22 releases, 636 commits, maintained in collaboration with Google
- Supports MCP spec **2025-11-25** (current), with backward compat for all prior spec versions
- Covers: Tools, Resources, Prompts, stdio transport, command transports, OAuth, client-side OAuth (experimental in v1.4.0+)
- The README explicitly credits `mark3labs/mcp-go` as one of the inspirations — the official SDK incorporated lessons from the community project
- `golang.org/x/tools/internal/mcp` also exists but is internal and not for public use

### mark3labs/mcp-go

Still valid and battle-tested. It currently leads the official SDK in:
- **HTTP/SSE transport** (the official SDK's HTTP support is less mature as of v1.5.0)
- **Middleware patterns** — `Use()` for tool middleware, prompt middleware
- Streamable-HTTP clients and async task handling (task-augmented tools)

**If CIBI's MCP server uses stdio transport** (which it likely will — Claude Desktop connects via stdio), use the official SDK. If you need HTTP/SSE for the MCP server (e.g., exposing it to non-stdio MCP clients), mark3labs/mcp-go still has an edge.

### Recommendation for CIBI

Use `modelcontextprotocol/go-sdk` for Milestone 3. CIBI's MCP server will expose `get_financial_status()`, `check_purchase_feasibility(amount)`, and `log_transaction(amount, description)` — all perfectly suited to the official SDK's typed tool handler pattern. Stdio transport is the right choice for a local tool.

```
go get github.com/modelcontextprotocol/go-sdk@latest
```

**Risk flag:** The official SDK is at v1.x but only recently crossed that threshold. HTTP transport is still maturing. Monitor release notes between now and Milestone 3 implementation.

---

## 3. Go Module Naming: Renaming `cibi-api` to `cibi`

**Recommendation: Rename the module, do it once, do it completely.**

### The Rename

The current module path is `github.com/ufleck/cibi-api`. Since the project is being restructured into a monorepo with CLI + API + MCP, the correct path is `github.com/ufleck/cibi`.

This is a private/personal project (no public consumers), so there is no deprecation ceremony needed. The rename is low-risk.

### Mechanical Steps

```bash
# 1. Update go.mod
go mod edit -module github.com/ufleck/cibi

# 2. Update all import paths in .go files
# Use sed or gopls refactoring:
find . -name "*.go" | xargs sed -i 's|github.com/ufleck/cibi-api|github.com/ufleck/cibi|g'

# 3. Verify
go build ./...
```

### Target Directory Structure

The Go official docs recommend `cmd/` for multi-binary repos. For CIBI:

```
github.com/ufleck/cibi/
├── go.mod                        # module github.com/ufleck/cibi
├── go.sum
├── cmd/
│   ├── cibi/
│   │   └── main.go              # CLI binary (Cobra root)
│   └── cibi-api/
│       └── main.go              # API server binary (Echo)
├── internal/
│   ├── engine/                  # Decision Engine — shared core
│   ├── db/                      # DB init, migrations
│   ├── repos/                   # Repository layer
│   └── services/                # Service layer
├── handlers/                    # Echo HTTP handlers (API-only)
├── types/                       # Shared domain types
└── data/                        # SQLite file (gitignored)
```

Binary install paths become:
```
go install github.com/ufleck/cibi/cmd/cibi@latest
go install github.com/ufleck/cibi/cmd/cibi-api@latest
```

### Key Convention

Keep `cmd/` entries as thin wires — just `main()` that calls into `internal/` packages. All testable logic lives in `internal/`. This is the official Go guidance and the single most important structural rule for this codebase.

**Do NOT use Go Workspaces** (`go.work`) unless the project splits into genuinely separate modules with independent versioning. For CIBI — one module, one `go.mod`, `cmd/` structure — workspaces add complexity without benefit.

---

## 4. React + Vite Dashboard

**Recommendation: Vite 6 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query + Motion**

### Vite Is Still the Right Choice in 2026

For a **local, authenticated, personal dashboard** — Vite 6 with React 19 is unambiguously correct. Next.js would add SSR complexity with zero benefit (no SEO, no public traffic, no server components needed).

The 2026 consensus is clear:
- Vite 6 replaced Create React App as the React SPA standard
- Sub-60ms HMR, zero-config TypeScript, deploy-anywhere static output
- Next.js wins when you need SSR, ISR, or public-facing SEO pages — none of which apply to CIBI

### Recommended Stack for CIBI Dashboard

| Layer | Choice | Version | Notes |
|-------|--------|---------|-------|
| Build tool | Vite | 6.x | Still the SPA standard |
| Framework | React | 19 | Stable; concurrent features matter for live data |
| Language | TypeScript | 5.x | Non-negotiable for a typed API surface |
| Styling | Tailwind CSS | v4 | New OKLCh color system; significant DX improvements over v3 |
| Components | shadcn/ui | latest | Radix UI primitives, copied into your repo — no dep lock-in |
| Data fetching | TanStack Query | v5 | Server state management, background refetch, polling for live balance |
| Routing | TanStack Router | v1 | Type-safe routing; pairs with TanStack Query; correct choice for Vite SPAs |
| Animation | Motion (ex-Framer Motion) | v11+ | See note below |
| Charts | Recharts | v3 | Works well with React 19; simpler than D3 for financial charts |

### Framer Motion → Motion

**Important rename:** The library is now called **Motion** and the import has changed.

```ts
// OLD (deprecated)
import { motion } from "framer-motion"

// NEW
import { motion } from "motion/react"
```

Install: `npm install motion` (not `framer-motion`). The `framer-motion` package still works but the canonical package is `motion`. The API is backward-compatible. Bundle size is ~50kB gzipped — acceptable for a local dashboard with no bandwidth constraints.

For simpler animations (the CIBI verdict card flip, balance counter), Motion is the right call. GSAP is overkill unless you're doing timeline-sequenced scroll animations.

### Tailwind v4 Note

Tailwind CSS v4 is a significant rewrite. The config file format has changed (CSS-first config via `@theme` in your CSS file instead of `tailwind.config.js`). shadcn/ui now supports v4 natively. If scaffolding from scratch, use v4. If migrating an existing v3 project, budget time for the migration.

### Scaffolding Command

```bash
npm create vite@latest cibi-web -- --template react-ts
cd cibi-web
npm install
npx shadcn@latest init
npm install @tanstack/react-query @tanstack/react-router motion recharts
```

---

## 5. Go Decimal Arithmetic for Financial Calculations

**Recommendation: `shopspring/decimal` for correctness; consider `govalues/decimal` if performance becomes a concern.**

### Why Not `float64`

Never use `float64` for money. `0.1 + 0.2 == 0.30000000000000004` in Go, as in every IEEE 754 language. Financial calculations require exact decimal arithmetic.

### The Two Real Options

| Library | Version | Precision | Allocations | Zero div | Stars |
|---------|---------|-----------|-------------|----------|-------|
| **shopspring/decimal** | v1.4.0 | Arbitrary (2^31 digits) | Yes (heap) | Panics | 6k+ |
| **govalues/decimal** | v0.1.x | 19 digits max | Zero-alloc | Returns error | Growing |

### Performance Reality

Benchmarks show `govalues/decimal` is ~8-9x faster than `shopspring/decimal` on basic arithmetic (16ns vs 141ns per operation). For CIBI — calculating purchasing power for a personal finance app — this difference is irrelevant at any realistic scale.

**shopspring/decimal is the right choice for CIBI** because:
1. Arbitrary precision eliminates any edge case for large sums or currency conversion
2. It is the recognized standard — widely used, well-documented, years of battle-testing
3. 141ns per arithmetic operation is undetectable in a sub-100ms decision engine
4. The panic-on-division behavior is actually a feature for financial code: you want to crash loudly on divide-by-zero, not silently return an error that might get swallowed

**Use govalues/decimal** if CIBI ever needs to run bulk projections (e.g., forecasting 10,000 recurring transactions) and profiling shows the decimal layer is the bottleneck.

### Usage Pattern

```go
import "github.com/shopspring/decimal"

balance := decimal.NewFromFloat(1500.00)
rent := decimal.NewFromString("850.00") // prefer string construction for exact values
buffer := decimal.NewFromFloat(200.00)

liquid := balance.Sub(rent).Sub(buffer)
canBuy := liquid.GreaterThanOrEqual(decimal.NewFromFloat(itemPrice))
```

Always construct from strings when the value originates from user input or a database TEXT field. Use `NewFromFloat` only when the source is already an IEEE 754 value you trust.

```
go get github.com/shopspring/decimal@latest
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI framework | Cobra v1.10 | urfave/cli v3 | Subcommand depth, ecosystem size |
| CLI framework | Cobra v1.10 | kong | Smaller adoption, fewer examples |
| MCP SDK | modelcontextprotocol/go-sdk | mark3labs/mcp-go | Official SDK now stable at v1.5.0; prefer institutional backing |
| Dashboard build | Vite 6 | Next.js | No SSR need; SPA is simpler and faster locally |
| Dashboard routing | TanStack Router | React Router v7 | TanStack Router is fully type-safe; pairs better with TanStack Query |
| Decimal | shopspring/decimal | govalues/decimal | Arbitrary precision; established; panics loudly on errors |
| Decimal | shopspring/decimal | math/big | Too low-level; no decimal-aware formatting or rounding modes |

---

## Sources

- [Cobra releases — spf13/cobra](https://github.com/spf13/cobra/releases) — v1.10.2 confirmed active
- [Go official module layout docs](https://go.dev/doc/modules/layout) — cmd/ structure guidance
- [mcp-go releases — mark3labs/mcp-go](https://github.com/mark3labs/mcp-go/releases) — v0.47.1, April 2025
- [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk) — v1.5.0, April 7, 2026, official + Google-backed
- [shopspring/decimal — pkg.go.dev](https://pkg.go.dev/github.com/shopspring/decimal)
- [govalues/decimal — GitHub](https://github.com/govalues/decimal) — performance benchmarks
- [Vite vs Next.js 2026 — DEV Community](https://dev.to/shadcndeck_dev/nextjs-vs-vite-choosing-the-right-tool-in-2026-38hp)
- [Motion animation library](https://motion.dev/) — canonical successor to framer-motion
- [TanStack ecosystem](https://tanstack.com/) — Query v5, Router v1
- [Building CLI Apps with Cobra and Viper — April 2026](https://dasroot.net/posts/2026/04/building-cli-applications-cobra-viper/)
- [JetBrains Go Ecosystem 2025 trends](https://blog.jetbrains.com/go/2025/11/10/go-language-trends-ecosystem-2025/)
