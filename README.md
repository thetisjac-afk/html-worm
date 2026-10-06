# Chemical Worm

A soft-bodied earthworm that crawls the way real earthworms do: by sending
waves of contraction down its body while tiny bristles grip the soil.

Open `index.html` in a browser. No build step.

| Input | What happens |
| --- | --- |
| Move the cursor | It's a scent. The worm smells it and crawls toward it, then forages when it arrives |
| Click/tap the head | Withdrawal reflex: the body snaps short, then reverses away |
| Click/tap the tail | Escape: a burst of fast waves |
| Click/tap mid-body | Flinch: that part clenches and bends away |
| `L` | Cursor becomes a light. Worms hate light, so it flees |
| `D` | Debug view: grip (green dots), sensors, behaviour state, speed |
| `W` | Cycle looks: plexus (default, glowing dot network), mesh (the original), lattice, tube, fleshy |
| `P` or the gear | Live tuning panel |
| Leave the window | Nothing to smell: it explores, and rests now and then |

## How it moves

Read this alongside the debug view (`D`).

**1. A travelling wave.** (`Worm.muscles` in `src/body.js`.) Each segment's target length is a sine
wave, and the phase shifts a little for every segment along the body:

```js
c = sin(phase - 2π · s / waveLength)   // s = 0 at the head, 1 at the tail
targetLength = restLength · (1 - waveAmplitude · c)
```

As `phase` grows, each crest slides from head to tail. With `waveLength: 0.45`
there are about two waves on the body at once.

**2. Squeezed segments grip.** A worm is a bag of fluid (a *hydrostatic
skeleton*). Squeeze a segment short and it bulges fat, pressing its bristles
(*setae*) into the soil. So `grip` follows `c`: the green clusters in debug
view are the short, fat, anchored parts. Both looks draw the bulge from the
real segment lengths: in the mesh, squeezed segments swell and their lines
brighten.

**3. The grip is a ratchet.** (`Worm.mobility`.) This is the single most important
idea. Setae point backwards: sliding forwards is easy, sliding backwards is
nearly impossible. Every time a segment stretches, its front end can move
forward but its back end can't move back. Every time it squeezes, its back
end gets pulled forward but its front end stays put. Either way the worm
creeps forward. Set `ratchet` to 0 in the panel and it mostly wiggles in place.
That's what the old version did: its forward and backward friction were
almost equal (22 vs 26), and it crawled at about 7 px/s.

**4. Follow the leader.** Only the first few neck joints steer (`headJoints`).
The rest of the body can't slide sideways (`lateralGrip`), so each segment
slides along the groove the head carved. That's why the body traces the
head's path instead of swinging around.

### The solver, briefly

Physics is *position-based*: each step moves the nodes a little, then
repeatedly nudges them until segment lengths and joint angles are close to
their targets. How far each node gets nudged is its `mobility` in that
direction. That's how one function handles friction, anchoring and the
ratchet.

Two traps this code avoids. The comments mark them:

- **Fixing one joint must not break its neighbour.** Rotating a node around a
  joint bends the next joint too, so joints undo each other's work. The neck
  instead swings everything in front of the joint as one rigid piece, and the
  body uses balanced "kink" nudges (`solveKink`).
- **Read state fresh inside the loop.** Angles computed before a sweep go
  stale as the sweep moves nodes. Acting on stale angles made an early
  version explode.

## How it glows (`src/dotstyles.js`, plexus)

Dots sit in loose lanes inside the body and link to any neighbour within
reach. Line brightness is the average glow of its two dots, so light seems
to flow through the network. A dot's glow adds up:

- **squeeze**: segments contracting in the muscle wave glow brighter
- **nerve impulse**: a narrow bright band racing head to tail, faster when crawling
- **breathing**: a slow swell while resting
- **shockwave**: a ring of light spreading out from where you poked it

Everything is drawn with additive blending (`lighter`), so where many lines
cross the light piles up, like real glowing filaments.

## How it decides (`src/brain.js`)

Two scent sensors sit either side of the head. The worm compares them:

```js
signal = (left - right) / (left + right)   // -1..1, same at any distance
```

It turns toward the stronger side (*klinotaxis*). If both sensors smell less
than the head itself, the food is behind, so it turns hard. While the
gradient is unclear it sways its head side to side to sample it (*casting*).

A small state machine picks the behaviour: `seek`, `forage`, `flee`,
`explore`, `rest`, `withdraw`. Every state just sets a few commands for the
body (`activity`, `turn`, `direction`, `tone`). The body never knows which
behaviour it's in.

## Files

```
index.html       page, styles, script tags
src/config.js    every tunable number, with comments
src/math.js      small helpers
src/body.js      physics: muscles, grip, solver
src/brain.js     senses and behaviours
src/mesh.js      the mesh look (the original renderer) and the soft outline every dot look builds on
src/dotstyles.js plexus (pulsing dot network), lattice and tube looks
src/render.js    picks the look, fleshy style, soil, slime trail, debug overlay
src/panel.js     live tuning panel
src/main.js      game loop and input
tests/smoke.mjs  headless browser checks
```

## Tests

```sh
npm install
npx playwright install chromium   # first time only
npm test
```

If you already have a Chromium binary, point at it with `CHROMIUM_PATH=/path/to/chrome npm test`.

## Things to try in the panel

- `ratchet` → 0: speed drops from about 70 to 10 px/s. That shows where forward motion comes from.
- `waveLength` → 1.2: one long wave instead of two. Longer strides, so it's twice as fast, but it looks less like a worm.
- `lateralGrip` → 0.2: the body skids sideways around corners.
- `headJoints` → 8: turns get about 8× wider, because the body stops following the head's path.
- `headSway` → 0.8 with the cursor parked: a worm frantically casting for a scent.
