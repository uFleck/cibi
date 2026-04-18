# Phase 2: shared debt list components - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Create shared debt list UI components to replace duplicated debt-list rendering patterns across existing owner/public debt surfaces, while preserving current domain behavior and staying inside current feature scope.

</domain>

<decisions>
## Implementation Decisions

### Responsive structure
- **D-01:** Use one shared component with variant props (`mobile|desktop|auto`) instead of separate components per breakpoint.
- **D-02:** Row tap/click is primary open action; inline secondary actions remain visible.
- **D-03:** Shared standardized states: skeleton loading rows, empty state with helper text + CTA, and inline retry error state.
- **D-04:** Compact default density: primary description; secondary due/next date + status; trailing amount + actions.

### Shared API contract
- **D-05:** Shared list receives a view-model contract (`DebtListItemVM` style); each page maps domain entities to this VM.
- **D-06:** Use capability-based optional callbacks (`onOpen`, `onConfirm`, `onDelete`, `onCopy`) and show actions only when callback exists.

### Permissions and confirmation behavior
- **D-07:** Public pages are read-only by default.
- **D-08:** Exception: friend public page can expose host-only confirmation flow for received payments.
- **D-09:** "Confirm paid" is a reversible toggle (on/off), not a one-way action.
- **D-10:** Toggle-off must fully undo toggle-on side effects.
- **D-11:** Undo semantics are strict full rollback of financial/projection effects, while keeping an audit trail.

### Extraction boundaries
- **D-12:** Extract UI concerns only (layout/row/state blocks/action slots). Keep domain math, permission rules, mutations, and toast logic in page/service layers.

### Navigation behavior
- **D-13:** Standardize row-open flow to modal across owner and public surfaces.
- **D-14:** On mobile, modal is full-screen sheet/modal style.

### the agent's Discretion
- Exact prop/type names for shared VM and callback interfaces.
- Final copy text wording for empty/error/retry states.
- Internal component composition details as long as decisions above remain true.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirements sources
- `.planning/ROADMAP.md` - Phase 2 boundary and current milestone sequencing.
- `.planning/REQUIREMENTS.md` - Overall product constraints and traceability context.
- `.planning/PROJECT.md` - Project-level constraints (local-first, correctness over convenience).

### Existing architecture and conventions
- `.planning/codebase/CONVENTIONS.md` - UI/TS conventions, MoneyValue and component usage patterns.
- `.planning/codebase/STRUCTURE.md` - Existing frontend/backend file layout and integration points.
- `.planning/codebase/STACK.md` - React/TanStack/shadcn stack decisions affecting implementation style.

### Concrete implementation anchors
- `web/src/components/CompactEntityTable.tsx` - Current compact list/table pattern and action affordances.
- `web/src/pages/friends.tsx` - Current owner debt list flows, state handling, and mutation usage.
- `web/src/pages/friend-public.tsx` - Public friend flow constraints and confirmation-related behavior.
- `web/src/pages/group-public.tsx` - Public group flow constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/components/CompactEntityTable.tsx`: Existing compact mobile+desktop responsive list/table pattern with optional actions.
- `MoneyValue` usage across friends/public pages: established money rendering (sign/tone/currency consistency).
- Existing page-level modal patterns in `web/src/pages/friends.tsx`: reusable interaction shell for row-open standardization.

### Established Patterns
- Page-level `useQuery`/`useMutation` orchestration in pages; presentational components remain lightweight.
- Capability-driven actions already appear in list rows (`onCopy`, `onOpen`, conditional confirm/delete).
- Empty/loading handling currently repeated; good extraction candidate into shared UI states.

### Integration Points
- Primary extraction target: `web/src/pages/friends.tsx` debt list/table blocks.
- Secondary consumers: `web/src/pages/friend-public.tsx` and `web/src/pages/group-public.tsx`.
- Shared component likely lives under `web/src/components/` and is fed VM data/callbacks from each surface.

</code_context>

<specifics>
## Specific Ideas

- Public pages stay read-only except host-specific confirm flow in friend-public.
- Confirmation must be reversible with strict rollback parity.
- Move toward modal-based detail interaction uniformly, with full-screen mobile modality.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 02-shared-debt-list-components*
*Context gathered: 2026-04-18*
