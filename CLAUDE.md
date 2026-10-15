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
  - `make upd` (builds the desktop app: `npm --prefix desktop run tauri build`)
- Treat this as mandatory unless the user explicitly says not to.

## Workflow

- The app is `desktop/`: a Tauri 2 shell (Rust in `desktop/src-tauri`) around a React + TypeScript UI (`desktop/src`). The domain logic is TypeScript in `desktop/src/domain`. There is no Go server and no Docker.
- Desktop work happens directly on `main` in this repo (no worktree).
- After finishing a change in this project, always commit and push it (standing permission; no need to ask). Stage only the files that belong to the change.
- If `make upd` fails with "access denied" on `target\release\cibi.exe`, the app is running: close it (`Stop-Process -Name cibi -Force`) and rebuild without asking.
- If `make upd` fails with `dlltool.exe not found`, a GNU `rustc` is shadowing the MSVC one: prepend `C:\Users\Pichau\.cargo\bin` to PATH (PowerShell) and re-run.
- The app must run on its own: no change should need a server, Go code, or web code.
- Do not open, copy, or change the personal database (`data/cibi.db`, or the app's `cibi.db` in `%APPDATA%\com.ufleck.cibi`) without asking.
