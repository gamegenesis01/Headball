// ─────────────────────────────────────────────
//  UFL HEADBALL  –  game.js
//  Pure Canvas, no external dependencies
// ─────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Resize canvas to fill available space ──
function resizeCanvas() {
  const hud  = document.getElementById('hud');
  const mob  = document.getElementById('mobile-controls');
  const maxW = 800;
  const w    = Math.min(window.innerWidth, maxW);
  const hudH = hud.offsetHeight;
  const mobH = mob.offsetStyle ? 0 : mob.offsetHeight; // hidden on desktop
  const availH = window.innerHeight - hudH - mob.offsetHeight;
  canvas.width  = w;
  canvas.height = Math.max(280, availH);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Constants ──
const GRAVITY      = 0.45;
const PLAYER_SPEED = 4.5;
const JUMP_FORCE   = -12;
const BALL_RADIUS  = 18;
const HEAD_RADIUS  = 16;   // collision radius for heading
const GOAL_WIDTH   = 12;
const WIN_SCORE    = 3;

// ── Game State ──
let state = {
  level       : 1,
  coins       : 0,
  playerScore : 0,
  aiScore     : 0,
  phase       : 'start',   // 'start' | 'playing' | 'goal' | 'end'
  goalTimer   : 0,
  obstacles   : [],
};

// ── Keyboard input ──
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true;  });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

// ── Virtual Joystick ──
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const JOY_RADIUS = 42;   // max knob travel (px)
const JOY_DEAD   = 14;   // deadzone (px)

const joy = { x: 0, y: 0, active: false, id: null };
let joyWasUp = false;    // edge-detect for jump trigger

function joyPos(clientX, clientY) {
  const r  = joystickBase.getBoundingClientRect();
  const cx = r.left + r.width  / 2;
  const cy = r.top  + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > JOY_RADIUS) { dx = dx / dist * JOY_RADIUS; dy = dy / dist * JOY_RADIUS; }
  return { x: dx, y: dy };
}

function joyApply(x, y) {
  joy.x = x; joy.y = y;
  joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
}

joystickBase.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  joy.id = t.identifier; joy.active = true;
  const p = joyPos(t.clientX, t.clientY);
  joyApply(p.x, p.y);
}, { passive: false });

joystickBase.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      const p = joyPos(t.clientX, t.clientY);
      joyApply(p.x, p.y);
    }
  }
}, { passive: false });

['touchend', 'touchcancel'].forEach(evt => {
  joystickBase.addEventListener(evt, e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        joy.active = false; joy.id = null;
        joyWasUp = false;
        joyApply(0, 0);
      }
    }
  }, { passive: false });
});

// Mouse fallback for desktop testing
joystickBase.addEventListener('mousedown', e => {
  joy.active = true;
  const p = joyPos(e.clientX, e.clientY);
  joyApply(p.x, p.y);
  const mm = ev => { const p = joyPos(ev.clientX, ev.clientY); joyApply(p.x, p.y); };
  const mu = () => { joy.active = false; joyWasUp = false; joyApply(0, 0); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
});

// ── Entities ──
function makePlayer() {
  return {
    x: 0, y: 0, w: 32, h: 52,
    vx: 0, vy: 0,
    onGround: false,
    jumpsLeft: 1,
    facing: 1,   // 1 = right, -1 = left
    side: 'player',
  };
}

function makeAI() {
  return {
    x: 0, y: 0, w: 32, h: 52,
    vx: 0, vy: 0,
    onGround: false,
    jumpsLeft: 1,
    facing: -1,
    side: 'ai',
    reactionTimer: 0,
    targetX: 0,
  };
}

function makeBall() {
  return { x: 0, y: 0, vx: 0, vy: 0, r: BALL_RADIUS, spin: 0 };
}

let player = makePlayer();
let ai     = makeAI();
let ball   = makeBall();

// ── Layout helpers (recalculated each frame) ──
function ground()      { return canvas.height - 36; }
function goalHeight()  { return Math.min(120, canvas.height * 0.38); }
function goalY()       { return ground() - goalHeight(); }
function leftGoalX()   { return 0; }
function rightGoalX()  { return canvas.width - GOAL_WIDTH; }
function centreX()     { return canvas.width / 2; }

// ── Reset positions ──
function resetPositions() {
  const g = ground();
  player.x = canvas.width * 0.22;
  player.y = g - player.h;
  player.vx = 0; player.vy = 0; player.onGround = true; player.jumpsLeft = 1;

  ai.x = canvas.width * 0.72;
  ai.y = g - ai.h;
  ai.vx = 0; ai.vy = 0; ai.onGround = true; ai.jumpsLeft = 1;

  ball.x  = canvas.width / 2;
  ball.y  = g - 100;
  ball.vx = (Math.random() < 0.5 ? 1 : -1) * 2;
  ball.vy = -3;
  ball.spin = 0;
}

// ── Obstacles ──
function buildObstacles() {
  state.obstacles = [];
  if (state.level < 4) return;
  const count = Math.min(state.level - 3, 3);
  for (let i = 0; i < count; i++) {
    state.obstacles.push({
      x    : canvas.width * (0.3 + i * 0.15),
      y    : ground() - 80 - Math.random() * 60,
      w    : 18,
      h    : 18,
      vx   : (Math.random() < 0.5 ? 1 : -1) * (1.5 + state.level * 0.2),
      vy   : 0,
      r    : 9,
      type : 'bouncer',
    });
  }
}

// ── AI difficulty ──
function aiSpeed()   { return Math.min(3.5 + state.level * 0.4, 8); }
function aiDelay()   { return Math.max(40 - state.level * 5, 4);    }  // frames of reaction lag
function aiJumpErr() { return Math.max(60 - state.level * 8, 8);    }  // px position error

// ── AI brain ──
function updateAI() {
  const g = ground();

  // Predict where ball will land on AI half
  let predX = ball.x;
  let predVx = ball.vx;
  let predVy = ball.vy;
  let predY  = ball.y;
  for (let t = 0; t < 80; t++) {
    predVy += GRAVITY;
    predY  += predVy;
    predX  += predVx;
    if (predY >= g - BALL_RADIUS) { predY = g - BALL_RADIUS; break; }
  }

  // Add error proportional to difficulty
  const err = (Math.random() - 0.5) * aiJumpErr();
  ai.targetX = predX + err;

  // Throttle with reaction timer
  ai.reactionTimer--;
  if (ai.reactionTimer > 0) return;
  ai.reactionTimer = aiDelay();

  const spd = aiSpeed();
  const diff = ai.targetX - (ai.x + ai.w / 2);

  if (Math.abs(diff) > 6) {
    ai.vx = Math.sign(diff) * spd;
    ai.facing = Math.sign(diff);
  } else {
    ai.vx = 0;
  }

  // Jump decision: ball is close and above
  const ballNear = Math.abs(ball.x - (ai.x + ai.w / 2)) < 120;
  const ballHigh = ball.y < ai.y + 20;
  if (ai.onGround && ballNear && ballHigh) {
    ai.vy = JUMP_FORCE;
    ai.onGround = false;
    ai.jumpsLeft = 0;
  }
}

// ── Physics ──
function applyGravity(e) {
  e.vy += GRAVITY;
}

function clampToFloor(e) {
  const g = ground();
  if (e.y + e.h >= g) {
    e.y = g - e.h;
    e.vy = 0;
    e.onGround = true;
    e.jumpsLeft = 1;
  }
}

function clampToCeiling(e) {
  if (e.y < 0) { e.y = 0; e.vy = 0; }
}

function clampToWalls(e) {
  const minX = GOAL_WIDTH;
  const maxX = canvas.width - GOAL_WIDTH - e.w;
  const mid  = canvas.width / 2;

  // Air-hockey style: each side stays in their own half
  if (e.side === 'player') {
    if (e.x < minX)          { e.x = minX;          e.vx = 0; }
    if (e.x + e.w > mid - 2) { e.x = mid - 2 - e.w; e.vx = 0; }
  } else {
    if (e.x < mid + 2) { e.x = mid + 2; e.vx = 0; }
    if (e.x > maxX)    { e.x = maxX;    e.vx = 0; }
  }
}

function moveBall() {
  ball.vy += GRAVITY * 0.95;
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.spin += ball.vx * 0.04;

  const g = ground();

  // Floor bounce
  if (ball.y + ball.r >= g) {
    ball.y  = g - ball.r;
    ball.vy = -Math.abs(ball.vy) * 0.62;
    ball.vx *= 0.82;
    ball.spin *= 0.6;
  }

  // Ceiling
  if (ball.y - ball.r < 0) {
    ball.y  = ball.r;
    ball.vy = Math.abs(ball.vy) * 0.6;
  }

  // Side walls – but allow scoring through goals
  if (ball.x - ball.r < GOAL_WIDTH) {
    // Check if in goal mouth (left goal = AI scores)
    if (ball.y > goalY() && ball.y < g) {
      checkGoalLeft();
    } else {
      ball.x  = GOAL_WIDTH + ball.r;
      ball.vx = Math.abs(ball.vx) * 0.7;
    }
  }
  if (ball.x + ball.r > canvas.width - GOAL_WIDTH) {
    if (ball.y > goalY() && ball.y < g) {
      checkGoalRight();
    } else {
      ball.x  = canvas.width - GOAL_WIDTH - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.7;
    }
  }
}

// ── Goal detection ──
let goalLock = false; // prevent multi-trigger

function checkGoalLeft() {
  if (goalLock || state.phase !== 'playing') return;
  goalLock = true;
  // ball went into LEFT goal → AI scores
  state.aiScore++;
  triggerGoal('ai');
}

function checkGoalRight() {
  if (goalLock || state.phase !== 'playing') return;
  goalLock = true;
  // ball went into RIGHT goal → Player scores
  state.playerScore++;
  triggerGoal('player');
}

function triggerGoal(scorer) {
  state.phase = 'goal';
  state.goalTimer = 90; // frames to show goal animation
  showGoalFlash(scorer);
  playGoalSound();
  updateHUD();
}

// ── Head collision ──
function headCollision(entity) {
  // Head is at the top-centre of the character
  const hx = entity.x + entity.w / 2;
  const hy = entity.y + 10;

  const dx = ball.x - hx;
  const dy = ball.y - hy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < BALL_RADIUS + HEAD_RADIUS) {
    // Resolve overlap
    const overlap = BALL_RADIUS + HEAD_RADIUS - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    // Relative velocity
    const dvx = ball.vx - (entity.vx || 0);
    const dvy = ball.vy - (entity.vy || 0);
    const dot  = dvx * nx + dvy * ny;

    if (dot < 0) {
      const restitution = 0.75;
      ball.vx -= (1 + restitution) * dot * nx;
      ball.vy -= (1 + restitution) * dot * ny;

      // Extra kick from entity's motion
      ball.vx += (entity.vx || 0) * 0.5;
      ball.vy += (entity.vy || 0) * 0.4;

      // Cap speed
      const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (spd > 18) { ball.vx = ball.vx / spd * 18; ball.vy = ball.vy / spd * 18; }

      playHitSound();
    }
  }
}

// ── Obstacle collision with ball ──
function obstacleCollision(obs) {
  const dx   = ball.x - obs.x;
  const dy   = ball.y - obs.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < ball.r + obs.r) {
    const nx = dx / dist || 1;
    const ny = dy / dist || 0;
    ball.x = obs.x + nx * (ball.r + obs.r);
    ball.y = obs.y + ny * (ball.r + obs.r);
    const dot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
    ball.vx *= 0.9;
    ball.vy *= 0.9;
  }
}

// ── Update obstacles ──
function updateObstacles() {
  const g = ground();
  for (const obs of state.obstacles) {
    obs.vy += GRAVITY * 0.5;
    obs.x  += obs.vx;
    obs.y  += obs.vy;
    if (obs.y + obs.r >= g) { obs.y = g - obs.r; obs.vy = -Math.abs(obs.vy) * 0.6; }
    if (obs.x - obs.r < GOAL_WIDTH) { obs.x = GOAL_WIDTH + obs.r; obs.vx = Math.abs(obs.vx); }
    if (obs.x + obs.r > canvas.width - GOAL_WIDTH) { obs.x = canvas.width - GOAL_WIDTH - obs.r; obs.vx = -Math.abs(obs.vx); }
    obstacleCollision(obs);
  }
}

// ── Player input ──
function handlePlayerInput() {
  if (joy.active) {
    // ── Joystick left/right ──
    if (joy.x < -JOY_DEAD) {
      player.vx = -PLAYER_SPEED * Math.min(Math.abs(joy.x) / JOY_RADIUS, 1);
      player.facing = -1;
    } else if (joy.x > JOY_DEAD) {
      player.vx = PLAYER_SPEED * Math.min(joy.x / JOY_RADIUS, 1);
      player.facing = 1;
    } else {
      player.vx *= 0.75;
    }

    // ── Up = jump (edge-triggered so holding up doesn't spam) ──
    const joyUp = joy.y < -JOY_DEAD * 1.2;
    if (joyUp && !joyWasUp && player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
    }
    joyWasUp = joyUp;

    // ── Down = dive (force player down mid-air) ──
    if (joy.y > JOY_DEAD * 1.2 && !player.onGround) {
      player.vy += 2.5;
    }

  } else {
    // ── Keyboard fallback ──
    if (keys['ArrowLeft'])       { player.vx = -PLAYER_SPEED; player.facing = -1; }
    else if (keys['ArrowRight']) { player.vx =  PLAYER_SPEED; player.facing =  1; }
    else                         { player.vx *= 0.75; }

    if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      keys['Space'] = false;
    }

    // Down key = dive in air
    if ((keys['ArrowDown'] || keys['KeyS']) && !player.onGround) {
      player.vy += 2.5;
    }
  }
}

// ── Player ↔ AI solid collision ──
function playerAICollision() {
  const pL = player.x, pR = player.x + player.w;
  const pT = player.y, pB = player.y + player.h;
  const aL = ai.x,     aR = ai.x + ai.w;
  const aT = ai.y,     aB = ai.y + ai.h;

  // No overlap?
  if (pR <= aL || pL >= aR || pB <= aT || pT >= aB) return;

  const overlapX = Math.min(pR - aL, aR - pL);
  const overlapY = Math.min(pB - aT, aB - pT);

  if (overlapX <= overlapY) {
    // Horizontal push-apart
    const push = overlapX / 2;
    if (player.x < ai.x) {
      player.x -= push;
      ai.x     += push;
    } else {
      player.x += push;
      ai.x     -= push;
    }
    player.vx *= 0.3;
    ai.vx = 0;
  } else {
    // Vertical push (land on top)
    if (player.y < ai.y) {
      player.y  = aT - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      ai.y  = pB;
      ai.vy = 0;
    }
  }
}

// ── Move entity ──
function moveEntity(e) {
  e.x += e.vx;
  e.y += e.vy;
}

// ── Main update ──
function update() {
  if (state.phase === 'goal') {
    state.goalTimer--;
    if (state.goalTimer <= 0) {
      goalLock = false;
      // Check win/lose
      if (state.playerScore >= WIN_SCORE) {
        endLevel(true);
      } else if (state.aiScore >= WIN_SCORE) {
        endLevel(false);
      } else {
        resetPositions();
        state.phase = 'playing';
      }
    }
    return;
  }

  if (state.phase !== 'playing') return;

  handlePlayerInput();
  updateAI();

  applyGravity(player);
  applyGravity(ai);
  moveEntity(player);
  moveEntity(ai);

  clampToFloor(player);
  clampToFloor(ai);
  clampToCeiling(player);
  clampToCeiling(ai);
  clampToWalls(player);
  clampToWalls(ai);

  moveBall();
  headCollision(player);
  headCollision(ai);
  updateObstacles();
}

// ── Level transitions ──
function endLevel(won) {
  state.phase = 'end';
  if (won) {
    state.coins += 10 + state.level * 5;
    showOverlay(
      '🏆 YOU WIN!',
      `Level ${state.level} cleared!\n+${10 + state.level * 5} coins earned`,
      'NEXT LEVEL'
    );
  } else {
    showOverlay('❌ GAME OVER', `The CPU won!\nTotal coins: ${state.coins}`, 'TRY AGAIN');
  }
  updateHUD();
}

function startLevel(lvl) {
  state.level       = lvl;
  state.playerScore = 0;
  state.aiScore     = 0;
  state.phase       = 'playing';
  goalLock          = false;
  buildObstacles();
  resetPositions();
  updateHUD();
  hideOverlay();
}

// ── HUD ──
function updateHUD() {
  document.getElementById('player-score').textContent  = state.playerScore;
  document.getElementById('ai-score').textContent      = state.aiScore;
  document.getElementById('level-display').textContent = `LEVEL ${state.level}`;
  document.getElementById('coins-display').textContent = `🪙 ${state.coins}`;
}

// ── Overlay ──
function showOverlay(title, sub, btnText) {
  const el = document.getElementById('overlay');
  document.getElementById('overlay-title').innerHTML = title;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('overlay-btn').textContent = btnText;
  el.classList.remove('hidden');
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

document.getElementById('overlay-btn').addEventListener('click', () => {
  if (state.phase === 'end') {
    if (state.playerScore >= WIN_SCORE) {
      startLevel(state.level + 1);
    } else {
      // Game over – restart from level 1, keep coins
      startLevel(1);
    }
  } else if (state.phase === 'start') {
    startLevel(1);
  }
});

// ── Goal flash ──
let goalFlashData = null;
function showGoalFlash(scorer) {
  goalFlashData = { scorer, frame: 0 };
}

// ── Audio (Web Audio API – tiny synth sounds) ──
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playHitSound() {
  try {
    const ac  = getAudio();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.25, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.start(); osc.stop(ac.currentTime + 0.12);
  } catch(_) {}
}

function playGoalSound() {
  try {
    const ac = getAudio();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.15, ac.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.12 + 0.25);
      osc.start(ac.currentTime + i * 0.12);
      osc.stop(ac.currentTime + i * 0.12 + 0.25);
    });
  } catch(_) {}
}

// ── Rendering ──

// Grass pattern cache
let grassPattern = null;
function getGrassPattern() {
  if (grassPattern) return grassPattern;
  const off = document.createElement('canvas');
  off.width = off.height = 40;
  const c = off.getContext('2d');
  c.fillStyle = '#2d6a2d';
  c.fillRect(0, 0, 40, 40);
  c.fillStyle = '#357a35';
  c.fillRect(0, 0, 20, 40);
  grassPattern = ctx.createPattern(off, 'repeat');
  return grassPattern;
}

function drawBackground() {
  const W = canvas.width, H = canvas.height;
  const g = ground();

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, g);
  sky.addColorStop(0, '#0a1628');
  sky.addColorStop(0.6, '#1a2f5a');
  sky.addColorStop(1, '#2a4a7f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, g);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  // Use deterministic stars based on canvas size
  const seed = W * 31 + H * 17;
  for (let i = 0; i < 40; i++) {
    const sx = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280 * W;
    const sy = ((seed * (i + 1) * 6971  + 3141)  % 233280) / 233280 * g * 0.7;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Stadium lights (two poles)
  drawLight(W * 0.18, g * 0.15);
  drawLight(W * 0.82, g * 0.15);

  // Crowd silhouette
  ctx.fillStyle = '#12204a';
  ctx.fillRect(0, g * 0.65, W, g * 0.15);
  // Wavy crowd tops
  ctx.beginPath();
  ctx.moveTo(0, g * 0.65);
  for (let x = 0; x <= W; x += 8) {
    ctx.lineTo(x, g * 0.65 - 6 + Math.sin(x * 0.3) * 5);
  }
  ctx.lineTo(W, g * 0.8); ctx.lineTo(0, g * 0.8);
  ctx.closePath();
  ctx.fill();

  // Pitch
  ctx.fillStyle = getGrassPattern();
  ctx.fillRect(0, g, W, H - g);

  // Centre line
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2, g); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);

  // Centre circle
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(W / 2, g + (H - g) / 2, Math.min(W, H - g) * 0.22, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLight(x, y) {
  // Pole
  ctx.fillStyle = '#888';
  ctx.fillRect(x - 3, y, 6, ground() * 0.55);
  // Lamp glow
  const grd = ctx.createRadialGradient(x, y, 2, x, y, 60);
  grd.addColorStop(0, 'rgba(255,240,180,0.35)');
  grd.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(x - 60, y - 30, 120, 80);
  ctx.fillStyle = '#ffe8a0';
  ctx.fillRect(x - 12, y - 6, 24, 8);
}

function drawGoals() {
  const g  = ground();
  const gh = goalHeight();
  const gy = goalY();

  // Left goal (AI scores here = player's goal)
  ctx.fillStyle = 'rgba(255,80,80,0.15)';
  ctx.fillRect(0, gy, GOAL_WIDTH, gh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, gy, GOAL_WIDTH, gh);

  // Right goal (Player scores here = AI's goal)
  ctx.fillStyle = 'rgba(80,200,255,0.15)';
  ctx.fillRect(canvas.width - GOAL_WIDTH, gy, GOAL_WIDTH, gh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.strokeRect(canvas.width - GOAL_WIDTH, gy, GOAL_WIDTH, gh);

  // Net lines
  drawNet(0, gy, GOAL_WIDTH, gh);
  drawNet(canvas.width - GOAL_WIDTH, gy, GOAL_WIDTH, gh);
}

function drawNet(x, y, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.8;
  const step = 8;
  for (let ry = y; ry < y + h; ry += step) {
    ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke();
  }
  for (let rx = x; rx < x + w; rx += step) {
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx, y + h); ctx.stroke();
  }
}

function drawCharacter(e, isPlayer) {
  const cx = e.x + e.w / 2;
  const cy = e.y;
  const facing = e.facing || 1;

  ctx.save();
  ctx.translate(cx, cy);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, e.h - 2, e.w * 0.45, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (jersey)
  const bodyColor = isPlayer ? '#1e90ff' : '#e03030';
  const bodyDark  = isPlayer ? '#0060c0' : '#a01010';

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(-10, 18, 20, 22, 4);
  ctx.fill();

  // Jersey stripes
  ctx.fillStyle = bodyDark;
  ctx.fillRect(-3, 18, 6, 22);

  // Shorts
  ctx.fillStyle = isPlayer ? '#fff' : '#111';
  ctx.fillRect(-10, 38, 20, 10);

  // Legs
  ctx.fillStyle = isPlayer ? '#f0c090' : '#f0c090';
  ctx.fillRect(-9, 47, 7, 5); // left leg
  ctx.fillRect(2, 47, 7, 5);  // right leg

  // Boots
  ctx.fillStyle = '#222';
  ctx.fillRect(-10, 51, 9, 3);
  ctx.fillRect(1, 51, 9, 3);

  // Head
  ctx.fillStyle = '#f0c090';
  ctx.beginPath();
  ctx.arc(0, 10, 12, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = isPlayer ? '#3a1a00' : '#1a1a1a';
  ctx.beginPath();
  ctx.arc(0, 4, 12, Math.PI, 0);
  ctx.fill();

  // Eyes (face direction)
  ctx.fillStyle = '#fff';
  ctx.fillRect(facing * 2, 9, 5, 4);
  ctx.fillStyle = '#222';
  ctx.fillRect(facing * 3, 10, 2.5, 2.5);

  // Mouth
  ctx.strokeStyle = '#a06040';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 15, 4, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.restore();
}

function drawBall() {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, ball.r + 2, ball.r * 0.8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball base
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.fill();

  // Black pentagon patches (classic soccer ball)
  ctx.fillStyle = '#111';
  const patches = [
    [0, 0], [0, -11], [10, -5], [-10, -5], [10, 5], [-10, 5]
  ];
  for (const [px, py] of patches) {
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(-5, -6, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawObstacles() {
  for (const obs of state.obstacles) {
    ctx.save();
    ctx.translate(obs.x, obs.y);
    // Orange spinning disk
    ctx.fillStyle = '#ff8c00';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, obs.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 0);
    ctx.restore();
  }
}

function drawGoalFlash() {
  if (!goalFlashData) return;
  goalFlashData.frame++;
  const f = goalFlashData.frame;
  if (f > 60) { goalFlashData = null; return; }

  const alpha = Math.max(0, 1 - f / 60);
  const isPlayer = goalFlashData.scorer === 'player';
  const text = isPlayer ? '⚽ GOAL!' : '😤 CPU GOAL!';
  const color = isPlayer ? '#ffe84d' : '#ff5555';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.min(64, canvas.width * 0.1)}px Arial Black, Arial`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 12;
  ctx.fillText(text, canvas.width / 2, canvas.height * 0.38);
  ctx.restore();
}

// ── Main render ──
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawGoals();
  drawObstacles();
  drawBall();
  drawCharacter(player, true);
  drawCharacter(ai, false);
  drawGoalFlash();
}

// ── Game loop ──
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// ── Boot ──
updateHUD();
showOverlay('⚽ UFL HEADBALL', 'Score 3 goals to win!\nArrows to move • Space to jump • Down to dive', 'KICK OFF!');

// Unlock audio on first interaction
document.addEventListener('click',     () => { try { getAudio().resume(); } catch(_){} }, { once: true });
document.addEventListener('touchstart',() => { try { getAudio().resume(); } catch(_){} }, { once: true });

loop();
