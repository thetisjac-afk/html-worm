const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// Frame-rate independent "move toward" factor for exponential smoothing.
function expSmoothing(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function rotateAround(px, py, cx, cy, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
