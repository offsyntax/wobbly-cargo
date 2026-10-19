# Visual reference

Five approved mockups of the target look (portrait, 390×844 logical px, PNGs rendered @2x).

| File | Screen |
|---|---|
| `01-gameplay-city.png` | Gameplay, City world, first-time "HOLD TO DRIVE" hint |
| `02-gameplay-desert-flip.png` | Gameplay, Desert world, monster truck mid-air flip with ice-cream cargo |
| `03-fail-cargo-cracked.png` | Fail screen (rewarded Continue + Retry) |
| `04-level-complete.png` | Level complete (stars, stats, ×2 coins, Next) |
| `05-garage.png` | Garage (vehicle stage, vehicle chips, upgrade cards, PLAY) |

Each PNG has a matching `.dc.html` source that contains the exact SVG geometry, colors, sizes
and HUD layout used in the mockup.

## How to use these (agents)
- **PNGs = the target look.** Match the style, palette, outline weights, typography and layout.
  They are a direction, not a pixel spec: improve spacing or readability when needed.
- **`.dc.html` = reusable source.** You may copy SVG shapes (pickup truck, monster truck, eggs,
  crate, ice-cream cup, coins, flag, cacti, buildings, icons) into `art/src/*.svg` as the
  starting point for game assets. Ignore the `<x-dc>`, `{{…}}` and `data-props` markup; that is
  the mockup tool's format, not game code.
- **Do not ship these files** in the game build. They live in `docs/` only.
- The background terrain in the mockups is illustrative; real terrain is generated from level
  JSON in code.

## Known fixes vs. the mockups
- `01`: the "HOLD TO DRIVE" circle overlaps the truck. In the game, place the hint lower or
  fade it out as soon as the player holds, so it never covers the vehicle.
- `01`: the portrait view leaves a lot of empty sky. The camera look-ahead/zoom in GDD §6 should
  keep more of the road visible.
- UI text in mockups is English and placeholder values (coins, levels, prices) are examples.
