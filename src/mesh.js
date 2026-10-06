// The original look: a transparent body made of dots and connecting lines.
// This is the first version's RenderSystem, driven by the new physics.
// The edge points trail the spine slightly (head fastest, tail slowest),
// which is what makes the body feel soft.
const Mesh = {
  left: null,
  right: null,
  pressure: null,

  ensure(worm) {
    if (this.left && this.left.length === worm.n) return false;
    this.left = Array.from({ length: worm.n }, () => ({ x: 0, y: 0 }));
    this.right = Array.from({ length: worm.n }, () => ({ x: 0, y: 0 }));
    this.pressure = new Float64Array(worm.n);
    return true;
  },

  update(worm, brain, dt) {
    const snap = this.ensure(worm);
    const n = worm.n;
    const L0 = worm.restLength;
    const bodyWidth = L0 * (24 / 18); // the original's width-to-segment ratio
    // Stretch of segment j: + when longer than rest, - when squeezed.
    const stretchAt = (j) => worm.len[clamp(j, 0, n - 2)] / L0 - 1;

    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      const tx = worm.tx[i];
      const ty = worm.ty[i];
      const nx = -ty;
      const ny = tx;
      const leftStretch = stretchAt(i - 1);
      const rightStretch = stretchAt(i);
      const stretch = (leftStretch + rightStretch) * 0.5;
      const slope = leftStretch - rightStretch;
      const pressure = clamp(-(leftStretch + rightStretch) * 1.9, 0, 1.1);
      const taper = 0.15 + Math.sin((1 - t) * Math.PI) * 0.76 + (1 - t) * 0.18;
      const pressureLead = clamp(pressure + slope * 0.36, 0, 1.2);
      const widthBase = bodyWidth * taper * (1 + pressureLead * 0.88 - Math.max(0, stretch) * 0.24);
      const width = widthBase * (1 - worm.grip[i] * 0.15);
      const turnBias = brain.turn * 0.18 * taper;
      const outside = 1 + turnBias;
      const inside = 1 - turnBias;
      const shear = slope * 10 * (0.2 + pressureLead * 0.8) + brain.turn * 4.2 * (1 - t * 0.55);
      const lagRate = snap ? 1000 : lerp(16, t < 0.55 ? 11 : 7, t);
      const lag = expSmoothing(lagRate, dt);

      this.pressure[i] = pressureLead;
      const l = this.left[i];
      const r = this.right[i];
      l.x = lerp(l.x, worm.x[i] - tx * shear + nx * width * outside, lag);
      l.y = lerp(l.y, worm.y[i] - ty * shear + ny * width * outside, lag);
      r.x = lerp(r.x, worm.x[i] + tx * shear - nx * width * inside, lag);
      r.y = lerp(r.y, worm.y[i] + ty * shear - ny * width * inside, lag);
    }
  },

  draw(ctx, worm) {
    const n = worm.n;
    const { left, right } = this;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < n - 1; i += 1) {
      const pressure = (this.pressure[i] + this.pressure[i + 1]) * 0.5;
      const hold = (worm.grip[i] + worm.grip[i + 1]) * 0.5;
      const ax = worm.x[i];
      const ay = worm.y[i];
      const bx = worm.x[i + 1];
      const by = worm.y[i + 1];

      // Outer skin.
      ctx.strokeStyle = `rgba(255,255,255,${(0.58 + pressure * 0.14 + hold * 0.18).toFixed(3)})`;
      ctx.lineWidth = 1.05 + pressure * 0.38;
      ctx.beginPath();
      ctx.moveTo(left[i].x, left[i].y);
      ctx.lineTo(left[i + 1].x, left[i + 1].y);
      ctx.moveTo(right[i].x, right[i].y);
      ctx.lineTo(right[i + 1].x, right[i + 1].y);
      ctx.stroke();

      // Spine.
      ctx.strokeStyle = `rgba(255,255,255,${(0.42 + pressure * 0.1).toFixed(3)})`;
      ctx.lineWidth = 1.05 * 0.84;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Ribs and alternating diagonal braces.
      ctx.strokeStyle = `rgba(255,255,255,${(0.16 + pressure * 0.1).toFixed(3)})`;
      ctx.lineWidth = 1.05 * 0.72;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(left[i].x, left[i].y);
      ctx.moveTo(ax, ay);
      ctx.lineTo(right[i].x, right[i].y);
      if (i % 2 === 0) {
        ctx.moveTo(left[i].x, left[i].y);
        ctx.lineTo(bx, by);
      } else {
        ctx.moveTo(right[i].x, right[i].y);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    // Dots on every other node: spine and both edges.
    for (let i = 0; i < n; i += 2) {
      const pressure = this.pressure[i];
      const radius = 1.25 + pressure * 0.45;
      ctx.fillStyle = `rgba(255,255,255,${(0.55 + pressure * 0.24).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(worm.x[i], worm.y[i], radius, 0, TAU);
      ctx.moveTo(left[i].x + radius * 0.85, left[i].y);
      ctx.arc(left[i].x, left[i].y, radius * 0.85, 0, TAU);
      ctx.moveTo(right[i].x + radius * 0.85, right[i].y);
      ctx.arc(right[i].x, right[i].y, radius * 0.85, 0, TAU);
      ctx.fill();
    }
  },

  scale(sx, sy) {
    if (!this.left) return;
    for (const p of this.left.concat(this.right)) {
      p.x *= sx;
      p.y *= sy;
    }
  }
};
