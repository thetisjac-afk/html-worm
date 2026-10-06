const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const FIXED_DT = 1 / 120;
const MAX_STEPS = 8;

const input = {
  x: 0,
  y: 0,
  active: false,
  idleTimer: 0 // touch has no hover, so a lifted finger's scent fades after a while
};

const sim = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  speed: 0,
  fps: 60,
  frameDt: 1 / 60,
  worm: null,
  brain: null,
  input
};
window.sim = sim; // handy from the devtools console, and used by the tests

function resize() {
  sim.dpr = Math.min(window.devicePixelRatio || 1, 2);
  sim.width = window.innerWidth;
  sim.height = window.innerHeight;
  canvas.width = Math.floor(sim.width * sim.dpr);
  canvas.height = Math.floor(sim.height * sim.dpr);
  ctx.setTransform(sim.dpr, 0, 0, sim.dpr, 0, 0);
  Renderer.resize(sim.width, sim.height, sim.dpr);
}

function spawn() {
  const angle = sim.worm ? Math.atan2(sim.worm.ty[0], sim.worm.tx[0]) : randRange(-0.4, 0.4);
  const x = sim.worm ? sim.worm.x[0] : sim.width * 0.5 + 120;
  const y = sim.worm ? sim.worm.y[0] : sim.height * 0.5;
  sim.worm = new Worm(x, y, angle);
  if (!sim.brain) sim.brain = createBrain();
  Renderer.trail.length = 0;
}

function step(dt) {
  sim.time += dt;
  if (input.idleTimer > 0) {
    input.idleTimer -= dt;
    if (input.idleTimer <= 0) input.active = false;
  }
  const cx = sim.worm.centerX();
  const cy = sim.worm.centerY();
  Brain.update(sim.brain, sim.worm, input, dt, sim);
  sim.worm.step(sim.brain, dt, sim);
  const v = Math.hypot(sim.worm.centerX() - cx, sim.worm.centerY() - cy) / dt;
  sim.speed = lerp(sim.speed, v, expSmoothing(1.5, dt));
}

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frameDt > 0) sim.fps = lerp(sim.fps, 1 / frameDt, 0.05);
  sim.frameDt = frameDt;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }
  if (steps === MAX_STEPS) accumulator = 0; // fell behind: drop time rather than spiral
  Renderer.draw(ctx, sim);
  requestAnimationFrame(frame);
}

// --- Input -----------------------------------------------------------------
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" && event.buttons === 0) return;
  input.active = true;
  input.idleTimer = 0;
  input.x = event.clientX;
  input.y = event.clientY;
});

canvas.addEventListener("pointerdown", (event) => {
  const hit = Brain.poke(sim.brain, sim.worm, event.clientX, event.clientY);
  if (!hit) {
    input.active = true;
    input.idleTimer = 0;
    input.x = event.clientX;
    input.y = event.clientY;
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "mouse") input.idleTimer = 6;
});

// The cursor left the window. (`pointerleave` on window never fires, which
// is why the old version never went back to wandering.)
document.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) input.active = false;
});
window.addEventListener("blur", () => {
  input.active = false;
});

window.addEventListener("keydown", (event) => {
  if (event.target.closest && event.target.closest("#panel")) return;
  const key = event.key.toLowerCase();
  if (key === "p") Panel.toggle();
  else if (key === "d") CONFIG.debug = !CONFIG.debug;
  else if (key === "w") CONFIG.style = CONFIG.style === "mesh" ? "organic" : "mesh";
  else if (key === "l") CONFIG.cursorMode = CONFIG.cursorMode === "light" ? "food" : "light";
  else return;
  Panel.sync();
});

window.addEventListener("resize", () => {
  const sx = window.innerWidth / (sim.width || 1);
  const sy = window.innerHeight / (sim.height || 1);
  resize();
  sim.worm.scale(sx, sy);
  Mesh.scale(sx, sy);
});

resize();
spawn();
Panel.init(spawn);
setTimeout(() => document.getElementById("hint").classList.add("faded"), 9000);
requestAnimationFrame(frame);
