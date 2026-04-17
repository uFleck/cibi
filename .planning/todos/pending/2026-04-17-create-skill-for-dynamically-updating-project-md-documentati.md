---
created: 2026-04-17T00:24:18.181Z
title: Create skill for dynamically updating project .md documentation
area: tooling
files: []
---

## Problem

Project documentation (architecture, API docs, conventions) goes stale as code evolves. Need a way to keep .md docs in sync with codebase changes automatically — ideally a Claude Code skill that re-reads relevant source files and updates the docs in place.

## Solution

Write a new superpowers/GSD-compatible skill (`gsd-docs-update` or similar) that:
- Scans recently changed files (git diff) to detect what changed
- Identifies affected doc sections
- Rewrites stale sections with current codebase truth
- Commits updated docs atomically

Could integrate with a post-execute hook or be invoked manually after a phase completes.
