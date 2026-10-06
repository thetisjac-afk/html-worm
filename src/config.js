// Every tunable number lives here. The panel (press P) edits this object live.
// Units: px, seconds, radians. "0..1" values are fractions.
const CONFIG = {
  // --- Body -------------------------------------------------------------
  segments: 30,          // muscular segments (nodes = segments + 1)
  segmentLength: 14,     // resting length of one segment
  radius: 11,            // resting half-width of the body (organic style)

  // --- Muscles: the peristaltic wave -------------------------------------
  // Each segment squeezes and stretches on a sine wave whose phase shifts
  // along the body, so contraction waves travel from head to tail.
  waveFrequency: 1.4,    // waves per second at full drive
  waveLength: 0.45,      // wave length as a fraction of the body (0.45 = ~2 waves visible)
  waveAmplitude: 0.34,   // how far a segment shortens/lengthens (0.34 = +/-34%)

  // --- Ground contact: the setae (tiny bristles) -----------------------
  // Short, fat (contracted) segments push bristles into the soil and grip.
  // Bristles point backwards, so they act as a ratchet: sliding backwards
  // is blocked, sliding forwards is easy. This asymmetry is what makes the
  // worm move at all.
  ratchet: 0.97,         // 0 = no grip, 1 = gripping segments never slide backwards
  forwardFriction: 0.25, // how much gripping segments also resist sliding forwards
  lateralGrip: 0.9,      // resistance to sliding sideways (makes the body follow the head's path)
  drag: 14,              // how quickly momentum dies (worms live in a world of friction, not inertia)

  // --- Solver -------------------------------------------------------------
  iterations: 10,        // constraint passes per physics step
  maxJointBend: 0.7,     // hard limit per joint, stops the body folding into zigzags
  bodySmoothing: 0.12,   // pulls each joint's bend toward its neighbours' (smooth curves, no kinks)

  // --- Senses & steering ---------------------------------------------------
  // Two chemical sensors either side of the head compare scent strength.
  sensorDistance: 24,    // how far ahead of the head the sensors sit
  sensorSpread: 16,      // how far apart (left/right) they are
  scentFalloff: 80,      // scent decays as exp(-distance / falloff); smaller = sharper gradient
  steerGain: 3.2,        // how hard the worm turns toward the stronger side
  maxHeadBend: 1.6,      // total bend the head can make (radians, shared across the neck joints)
  headJoints: 3,         // joints behind the head that actively steer; the rest of the body just follows the path
  headSway: 0.32,        // side-to-side "casting" of the head while it searches
  arriveRadius: 40,      // close enough to the scent to stop and forage

  // --- View ----------------------------------------------------------------
  style: "plexus",       // "plexus" (glowing dot network), "mesh", "lattice", "tube" or "organic"
  cursorMode: "food",    // "food" (attract) or "light" (worms hate light: repel)
  slime: true,           // draw the slime trail
  debug: false           // show grip, sensors and behaviour state
};

const DEFAULT_CONFIG = Object.freeze({ ...CONFIG });
