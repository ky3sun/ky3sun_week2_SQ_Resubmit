// PANIC BLOB + MISCHIEF MAP (p5.js)
// Replace your entire sketch.js with this

// -------------------------
// Blob state (emotion: PANIC)
// -------------------------
let blob = {
  // Position
  x: 240,
  y: 160,

  // Movement
  vx: 0,
  vy: 0,
  maxSpeed: 6.2,
  accel: 0.45,
  friction: 0.92,

  // Soft body look
  r: 28,
  points: 56,
  wobble: 9,
  wobbleFreq: 0.9,
  t: 0,
  tSpeed: 0.02,

  // Panic tuning
  fearRadius: 130, // mouse too close -> panic
  shake: 0, // screen shake amount
  panic: 0, // 0..1 intensity
};

// -------------------------
// Small map environment
// -------------------------
let items = [];
let obstacles = [];
let stolenCount = 0;

// Simple helper
function clamp(v, a, b) {
  return max(a, min(b, v));
}

function setup() {
  createCanvas(480, 320);
  noStroke();
  textFont("sans-serif");
  textSize(14);

  // Make some obstacles (rect walls inside the map)
  obstacles = [
    { x: 120, y: 60, w: 70, h: 18 },
    { x: 280, y: 90, w: 120, h: 18 },
    { x: 90, y: 210, w: 110, h: 18 },
    { x: 260, y: 220, w: 70, h: 18 },
  ];

  // Scatter items to bump/steal
  for (let i = 0; i < 9; i++) {
    items.push(makeItem());
  }
}

function makeItem() {
  return {
    x: random(40, width - 40),
    y: random(40, height - 40),
    r: random(8, 14),
    vx: random(-0.6, 0.6),
    vy: random(-0.6, 0.6),
    alive: true,
  };
}

function draw() {
  // --- Panic background (subtle alarm pulse) ---
  const alarm = 0.5 + 0.5 * sin(frameCount * 0.12);
  background(235 - alarm * 12);

  // Update blob panic based on mouse distance
  const dToMouse = dist(blob.x, blob.y, mouseX, mouseY);
  blob.panic = clamp(map(dToMouse, blob.fearRadius, 20, 0, 1), 0, 1);

  // Screen shake increases with panic
  blob.shake = lerp(blob.shake, blob.panic * 6, 0.12);

  // Apply camera shake
  push();
  translate(random(-blob.shake, blob.shake), random(-blob.shake, blob.shake));

  // Draw map boundary
  drawMapFrame();

  // Draw obstacles
  drawObstacles();

  // Update & draw items
  updateItems();
  drawItems();

  // Update blob movement (panic flee + jitter)
  updateBlob();

  // Draw panic rings around mouse (visual cue)
  drawPanicRings();

  // Draw blob
  drawBlob();

  pop();

  // UI overlay (not shaken)
  drawUI();
}

// -------------------------
// Movement & physics
// -------------------------
function updateBlob() {
  // Panic makes blob "breathe" faster and wobble more
  blob.tSpeed = lerp(0.012, 0.06, blob.panic);
  blob.wobble = lerp(7, 14, blob.panic);
  blob.t += blob.tSpeed;

  // Flee vector away from mouse (stronger when closer)
  let ax = 0;
  let ay = 0;

  if (blob.panic > 0) {
    const awayX = blob.x - mouseX;
    const awayY = blob.y - mouseY;
    const m = max(0.0001, sqrt(awayX * awayX + awayY * awayY));
    const nx = awayX / m;
    const ny = awayY / m;

    // stronger acceleration under panic
    const strength = lerp(0.1, blob.accel * 2.2, blob.panic);
    ax += nx * strength;
    ay += ny * strength;

    // jitter (panic twitch)
    ax += random(-0.15, 0.15) * blob.panic;
    ay += random(-0.15, 0.15) * blob.panic;
  } else {
    // When calm, gentle wandering
    ax += map(noise(frameCount * 0.01), 0, 1, -0.06, 0.06);
    ay += map(noise(999 + frameCount * 0.01), 0, 1, -0.06, 0.06);
  }

  // Integrate velocity
  blob.vx += ax;
  blob.vy += ay;

  // Speed clamp
  const sp = sqrt(blob.vx * blob.vx + blob.vy * blob.vy);
  const maxSp = lerp(2.4, blob.maxSpeed, blob.panic);
  if (sp > maxSp) {
    blob.vx = (blob.vx / sp) * maxSp;
    blob.vy = (blob.vy / sp) * maxSp;
  }

  // Apply friction
  blob.vx *= blob.friction;
  blob.vy *= blob.friction;

  // Move
  blob.x += blob.vx;
  blob.y += blob.vy;

  // Collide with outer walls
  wallBounceBlob();

  // Collide with obstacles (simple AABB resolution)
  collideBlobObstacles();

  // Mischief interaction with items
  mischief();
}

function wallBounceBlob() {
  const pad = 14;
  if (blob.x < pad) {
    blob.x = pad;
    blob.vx *= -0.9;
  }
  if (blob.x > width - pad) {
    blob.x = width - pad;
    blob.vx *= -0.9;
  }
  if (blob.y < pad) {
    blob.y = pad;
    blob.vy *= -0.9;
  }
  if (blob.y > height - pad) {
    blob.y = height - pad;
    blob.vy *= -0.9;
  }
}

function collideBlobObstacles() {
  // treat blob as circle colliding with rectangles
  for (const o of obstacles) {
    // closest point on rect to circle center
    const cx = clamp(blob.x, o.x, o.x + o.w);
    const cy = clamp(blob.y, o.y, o.y + o.h);
    const d = dist(blob.x, blob.y, cx, cy);
    const rr = blob.r * 0.72; // effective collision size

    if (d < rr) {
      // push out along normal
      const nx = (blob.x - cx) / max(0.0001, d);
      const ny = (blob.y - cy) / max(0.0001, d);
      const push = rr - d + 0.5;

      blob.x += nx * push;
      blob.y += ny * push;

      // bounce velocity a bit
      const dot = blob.vx * nx + blob.vy * ny;
      blob.vx -= 2 * dot * nx;
      blob.vy -= 2 * dot * ny;
      blob.vx *= 0.65;
      blob.vy *= 0.65;
    }
  }
}

// -------------------------
// Mischief: bump or steal
// -------------------------
function mischief() {
  const stealMode = keyIsDown(SHIFT); // hold Shift to steal
  for (const it of items) {
    if (!it.alive) continue;

    const d = dist(blob.x, blob.y, it.x, it.y);
    const hit = d < blob.r * 0.78 + it.r;

    if (hit) {
      if (stealMode) {
        it.alive = false;
        stolenCount += 1;

        // small "panic reward" kick
        blob.vx += random(-1, 1);
        blob.vy += random(-1, 1);
      } else {
        // bump it away (classic mischief)
        const nx = (it.x - blob.x) / max(0.0001, d);
        const ny = (it.y - blob.y) / max(0.0001, d);
        const force = lerp(0.7, 2.6, blob.panic);

        it.vx += nx * force;
        it.vy += ny * force;

        // blob also recoils slightly
        blob.vx -= nx * force * 0.35;
        blob.vy -= ny * force * 0.35;
      }
    }
  }

  // respawn if too many stolen
  const aliveCount = items.filter((it) => it.alive).length;
  if (aliveCount < 4) {
    // add 2 new items
    items.push(makeItem());
    items.push(makeItem());
  }
}

// -------------------------
// Items update
// -------------------------
function updateItems() {
  for (const it of items) {
    if (!it.alive) continue;

    // drift and friction
    it.x += it.vx;
    it.y += it.vy;
    it.vx *= 0.94;
    it.vy *= 0.94;

    // bounce off outer walls
    const pad = 12;
    if (it.x < pad) {
      it.x = pad;
      it.vx *= -0.9;
    }
    if (it.x > width - pad) {
      it.x = width - pad;
      it.vx *= -0.9;
    }
    if (it.y < pad) {
      it.y = pad;
      it.vy *= -0.9;
    }
    if (it.y > height - pad) {
      it.y = height - pad;
      it.vy *= -0.9;
    }

    // simple obstacle collision for items
    for (const o of obstacles) {
      if (circleRectHit(it.x, it.y, it.r, o.x, o.y, o.w, o.h)) {
        // push out by reversing velocity
        it.vx *= -0.85;
        it.vy *= -0.85;
        it.x += it.vx * 2;
        it.y += it.vy * 2;
      }
    }
  }
}

function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const px = clamp(cx, rx, rx + rw);
  const py = clamp(cy, ry, ry + rh);
  return dist(cx, cy, px, py) < cr;
}

// -------------------------
// Drawing
// -------------------------
function drawMapFrame() {
  // Border
  noFill();
  stroke(30, 30, 30, 120);
  strokeWeight(2);
  rect(8, 8, width - 16, height - 16, 10);
  noStroke();

  // A subtle floor texture
  for (let i = 0; i < 18; i++) {
    const x = (i / 18) * width;
    fill(0, 0, 0, 6);
    rect(x, 0, 1, height);
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    fill(40, 40, 40, 160);
    rect(o.x, o.y, o.w, o.h, 6);

    // hazard stripes for "panic vibe"
    for (let i = 0; i < o.w; i += 10) {
      fill(255, 180, 0, 90);
      rect(o.x + i, o.y, 5, o.h);
    }
  }
}

function drawItems() {
  for (const it of items) {
    if (!it.alive) continue;

    // Items "glint" to feel steal-able
    const glint = 0.5 + 0.5 * sin(frameCount * 0.2 + it.x * 0.02);
    fill(250, 80 + glint * 120, 70, 220);
    circle(it.x, it.y, it.r * 2);

    fill(255, 255, 255, 140);
    circle(it.x - it.r * 0.25, it.y - it.r * 0.25, it.r * 0.6);
  }
}

function drawPanicRings() {
  // Rings expand around mouse when blob panics
  if (blob.panic <= 0.02) return;

  const rings = 3;
  for (let i = 0; i < rings; i++) {
    const t = (frameCount * 0.6 + i * 20) % 60;
    const r = map(t, 0, 60, 12, 70) + blob.panic * 30;
    const a = map(t, 0, 60, 120, 0) * blob.panic;

    noFill();
    stroke(200, 30, 30, a);
    strokeWeight(2);
    circle(mouseX, mouseY, r * 2);
  }
  noStroke();
}

function drawBlob() {
  // Blob color shifts with panic: calm blue -> panic red
  const rr = lerp(20, 220, blob.panic);
  const gg = lerp(120, 60, blob.panic);
  const bb = lerp(255, 70, blob.panic);

  fill(rr, gg, bb);

  beginShape();
  for (let i = 0; i < blob.points; i++) {
    const a = (i / blob.points) * TAU;

    const n = noise(
      cos(a) * blob.wobbleFreq + 100,
      sin(a) * blob.wobbleFreq + 100,
      blob.t,
    );

    const r = blob.r + map(n, 0, 1, -blob.wobble, blob.wobble);

    vertex(blob.x + cos(a) * r, blob.y + sin(a) * r);
  }
  endShape(CLOSE);

  // Tiny "eye" to show direction (helps emotion readability)
  const dir = atan2(blob.vy, blob.vx);
  const eyeDist = blob.r * 0.35;
  const ex = blob.x + cos(dir) * eyeDist;
  const ey = blob.y + sin(dir) * eyeDist;

  fill(0, 0, 0, 170);
  circle(ex, ey, lerp(5, 8, blob.panic));
}

function drawUI() {
  fill(0, 160);
  text(
    "Emotion: PANIC — Move mouse close to scare the blob.\nMischief: bump items by touching them. Hold SHIFT to STEAL.\nStolen: " +
      stolenCount,
    12,
    20,
  );
}
