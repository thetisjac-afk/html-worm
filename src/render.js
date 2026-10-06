// Drawing only. Nothing here changes the simulation.
const Renderer = {
  soil: null,
  trail: [],
  trailClock: 0,
  geo: null,

  resize(width, height, dpr) {
    this.soil = this.paintSoil(width, height, dpr);
  },

  // A static soil texture, painted once per resize.
  paintSoil(width, height, dpr) {
    const c = document.createElement("canvas");
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#211812";
    g.fillRect(0, 0, width, height);

    // Damp patches.
    for (let i = 0; i < (width * height) / 9000; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = randRange(30, 120);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.5;
      grad.addColorStop(0, dark ? "rgba(10,6,4,0.22)" : "rgba(70,52,38,0.14)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Grains.
    for (let i = 0; i < (width * height) / 60; i += 1) {
      const v = Math.floor(randRange(40, 120));
      g.fillStyle = `rgba(${v + 20},${v},${Math.floor(v * 0.75)},${randRange(0.08, 0.35).toFixed(2)})`;
      const s = Math.random() < 0.9 ? 1 : 2;
      g.fillRect(Math.random() * width, Math.random() * height, s, s);
    }
    // Pebbles.
    for (let i = 0; i < (width * height) / 26000; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = randRange(1.5, 4.5);
      const v = Math.floor(randRange(60, 110));
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(x + 1, y + 1.5, r * 1.2, r, Math.random() * Math.PI, 0, TAU);
      g.fill();
      g.fillStyle = `rgb(${v + 10},${v},${v - 12})`;
      g.beginPath();
      g.ellipse(x, y, r * 1.2, r, Math.random() * Math.PI, 0, TAU);
      g.fill();
    }
    // Vignette.
    const vg = g.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, width, height);
    return c;
  },

  // Turn the spine into an outline. Width comes from the actual segment
  // length: a worm is a water-filled tube, so a squeezed segment gets fatter
  // (constant volume: width ~ 1 / sqrt(length)).
  geometry(worm) {
    const n = worm.n;
    const geo = this.geo && this.geo.n === n ? this.geo : (this.geo = {
      n,
      w: new Float64Array(n),
      lx: new Float64Array(n),
      ly: new Float64Array(n),
      rx: new Float64Array(n),
      ry: new Float64Array(n),
      squeeze: new Float64Array(n)
    });
    const L0 = worm.restLength;
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      const la = worm.len[Math.max(0, i - 1)];
      const lb = worm.len[Math.min(n - 2, i)];
      const ratio = clamp(((la + lb) * 0.5) / L0, 0.45, 1.8);
      let profile = 0.5 + 0.5 * smoothstep(s / 0.09);                // pointed head
      profile *= 1 - 0.38 * smoothstep((s - 0.78) / 0.22);            // flattened tail
      profile *= 1 + 0.12 * Math.exp(-(((s - 0.3) / 0.05) ** 2));     // clitellum
      geo.w[i] = CONFIG.radius * profile * clamp(1 / Math.sqrt(ratio), 0.75, 1.5);
      geo.squeeze[i] = clamp((1 - ratio) / 0.35, -1, 1);
      const nx = -worm.ty[i];
      const ny = worm.tx[i];
      geo.lx[i] = worm.x[i] + nx * geo.w[i];
      geo.ly[i] = worm.y[i] + ny * geo.w[i];
      geo.rx[i] = worm.x[i] - nx * geo.w[i];
      geo.ry[i] = worm.y[i] - ny * geo.w[i];
    }
    return geo;
  },

  outlinePath(ctx, worm, geo) {
    const n = worm.n;
    const pts = [];
    pts.push([worm.x[0] + worm.tx[0] * geo.w[0] * 1.2, worm.y[0] + worm.ty[0] * geo.w[0] * 1.2]);
    for (let i = 0; i < n; i += 1) pts.push([geo.lx[i], geo.ly[i]]);
    pts.push([worm.x[n - 1] - worm.tx[n - 1] * geo.w[n - 1] * 0.9, worm.y[n - 1] - worm.ty[n - 1] * geo.w[n - 1] * 0.9]);
    for (let i = n - 1; i >= 0; i -= 1) pts.push([geo.rx[i], geo.ry[i]]);

    // Smooth closed curve through the midpoints.
    ctx.beginPath();
    const m = pts.length;
    const last = pts[m - 1];
    ctx.moveTo((last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2);
    for (let k = 0; k < m; k += 1) {
      const p = pts[k];
      const q = pts[(k + 1) % m];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  },

  draw(ctx, sim) {
    const { worm, brain, input, width, height } = sim;
    const geo = this.geometry(worm);

    if (CONFIG.style === "mesh") {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      if (input.active && CONFIG.cursorMode === "light") this.drawCursorField(ctx, input);
      Mesh.update(worm, brain, sim.frameDt);
      Mesh.draw(ctx, worm);
    } else {
      if (this.soil) ctx.drawImage(this.soil, 0, 0, width, height);
      this.drawCursorField(ctx, input);
      if (CONFIG.slime) this.drawTrail(ctx, worm, geo, sim.time);
      this.drawOrganic(ctx, worm, geo);
    }
    if (CONFIG.debug) this.drawDebug(ctx, sim, geo);
  },

  drawCursorField(ctx, input) {
    if (!input.active) return;
    if (CONFIG.cursorMode === "light") {
      const r = 420;
      const g = ctx.createRadialGradient(input.x, input.y, 0, input.x, input.y, r);
      g.addColorStop(0, "rgba(255,236,190,0.30)");
      g.addColorStop(0.25, "rgba(255,220,160,0.10)");
      g.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = g;
      ctx.fillRect(input.x - r, input.y - r, r * 2, r * 2);
    } else {
      const r = CONFIG.scentFalloff * 3;
      const g = ctx.createRadialGradient(input.x, input.y, 0, input.x, input.y, r);
      g.addColorStop(0, "rgba(140,190,90,0.16)");
      g.addColorStop(1, "rgba(140,190,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(input.x - r, input.y - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(120,150,70,0.85)";
      ctx.beginPath();
      ctx.arc(input.x, input.y, 3, 0, TAU);
      ctx.fill();
    }
  },

  // The tail leaves a damp track that slowly dries.
  drawTrail(ctx, worm, geo, time) {
    const tail = worm.n - 1;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - worm.x[tail], last.y - worm.y[tail]) > 4) {
      this.trail.push({ x: worm.x[tail], y: worm.y[tail], w: geo.w[Math.floor(worm.n * 0.6)], t: time });
    }
    const life = 14;
    while (this.trail.length && time - this.trail[0].t > life) this.trail.shift();
    if (this.trail.length > 1200) this.trail.splice(0, this.trail.length - 1200);

    ctx.lineCap = "round";
    for (let k = 1; k < this.trail.length; k += 1) {
      const a = this.trail[k - 1];
      const b = this.trail[k];
      if (Math.hypot(a.x - b.x, a.y - b.y) > 30) continue;
      const fade = 1 - (time - b.t) / life;
      ctx.strokeStyle = `rgba(8,4,2,${(0.13 * fade).toFixed(3)})`;
      ctx.lineWidth = b.w * 1.3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,235,210,${(0.035 * fade).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },

  drawOrganic(ctx, worm, geo) {
    const n = worm.n;

    // Shadow + base colour.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2.5;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgb(168,92,90)";
    this.outlinePath(ctx, worm, geo);
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.outlinePath(ctx, worm, geo);
    ctx.clip();

    // Colour per node: squeezed segments flush darker (blood is pushed in),
    // stretched ones go pale. Head is redder, tail paler. Each segment is
    // filled with a gradient between its two nodes so the bands blend.
    const colors = this._colors || (this._colors = []);
    colors.length = n;
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      const k = clamp(0.5 + geo.squeeze[i] * 0.9, 0, 1);
      let r = lerp(196, 120, k);
      let g = lerp(126, 52, k);
      let b = lerp(118, 62, k);
      const headTint = 1 - smoothstep(s / 0.2);
      r += headTint * 6;
      g -= headTint * 18;
      b -= headTint * 12;
      const tailPale = smoothstep((s - 0.75) / 0.25);
      r += tailPale * 14;
      g += tailPale * 16;
      b += tailPale * 10;
      const clit = Math.exp(-(((s - 0.3) / 0.045) ** 2));
      r = lerp(r, 214, clit * 0.75);
      g = lerp(g, 132, clit * 0.75);
      b = lerp(b, 104, clit * 0.75);
      colors[i] = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
    const pad = 3; // overdraw past the outline; the clip trims it
    const ex = (px, cx) => px + (px - cx) * pad;
    for (let i = 0; i < n - 1; i += 1) {
      const grad = ctx.createLinearGradient(worm.x[i], worm.y[i], worm.x[i + 1], worm.y[i + 1]);
      grad.addColorStop(0, colors[i]);
      grad.addColorStop(1, colors[i + 1]);
      ctx.fillStyle = grad;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex(geo.lx[i], worm.x[i]), ex(geo.ly[i], worm.y[i]));
      ctx.lineTo(ex(geo.lx[i + 1], worm.x[i + 1]), ex(geo.ly[i + 1], worm.y[i + 1]));
      ctx.lineTo(ex(geo.rx[i + 1], worm.x[i + 1]), ex(geo.ry[i + 1], worm.y[i + 1]));
      ctx.lineTo(ex(geo.rx[i], worm.x[i]), ex(geo.ry[i], worm.y[i]));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Edge darkening gives the tube some roundness.
    ctx.strokeStyle = "rgba(60,18,22,0.35)";
    ctx.lineWidth = 3;
    this.outlinePath(ctx, worm, geo);
    ctx.stroke();

    // Dorsal blood vessel.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(100,24,36,0.22)";
    ctx.lineWidth = CONFIG.radius * 0.35;
    ctx.beginPath();
    ctx.moveTo(worm.x[0], worm.y[0]);
    for (let i = 1; i < n; i += 1) ctx.lineTo(worm.x[i], worm.y[i]);
    ctx.stroke();

    // Annuli: rings at each segment and half-segment. They bunch up where
    // the body squeezes, which makes the travelling wave visible.
    ctx.strokeStyle = "rgba(70,22,28,0.26)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < n - 1; i += 1) {
      ctx.moveTo(geo.lx[i], geo.ly[i]);
      ctx.lineTo(geo.rx[i], geo.ry[i]);
    }
    ctx.stroke();

    // Wet highlight, offset toward a light in the top-left.
    const lx = -0.42;
    const ly = -0.55;
    ctx.beginPath();
    for (let i = 1; i < n - 1; i += 1) {
      const px = worm.x[i] + lx * geo.w[i];
      const py = worm.y[i] + ly * geo.w[i];
      if (i === 1) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(255,215,205,0.13)";
    ctx.lineWidth = CONFIG.radius * 0.8;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,235,0.16)";
    ctx.lineWidth = CONFIG.radius * 0.25;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(40,10,14,0.55)";
    ctx.lineWidth = 0.8;
    this.outlinePath(ctx, worm, geo);
    ctx.stroke();
  },

  drawDebug(ctx, sim, geo) {
    const { worm, brain, input } = sim;
    // Grip: green dots, bigger = gripping harder.
    for (let i = 0; i < worm.n; i += 1) {
      const g = worm.grip[i];
      ctx.fillStyle = `rgba(90,255,140,${(0.25 + g * 0.75).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(worm.x[i], worm.y[i], 1 + g * 3, 0, TAU);
      ctx.fill();
    }
    if (input.active) {
      const s = brain.sensors;
      ctx.fillStyle = `rgba(255,220,80,${(0.3 + s.li * 0.7).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.lx, s.ly, 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(80,200,255,${(0.3 + s.ri * 0.7).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.rx, s.ry, 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(input.x, input.y, CONFIG.arriveRadius, 0, TAU);
      ctx.stroke();
    }
    const lines = [
      `state     ${brain.state}${brain.direction < 0 ? " (reversing)" : ""}`,
      `activity  ${brain.activity.toFixed(2)}`,
      `turn      ${brain.turn.toFixed(2)}`,
      `signal    ${brain.signal.toFixed(2)}${brain.behind ? " (behind)" : ""}`,
      `speed     ${sim.speed.toFixed(0)} px/s  (${(sim.speed / (worm.restLength * (worm.n - 1))).toFixed(2)} body/s)`,
      `fps       ${sim.fps.toFixed(0)}`
    ];
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(10, 10, 300, lines.length * 16 + 10);
    ctx.fillStyle = "#cfe";
    lines.forEach((l, k) => ctx.fillText(l, 18, 28 + k * 16));
  }
};
