// The worm's nervous system: reads its senses, picks a behaviour, and outputs
// a handful of commands for the body:
//   activity   0..1  how hard the muscles work (wave speed and size)
//   turn      -1..1  neck bend, + bends toward the head's +normal side
//   direction  +1 / -1  crawl forwards or backwards
//   tone       0..1  whole-body squeeze (withdrawal reflex)
//   freqBoost  >= 1  faster waves (escape)
//   flinch     0..1  local clench where it was poked
//
// Behaviours:
//   seek     smells food (cursor) and crawls toward it
//   forage   at the food: slows down, head probes around
//   flee     cursor is a light: crawls away (worms are photophobic)
//   explore  nothing to sense: wanders with a correlated random walk
//   rest     lies still for a while, breathing
//   withdraw head was poked: snaps back, then reverses away

function createBrain() {
  return {
    state: "explore",
    stateTime: 0,
    drive: 0.5,
    activity: 0,
    turn: 0,
    turnTarget: 0,
    direction: 1,
    tone: 0,
    freqBoost: 1,
    boostTime: 0,
    flinch: 0,
    flinchNode: 0,
    flinchSide: 0,
    swayPhase: 0,
    wander: 0,
    restTimer: randRange(10, 18),
    escapeTurn: 0,
    signal: 0,
    behind: false,
    sensors: { lx: 0, ly: 0, rx: 0, ry: 0, li: 0, ri: 0 },
    targetDistance: Infinity,
    shock: 0,      // seconds since the last poke (drives the light shockwave)
    shockNode: -1
  };
}

const Brain = {
  setState(brain, state) {
    if (brain.state !== state) {
      brain.state = state;
      brain.stateTime = 0;
    }
  },

  update(brain, worm, input, dt, bounds) {
    brain.stateTime += dt;
    const hx = worm.x[0];
    const hy = worm.y[0];
    const tx = worm.tx[0];
    const ty = worm.ty[0];
    const nx = -ty;
    const ny = tx;

    // --- Senses --------------------------------------------------------
    const target = input.active ? input : null;
    let signal = 0;
    if (target) {
      const s = brain.sensors;
      s.lx = hx + tx * CONFIG.sensorDistance + nx * CONFIG.sensorSpread;
      s.ly = hy + ty * CONFIG.sensorDistance + ny * CONFIG.sensorSpread;
      s.rx = hx + tx * CONFIG.sensorDistance - nx * CONFIG.sensorSpread;
      s.ry = hy + ty * CONFIG.sensorDistance - ny * CONFIG.sensorSpread;
      const scent = (px, py) => Math.exp(-Math.hypot(target.x - px, target.y - py) / CONFIG.scentFalloff);
      s.li = scent(s.lx, s.ly);
      s.ri = scent(s.rx, s.ry);
      // Normalised difference: works the same near or far from the source.
      signal = (s.li - s.ri) / (s.li + s.ri + 1e-12);
      // Both sensors weaker than the head itself: the source is behind us.
      brain.behind = (s.li + s.ri) * 0.5 < scent(hx, hy);
      brain.targetDistance = Math.hypot(target.x - hx, target.y - hy);
    } else {
      brain.targetDistance = Infinity;
      brain.behind = false;
    }
    brain.signal = signal;

    // Walls feel like a repellent: steer toward the open side.
    const margin = 120;
    let wx = 0;
    let wy = 0;
    if (hx < margin) wx += (1 - hx / margin) ** 2;
    if (hx > bounds.width - margin) wx -= (1 - (bounds.width - hx) / margin) ** 2;
    if (hy < margin) wy += (1 - hy / margin) ** 2;
    if (hy > bounds.height - margin) wy -= (1 - (bounds.height - hy) / margin) ** 2;
    const wallSteer = nx * wx + ny * wy;
    const wallAhead = -(tx * wx + ty * wy); // > 0 when heading into a wall

    // --- Behaviour selection ---------------------------------------------
    const light = CONFIG.cursorMode === "light";
    if (brain.state !== "withdraw") {
      if (target && !light) {
        if (brain.state === "forage") {
          if (brain.targetDistance > CONFIG.arriveRadius * 2.6) this.setState(brain, "seek");
        } else if (brain.targetDistance < CONFIG.arriveRadius) {
          this.setState(brain, "forage");
        } else {
          this.setState(brain, "seek");
        }
      } else if (target && light && brain.targetDistance < 420) {
        this.setState(brain, "flee");
      } else if (brain.state !== "rest") {
        this.setState(brain, "explore");
      }
    }

    let drive = 0.5;
    let turn = 0;
    let sway = CONFIG.headSway;
    let swayFreq = 0.55;
    brain.direction = 1;

    switch (brain.state) {
      case "seek": {
        const d = brain.targetDistance - CONFIG.arriveRadius;
        drive = 0.35 + 0.65 * smoothstep(d / 160);
        turn = brain.behind ? (Math.sign(signal) || 1) : signal * CONFIG.steerGain;
        // Casting: search harder when the gradient is unclear.
        sway *= 0.25 + 0.75 * (1 - Math.min(1, Math.abs(signal) * 2));
        break;
      }
      case "forage": {
        drive = 0.12;
        turn = signal * CONFIG.steerGain * 0.5;
        sway *= 2.2;
        swayFreq = 0.9;
        break;
      }
      case "flee": {
        const closeness = 1 - brain.targetDistance / 420;
        drive = 0.4 + 0.6 * closeness;
        turn = brain.behind ? 0 : -(Math.sign(signal) || 1) * Math.max(0.6, Math.abs(signal) * CONFIG.steerGain);
        sway *= 0.4;
        break;
      }
      case "explore": {
        // Correlated random walk: the turn drifts rather than jitters.
        brain.wander += randRange(-1, 1) * 2.2 * Math.sqrt(dt) - brain.wander * 0.5 * dt;
        brain.wander = clamp(brain.wander, -0.8, 0.8);
        drive = 0.55;
        turn = brain.wander;
        brain.restTimer -= dt;
        if (brain.restTimer <= 0) {
          this.setState(brain, "rest");
          brain.restTimer = randRange(2.5, 6);
        }
        break;
      }
      case "rest": {
        drive = 0;
        sway *= 0.6;
        swayFreq = 0.2;
        brain.restTimer -= dt;
        if (brain.restTimer <= 0) {
          this.setState(brain, "explore");
          brain.restTimer = randRange(10, 20);
        }
        break;
      }
      case "withdraw": {
        // Setae flip to point forwards, so the anchored tail resists being
        // dragged and the squeeze pulls the head back instead.
        brain.direction = -1;
        if (brain.stateTime < 0.45) {
          drive = 0;
          brain.tone = Math.max(brain.tone, 0.32 * (1 - brain.stateTime / 0.45));
        } else if (brain.stateTime < 1.8) {
          drive = 0.8;
          turn = brain.escapeTurn;
        } else {
          this.setState(brain, "explore");
          brain.restTimer = randRange(10, 20);
        }
        sway = 0;
        break;
      }
    }

    if (brain.state !== "withdraw" && brain.state !== "rest") {
      turn += wallSteer * 3;
      if (wallAhead > 0.3) drive *= 1 - 0.5 * Math.min(1, wallAhead);
    }

    // --- Smooth outputs (muscles can't change instantly) ------------------
    brain.drive = drive;
    brain.activity = lerp(brain.activity, drive, expSmoothing(drive > brain.activity ? 2.5 : 1.6, dt));
    brain.swayPhase += TAU * swayFreq * dt;
    brain.turnTarget = clamp(turn, -1, 1) + Math.sin(brain.swayPhase) * sway;
    brain.turn = lerp(brain.turn, clamp(brain.turnTarget, -1.2, 1.2), expSmoothing(5, dt));

    brain.tone *= Math.exp(-3 * dt); // the withdraw case re-asserts it while the snap lasts
    brain.flinch *= Math.exp(-4 * dt);
    if (brain.shockNode >= 0) brain.shock += dt;
    brain.boostTime = Math.max(0, brain.boostTime - dt);
    brain.freqBoost = 1 + 0.9 * smoothstep(brain.boostTime / 0.6);
    if (brain.boostTime > 0) brain.activity = Math.max(brain.activity, 0.95);
  },

  // Returns true if the poke landed on the worm.
  poke(brain, worm, px, py) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < worm.n; i += 1) {
      const d = Math.hypot(worm.x[i] - px, worm.y[i] - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > CONFIG.radius * 2.5 + 12) return false;

    brain.shock = 0;
    brain.shockNode = best;

    const s = best / (worm.n - 1);
    if (s < 0.3) {
      // Head touched: giant-fibre reflex, the whole body snaps short.
      this.setState(brain, "withdraw");
      brain.activity = 0;
      brain.tone = 0.32;
      brain.escapeTurn = randRange(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1);
    } else if (s > 0.7) {
      // Tail touched: bolt forwards.
      brain.boostTime = 1.6;
      if (brain.state === "rest") this.setState(brain, "explore");
    } else {
      // Mid-body: clench and bend away from the touch.
      brain.flinch = 1;
      brain.flinchNode = best;
      const side = (px - worm.x[best]) * -worm.ty[best] + (py - worm.y[best]) * worm.tx[best];
      brain.flinchSide = side > 0 ? -1 : 1;
    }
    return true;
  }
};
