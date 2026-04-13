# TripCanvas Migration

WordPress → Cloudflare Pages + Workers + D1 + R2

## Quick Reference

| App | URL | Command |
|---|---|---|
| CMS Admin | https://cms.tripcanvas.co/admin | `pnpm dev:cms` |
| Frontend | https://tripcanvas.co | `pnpm dev:frontend` |

## Working with Opencode / AI Agent

This repo is set up for AI-assisted development.

- **`CLAUDE.md`** — permanent project context, read every session
- **`AGENTS.md`** — current phase task list, swap when a phase completes

### Starting a session
Open the repo in Opencode. The agent will automatically read `CLAUDE.md`
and `AGENTS.md` and continue from the last incomplete task.

If starting fresh: tell the agent:
> "Read CLAUDE.md and AGENTS.md, check git log, and continue the migration."

### Completing a phase
When all tasks in `AGENTS.md` are done:
1. Check off the phase in `CLAUDE.md`
2. Run: `cp AGENTS-phase{N+1}.md AGENTS.md`
3. Commit and start the next session

## Phases

| Phase | File | Status |
|---|---|---|
| 1 — WP Export | `AGENTS.md` | Active |
| 2 — Payload + CF Setup | `AGENTS-phase2.md` | Pending |
| 3 — Data Migration | `AGENTS-phase3.md` | Pending |
| 4 — Astro Frontend | `AGENTS-phase4.md` | Pending |
| 5 — DNS Cutover | `AGENTS-phase5.md` | Pending |

## Stack

- **Frontend**: Astro + Cloudflare Pages
- **CMS**: Payload CMS v3 + Cloudflare Workers
- **DB**: Cloudflare D1 (SQLite)
- **Media**: Cloudflare R2
- **Tooling**: pnpm workspaces, TypeScript, Wrangler
