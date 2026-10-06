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

  // C: plexus / constellation. Scattered dots fill the body and connect to
  // any neighbour close enough, like a living network.
  plexus(ctx, worm) {
    const n = worm.n;
    const per = 5;
    if (!this.seeds || this.seeds.length !== n * per) {
      this.seeds = [];
      for (let k = 0; k < n * per; k += 1) {
        this.seeds.push({ u: randRange(-0.95, 0.95), v: Math.random(), s: randRange(0.5, 1.4) });
      }
    }
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const a = this.frame(i);
      const b = this.frame(Math.min(n - 1, i + 1));
      for (let k = 0; k < per; k += 1) {
        const seed = this.seeds[i * per + k];
        const v = i === n - 1 ? 0 : seed.v;
        const cx = lerp(a.cx, b.cx, v);
        const cy = lerp(a.cy, b.cy, v);
        const hx = lerp(a.hx, b.hx, v);
        const hy = lerp(a.hy, b.hy, v);
        pts.push({ x: cx + hx * seed.u, y: cy + hy * seed.u, i, s: seed.s, p: Mesh.pressure[i] });
      }
    }
    const reach = worm.restLength * 1.55;
    const segs = [];
    for (let a = 0; a < pts.length; a += 1) {
      const pa = pts[a];
      for (let b = a + 1; b < pts.length && pts[b].i <= pa.i + 2; b += 1) {
        const pb = pts[b];
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < reach) segs.push([pa.x, pa.y, pb.x, pb.y, (1 - d / reach) * 0.75 + pa.p * 0.15]);
      }
    }
    ctx.lineCap = "round";
    this.strokeBuckets(ctx, segs, "200,230,255", 0.8);
    ctx.globalCompositeOperation = "lighter";
    for (const p of pts) this.dot(ctx, p.x, p.y, (2.5 + p.p * 2.5) * p.s + 1.5, 0.45 + p.p * 0.35);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
};
