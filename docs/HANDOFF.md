# HANDOFF — read first, update last

Purpose: any new session (or a teammate) can resume from here without reading old chats.
Keep the top sections short and current (rewrite them; don't append). Only the Session log
grows; keep the last 10 entries here and move older ones to `docs/handoff-archive.md`.

## Current state
- Date: 2026-10-20 · Milestone: **M1 — "fun slice" gate.** User stopped new content work after the
  first playtest ("no fun yet"). Goal: ONE hand-crafted 30–40 s level `fun-01` that makes a
  first-time player say "one more try"; the user plays it and decides whether we continue.
- Built so far (on `main`): GameSim (pickup, eggs, rules, bot), city-01..03 (judged weak),
  procedural audio (judged bad), HUD/overlays, responsive camera, art v1 (judged weak).

## Milestones
- [x] M0 Setup · [ ] M1 Core feel · [ ] M2 Content & meta · [ ] M3 Polish & platform ·
  [ ] M4 QA & submission  (definitions: `docs/GDD.md` §13)

## In progress
- `physics-specialist`: HCR feel retune (GDD §5 targets), firm release brake + `telemetry.braking`,
  low bed walls (top y +0.30) and lively eggs, coins as sensors, `land.perfect`, obstacle props
  (`seesaw`, `log`, `rocks`, `bumpRow`) in `src/data/props.ts`.
- `svg-artist`: pickup redraw (geometry in GDD-aligned numbers: wheels r 0.36 at ±1.15/−0.50, bed
  floor +0.05, walls +0.30), egg hairline/cracked/splat + yolk/shell particles, skyline buildings
  with windows + clouds + hills from reference 01/02, obstacle sprites, sparkle/confetti/dust, HUD
  icons from the reference.

## Next steps (in order)
1. `level-designer`: `src/levels/fun-01.json` (30–40 s): small bumps, dip, ramp jump, gap, steep
   hill, rocks, final drop; ≥ 3 obstacle types; a cargo threat every 3–5 s. Default level = fun-01.
2. `ui-builder` A (no GameScene edits): `src/render/background.ts` (3 parallax layers + clouds from
   reference sprites) + HUD rework per reference (pause, level pill, coins, progress, cargo meter;
   safe area at every size; HOLD hint never cropped) + camera zoom rule (GDD §6 revised).
3. `ui-builder` B (owns GameScene): juice — landing dust, shake by impulse, chassis squash, coin pop
   + sparkle + rising-pitch combo, PERFECT LANDING text, finish confetti, near-break 0.3 s slow-mo +
   cargo-meter wobble, funny fail (eggs fly, slow-mo, splat on screen), egg crack states, brake
   lights/dust; then integrate A.
4. Screenshots: landscape, portrait, crash moment; compare with reference 01/02; merge; test link.
5. Sounds: after the user allows kenney.nl / opengameart.org / freesound.org (pending).

## Waiting on humans
- User: add kenney.nl, opengameart.org, freesound.org to the environment's Allowed domains
  (needed for recorded CC0 sounds).
- Sound Lab listen (`npm run dev` → `/sound-lab.html`): engine crossfades/loop clicks, rev/landing
  dip, impact tiers, squeak, egg crack/splat, rattle level. All 24 sounds are synthetic.
- Test link is LIVE (repo public, Pages on, PR #1 merged): https://offsyntax.github.io/wobbly-cargo/
  Every push to `main` redeploys. User verified on iPhone 2026-10-19: portrait fills the screen,
  landscape letterboxes (390×520 centered) as intended. M0 phone test PASSED.
- Phone smoke test of that link (game loads, letterboxed, box falls onto ground).
- Playgama / Mediacube replies (payout terms, Türkiye eligibility, revenue per 1,000 plays).

## Open issues / risks
- Portrait side-view may feel cramped → validate camera zoom/look-ahead in M1.
- Exact Playables / Playgama SDK method names must be verified against official docs (M3).
- Phaser chunk is 1.58 MB raw (404 kB gzip); fine for budget, revisit custom build in M3.
- Levels may be too forgiving: holding all the time never breaks an egg on city-01..03 (only
  damage). Fine for teaching levels; confirm with the user's playtest.
- Physics: a 1.5 m ramp onto flat ground breaks eggs at any speed → levels need downslope
  landings. Eggs survive a 4 m hill ≤ 7 m/s, crack at ≥ 9 m/s.
- Audio: impact tiers tuned from bot runs (0.8/1.9/4/12 N·s, `wheelOmegaAtMax` 31); the bot rarely
  lands hard → retune the hard tier from human runs. Stereo pan by screen x not built. kenney.nl / freesound.org are
  blocked by the session proxy (403) → recorded CC0 sources would need network allowlisting.
- Camera still not good enough for the user (2026-10-20, "hatalar var"): revisit in M1 with
  the vehicle; ask the user exactly when it looks wrong (fall, landing, resize?) and record video.
- Landscape layouts (menus/HUD) need the user's approval via screenshots (portrait + landscape).
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
- 2026-10-20 Feel overhaul after the user's first playtest: Hill Climb Racing-style feel (targets
  in GDD §5), firm release brake with feedback, pickup redesigned (smaller wheels, raised bed),
  coins collectable, levels redesigned, sounds replaced by CC0 recordings once the user allows
  kenney.nl / opengameart.org / freesound.org in the environment's network settings.
- 2026-10-20 Level schema: `null` in `terrain` splits chains (gap); `platform` may take absolute
  top `y`. Cargo never collides with wheels (wheel tops poked through the bed floor).
- 2026-10-20 Audio: all M1 sounds are our own procedural synthesis (`tools/audio.mjs`), MP3 only;
  drop CC0 recordings into `audio/src` with the same names to replace them.
- 2026-10-20 Camera feel rules (GDD §6 "Smoothness"): interpolation, critically damped follow,
  dead zone, zoom hysteresis; e2e guards it (`CAM_D2_MAX = 0.01`). Tune values in M1 with the vehicle.
- 2026-10-20 Rendering: Phaser 4.2.1 has no `resolution` option → `Scale.NONE`, canvas backing
  store = CSS size × min(DPR, 2), world zoom = baseZoom·dpr/PPM, HUD on a zoom-1 UI camera.
  Anchor y interpolates on log(aspect) (0.55 at ≥16:9 … 0.62 at ≤9:16).
- 2026-10-20 Screen: responsive full-viewport at every aspect ratio (supersedes portrait-first
  and the adaptive-portrait decision below). Reason: Playables rules (all aspect ratios, live
  resize keeping state, no orientation lock, touch + mouse); side-view driving is landscape-native;
  CrazyGames/Poki traffic is mostly desktop. Camera rule: GDD §6. Input: touch/mouse/Space/↑.
- 2026-10-19 [SUPERSEDED 2026-10-20] Adaptive portrait: logical width fixed 390, height = clamp(390·vh/vw, 520, 900)
  (`src/scenes/viewport.ts`). Phones fill the screen; wider screens letterbox. Scenes must lay
  out from `this.scale.height` (top-anchored HUD, bottom-anchored ground), never a fixed 844.
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
- 2026-10-20 · fun-slice gate · User playtest: brake empty, sounds bad, truck ugly, coins useless,
  levels weak, no fun. User: stop content, build ONE fun level + juice + real background + HUD per
  reference. Camera zoom rule revised (GDD §6). Feel targets in GDD §5.
- 2026-10-20 · M1 playable · GameScene wired (`src/render/worldRenderer.ts`, `src/ui/{kit,Hud,
  Overlay}.ts`, `src/levels/index.ts`), fonts bundled, atlas @3x, audio tiers tuned. All checks
  green. Merged to main for the playtest. Next: user notes → tuning.
- 2026-10-20 · M1 sim · `GameSim` + Pickup + eggs + rules + bot; check 66 tests, test-01 3★ 17.8 s.
  Next: GameScene wiring (ui-builder) + city-01..03 (level-designer) in parallel.
- 2026-10-20 · M1 start · User: camera still not good, postpone, continue M1. Added sim contract
  `src/sim/types.ts`; launched physics / art / sound slices in parallel.
- 2026-10-20 · camera smoothness · User: camera felt wobbly/shaky. Added render interpolation
  (`src/render/interp.ts`), `CameraRig` (smoothDamp, ±10% dead zone, zoom hysteresis), e2e
  `camera smoothness` (max |Δ² scrollY| 0.022 → 0.0046). Merged to main. Next: user re-test, M1.
- 2026-10-20 · camera fix · User: no ground visible while airborne on desktop. Added
  `frameVertical()` (frames vehicle + ground, zoom ≥ ×0.75, 0.15 s smoothing; `GROUND_Y_M` →
  terrain height in M1), drop height 6 m, e2e 12/12. Merged to main. Next: user re-test, M1.
- 2026-10-20 · direction change · User: responsive full-viewport, no longer portrait-first.
  Docs updated (CLAUDE.md 4/8, GDD §1/4/6/13/14/15/17, ui-builder, reference README). Code:
  `src/render/{camera,view}.ts`, `src/input/hold.ts`, GameScene/main rewritten, e2e 10/10.
  Merged to main (PR #3). Next: user phone test both orientations, then M1 vehicle.
- 2026-10-19 · M0 follow-up · Repo public, Pages live, PR #1 merged. iPhone showed side bars →
  adaptive logical height (fills phones, letterboxes wide screens), e2e checks 390×664 fill.
  User re-checked on iPhone: OK. Next: M1 vehicle physics.
- 2026-10-19 · M0 · Hooks chmod +x; scaffold (`src/sim` FixedStepper + tests, Boot/Preload/Game
  scenes, size check), platform `local` adapter, Playwright e2e, art pipeline, Pages workflow,
  stub scripts. M0 done · next: M1 vehicle physics · blocker: merge + enable Pages ·
  budget: M0 used ~4 subagent runs.
- 2026-10-19 · setup · Docs, agent config, visual reference and handoff created. Next: M0.
