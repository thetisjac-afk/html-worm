// A small live-tuning panel for CONFIG. Press P or click the gear.
const PANEL_SPEC = [
  { group: "Body" },
  { key: "segments", min: 10, max: 60, step: 1, rebuild: true },
  { key: "segmentLength", min: 4, max: 16, step: 0.5, rebuild: true },
  { key: "radius", min: 2, max: 14, step: 0.5 },
  { group: "Muscle wave" },
  { key: "waveFrequency", min: 0.1, max: 4, step: 0.05 },
  { key: "waveLength", min: 0.1, max: 1.5, step: 0.01 },
  { key: "waveAmplitude", min: 0, max: 0.6, step: 0.01 },
  { group: "Ground grip" },
  { key: "ratchet", min: 0, max: 1, step: 0.01 },
  { key: "forwardFriction", min: 0, max: 0.95, step: 0.01 },
  { key: "lateralGrip", min: 0, max: 0.98, step: 0.01 },
  { key: "drag", min: 0, max: 40, step: 0.5 },
  { group: "Body shape" },
  { key: "maxJointBend", min: 0.1, max: 1.5, step: 0.01 },
  { key: "bodySmoothing", min: 0, max: 0.6, step: 0.01 },
  { group: "Senses" },
  { key: "scentFalloff", min: 10, max: 250, step: 1 },
  { key: "steerGain", min: 0, max: 8, step: 0.1 },
  { key: "maxHeadBend", min: 0.2, max: 3, step: 0.05 },
  { key: "headJoints", min: 1, max: 10, step: 1 },
  { key: "headSway", min: 0, max: 1, step: 0.01 },
  { group: "View" },
  { key: "style", options: ["plexus", "mesh", "lattice", "tube", "organic"] },
  { key: "cursorMode", options: ["food", "light"] },
  { key: "slime", toggle: true },
  { key: "debug", toggle: true }
];

const Panel = {
  root: null,
  inputs: {},

  init(onRebuild) {
    const root = document.createElement("div");
    root.id = "panel";
    root.hidden = true;
    this.root = root;

    for (const spec of PANEL_SPEC) {
      if (spec.group) {
        const h = document.createElement("h3");
        h.textContent = spec.group;
        root.appendChild(h);
        continue;
      }
      const row = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = spec.key;
      row.appendChild(name);
      let input;
      const value = document.createElement("output");

      if (spec.options) {
        input = document.createElement("select");
        for (const opt of spec.options) input.add(new Option(opt, opt));
        input.addEventListener("change", () => {
          CONFIG[spec.key] = input.value;
        });
      } else if (spec.toggle) {
        input = document.createElement("input");
        input.type = "checkbox";
        input.addEventListener("change", () => {
          CONFIG[spec.key] = input.checked;
        });
      } else {
        input = document.createElement("input");
        input.type = "range";
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
        input.addEventListener("input", () => {
          CONFIG[spec.key] = Number(input.value);
          value.textContent = input.value;
          if (spec.rebuild) onRebuild();
        });
      }
      row.appendChild(input);
      row.appendChild(value);
      root.appendChild(row);
      this.inputs[spec.key] = { input, value, spec };
    }

    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const reset = document.createElement("button");
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      Object.assign(CONFIG, DEFAULT_CONFIG);
      onRebuild(); // may shrink sizes to fit the screen
      this.sync();
    });
    const copy = document.createElement("button");
    copy.textContent = "Copy config";
    copy.addEventListener("click", async () => {
      const text = JSON.stringify(CONFIG, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
      } catch {
        console.log(text);
        copy.textContent = "See console";
      }
      setTimeout(() => (copy.textContent = "Copy config"), 1200);
    });
    buttons.append(reset, copy);
    root.appendChild(buttons);

    document.body.appendChild(root);

    const gear = document.createElement("button");
    gear.id = "gear";
    gear.title = "Tuning panel (P)";
    gear.textContent = "⚙";
    gear.addEventListener("click", () => this.toggle());
    document.body.appendChild(gear);

    // Keep pointer events on the panel from steering the worm.
    for (const el of [root, gear]) {
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      el.addEventListener("pointermove", (e) => e.stopPropagation());
    }
    this.sync();
  },

  sync() {
    for (const key in this.inputs) {
      const { input, value, spec } = this.inputs[key];
      if (spec.toggle) input.checked = CONFIG[key];
      else input.value = CONFIG[key];
      value.textContent = spec.options || spec.toggle ? "" : CONFIG[key];
    }
  },

  toggle() {
    this.root.hidden = !this.root.hidden;
  }
};
