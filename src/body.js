// The worm's body: a chain of nodes joined by muscular segments.
//
// Physics is position-based (Verlet integration + constraints) and heavily
// damped. Each step:
//   1. muscles()   set every segment's target length from a travelling sine wave,
//                  and work out which segments grip the ground
//   2. integrate() carry a little momentum forward, filtered through friction
//   3. solve()     pull segments toward their target lengths and joints toward
//                  their target bends. How much each node moves depends on its
//                  "mobility": a gripping node barely moves backwards or sideways.
//
// Nothing ever pushes the worm forward directly. It moves because segments
// stretch and squeeze while their grip on the ground is one-directional.
const MAX_STEP_MOVE = 2; // px per physics step (240 px/s at 120 Hz)

class Worm {
  constructor(x, y, angle) {
    this.build(x, y, angle);
  }

  build(x, y, angle) {
    const segs = CONFIG.segments;
    const n = segs + 1;
    this.n = n;
    this.restLength = CONFIG.segmentLength;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.tx = new Float64Array(n); // unit tangent, pointing toward the head
    this.ty = new Float64Array(n);
    this.grip = new Float64Array(n);
    this.targetLen = new Float64Array(segs);
    this.len = new Float64Array(segs).fill(CONFIG.segmentLength);
    this.contraction = new Float64Array(segs); // -1 stretched .. +1 squeezed
    this.bendTarget = new Float64Array(n);
    this.phase = 0;

    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    for (let i = 0; i < n; i += 1) {
      this.x[i] = this.px[i] = x - cx * i * CONFIG.segmentLength;
      this.y[i] = this.py[i] = y - cy * i * CONFIG.segmentLength;
    }
    this.updateTangents();
  }

  updateTangents() {
    const { n, x, y, tx, ty } = this;
    for (let i = 0; i < n; i += 1) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = x[a] - x[b];
      const dy = y[a] - y[b];
      const d = Math.hypot(dx, dy) || 1;
      tx[i] = dx / d;
      ty[i] = dy / d;
    }
  }

  centerX() {
    let sum = 0;
    for (let i = 0; i < this.n; i += 1) sum += this.x[i];
    return sum / this.n;
  }

  centerY() {
    let sum = 0;
    for (let i = 0; i < this.n; i += 1) sum += this.y[i];
    return sum / this.n;
  }

  step(brain, dt, bounds) {
    this.updateTangents();
    this.muscles(brain, dt);
    this.integrate(brain, dt);
    this.solve(brain);
    this.constrain(bounds);
    this.measure();
  }

  muscles(brain, dt) {
    const segs = this.n - 1;
    const amp = Math.min(1, brain.activity * 1.4); // the wave fades out as the worm stops
    const freq = CONFIG.waveFrequency * (0.35 + 0.65 * brain.activity) * brain.freqBoost;
    this.phase += TAU * freq * dt * brain.direction;

    const segGrip = this._segGrip || (this._segGrip = []);
    for (let j = 0; j < segs; j += 1) {
      const s = (j + 0.5) / segs;
      // Phase lags further down the body, so each crest travels head -> tail.
      let c = Math.sin(this.phase - (TAU * s) / CONFIG.waveLength) * amp;

      // A poked mid-body segment clenches.
      if (brain.flinch > 0.01) {
        const d = (j - brain.flinchNode) / 2.5;
        c += brain.flinch * 1.4 * Math.exp(-d * d);
      }
      c = clamp(c, -1, 1.5);
      this.contraction[j] = c;
      this.targetLen[j] =
        this.restLength * (1 - CONFIG.waveAmplitude * c) * (1 - brain.tone);

      // Squeezed segments grip. A resting worm grips everywhere.
      const wave = smoothstep((c + 0.15) / 0.75);
      let g = lerp(1, wave, amp);
      // Withdrawal reflex: the tail anchors so the contraction yanks the head back.
      if (brain.tone > 0.02) {
        g = lerp(g, s * s, Math.min(1, brain.tone * 3));
      }
      segGrip[j] = g;
    }

    for (let i = 0; i < this.n; i += 1) {
      const a = segGrip[Math.max(0, i - 1)];
      const b = segGrip[Math.min(segs - 1, i)];
      this.grip[i] = (a + b) * 0.5;
    }
    this.direction = brain.direction;
  }

  // How freely node i can move in unit direction (dx, dy) right now.
  // This one function is the whole ground-contact model.
  mobility(i, dx, dy) {
    const g = this.grip[i];
    const along = dx * this.tx[i] + dy * this.ty[i]; // + = toward head
    const side = -dx * this.ty[i] + dy * this.tx[i];
    const backward = along * this.direction < 0;
    const mAlong = backward ? 1 - CONFIG.ratchet * g : 1 - CONFIG.forwardFriction * g;
    const mSide = 1 - CONFIG.lateralGrip * (0.6 + 0.4 * g);
    return Math.max(0.015, along * along * mAlong + side * side * mSide);
  }

  integrate(brain, dt) {
    const keep = Math.exp(-CONFIG.drag * dt);
    for (let i = 0; i < this.n; i += 1) {
      const vx = this.x[i] - this.px[i];
      const vy = this.y[i] - this.py[i];
      const tx = this.tx[i];
      const ty = this.ty[i];
      let along = vx * tx + vy * ty;
      let side = -vx * ty + vy * tx;
      const g = this.grip[i];
      if (along * this.direction < 0) {
        along *= 1 - CONFIG.ratchet * g;
      }
      along *= keep;
      side *= keep * (1 - CONFIG.lateralGrip * 0.5);
      // Safety net: no worm moves faster than this, whatever the solver did.
      const speed = Math.hypot(along, side);
      if (speed > MAX_STEP_MOVE) {
        along *= MAX_STEP_MOVE / speed;
        side *= MAX_STEP_MOVE / speed;
      }
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.x[i] += tx * along - ty * side;
      this.y[i] += ty * along + tx * side;
    }
  }

  solve(brain) {
    const n = this.n;
    const head = Math.min(CONFIG.headJoints, n - 2);

    // Steering: the neck joints bend toward the brain's turn command,
    // strongest just behind the head. Joint angles are measured walking
    // head -> tail, which is the mirror image of the direction of travel,
    // hence the minus sign.
    let weightSum = 0;
    for (let i = 1; i <= head; i += 1) weightSum += head + 1 - i;
    for (let i = 1; i <= head; i += 1) {
      this.bendTarget[i] = -brain.turn * CONFIG.maxHeadBend * ((head + 1 - i) / weightSum);
    }

    for (let iter = 0; iter < CONFIG.iterations; iter += 1) {
      // Segment lengths (alternate sweep direction to avoid bias).
      const forward = iter % 2 === 0;
      for (let k = 0; k < n - 1; k += 1) {
        const j = forward ? k : n - 2 - k;
        this.solveLength(j, j + 1, this.targetLen[j]);
      }

      // Neck: swing everything in front of joint i around it as one rigid
      // piece. That changes joint i's angle and no other.
      for (let i = head; i >= 1; i -= 1) {
        const target = clamp(this.bendTarget[i], -CONFIG.maxJointBend, CONFIG.maxJointBend);
        const delta = clamp((target - this.jointAngle(i)) * 0.35, -0.2, 0.2);
        this.swingFront(i, -delta);
      }

      // Body: smooth the curvature (kills zigzags, keeps arcs) and stop folds.
      for (let i = 1; i < n - 1; i += 1) {
        this.solveKink(i, i > head, brain);
      }
    }
  }

  // Rotate nodes 0..i-1 around node i.
  swingFront(i, angle) {
    if (Math.abs(angle) < 1e-7) return;
    const cx = this.x[i];
    const cy = this.y[i];
    for (let k = 0; k < i; k += 1) {
      [this.x[k], this.y[k]] = rotateAround(this.x[k], this.y[k], cx, cy, angle);
    }
  }

  // The "kink" at node i is how far it sits off the line between its
  // neighbours. Moving the node by 2/3 of a correction and each neighbour
  // by 1/3 the other way changes the kink without shifting the body.
  solveKink(i, smooth, brain) {
    const { x, y } = this;
    const kx = x[i] - (x[i - 1] + x[i + 1]) * 0.5;
    const ky = y[i] - (y[i - 1] + y[i + 1]) * 0.5;
    let goalX = kx;
    let goalY = ky;

    if (smooth && i + 1 < this.n - 1) {
      const ax = x[i - 1] - (x[i - 2 >= 0 ? i - 2 : 0] + x[i]) * 0.5;
      const ay = y[i - 1] - (y[i - 2 >= 0 ? i - 2 : 0] + y[i]) * 0.5;
      const bx = x[i + 1] - (x[i] + x[i + 2]) * 0.5;
      const by = y[i + 1] - (y[i] + y[i + 2]) * 0.5;
      goalX = lerp(kx, (ax + bx) * 0.5, CONFIG.bodySmoothing);
      goalY = lerp(ky, (ay + by) * 0.5, CONFIG.bodySmoothing);

      if (brain.flinch > 0.01) {
        const d = (i - brain.flinchNode) / 3;
        const push = brain.flinchSide * 2.2 * brain.flinch * Math.exp(-d * d);
        goalX += -this.ty[i] * push * 0.3;
        goalY += this.tx[i] * push * 0.3;
      }
    }

    const angle = Math.abs(this.jointAngle(i));
    if (angle > CONFIG.maxJointBend) {
      const shrink = CONFIG.maxJointBend / angle;
      goalX *= shrink;
      goalY *= shrink;
    }

    const cx = goalX - kx;
    const cy = goalY - ky;
    if (cx === 0 && cy === 0) return;
    x[i] += (cx * 2) / 3;
    y[i] += (cy * 2) / 3;
    x[i - 1] -= cx / 3;
    y[i - 1] -= cy / 3;
    x[i + 1] -= cx / 3;
    y[i + 1] -= cy / 3;
  }

  solveLength(a, b, rest) {
    const dx = this.x[b] - this.x[a];
    const dy = this.y[b] - this.y[a];
    const d = Math.hypot(dx, dy) || 0.0001;
    const err = d - rest;
    const ex = dx / d;
    const ey = dy / d;
    const s = err > 0 ? 1 : -1; // too long: a moves toward b, b toward a
    const ma = this.mobility(a, s * ex, s * ey);
    const mb = this.mobility(b, -s * ex, -s * ey);
    const k = err / (ma + mb);
    this.x[a] += ex * k * ma;
    this.y[a] += ey * k * ma;
    this.x[b] -= ex * k * mb;
    this.y[b] -= ey * k * mb;
  }

  // Signed turning angle at joint i, walking from head to tail.
  jointAngle(i) {
    const ux = this.x[i] - this.x[i - 1];
    const uy = this.y[i] - this.y[i - 1];
    const vx = this.x[i + 1] - this.x[i];
    const vy = this.y[i + 1] - this.y[i];
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  }

  constrain(bounds) {
    const m = 4;
    for (let i = 0; i < this.n; i += 1) {
      if (this.x[i] < m) this.x[i] = this.px[i] = m;
      else if (this.x[i] > bounds.width - m) this.x[i] = this.px[i] = bounds.width - m;
      if (this.y[i] < m) this.y[i] = this.py[i] = m;
      else if (this.y[i] > bounds.height - m) this.y[i] = this.py[i] = bounds.height - m;
    }
  }

  measure() {
    for (let j = 0; j < this.n - 1; j += 1) {
      this.len[j] = Math.hypot(this.x[j + 1] - this.x[j], this.y[j + 1] - this.y[j]);
    }
  }

  scale(sx, sy) {
    for (let i = 0; i < this.n; i += 1) {
      this.x[i] *= sx;
      this.px[i] *= sx;
      this.y[i] *= sy;
      this.py[i] *= sy;
    }
  }
}
