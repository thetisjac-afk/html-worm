// Alternative "creature made of connected dots" looks. All of them reuse the
// soft, lagging outline from Mesh.update (left/right edge points), so they
// share its squishiness and pressure bulges; they only differ in which dots
// exist and how they are wired together.
const DotStyles = {
  glow: null,

  // A pre-rendered soft dot, stamped with additive blending.
  glowSprite() {
    if (this.glow) return this.glow;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(220,240,255,0.85)");
    grad.addColorStop(0.45, "rgba(150,200,255,0.18)");
    grad.addColorStop(1, "rgba(120,180,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glow = c;
    return c;
  },

  dot(ctx, x, y, size, alpha) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(this.glowSprite(), x - size, y - size, size * 2, size * 2);
  },

  // Centre and half-width vector of the body at node i.
  frame(i) {
    const l = Mesh.left[i];
    const r = Mesh.right[i];
    return { cx: (l.x + r.x) / 2, cy: (l.y + r.y) / 2, hx: (l.x - r.x) / 2, hy: (l.y - r.y) / 2 };
  },

  // Lines are grouped into a few brightness buckets so each bucket is one stroke.
  strokeBuckets(ctx, segs, color, width) {
    const buckets = [[], [], [], [], [], []];
    for (const s of segs) {
      const k = Math.min(5, Math.floor(clamp(s[4], 0, 0.999) * 6));
      buckets[k].push(s);
    }
    ctx.lineWidth = width;
    buckets.forEach((list, k) => {
      if (!list.length) return;
      ctx.strokeStyle = `rgba(${color},${((k + 0.5) / 6).toFixed(3)})`;
      ctx.beginPath();
      for (const s of list) {
        ctx.moveTo(s[0], s[1]);
        ctx.lineTo(s[2], s[3]);
      }
      ctx.stroke();
    });
  },

  // A: clean triangulated lattice, 5 rows of dots, glowing nodes.
  lattice(ctx, worm) {
    const n = worm.n;
    const rows = [-1, -0.5, 0, 0.5, 1];
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const f = this.frame(i);
      pts.push(rows.map((u) => [f.cx + f.hx * u, f.cy + f.hy * u]));
    }
    const segs = [];
    for (let i = 0; i < n; i += 1) {
      const p = Mesh.pressure[i];
      for (let r = 0; r < rows.length; r += 1) {
        const edge = r === 0 || r === rows.length - 1;
        const a = pts[i][r];
        if (r < rows.length - 1) segs.push([...a, ...pts[i][r + 1], 0.18 + p * 0.25]);
        if (i < n - 1) {
          const b = pts[i + 1][r];
          segs.push([...a, ...b, (edge ? 0.75 : 0.3) + p * 0.2]);
          if (r < rows.length - 1) {
            const diag = (i + r) % 2 === 0 ? [...a, ...pts[i + 1][r + 1]] : [...pts[i][r + 1], ...b];
            segs.push([...diag, 0.14 + p * 0.2]);
          }
        }
      }
    }
    ctx.lineCap = "round";
    this.strokeBuckets(ctx, segs, "200,225,255", 0.9);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i += 1) {
      const p = Mesh.pressure[i];
      for (let r = 0; r < rows.length; r += 1) {
        const edge = r === 0 || r === rows.length - 1;
        this.dot(ctx, pts[i][r][0], pts[i][r][1], (edge ? 5 : 3.6) + p * 3, (edge ? 0.7 : 0.45) + p * 0.3);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },

  // B: a woven 3D tube. Rings of dots wrap around the body; the strands
  // spiral, and the far side of the tube is drawn dim so it reads as depth.
  tube(ctx, worm, time) {
    const n = worm.n;
    const K = 10;
    const twist = 0.32;
    const roll = time * 0.6;
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const f = this.frame(i);
      const ring = [];
      for (let k = 0; k < K; k += 1) {
        const th = (k / K) * TAU + i * twist + roll;
        const c = Math.cos(th);
        ring.push([f.cx + f.hx * c, f.cy + f.hy * c, Math.sin(th)]);
      }
      pts.push(ring);
    }
    const segs = [];
    for (let i = 0; i < n; i += 1) {
      const p = Mesh.pressure[i];
      for (let k = 0; k < K; k += 1) {
        const a = pts[i][k];
        const b = pts[i][(k + 1) % K];
        const depth = (a[2] + b[2]) * 0.25 + 0.5; // 0 back .. 1 front
        segs.push([a[0], a[1], b[0], b[1], 0.04 + depth * 0.32 + p * 0.15]);
        if (i < n - 1) {
          const c = pts[i + 1][k];
          const d2 = (a[2] + c[2]) * 0.25 + 0.5;
          segs.push([a[0], a[1], c[0], c[1], 0.05 + d2 * 0.55 + p * 0.15]);
        }
      }
    }
    ctx.lineCap = "round";
    this.strokeBuckets(ctx, segs, "190,220,255", 0.85);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i += 1) {
      const p = Mesh.pressure[i];
      for (let k = 0; k < K; k += 1) {
        const [x, y, z] = pts[i][k];
        const depth = z * 0.5 + 0.5;
        this.dot(ctx, x, y, 2.2 + depth * 3.2 + p * 2, 0.12 + depth * 0.7 + p * 0.2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },

  // C: plexus. Dots fill the body in loose lanes and link to any neighbour
  // close enough, like a living network. It pulses:
  //   - squeezed segments glow (the muscle wave)
  //   - nerve impulses race head -> tail while it crawls
  //   - a slow breathing glow while it rests
  //   - a poke sends a shockwave of light out from the touch
  plexus(ctx, worm, brain, time) {
    const n = worm.n;
    const lanes = [-0.92, -0.5, -0.12, 0.25, 0.62, 0.95];
    const per = lanes.length;
    if (!this.seeds || this.seeds.length !== n * per) {
      this.seeds = [];
      for (let i = 0; i < n; i += 1) {
        for (let k = 0; k < per; k += 1) {
          const edge = k === 0 || k === per - 1;
          this.seeds.push({
            u: clamp(lanes[k] + (edge ? randRange(-0.04, 0.04) : randRange(-0.16, 0.16)), -1, 1),
            v: randRange(0, 1),
            size: randRange(0.6, 1.3),
            phase: randRange(0, TAU),
            rate: randRange(0.6, 1.6)
          });
        }
      }
    }

    // Per-node brightness from the body's state.
    const glow = this._glow || (this._glow = []);
    glow.length = n;
    const moving = brain.activity;
    const nervePhase = time * (0.5 + 0.9 * moving);
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      const squeeze = Math.max(0, worm.contraction[Math.min(n - 2, i)]);
      const f = ((nervePhase - s * 0.9) % 1 + 1) % 1;
      const nerve = Math.exp(-(((f - 0.5) / 0.035) ** 2)) * (0.15 + 0.85 * moving);
      const breathe = (1 - moving) * 0.18 * (0.5 + 0.5 * Math.sin(time * 1.6 - s * 2));
      let shock = 0;
      if (brain.shockNode >= 0 && brain.shock < 1.2) {
        const front = brain.shock * 40; // nodes per second
        const d = Math.abs(i - brain.shockNode) - front;
        shock = Math.exp(-((d / 2.2) ** 2)) * (1 - brain.shock / 1.2);
      }
      const head = 0.25 * (1 - smoothstep(s / 0.12));
      glow[i] = 0.32 + squeeze * 0.45 + nerve * 0.7 + breathe + shock * 1.2 + head;
    }

    const pts = this._pts || (this._pts = []);
    pts.length = 0;
    for (let i = 0; i < n; i += 1) {
      const a = this.frame(i);
      const b = this.frame(Math.min(n - 1, i + 1));
      for (let k = 0; k < per; k += 1) {
        const seed = this.seeds[i * per + k];
        const v = i === n - 1 ? 0 : seed.v;
        // Each dot drifts a little on its own, like a cell.
        const u = seed.u + Math.sin(time * seed.rate + seed.phase) * 0.07;
        const along = Math.cos(time * seed.rate * 0.8 + seed.phase) * 0.12;
        const cx = lerp(a.cx, b.cx, v);
        const cy = lerp(a.cy, b.cy, v);
        const hx = lerp(a.hx, b.hx, v);
        const hy = lerp(a.hy, b.hy, v);
        const len = Math.hypot(hx, hy) || 1;
        pts.push({
          x: cx + hx * u - (hy / len) * along * worm.restLength,
          y: cy + hy * u + (hx / len) * along * worm.restLength,
          i,
          size: seed.size,
          g: lerp(glow[i], glow[Math.min(n - 1, i + 1)], v)
        });
      }
    }

    const reach = worm.restLength * 1.5;
    const segs = [];
    for (let a = 0; a < pts.length; a += 1) {
      const pa = pts[a];
      for (let b = a + 1; b < pts.length && pts[b].i <= pa.i + 2; b += 1) {
        const pb = pts[b];
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < reach) {
          const near = 1 - d / reach;
          segs.push([pa.x, pa.y, pb.x, pb.y, near * near * (pa.g + pb.g) * 0.5]);
        }
      }
    }

    // Feelers: the two chemical sensors, linked to the head.
    if (brain.targetDistance < Infinity) {
      const s = brain.sensors;
      const h = pts[Math.floor(per / 2)];
      const pulse = 0.25 + 0.2 * Math.sin(time * 6);
      segs.push([h.x, h.y, s.lx, s.ly, pulse * (0.5 + s.li)]);
      segs.push([h.x, h.y, s.rx, s.ry, pulse * (0.5 + s.ri)]);
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    this.strokeBuckets(ctx, segs, "150,205,255", 0.8);
    for (const p of pts) {
      this.dot(ctx, p.x, p.y, (2.2 + p.g * 3.2) * p.size, 0.25 + p.g * 0.6);
    }
    if (brain.targetDistance < Infinity) {
      const s = brain.sensors;
      this.dot(ctx, s.lx, s.ly, 3 + s.li * 4, 0.3 + s.li * 0.6);
      this.dot(ctx, s.rx, s.ry, 3 + s.ri * 4, 0.3 + s.ri * 0.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
};
