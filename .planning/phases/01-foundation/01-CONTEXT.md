# Phase 01: Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The codebase is restructured into a clean, testable monorepo with no global state, pure-Go SQLite, versioned migrations, and a wired App struct — ready to receive domain logic. Infrastructure refactoring, repo rename, DB initialization, and DI wiring setup.

</domain>

<decisions>
## Implementation Decisions

### Migration Format
- **D-01:** Migrations will be written as `.go` files utilizing Goose's Go API rather than raw `.sql` files.

### Default Database Path
- **D-02:** The SQLite database will default to `./db/cibi.db` if no configuration override is provided.

### the agent's Discretion
- The precise structure of the Go migrations inside `internal/migrations/`.
- Implementation details of the `internal/app` wiring as long as it adheres to the requirements of eliminating global state and providing a fully wired graph.

</decisions>

<specifics>
## Specific Ideas

- Keep things straightforward and simple ("normal caveman mode").

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definitions
- `.planning/REQUIREMENTS.md` — Read ARCH-01 to ARCH-06 and SCHEMA-01 to SCHEMA-05.
- `CIBI_SPEC.md` — Core domain rules and product intent.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The existing Echo `handlers/`, `services/`, and `repos/` provide the structure to migrate from `cibi-api/` to `cmd/cibi-api/` with minimal logic rewrite.

### Established Patterns
- **Manual injection:** Handlers, Services, and Repositories are wired manually using `New*` constructors rather than a heavy DI framework.
- **Error wrapped formatting:** Typical `fmt.Errorf("message: %w", err)` pattern usage (though custom capitalization like "Could not...") exists in `services/`.
- **Pure-Go:** Transitioning directly to `modernc.org/sqlite` instead of `mattn/go-sqlite3` removes CGO dependencies completely.

### Integration Points
- `main.go` bootstrap needs heavy modification to shift to the new `internal/app.New(cfg)` architectural requirement.
- Go module renaming across the entire repository.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 01-foundation*
*Context gathered: 2026-04-11*
