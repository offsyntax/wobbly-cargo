# Wobbly Cargo — agent instructions

Responsive (fills any screen) 2D physics driving game for web portals. Drive with one finger
or one key and deliver fragile cargo (eggs, ice cream) to the finish without breaking it. Full design, milestones and
checklists: `docs/GDD.md`. Read it at the start of each milestone, not every turn.

Distribution order: YouTube Playables (via Playgama / Mediacube) → CrazyGames → Poki →
later mobile (Capacitor). Game UI text is English; strings live in `src/i18n/en.json`.

## Stack (do not change without asking)
- TypeScript (strict), Vite, Phaser 4.x (MIT) for rendering/input/audio/scenes.
- planck.js (MIT, Box2D port) for physics. No other runtime dependencies without asking.
- Node LTS. Dev deps allowed for tooling (vitest, eslint, playwright, svg → png, atlas packer).

## Hard platform constraints (a build that breaks one of these is a failed build)
1. Total build target < 5 MB. Platform limit: initial load < 30 MB, no single file > 30 MB.
2. Ship plain files. Do not rely on pre-compressed .gz/.br assets.
3. Zero external network calls at runtime: no CDNs, no Google Fonts, no analytics, no fetch to
   other domains. Fonts, sounds and images are bundled.
4. Responsive, full-viewport: playable at every aspect ratio, fills the viewport (no
   letterbox/pillarbox in gameplay; the visible world grows instead), adapts live on resize
   without losing state, never locks orientation, text/art crisp at every size and DPR, HUD
   anchored to edges + safe-area insets. Test sizes: 390×844, 844×390, 600×600, 1280×720,
   1920×1080. Camera rule: GDD §6.
5. Respect platform pause / resume and audio on/off immediately (stop sim, mute all audio).
6. Saves only through the platform adapter (`src/platform`). No direct localStorage in game code.
7. Ads only through the platform adapter. No banners. Never show an ad during active driving.
8. One-input control: hold touch / hold mouse / hold Space or ↑ (touch + mouse are Playables
   MUSTs). Understandable in ~10 seconds, no tutorial longer than one screen.
9. ≥ 30 FPS on mid-range phones, first playable frame < 5 s on 4G.

## Architecture
- `src/sim/`: pure physics and game rules (planck only, NO Phaser imports). Deterministic fixed
  step 1/60 s with accumulator. Units are meters; `PPM = 40` px per meter for rendering.
- `src/scenes/`: Boot, Preload, Menu, LevelSelect, Game, Fail, Complete, Garage, Pause.
- `src/render/`: draws sim state (terrain polygons, vehicle sprites, cargo, particles, camera).
  Keep it swappable: gameplay physics is 2D for good, but a 3D-look render layer (e.g. blocky
  Three.js) may replace the 2D art later. Sim must never depend on render.
- `src/platform/`: `Platform` interface + `local` (dev), `playables` (YouTube `ytgame` SDK),
  `playgama` (Playgama Bridge). Game code only talks to the interface. Verify SDK method
  names against the official docs before implementing; do not guess.
- `src/data/`: vehicles, cargo types, upgrades, economy constants (JSON or typed TS).
- `src/levels/*.json`: level data (schema in `docs/GDD.md`). Levels are data, never code.
- `tools/`: art build, level bot, size check.

## Art rules (no human designer; you are the artist)
- Visual reference: `docs/reference/` (read its README). PNGs are the target look; the
  `.dc.html` files hold SVG shapes you may reuse in `art/src/`. Never ship them in the build.
- Style: flat fills, thick dark outline `#1E1B2E` (4 px world objects, 3 px small details/UI),
  round line joins, no gradients, no textures, no emoji, nothing that looks AI-generated.
- Palette: ink `#1E1B2E` · ink-soft `#4A4560` · white `#FFFFFF` · primary yellow `#FFC93C` ·
  go green `#4CC26B` · info blue `#4FB3FF` · vehicle red `#E8443A` · danger text `#D7372E`.
  City: sky `#9ED8F5`, skyline `#C3E6F7`, far hills `#A6DB8C`, grass `#6BBF59`, dirt `#9B6A3E`.
  Desert: sky `#FFD9A6`, sun `#FFB347`, dunes `#F6C987`, ground `#E9A54F`, canyon `#C9813F`.
  Cargo: egg `#FFF8EC`, crate `#C98B4E`, scoops `#FF8FB1` `#8FE3C3` `#FFF1C9`.
- Fonts: Lilita One (headings, buttons), Nunito 700/800 (body). OFL, bundled in `public/fonts`.
- Sources are hand-written SVG in `art/src/`. `npm run art` rasterizes to PNG (@2x) and packs
  one atlas into `public/atlas/`. Never hand-edit generated files.
- Terrain, particles (dust, egg splat, confetti, sparks) and screen effects are drawn in code.
- After creating or changing art, render a preview sheet (`npm run art:preview`) and look at the
  screenshot yourself before showing it to the user. Fix obvious issues first.

## Third-party assets & licenses (audio, fonts, icons, art, code)
Only open / free licenses that allow commercial use in a monetized game:
- **Allowed:** CC0 / public domain (preferred), CC-BY 4.0 (attribution required: add to
  `ASSETS_LICENSES.md` AND the in-game Credits screen), SIL OFL (fonts), MIT / ISC / BSD /
  Apache-2.0 / zlib (code and icon sets).
- **Forbidden:** any NC (non-commercial), ND (no derivatives), SA / share-alike, GPL/LGPL code in
  the game bundle, "free for personal use", custom/unclear licenses, paid packs, anything ripped
  from other games, and files whose license you cannot verify on the source page.
- **Sources:** Kenney.nl (CC0 audio, UI, sprites), OpenGameArt.org (filter CC0/CC-BY, verify per
  file), Freesound.org (CC0 or CC-BY only, verify per file), incompetech.com music (CC-BY 4.0,
  credit required), Google Fonts (OFL), Lucide (ISC) / Tabler (MIT) icons if needed. Procedurally
  generated SFX (e.g. jsfxr-style code) are our own work.
- Audio budget: total < 1.5 MB (mono SFX, 1–2 s seamless engine loops, one music loop).
  Sound quality is a core pillar: full spec in `docs/GDD.md` §11 (engine RPM layers, brake/skid,
  impulse-driven impacts, cargo sounds, mixing buses, Sound Lab).
- Every third-party file goes into `ASSETS_LICENSES.md` (file, author, source URL, license, any
  modifications) the moment it is added. Include the Phaser, planck.js and OFL font licenses.
- When unsure about a license: don't use the file; generate or draw our own instead.

## How to work
- Work in small vertical slices that are playable after each step.
- After every slice: `npm run check` (typecheck, lint, unit tests, build, size check).
  Before claiming a level works: `npm run levels:verify` must pass for it.
- Commit after each green slice with a short message. Never commit secrets.
- Keep `docs/HANDOFF.md` current (see "Handoff" below). Never end a turn that changed files
  without updating it.
- Do not refactor unrelated code. Prefer simple, readable code over abstractions.
- You cannot hear audio. Verify sounds objectively (duration, loudness, peaks, loop seams via
  ffmpeg) and ask the user to listen in the dev Sound Lab before calling a sound done.
- Ask before: adding a dependency, changing the stack, changing the art direction, or anything
  that affects the platform constraints above.

## Commands
- `npm run dev` (run in background, never block the session)
- `npm run check` · `npm run build` · `npm run size` · `npm run art` · `npm run art:preview`
- `npm run levels:verify` (headless level bot) · `npm run e2e` (Playwright smoke + screenshots)
- `npm run zip` (submission ZIP for Playgama / Playables)
- `npm run audio` (trim, loop, normalize, convert sources in `audio/src` → `public/audio`)
- `/sound-lab` dev page: audition every sound + engine RPM slider (never in production build)

## Models, effort & subagents
Main agent: Opus 5.5, effort `high` (set in `.claude/settings.json`). The main agent plans,
decides, reviews and integrates. It delegates implementation work to the subagents in
`.claude/agents/`, each pinned to a model and effort that fit the difficulty:

| Subagent | Model | Effort | Use for |
|---|---|---|---|
| `physics-specialist` | Opus | high | vehicle/cargo physics, driving feel, stubborn physics bugs |
| `platform-integrator` | Opus | medium | YouTube Playables + Playgama SDK adapters |
| `svg-artist` | Opus | medium | all SVG art, previews, self-review |
| `level-designer` | Sonnet | medium | level JSON + level bot tuning |
| `ui-builder` | Sonnet | medium | scenes, menus, HUD, screens, setup/scaffolding |
| `sound-designer` | Opus | medium | engine/brake/impact audio system, SFX sourcing + processing, mix |
| `qa-runner` | Haiku | low | run checks/tests/builds, return failures only (read-only) |
| `quick-fix` | Haiku | low | small, fully specified edits (rename, copy, constant tweak) |

Rules:
- Prefer the cheapest subagent that can do the job; escalate (Haiku → Sonnet → Opus) only after
  a failed attempt, and say why.
- Give subagents precise briefs (files, acceptance criteria) so they don't explore broadly.
- For one hard reasoning step, use `ultrathink` in that single prompt instead of raising effort.
- Do NOT use ultracode / dynamic workflows. Ultracode is not an effort level: it makes every
  substantive task fan out into many agents, multiplying token use. It is meant for large-codebase
  audits and migrations, not for building a small game, and would burn the budget.
- Do NOT use Fable (may bill to usage credits). Do NOT set `CLAUDE_CODE_EFFORT_LEVEL` or
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: they override the per-subagent settings above.

## Token budget rules (fixed budget: ~$100 for the playable MVP)
- Main agent at `high` is the biggest cost driver: keep main-agent turns short and push
  implementation and verbose output into subagents.
- Be concise in replies. No long explanations unless asked.
- Never read `dist/`, `node_modules/`, generated atlases or lockfiles.
- Run tests and builds through `qa-runner` (failures only); never paste long logs into the main
  context.
- Screenshots cost tokens: only for art reviews and final QA, at most a few per task.
- At the end of each milestone, remind the user to check usage (`/usage`, claude.ai Settings >
  Usage). If more than ~40% of the budget is gone after M1, suggest switching the main agent to
  effort `medium` (Opus 5.5 medium ≈ Opus 5 high).
- The user starts a new session (or runs `/compact`) between milestones; keep this file under
  ~190 lines.

## Handoff (`docs/HANDOFF.md`): the single source of "where are we"
- Session start: a SessionStart hook prints HANDOFF.md, recent commits and uncommitted files.
  Read it, then only the GDD section for the current milestone. Don't re-read everything.
- After every green slice, before `/compact`, and before ending a turn that changed files:
  1. Rewrite Current state, Milestones, In progress, Next steps (exact, actionable), Waiting on
     humans (Sound Lab listens, playtests, publisher replies), Open issues.
  2. Add new Decisions with date (never delete; mark superseded ones).
  3. Prepend one Session log entry (3–5 lines: done · next · blockers · budget note).
  4. Commit it together with the slice.
- Keep it under ~150 lines: rewrite, don't append; move old log entries to
  `docs/handoff-archive.md`.
- Write it for a stranger: file paths, command names, exact next step. No chat history.
- A Stop hook blocks finishing when files changed since the last handoff update; then just
  update HANDOFF.md (do not argue with the hook).
- Subagents don't edit HANDOFF.md; they report back and the main agent updates it.

## Compact instructions
When compacting, keep: current milestone, failing checks, file paths touched, open decisions.
Update `docs/HANDOFF.md` before compacting.
