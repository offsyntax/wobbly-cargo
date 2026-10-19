# Wobbly Cargo — Game Design Document & Build Plan

Working title: **Wobbly Cargo** (check name availability on Playables, CrazyGames, Poki and the
app stores before launch). Version: MVP for web portals.

## 1. Why this game (validated research, Oct 2026)
- YouTube Playables: Racing is ~6% of the catalog but the best-performing genre for new titles
  (median ~404K plays for titles added Sep–Oct 2026, ~20% pass 1M). Brain & Puzzle is the most
  crowded and the weakest for new titles.
- Poki data: level-based "platform" car games are ~7% of car titles but ~30% of car plays
  (Drive Mad alone earned >$1M in 12 months and is not on Playables).
- "Drive with fragile cargo" is proven on web portals (Eggy Car, CrazyGames rating 8.6) and has
  no equivalent on Playables yet.
- Pure car-crash sandboxes and "punch the dummy" clones are already saturated. Do not drift there.
- Genre references only (do NOT copy names, art, levels, UI): Eggy Car, Drive Mad,
  Hill Climb Racing.

**Our differentiators:** fills every screen, level-based with stars, several cargo types, garage
upgrades, satisfying crash/splat moments that read well as YouTube Shorts clips.

## 2. Pillars
1. **Instant:** one finger, playable in 10 s, no menus before the first level.
2. **Tense:** every bump threatens the cargo. Speed vs. care is the core decision.
3. **Juicy:** wobble, squash, splat, coins, confetti. Failure is funny, not frustrating.
4. **Short:** 20–60 s levels, ~10 min sessions, instant retry.

## 3. Core loop
Play level (20–60 s) → result (stars = intact cargo, coins) → optional rewarded ×2 →
next level or garage upgrade → harder level / new world / new vehicle.

## 4. Controls
- One action, same on every input: hold touch anywhere / hold mouse button / hold Space or ↑.
- Hold: accelerate. Release: brake/coast (strong brake when nearly stopped is NOT
  reverse; no reverse in MVP).
- In the air, hold: rotate vehicle backward (nose up); release: rotate forward slowly
  (tune so landing flat is learnable).
- Pause button top-left; Esc or P also pauses. That is the entire control scheme.

## 5. Physics & rules (src/sim)
- planck world, gravity −10 m/s², fixed step 1/60, 8 velocity / 3 position iterations.
- Vehicle: chassis polygon + 2 wheel circles joined by `WheelJoint` (suspension spring:
  frequency Hz and damping ratio from vehicle data; motor on rear wheel, both on Monster).
- Bed has low side walls; cargo bodies are dynamic and NOT welded (they must wobble).
- Cargo integrity: each cargo unit has HP. Contact impulse above `breakThreshold` deals damage;
  a big impulse breaks it instantly. Cargo that leaves the bed region for > 0.5 s is lost.
- Stars: 3 = all cargo intact, 2 = one lost, 1 = two lost, 0 = all lost → level failed.
- Fail when: all cargo lost, vehicle roof touches ground for > 0.4 s, or vehicle falls off map.
- Terrain: `ChainShape` from level points (smoothed with Catmull-Rom in the editor/loader).
- Determinism: sim must produce the same result for the same inputs (needed by the level bot).

## 6. Screen & camera (responsive)
- The game fills the viewport at every aspect ratio; the visible world grows, never letterbox.
- Base zoom (px per metre) = min(viewW / 16 m, viewH / 9 m) (≈80 px/m at 1280×720, ≈120 at
  1920×1080, ≈24 at 390×844). Starting values, tune in M1.
- Vehicle ~32% from the left; vertical anchor ~55% from top in landscape, ~62% in portrait
  (interpolate by aspect).
- Dynamic look-ahead (velocity) and speed/air zoom (×0.75–×1.0) on top of the base zoom.
- Airborne framing: keep the ground under the vehicle in view (frame vehicle + ground with
  ~12% margins, zoom out down to ×0.75); if it still doesn't fit, the vehicle stays fully
  visible and the ground may leave the bottom. Never cut off the vehicle.
- Smoothness (`CameraRig` in `src/render/camera.ts`): render interpolation between sim steps;
  critically damped follow (x 0.25 s, y 0.45 s, zoom 0.8 s); vertical dead zone ±10% of view
  height (bounces and suspension bobbing never move the camera); zoom-in only after the need
  holds ≥ +0.05 for 0.5 s. Camera never rotates; screen shake only as a deliberate effect (M3).
- On resize/rotation: recompute zoom and UI layout in the same frame; never restart the level.
- Parallax: sky (static), skyline/dunes (0.2), far hills (0.45), terrain (1.0). Layers tile
  horizontally and cover the tallest portrait view.
- HUD anchored to corners with safe-area insets, scaled by min(viewW, viewH). Menus have two
  layouts: portrait = stacked (reference PNGs), landscape = side by side (Garage: vehicle left,
  upgrades right; Complete: stars/stats left, buttons right).
- Render for device pixel ratio; never stretch.

## 7. Content
### Worlds (MVP: City; v1.0: City, Desert, Snow)
| World | Palette | Signature elements |
|---|---|---|
| City | blue/green | rolling hills, speed bumps, ramps, small gaps |
| Desert | orange/sand | dunes, canyon gaps, big jumps |
| Snow (v1.0) | white/blue | low friction ice patches, steep drops |

### Level JSON schema (`src/levels/<world>-<nn>.json`)
```json
{
  "id": "city-01",
  "world": "city",
  "terrain": [[0, 0], [8, 0.2], [14, 1.5]],
  "start": [2, 1],
  "finishX": 120,
  "cargo": "egg",
  "cargoCount": 3,
  "coins": [[20, 3], [22, 3.5]],
  "props": [{ "type": "ramp", "x": 40, "w": 4, "h": 1.5 }],
  "parTimeSec": 30
}
```
Units are meters. Props in MVP: `ramp`, `bump`, `gap` (implicit via terrain), `platform`.

### Difficulty curve (MVP 15 levels, City)
1–3 teach: gentle hills, one bump, no gaps. 4–6: ramps + first small gap. 7–10: combos,
first "hold in air to land flat". 11–15: longer, tighter, one "breather" level every 4.
Level bot must confirm every level is completable with ≥ 2 stars by a simple policy, and the
human playtest must confirm level 1 is beatable by a first-time player in < 60 s.

### Vehicles (data-driven)
| Vehicle | Unlock | Traits |
|---|---|---|
| Pickup | start | balanced |
| Dolmuş (minibus) | 2,000 coins | long, stable, slow, carries 4 cargo |
| Monster | 5,000 coins | big wheels, soft suspension, bouncy |
| Tractor (v1.0) | 8,000 coins | slow, huge grip, climbs anything |

### Upgrades (per vehicle, levels 1–10)
Engine (torque/top speed), Suspension (softer, less impact on cargo), Tires (grip),
Grip/Air control (rotation speed in air). Cost curve: `round(100 × 1.45^(level−1))`, rounded to 10.

### Cargo types
| Cargo | MVP? | Behavior |
|---|---|---|
| Eggs ×3 | yes | light, fragile, roll around |
| Ice cream tower | v1.0 | 3 stacked scoops, top one falls first, wobble |
| Glass bottles | later | heavier, break on hard landings only |

## 8. Economy (tune with data later)
- Coins per level: 20 base + 15 per intact cargo + pickups (5 each) + 10 under par time.
- Target: one upgrade affordable roughly every 2 levels in the first 10 levels.
- Rewarded ×2 doubles the level reward only.

## 9. Monetization (through the platform adapter only)
- Platform pre-roll on launch is automatic (Playables); do nothing.
- Rewarded: "Continue" once per attempt after a fail (respawn on last safe point with cargo
  restored to state at checkpoint), "×2 coins" on Complete, "Skip level" after 3 fails.
- Interstitial: only after Complete or Fail screens, starting at level 5, at most every 2nd
  completion and never within 60 s of another ad, never right before/after a rewarded ad.
- No banners. No ads during driving. No in-app purchases in MVP (Playables has none yet).

## 10. Screens (visual reference: `docs/reference/*.png`, see its README)
HUD (pause, level pill, coins, progress bar with flag, cargo meter), Fail ("CARGO CRACKED!",
Continue with ad, Retry), Complete (stars, cargo/time/coins rows, ×2 coins, Next),
Garage (vehicle stage, vehicle chips with locks, 2×2 upgrade cards, PLAY), Menu (logo, Play,
level select, sound/music toggles, Credits), Pause (resume, restart, home, sound toggle).
First launch skips the menu and starts level 1 directly with the "HOLD TO DRIVE" hint.

## 11. Sound design (a core pillar: half of the "feel" is audio)
Goal: every physical action has a clear, satisfying, non-repetitive sound that reacts to the
physics in real time. Cartoon-realistic, punchy, never harsh. Owner: `sound-designer` subagent.

### 11.1 Engine system (most important sound; built in M1 together with the physics)
- Layered loops crossfaded by RPM: `idle`, `low`, `mid`, `high` (1–2 s seamless loops, mono).
- RPM model: from rear-wheel angular velocity + throttle (smoothed, with inertia). Airborne +
  throttle → RPM rises fast (free-spinning wheels); landing → RPM drops with a short "load" dip.
- Per-layer playback rate 0.8–1.8 driven by RPM; a low-pass filter opens with throttle
  (muffled when coasting, bright when flooring it).
- Throttle press: short "rev blip" one-shot. Throttle release: subtle exhaust "pop/burble"
  (random, max 1 per second).
- Each vehicle has its own sound profile (pickup = mid, Dolmuş = deep diesel, monster = big V8,
  tractor = chugging) using different source loops and pitch ranges in `src/data`.

### 11.2 Tires, brakes, suspension
- Brake: short brake squeak on release at speed; tire skid loop when wheel slip > threshold,
  volume and pitch by slip amount.
- Surface rolling layer: soft gravel/dirt (City), sand hiss (Desert), crunchy snow (Snow).
- Suspension creak/thunk when compression exceeds a threshold (cooldown 150 ms).

### 11.3 Impacts & physics events (driven by contact impulse)
- Vehicle landings and bumps: 3 tiers (soft / medium / hard) × 3 variations each; volume and
  pitch scale with impulse; random pitch ±5% and volume ±2 dB to avoid repetition.
- Crash / roof hit: metal crunch + rattle tail; scraping loop while the chassis slides on ground.
- Cargo: rattle/clack when cargo hits bed walls (quiet, frequent, rate-limited), egg crack
  (damage warning, tense), egg splat (break, wet and funny), ice-cream plop/squish, crate thud.
- Ragdoll passenger / props (later content): body thuds in 3 tiers, cartoon "oof" is optional
  (no voice in MVP).
- Rule: max 4 simultaneous voices per impact family; quieter voices are dropped first.

### 11.4 Feedback & UI
- Coin pickup: bright chime; consecutive coins within 1 s raise pitch by one semitone (combo).
- Air time: rising whoosh while airborne; clean landing "ding"; flip completed sparkle.
- Stars: 3 ascending notes; level complete jingle (≤ 2.5 s); fail sting (≤ 1.5 s, funny, not sad).
- UI: button tap, back, toggle, upgrade purchase (cash register), unlock fanfare.

### 11.5 Ambience & music
- One ambience bed per world at low volume (City: distant birds/traffic; Desert: wind).
- One cheerful music loop (or one per world later) with its own toggle.

### 11.6 Mixing & tech
- Web Audio graph via Phaser's audio context: buses `music`, `ambience`, `engine`, `sfx`, `ui`
  → master with compressor/limiter. Suggested start levels: music 0.35, ambience 0.25,
  engine 0.6, sfx 0.8, ui 0.7.
- Ducking: music −6 dB during jingles and crashes. Pause/menus: low-pass + reduced volume.
- Subtle stereo pan by screen x for impacts and coins.
- Audio unlock on first tap (the first "hold to drive" counts). Platform mute and pause stop or
  mute the master bus instantly.
- Asset processing (`npm run audio`, ffmpeg): trim silence, short fades, seamless loop points at
  zero crossings, loudness normalization (one-shots ≈ −16 LUFS short-term, loops quieter),
  peaks ≤ −1 dBFS, mono, MP3. Total audio budget < 1.5 MB.
- Dev-only **Sound Lab** page (`/sound-lab`, excluded from the production build): every sound
  as a button, plus an RPM/throttle slider per vehicle to audition the engine system, and bus
  volume sliders. The humans use it to review sounds.

### 11.7 Sources & quality control
- Sources only per CLAUDE.md licensing rules: CC0 first (Kenney, CC0 on Freesound/OpenGameArt),
  CC-BY 4.0 with credit, or our own procedurally generated / layered sounds.
- Prefer real recorded CC0 sources for engine and impacts (sound better than pure synthesis);
  layer and process them to build our own variations.
- The agent cannot hear: it verifies objectively (duration, loudness, peaks, loop seams,
  spectrum) and then the humans listen in the Sound Lab. A sound is "done" only after human OK.
Licensing: open/free licenses only (CC0 preferred, CC-BY 4.0 with credit, generated SFX).
Full rules and allowed sources: CLAUDE.md "Third-party assets & licenses".
A small Credits screen (Settings → Credits) lists all CC-BY authors plus Phaser, planck.js
and font licenses.

## 12. Localization
EN in MVP. Then TR, ES, PT-BR (string JSON + font coverage). Arabic needs RTL layout for UI
text; do it after launch. Store titles/descriptions per language are prepared separately.

## 13. Milestones & acceptance criteria
Model/effort guidance per milestone is in §16.

**M0 — Setup (½ day)**
Vite + TS + Phaser + planck project, folder structure from CLAUDE.md, `npm run check` / `size` /
`e2e` scripts, platform adapter with `local` implementation, art pipeline skeleton, GitHub Pages
(or equivalent) deploy of `main` for phone testing. Make both `.claude/hooks/*.sh` executable
(`chmod +x`) and keep `docs/HANDOFF.md` updated from the first commit.
Done when: blank Game scene runs on a phone via the test link; all scripts exist and pass;
HANDOFF.md reflects the finished M0 and names the first M1 step.

**M1 — Core feel (day 1)**
Vehicle + wheel joints, one-finger control, air rotation, eggs on bed with breakage, responsive
camera (§6) with look-ahead/zoom and live resize, terrain from JSON, 3 levels, finish line, fail/complete detection,
pickup + egg + crate SVG art v1. Core audio wired to physics (§11.1–11.3): engine layers + rev,
brake/skid, bump/land impacts, egg crack/splat, plus the Sound Lab page.
Done when: the user plays 3 levels on a phone in portrait AND landscape and on desktop and says
the driving "feels good"; rotating mid-level keeps the run; level bot passes.

**M2 — Content & meta (day 2)**
15 City levels, coins, stars, save/load, Complete/Fail/Garage/Menu/Pause screens per reference
(portrait + landscape layouts for every screen, §6),
upgrades affecting physics, Dolmuş unlock.
Done when: a fresh player can play 15 levels, earn coins, buy an upgrade, and progress persists
after reload.

**M3 — Polish & platform (day 3)**
Final art pass + atlas, particles, screen shake, full sound pass (all §11 events, per-vehicle
engine profiles, ambience, music, mixing/ducking), settings, Playables adapter
(firstFrameReady/gameReady, pause/resume, audio, save, ads, score) and Playgama Bridge adapter,
logo + 3 cover image options, `ASSETS_LICENSES.md` complete.
Done when: Playables test suite / publisher checks pass locally; build < 5 MB.

**M4 — QA & submission (day 4)**
QA checklist (§14) green, submission ZIP, store texts, screenshots, upload to Playgama,
CrazyGames submission, Mediacube form.
Done when: build submitted to at least one publisher.

## 14. QA checklist (must all pass before submission)
- [ ] Size: total < 5 MB, no file > 30 MB, no pre-compressed assets required.
- [ ] Network: zero requests to external domains (verify in Playwright network log).
- [ ] Layout fills the viewport at 390×844, 844×390, 600×600, 1280×720, 1920×1080 and
      2560×1080: no black bars in gameplay, HUD visible, nothing cropped.
- [ ] Live resize/rotation keeps state (mid-level, mid-air, in menus).
- [ ] Every action works touch-only, mouse-only and keyboard-only.
- [ ] Pause/resume and mute/unmute from platform work instantly, including mid-air.
- [ ] Save survives reload; corrupted save falls back to defaults.
- [ ] No ad during driving; interstitial frequency rules hold; rewarded grants reward once.
- [ ] 30+ FPS on a mid-range Android phone; first frame < 5 s on throttled 4G.
- [ ] Level bot passes all levels; first-time player beats level 1 in < 60 s.
- [ ] All fonts, sounds, images listed in `ASSETS_LICENSES.md` with license.
- [ ] No console errors.
- [ ] Audio: every §11 event has a sound; no clipping (peaks ≤ −1 dBFS); loops seamless; no
      sound repeats identically on rapid triggers; engine reacts to throttle/air/landing;
      humans approved all sounds in the Sound Lab; audio total < 1.5 MB.

## 15. Submission kit (prepare in M4)
Game ZIP (Playgama: Bridge SDK integrated, orientation "any/both" if asked), title, short + long description (EN),
512×512 icon, cover/thumbnail images in the sizes each portal requests (check current portal
specs at submission time), 3–5 screenshots in landscape and portrait, 15–30 s gameplay video in 16:9 plus a 9:16 Shorts
cut.

## 16. Model, effort & budget plan
Budget: about $100 of usage for the playable MVP. Main agent: Opus 5.5 at `high` (orchestrates,
decides, reviews). Implementation goes to subagents defined in `.claude/agents/` (see the table
in CLAUDE.md "Models, effort & subagents"):

| Milestone | Main subagents |
|---|---|
| M0 setup | `ui-builder` (Sonnet medium), `qa-runner` (Haiku low) |
| M1 core feel | `physics-specialist` (Opus high), `sound-designer` (Opus medium), `svg-artist` (Opus medium), `level-designer` (Sonnet medium) |
| M2 content & meta | `level-designer`, `ui-builder` (Sonnet medium), `physics-specialist` for upgrades |
| M3 polish & platform | `platform-integrator` (Opus medium), `svg-artist`, `sound-designer` (Opus medium) |
| M4 QA & submission | `qa-runner` (Haiku low), `quick-fix` (Haiku low) |

No ultracode, no Fable. `/clear` between milestones. If >40% of the budget is used after M1,
drop the main agent to `medium`.

## 17. Risks & open questions
- Portrait phones see less road → validate §6 in M1 in both orientations.
- Publisher acceptance and revenue share for Türkiye-based individuals are unconfirmed (emails
  sent to Playgama and Mediacube).
- Revenue per 1,000 plays on Playables is not public (only publisher claims); measure ours.
- Keep differentiation from Eggy Car clear (levels, stars, garage, multiple cargo, fills every screen).
