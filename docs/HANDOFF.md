# HANDOFF — read first, update last

Purpose: any new session (or a teammate) can resume from here without reading old chats.
Keep the top sections short and current (rewrite them; don't append). Only the Session log
grows; keep the last 10 entries here and move older ones to `docs/handoff-archive.md`.

## Current state
- Date: 2026-10-19 · Milestone: **M0 in progress** (hooks executable; scaffold being built)
- Summary: Concept, engine, art direction, sound spec, licensing, models and budget are decided
  (see Decisions). No code yet.

## Milestones
- [ ] M0 Setup · [ ] M1 Core feel · [ ] M2 Content & meta · [ ] M3 Polish & platform ·
  [ ] M4 QA & submission  (definitions: `docs/GDD.md` §13)

## In progress
- M0 slice 1: Vite + TS + Phaser 4 + planck scaffold, blank Game scene, `npm run check`.

## Next steps (in order)
1. Implement M0 exactly as defined in `docs/GDD.md` §13.

## Waiting on humans
- Playgama / Mediacube replies (payout terms, Türkiye eligibility, revenue per 1,000 plays).
- Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) once the workflow exists.

## Open issues / risks
- Portrait side-view may feel cramped → validate camera zoom/look-ahead in M1.
- Exact Playables / Playgama SDK method names must be verified against official docs.

## Decisions (do not revisit without the user)
- 2026-10-19 Target: web portals first (YouTube Playables via Playgama/Mediacube, CrazyGames,
  Poki), mobile later via Capacitor.
- 2026-10-19 Concept: portrait, level-based 2D physics driving with fragile cargo + garage
  upgrades ("Wobbly Cargo"). Physics 2D for good; render layer kept swappable (3D look later).
- 2026-10-19 Engine: Phaser 4 + planck.js (both MIT, free). No paid engines or services.
- 2026-10-19 Art: flat vector, thick `#1E1B2E` outlines, palette in CLAUDE.md, references in
  `docs/reference/`. No human designer; agents make all art.
- 2026-10-19 Sound: core pillar, full spec in GDD §11; humans approve sounds in the Sound Lab.
- 2026-10-19 Licensing: CC0 / CC-BY 4.0 (credited) / OFL / MIT-family only.
- 2026-10-19 Models: main Opus 5.5 high; subagents per CLAUDE.md table; no ultracode, no Fable.
  Budget ≈ $100 for the playable MVP.

## Key files
- Rules: `CLAUDE.md` · Design & milestones: `docs/GDD.md` · Visual reference: `docs/reference/`
- Agents: `.claude/agents/` · Settings & hooks: `.claude/settings.json`, `.claude/hooks/`

## How to resume
1. Read this file (a SessionStart hook prints it automatically), then the GDD section for the
   current milestone.
2. Check `git log --oneline -10` and run `npm run check` via `qa-runner` before new work.

## Session log (newest first, max 10 entries; 3–5 lines each)
- 2026-10-19 · setup · Docs, agent config, visual reference and handoff created. Next: M0.
