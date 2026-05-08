# Local agent instructions

No project-local AM/Workflow Lite tools configured.

## Mandatory execution policy

1. **Plan first, always.**
   - Before any code change, produce an explicit implementation plan (steps, files, verification).
2. **Clarify until unambiguous.**
   - Ask targeted clarifying questions for missing or conflicting requirements.
   - Do not guess behavior, scope, or acceptance criteria.
3. **Hard block on coding before approval.**
   - After drafting the plan, stop and request explicit user confirmation.
   - Do not edit files, run implementation commands, or generate patches until the user approves the plan.
4. **If user says “implement now” with ambiguity present.**
   - Refuse implementation politely, list blockers, and ask the minimum questions needed to unblock.
5. **Isolate delegated changes in git worktrees.**
   - For delegated/parallel implementation runs, use isolated git worktrees (`worktree: true`).
   - Prefer worktrees for risky multi-file changes to avoid cross-task interference.

Default behavior when uncertain: ask, do not implement.

## Post-ship requirement

- After shipping any feature/change, always run:
  - `make upd`
- Treat this as mandatory unless the user explicitly says not to.
