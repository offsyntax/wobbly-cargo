# HANDOFF — read first, update last

Purpose: any new session (or a teammate) can resume from here without reading old chats.
Keep the top sections short and current (rewrite them; don't append). Only the Session log
grows; keep the last 10 entries here and move older ones to `docs/handoff-archive.md`.

## Current state
- Date: 2026-10-19 · Milestone: **M0 done** (on branch `claude/intelligent-ritchie-e4z909`;
  phone link goes live once merged to `main` + Pages enabled) · Next: **M1 Core feel**
- Summary: Vite + TS + Phaser 4.2.1 + planck 1.5.1. Blank Game scene (ground, falling planck
  box, atlas test sprite) at 390×844 FIT/letterbox. Platform interface + `local` adapter (saves,
  pause/resume, ad stubs). All scripts exist and pass: `check` (9 unit tests, dist 1.51 MB),
  `e2e` (3 viewport sizes, no console errors, no external requests), `art`, `art:preview`,
  `levels:verify` (0 levels yet), `zip` (394 KB), `audio` (no sources yet).

## Milestones
- [x] M0 Setup · [ ] M1 Core feel · [ ] M2 Content & meta · [ ] M3 Polish & platform ·
  [ ] M4 QA & submission  (definitions: `docs/GDD.md` §13)

## In progress
- Nothing.

## Next steps (in order)
1. M1 step 1 (`physics-specialist`): in `src/sim/` build the vehicle (chassis + 2 wheels via
   planck `WheelJoint`, suspension Hz/damping from `src/data/vehicles.ts`, rear motor) and
   one-finger control (hold = throttle, release = brake; in air hold = nose up) on a flat +
   one-ramp test terrain; deterministic unit test. Render it as plain shapes in `GameScene`.
2. Then terrain from level JSON (`src/levels/city-01.json`) + portrait camera (GDD §6).
3. Then cargo (eggs) + breakage, finish/fail detection, art v1, core audio + Sound Lab (§11).

## Waiting on humans
- User: make the repo public (Settings → General → Change visibility), then Settings → Pages →
  Source: **GitHub Actions**. Then re-run the "Deploy to GitHub Pages" workflow on `main`
  (workflow_dispatch) → https://offsyntax.github.io/wobbly-cargo/
- Phone smoke test of that link (game loads, letterboxed, box falls onto ground).
- Playgama / Mediacube replies (payout terms, Türkiye eligibility, revenue per 1,000 plays).

## Open issues / risks
- Portrait side-view may feel cramped → validate camera zoom/look-ahead in M1.
- Exact Playables / Playgama SDK method names must be verified against official docs (M3).
- Phaser chunk is 1.58 MB raw (404 kB gzip); fine for budget, revisit custom build in M3.
- No web fonts yet (system sans-serif); bundle Lilita One + Nunito in `public/fonts` in M1/M2.

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
- 2026-10-19 Vite `base: './'` (relative paths) so the same build works on GitHub Pages and in portal ZIPs.
- 2026-10-19 e2e pins `@playwright/test` 1.56.1 (matches pre-installed Chromium 1194; never
  `playwright install`). Art pipeline: resvg + sharp, own shelf packer, atlas committed.
- 2026-10-19 Platform: game code only uses `getPlatform()` from `src/platform`; `local` adapter
  for dev, `playables`/`playgama` in M3.
- 2026-10-19 Replies to the user are in Turkish (game UI text stays English).
- 2026-10-19 Phone test hosting: repo made public so free GitHub Pages works (user's choice).
- 2026-10-19 Sim stepper clamps at 5 steps/frame and drops extra backlog (no spiral of death).

## Key files
- Rules: `CLAUDE.md` · Design & milestones: `docs/GDD.md` · Visual reference: `docs/reference/`
- Agents: `.claude/agents/` · Settings & hooks: `.claude/settings.json`, `.claude/hooks/`

## How to resume
1. Read this file (a SessionStart hook prints it automatically), then the GDD section for the
   current milestone.
2. Check `git log --oneline -10` and run `npm run check` via `qa-runner` before new work.
3. Never run `playwright install`; `npm run e2e` uses the pinned Playwright + preinstalled Chromium.

## Session log (newest first, max 10 entries; 3–5 lines each)
- 2026-10-19 · M0 · Hooks chmod +x; scaffold (`src/sim` FixedStepper + tests, Boot/Preload/Game
  scenes, size check), platform `local` adapter, Playwright e2e, art pipeline, Pages workflow,
  stub scripts. M0 done · next: M1 vehicle physics · blocker: merge + enable Pages ·
  budget: M0 used ~4 subagent runs.
- 2026-10-19 · setup · Docs, agent config, visual reference and handoff created. Next: M0.
