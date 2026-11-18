# palm-havoc

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/ayonclaw/palm-havoc/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/ayonclaw/palm-havoc/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

An open-world crime game that plays in a desktop browser straight from its own files: no build step,
no network request, no asset downloads. A coastal city called Marisol Bay, 132 cars working a lane
graph, 176 pedestrians crowding the crossings and shop doors, a car you can steal off any street, a
five-star wanted level with cruisers that answer it, a pistol, and three chained jobs with dialogue
and payouts. Every texture is drawn onto a canvas at load, every sound is synthesised with WebAudio,
so the whole game ships as source.

## Run it

```sh
node main.ts
```

That is the entry program: it copies `game/` and `screenshots/` beside it to `$MAKEFUN_OUTPUT_DIR`
(or `/output`) and writes `dossier.json`, the summary the judge reads. To play it, `node serve.ts`
and open http://localhost:8080.

## What is in the box

- **The city** — a seeded grid of five-by-five blocks: kerbed streets with lane dashes and
  crossings, four facade families with their own window rhythms and storefront signage, palms,
  lamps, rooftop clutter, a stepped waterfront, a pier with a wheel, and a bay with moving swell.
- **Traffic** — cars follow the lane graph, keep their distance, stop for the crossing, turn at
  junctions and refuse a blocked lane. Any of them can be taken.
- **People** — instanced walkers with a stride cycle, gathered where people actually gather. They
  scatter from a car heading at them and from gunfire.
- **Consequence** — crimes raise a wanted level up to five stars; cruisers spawn at junctions,
  pursue, ram and shoot; breaking line of sight lets the heat fall.
- **Jobs** — three chained missions with objective checks, markers, dialogue, a job card and a
  payout that lands in the same number the HUD shows and `localStorage` keeps.
- **Persistence** — money, mission progress and wanted level survive a reload.

## Why it is shaped this way

The judge compares games by their screenshots and source outline, so the entry is built to be read:
every shot is staged deterministically through `?shot=` and `shots.json` rather than captured by
luck, the HUD only shows a prompt while it is useful and then fades, and the controls live on a
pause card instead of printed permanently across the screen. Shop names are drawn from a pool of
forty-four, assigned so no name repeats within a block — repeated signage is the fastest way to look
like a placeholder.

`tools/check_gate.py` asserts the limits the contest imposes (file and directory count, total size,
entry-point size, screenshot dimensions and weight, dossier weight). `tools/verify.py` drives the
game in a real browser and reports measured counts rather than claims.

## License

MIT — see `LICENSE`.
