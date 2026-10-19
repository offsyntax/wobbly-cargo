# Third-party assets & licenses

Rules: CLAUDE.md "Third-party assets & licenses". Allowed: CC0 / public domain, CC-BY 4.0
(credit here AND on the in-game Credits screen), SIL OFL (fonts), MIT / ISC / BSD / Apache-2.0 /
zlib (code). Add every third-party file the moment it is added: file, author, source URL,
license, modifications.

## Code (runtime bundle)

| Package | Version | Author | Source | License |
|---|---|---|---|---|
| Phaser | 4.2.1 | Phaser Studio Inc. (Richard Davey) | https://github.com/phaserjs/phaser | MIT |
| planck.js | 1.5.1 | Ali Shakiba, Erin Catto (Box2D) | https://github.com/piqnt/planck.js | MIT |

## Fonts

| File | Font | Author | Source | License |
|---|---|---|---|---|
| (none bundled yet: Lilita One + Nunito planned, both SIL OFL 1.1) | | | | |

## Audio

### Third-party audio files

| File | Author | Source URL | License | Modifications |
|---|---|---|---|---|
| (none) | | | | |

### Our own work (procedurally generated, no third-party material)

All files in `public/audio/*.mp3` are generated from code in `tools/audio.mjs` (`npm run audio`,
sources written to `audio/src/*.wav`) and processed by the same script. No credit required.

| Files | How it is made |
|---|---|
| `engine_idle_loop`, `engine_low_loop`, `engine_mid_loop`, `engine_high_loop` | exhaust pulse train (resonant decaying pulses + noise per cylinder firing) at 800/2000/3500/5500 RPM, seamless circular render |
| `rev_blip` | same pulse synth with an RPM sweep |
| `exhaust_pop_1..2` | low-passed noise bursts + short thumps |
| `brake_squeak` | vibrato sine with harmonics + noise |
| `skid_loop` | band-passed noise with integer-cycle flutter (seamless) |
| `impact_soft_1..3`, `impact_medium_1..3`, `impact_hard_1..3` | pitch-dropping thump + filtered noise + inharmonic metal partials + rattle clicks |
| `roof_crunch` | noise grains + metal partials + rattle tail |
| `cargo_rattle_1..3` | band-passed clicks with short resonances |
| `egg_crack` | sharp band-passed clicks + short creak chirp |
| `egg_splat` | thump + sweeping band-passed wet noise + droplet chirps |

## Art

| File | Author | Source | License | Modifications |
|---|---|---|---|---|
| (none: all art is hand-written SVG in `art/src/`, our own work) | | | | |
