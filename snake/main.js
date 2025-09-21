const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const overlayTitle = overlay.querySelector("h2");
const overlayMessage = overlay.querySelector("p");
const overlayButton = document.getElementById("startButton");
const overlayInitial = {
  title: overlayTitle.textContent,
  message: overlayMessage.innerHTML,
  button: overlayButton.textContent,
};

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const tempoEl = document.getElementById("tempo");
const speedBadgeEl = document.getElementById("speedBadge");
const lengthBadgeEl = document.getElementById("lengthBadge");
const levelProgressEl = document.getElementById("levelProgress");

const statsCards = Array.from(document.querySelectorAll(".stats .stat"));
const scoreCard = statsCards[0];
const bestCard = statsCards[1];
const levelCard = statsCards[2];
const tempoCard = statsCards[3];

const themeToggle = document.getElementById("themeToggle");
const touchButtons = Array.from(document.querySelectorAll(".touch-controls .control"));

const config = {
  gridSize: 32,
  tileSize: canvas.width / 32,
  baseSpeed: 150,
  minInterval: 50,
  levelSpan: 120,
  minFood: 2,
};

const foodTypes = [
  {
    key: "berry",
    label: "甜浆果",
    color: "#ff6b81",
    particles: "#ff8fa3",
    score: 10,
    growth: 1,
    weight: 6,
  },
  {
    key: "citrus",
    label: "阳光橙",
    color: "#ffb347",
    particles: "#ffd077",
    score: 25,
    growth: 1,
    weight: 3,
    onEat: () => {
      speedBonus = Math.min(speedBonus + 0.18, 0.55);
      createFloatingText("节奏加快", "#ffb347");
      triggerPulse(tempoCard);
    },
  },
  {
    key: "mint",
    label: "冰薄荷",
    color: "#6cf9e5",
    particles: "#a8fff2",
    score: 18,
    growth: 2,
    weight: 2,
    onEat: () => {
      slowTimer = 3200;
      createFloatingText("慢动作", "#6cf9e5");
      triggerPulse(tempoCard);
    },
  },
  {
    key: "royal",
    label: "皇室星辰",
    color: "#c77dff",
    particles: "#e7c2ff",
    score: 50,
    growth: 3,
    weight: 1,
    onEat: () => {
      rainbowTimer = 8000;
      createFloatingText("霓虹觉醒", "#c77dff");
      triggerPulse(tempoCard);
    },
  },
];

const tempoLabels = [
  { threshold: 1.15, label: "温和" },
  { threshold: 1.3, label: "灵动" },
  { threshold: 1.5, label: "燃烧" },
  { threshold: 1.75, label: "狂热" },
  { threshold: Infinity, label: "光速" },
];

const THEME_KEY = "neon-serpent-theme";
const BEST_KEY = "neon-serpent-best";

class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = !!(window.AudioContext || window.webkitAudioContext);
  }

  init() {
    if (!this.enabled || this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try {
      this.ctx = new Ctx();
    } catch (err) {
      this.enabled = false;
    }
  }

  resume() {
    if (!this.ctx || this.ctx.state === "running") return;
    this.ctx.resume().catch(() => {});
  }

  play(frequency, type = "sine", duration = 0.28, gainValue = 0.1) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playPair(frequencies, type = "sine", duration = 0.32, gainValue = 0.08) {
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.play(freq, type, duration, gainValue);
      }, index * 40);
    });
  }

  onStart() {
    this.playPair([220, 330, 440], "triangle", 0.35, 0.08);
  }

  onFruit(typeKey) {
    const tones = {
      berry: 260,
      citrus: 330,
      mint: 210,
      royal: 480,
    };
    this.playPair([tones[typeKey] || 260, (tones[typeKey] || 260) * 2], "sine", 0.25, 0.08);
  }

  onLevelUp() {
    this.playPair([420, 560, 720], "triangle", 0.38, 0.1);
  }

  onGameOver() {
    this.playPair([320, 180], "sawtooth", 0.45, 0.08);
  }
}

const audio = new AudioManager();

let snake = [];
let pendingDirection = null;
let direction = { x: 1, y: 0 };
let foods = [];
let particles = [];
let ripples = [];
let floatingTexts = [];
let growth = 0;
let score = 0;
let bestScore = Number(localStorage.getItem(BEST_KEY)) || 0;
let level = 1;
let speedBonus = 0;
let slowTimer = 0;
let rainbowTimer = 0;
let rainbowHue = 200;
let state = "idle";
let lastFrameTime = 0;
let lastStepTime = 0;
let touchStartPoint = null;

bestEl.textContent = bestScore;

const initialSnakeLength = 5;

function startGame() {
  audio.init();
  audio.resume();
  audio.onStart();

  state = "running";
  overlay.classList.add("hidden");
  overlayTitle.textContent = overlayInitial.title;
  overlayMessage.innerHTML = overlayInitial.message;
  overlayButton.textContent = overlayInitial.button;

  const startX = Math.floor(config.gridSize / 2);
  const startY = Math.floor(config.gridSize / 2);
  snake = Array.from({ length: initialSnakeLength }, (_, i) => ({
    x: startX - i,
    y: startY,
  }));
  direction = { x: 1, y: 0 };
  pendingDirection = null;
  growth = 0;
  score = 0;
  level = 1;
  speedBonus = 0;
  slowTimer = 0;
  rainbowTimer = 0;
  particles = [];
  ripples = [];
  floatingTexts = [];
  foods = [];
  ensureFood();
  updateScoreboard();
  const now = performance.now();
  lastFrameTime = now;
  lastStepTime = now;
}

function endGame() {
  state = "gameover";
  audio.onGameOver();
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "霓虹终曲";
  const recordText = score > bestScore ? "✨ 新纪录诞生！" : "继续挑战，点燃节奏。";
  overlayMessage.innerHTML = `本次得分 <strong>${score}</strong> 分。<br>${recordText}`;
  overlayButton.textContent = "再战一曲";
}

function ensureFood() {
  while (foods.length < config.minFood) {
    const food = createFood();
    if (!food) {
      break;
    }
    foods.push(food);
  }
}

function createFood() {
  const availableCells = new Set();
  for (let y = 0; y < config.gridSize; y += 1) {
    for (let x = 0; x < config.gridSize; x += 1) {
      availableCells.add(`${x},${y}`);
    }
  }
  snake.forEach((segment) => {
    availableCells.delete(`${segment.x},${segment.y}`);
  });
  foods.forEach((food) => {
    availableCells.delete(`${food.x},${food.y}`);
  });

  if (!availableCells.size) {
    return null;
  }

  const cells = Array.from(availableCells);
  const index = Math.floor(Math.random() * cells.length);
  const [x, y] = cells[index].split(",").map(Number);

  const type = pickFoodType();
  return {
    x,
    y,
    type,
    createdAt: performance.now(),
    waveOffset: Math.random() * Math.PI * 2,
  };
}

function pickFoodType() {
  const total = foodTypes.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const type of foodTypes) {
    if (roll < type.weight) {
      return type;
    }
    roll -= type.weight;
  }
  return foodTypes[0];
}

function hexToRgba(hex, alpha = 1) {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function triggerPulse(card) {
  if (!card) return;
  card.classList.remove("pulse");
  card.offsetHeight;
  card.classList.add("pulse");
}

function addScore(amount) {
  score += amount;
  if (score > bestScore) {
    bestScore = score;
    bestEl.textContent = bestScore;
    localStorage.setItem(BEST_KEY, bestScore.toString());
    triggerPulse(bestCard);
  }

  const newLevel = Math.floor(score / config.levelSpan) + 1;
  if (newLevel !== level) {
    level = newLevel;
    triggerPulse(levelCard);
    audio.onLevelUp();
    createFloatingText(`升级至 Lv.${level}`, "#7a5cf4");
  }
  updateScoreboard();
  triggerPulse(scoreCard);
}

function updateScoreboard() {
  scoreEl.textContent = score;
  bestEl.textContent = bestScore;
  levelEl.textContent = level;
  lengthBadgeEl.textContent = snake.length;

  const baseMultiplier = 1 + (level - 1) * 0.1;
  const effectiveMultiplier = Math.max(1, baseMultiplier + speedBonus);
  const tempoLabel = tempoLabels.find((item) => effectiveMultiplier < item.threshold)?.label || "温和";
  tempoEl.textContent = slowTimer > 0 ? "慢动作" : tempoLabel;
  speedBadgeEl.textContent = effectiveMultiplier.toFixed(2).replace(/\.00$/, "");

  const progress = ((score % config.levelSpan) / config.levelSpan) * 100;
  levelProgressEl.style.width = `${Math.min(progress + 2, 100)}%`;
  levelProgressEl.style.transform = `scaleX(${0.92 + progress / 300})`;
}

function handleInput(directionVector) {
  if (state === "idle") {
    startGame();
  }
  if (state !== "running") return;
  const isOpposite =
    directionVector.x === -direction.x && directionVector.y === -direction.y;
  if (isOpposite) return;
  pendingDirection = directionVector;
}

const keyBindings = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  KeyI: { x: 0, y: -1 },
  KeyK: { x: 0, y: 1 },
  KeyJ: { x: -1, y: 0 },
  KeyL: { x: 1, y: 0 },
};

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && state !== "running") {
    startGame();
    return;
  }
  const dir = keyBindings[event.code];
  if (dir) {
    event.preventDefault();
    handleInput(dir);
  }
});

touchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const dir = button.dataset.dir;
    const vector =
      dir === "up"
        ? { x: 0, y: -1 }
        : dir === "down"
        ? { x: 0, y: 1 }
        : dir === "left"
        ? { x: -1, y: 0 }
        : { x: 1, y: 0 };
    handleInput(vector);
  });
});

canvas.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      touchStartPoint = { x: touch.clientX, y: touch.clientY };
    }
  },
  { passive: true },
);

canvas.addEventListener(
  "touchmove",
  (event) => {
    if (event.touches.length > 0) {
      event.preventDefault();
    }
  },
  { passive: false },
);

canvas.addEventListener(
  "touchend",
  (event) => {
    if (!touchStartPoint || event.changedTouches.length === 0) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartPoint.x;
    const dy = touch.clientY - touchStartPoint.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 20) {
      touchStartPoint = null;
      return;
    }
    if (absX > absY) {
      handleInput({ x: dx > 0 ? 1 : -1, y: 0 });
    } else {
      handleInput({ x: 0, y: dy > 0 ? 1 : -1 });
    }
    touchStartPoint = null;
  },
  { passive: true },
);

canvas.addEventListener(
  "touchcancel",
  () => {
    touchStartPoint = null;
  },
  { passive: true },
);

overlayButton.addEventListener("click", () => {
  if (state === "running") return;
  startGame();
});

overlay.addEventListener("click", (event) => {
  if (event.target === overlay && state !== "running") {
    startGame();
  }
});

const root = document.documentElement;
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme === "light") {
  root.classList.add("light-mode");
  themeToggle.textContent = "🌞";
}

themeToggle.addEventListener("click", () => {
  root.classList.toggle("light-mode");
  const isLight = root.classList.contains("light-mode");
  themeToggle.textContent = isLight ? "🌞" : "🌗";
  localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
});

function getStepInterval() {
  const baseMultiplier = 1 + (level - 1) * 0.1;
  const effectiveMultiplier = Math.max(1, baseMultiplier + speedBonus);
  const slowFactor = slowTimer > 0 ? 0.6 : 1;
  return Math.max(config.minInterval, config.baseSpeed / (effectiveMultiplier * slowFactor));
}

function step() {
  if (pendingDirection) {
    direction = pendingDirection;
    pendingDirection = null;
  }

  const newHead = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  if (
    newHead.x < 0 ||
    newHead.x >= config.gridSize ||
    newHead.y < 0 ||
    newHead.y >= config.gridSize ||
    snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y)
  ) {
    endGame();
    return;
  }

  snake.unshift(newHead);

  const foodIndex = foods.findIndex((food) => food && food.x === newHead.x && food.y === newHead.y);
  if (foodIndex >= 0) {
    const food = foods.splice(foodIndex, 1)[0];
    growth += food.type.growth;
    addScore(food.type.score);
    if (food.type.onEat) {
      food.type.onEat();
    }
    audio.onFruit(food.type.key);
    createParticles(newHead.x, newHead.y, food.type.particles || food.type.color);
    createRipple(newHead.x, newHead.y, food.type.color);
    ensureFood();
  }

  if (growth > 0) {
    growth -= 1;
  } else {
    snake.pop();
  }
}

function updateParticles(delta) {
  particles = particles.filter((particle) => particle.life > 0);
  particles.forEach((particle) => {
    particle.life -= particle.decay * delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 0.00018 * delta;
    particle.vx *= 0.995;
    particle.vy *= 0.995;
  });
}

function createParticles(cellX, cellY, color) {
  const centerX = (cellX + 0.5) * config.tileSize;
  const centerY = (cellY + 0.5) * config.tileSize;
  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const speed = 0.07 + Math.random() * 0.05;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.0014 + Math.random() * 0.001,
      color,
    });
  }
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = hexToRgba(particle.color, 0.9);
    ctx.shadowColor = hexToRgba(particle.color, 0.8);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3.5 * (1 - particle.life * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function createRipple(cellX, cellY, color) {
  ripples.push({
    x: (cellX + 0.5) * config.tileSize,
    y: (cellY + 0.5) * config.tileSize,
    radius: config.tileSize * 0.6,
    life: 1,
    color,
  });
}

function updateRipples(delta) {
  ripples = ripples.filter((ripple) => ripple.life > 0);
  ripples.forEach((ripple) => {
    ripple.radius += delta * 0.08;
    ripple.life -= delta * 0.0004;
  });
}

function drawRipples() {
  ripples.forEach((ripple) => {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(ripple.color, ripple.life * 0.5);
    ctx.lineWidth = 3;
    ctx.globalAlpha = Math.max(0, ripple.life * 0.7);
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function createFloatingText(text, color) {
  if (floatingTexts.length > 4) {
    floatingTexts.shift();
  }
  floatingTexts.push({
    text,
    color,
    life: 1,
    y: 60,
  });
}

function updateFloatingTexts(delta) {
  floatingTexts = floatingTexts.filter((item) => item.life > 0);
  floatingTexts.forEach((item) => {
    item.y -= delta * 0.03;
    item.life -= delta * 0.0007;
  });
}

function drawFloatingTexts() {
  floatingTexts.forEach((item, index) => {
    ctx.save();
    ctx.font = "600 18px 'Poppins', 'PingFang SC', sans-serif";
    ctx.fillStyle = hexToRgba(item.color, Math.max(0, item.life));
    ctx.textAlign = "center";
    ctx.fillText(item.text, canvas.width / 2, item.y + index * 26);
    ctx.restore();
  });
}

function drawBackground(time) {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#050916");
  gradient.addColorStop(1, "#02040b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = hexToRgba("#7a5cf4", 0.35);
  const pulse = Math.sin(time * 0.0014) * 30 + 120;
  ctx.beginPath();
  ctx.arc(canvas.width * 0.28, canvas.height * 0.26, pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hexToRgba("#1e9ef5", 0.28);
  ctx.beginPath();
  ctx.arc(canvas.width * 0.74, canvas.height * 0.75, 140 + Math.cos(time * 0.0011) * 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= config.gridSize; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * config.tileSize, 0);
    ctx.lineTo(i * config.tileSize, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j <= config.gridSize; j += 1) {
    ctx.beginPath();
    ctx.moveTo(0, j * config.tileSize);
    ctx.lineTo(canvas.width, j * config.tileSize);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFoods(time) {
  foods.forEach((food) => {
    if (!food) return;
    const centerX = (food.x + 0.5) * config.tileSize;
    const centerY = (food.y + 0.5) * config.tileSize;
    const wave = Math.sin(time * 0.003 + food.waveOffset) * 0.5;
    const radius = config.tileSize * (0.32 + wave * 0.04);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = hexToRgba(food.type.color, 0.8);
    ctx.shadowBlur = food.type.key === "royal" ? 32 : 20;
    ctx.fillStyle = hexToRgba(food.type.color, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = hexToRgba(food.type.color, 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();

    if (food.type.key === "royal") {
      ctx.rotate((time * 0.0012) % (Math.PI * 2));
      ctx.strokeStyle = hexToRgba("#ffffff", 0.28);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, radius * 1.9);
        ctx.stroke();
        ctx.rotate((Math.PI * 2) / 6);
      }
    }

    ctx.restore();
  });
}

function drawSnake(time) {
  const rainbowActive = rainbowTimer > 0;
  const headDirection = pendingDirection || direction;
  snake.forEach((segment, index) => {
    const t = index / Math.max(1, snake.length - 1);
    const hue = rainbowActive ? (rainbowHue + t * 180) % 360 : 190 + t * 55;
    const lightness = rainbowActive ? 60 + Math.cos(time * 0.003 + t * 3) * 12 : 50 + (1 - t) * 12;
    const size = config.tileSize - 4 + Math.sin(time * 0.002 + t * 6) * 0.6;
    const x = segment.x * config.tileSize + (config.tileSize - size) / 2;
    const y = segment.y * config.tileSize + (config.tileSize - size) / 2;

    ctx.save();
    ctx.fillStyle = `hsl(${hue}, 90%, ${lightness}%)`;
    ctx.shadowColor = `hsla(${hue}, 90%, ${Math.min(lightness + 18, 90)}%, 0.85)`;
    ctx.shadowBlur = 22 - t * 12;
    roundedRect(ctx, x, y, size, size, Math.min(size / 2, 12));
    ctx.fill();

    if (index === 0) {
      ctx.shadowBlur = 30;
      ctx.strokeStyle = `hsla(${hue}, 98%, 70%, 0.35)`;
      ctx.lineWidth = 2;
      roundedRect(ctx, x - 2, y - 2, size + 4, size + 4, Math.min(size / 2 + 2, 14));
      ctx.stroke();

      const eyeOffset = config.tileSize * 0.18;
      const forwardOffsetX = headDirection.x * config.tileSize * 0.18;
      const forwardOffsetY = headDirection.y * config.tileSize * 0.18;
      const perpendicular = { x: -headDirection.y, y: headDirection.x };

      const headCenterX = segment.x * config.tileSize + config.tileSize / 2;
      const headCenterY = segment.y * config.tileSize + config.tileSize / 2;
      const leftEyeX = headCenterX + perpendicular.x * eyeOffset + forwardOffsetX;
      const leftEyeY = headCenterY + perpendicular.y * eyeOffset + forwardOffsetY;
      const rightEyeX = headCenterX - perpendicular.x * eyeOffset + forwardOffsetX;
      const rightEyeY = headCenterY - perpendicular.y * eyeOffset + forwardOffsetY;

      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.beginPath();
      ctx.arc(leftEyeX, leftEyeY, config.tileSize * 0.12, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, config.tileSize * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(24, 30, 50, 0.85)";
      ctx.beginPath();
      ctx.arc(
        leftEyeX + headDirection.x * config.tileSize * 0.08,
        leftEyeY + headDirection.y * config.tileSize * 0.08,
        config.tileSize * 0.05,
        0,
        Math.PI * 2,
      );
      ctx.arc(
        rightEyeX + headDirection.x * config.tileSize * 0.08,
        rightEyeY + headDirection.y * config.tileSize * 0.08,
        config.tileSize * 0.05,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  });
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function draw(time) {
  drawBackground(time);
  drawGrid();
  drawRipples();
  drawFoods(time);
  drawSnake(time);
  drawParticles();
  drawFloatingTexts();
}

function loop(time) {
  const delta = time - lastFrameTime || 16;
  lastFrameTime = time;

  if (state === "running") {
    const interval = getStepInterval();
    if (time - lastStepTime >= interval) {
      step();
      lastStepTime = time;
    }
    slowTimer = Math.max(0, slowTimer - delta);
    if (speedBonus > 0) {
      speedBonus = Math.max(0, speedBonus - delta * 0.00005);
    }
    if (rainbowTimer > 0) {
      rainbowTimer = Math.max(0, rainbowTimer - delta);
      rainbowHue = (rainbowHue + delta * 0.08) % 360;
    }
  }

  updateParticles(delta);
  updateRipples(delta);
  updateFloatingTexts(delta);
  draw(time);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
