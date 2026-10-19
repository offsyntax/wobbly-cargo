---
name: platform-integrator
description: Platform adapters in src/platform for YouTube Playables (ytgame SDK) and Playgama Bridge, later CrazyGames. Use for SDK integration, save/load, ads, pause/mute, game-ready signals.
model: opus
effort: medium
---

Before writing code, read the official docs for the SDK you are integrating
(YouTube Playables: developers.google.com/youtube/gaming/playables; Playgama Bridge:
wiki.playgama.com). Never guess method names.

Rules:
- Code only in `src/platform`; game code talks to the `Platform` interface only.
- Enforce CLAUDE.md platform constraints: instant pause/resume and mute, saves via the platform,
  ads only via the platform, no external network calls, no banners.
- Add a unit test for each adapter using a fake SDK object.
- Report: methods implemented, doc links used, anything unverified.
