// ── Firebase Setup ──────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, serverTimestamp, deleteDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAP6fOI8Hms6MBpyQJRRDO4RQtCjLKxfE",
  authDomain: "drawinggamesmth.firebaseapp.com",
  projectId: "drawinggamesmth",
  storageBucket: "drawinggamesmth.firebasestorage.app",
  messagingSenderId: "562113121703",
  appId: "1:562113121703:web:cf6f0e1da934a0e37d3a82",
  measurementId: "G-SLBE56M45G"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Word List ────────────────────────────────────────────────────────────────
const WORDS = [
  "Elephant","Rainbow","Guitar","Pizza","Castle","Rocket","Bicycle","Penguin",
  "Volcano","Lighthouse","Umbrella","Hamburger","Sunflower","Submarine","Dragon",
  "Cactus","Astronaut","Waterfall","Butterfly","Treasure chest","Fire truck",
  "Hot air balloon","Snowman","Spider web","Basketball","Surfboard","Telescope",
  "Microscope","Tornado","Kangaroo","Pineapple","Skyscraper","Rollercoaster",
  "Ferris wheel","Campfire","Sailboat","Piano","Crown","Compass","Sandcastle",
  "Jellyfish","Giraffe","Helicopter","Trampoline","Witch hat","Anchor","Magnet",
  "Ice cream","Lantern","Stopwatch","Boomerang","Igloo","Parachute","Pirate ship"
];

// ── Avatar Colors ────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#6c63ff","#ff6b6b","#43e97b","#f0a500","#00c9ff","#f77dac"];

// ── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  "#1a1a2e","#ffffff","#ff6b6b","#f0a500",
  "#43e97b","#6c63ff","#00c9ff","#f77dac",
  "#8B4513","#4a4a4a"
];

// ── State ────────────────────────────────────────────────────────────────────
let state = {
  playerId: null,
  playerName: null,
  lobbyId: null,
  isHost: false,
  role: null,        // "drawer" | "guesser"
  word: null,
  scores: {},
  round: 1,
  maxRounds: 4,
  timerInterval: null,
  timeLeft: 90,
  pendingAction: null, // "create" | "join"
  lobbyUnsub: null,
  gameUnsub: null,
  canvasUnsub: null,
  // drawing
  drawing: false,
  currentColor: "#1a1a2e",
  brushSize: 6,
  currentTool: "pen",
  lastX: 0,
  lastY: 0,
};

// ── DOM Refs ─────────────────────────────────────────────────────────────────
const screens = {
  home:     document.getElementById("screen-home"),
  lobby:    document.getElementById("screen-lobby"),
  game:     document.getElementById("screen-game"),
  roundend: document.getElementById("screen-roundend"),
  gameover: document.getElementById("screen-gameover"),
};

const $  = id => document.getElementById(id);
const el = {
  joinInput:      $("join-code-input"),
  homeError:      $("home-error"),
  namePrompt:     $("name-prompt"),
  nameInput:      $("player-name-input"),
  lobbyCode:      $("lobby-code-display"),
  playersList:    $("players-list"),
  lobbyWaiting:   $("lobby-waiting"),
  lobbyReady:     $("lobby-ready"),
  btnStart:       $("btn-start-game"),
  canvas:         $("draw-canvas"),
  canvasOverlay:  $("canvas-overlay"),
  overlayMsg:     $("overlay-msg"),
  toolbar:        $("toolbar"),
  guessArea:      $("guess-area"),
  guessInput:     $("guess-input"),
  guessFeedback:  $("guess-feedback"),
  chatLog:        $("chat-log"),
  wordDisplay:    $("word-display"),
  wordCard:       $("word-card"),
  roleLabel:      $("role-label"),
  roleValue:      $("role-value"),
  roundDisplay:   $("round-display"),
  timerText:      $("timer-text"),
  arcFg:          $("arc-fg"),
  playersMini:    $("players-mini"),
  colorSwatches:  $("color-swatches"),
  brushSize:      $("brush-size"),
  resultIcon:     $("result-icon"),
  resultTitle:    $("result-title"),
  resultSub:      $("result-sub"),
  scoreSummary:   $("score-summary"),
  btnNextRound:   $("btn-next-round"),
  waitingNext:    $("waiting-next"),
  winnerAnnounce: $("winner-announce"),
  finalScores:    $("final-scores"),
};

// ── Utility ──────────────────────────────────────────────────────────────────
function generateId(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function showError(msg) {
  el.homeError.textContent = msg;
  el.homeError.style.display = "block";
  setTimeout(() => { el.homeError.style.display = "none"; }, 4000);
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove("show"), 2500);
}

function avatarColor(idx) { return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }
function initials(name) { return name ? name.slice(0, 2).toUpperCase() : "??"; }

function randomWord() { return WORDS[Math.floor(Math.random() * WORDS.length)]; }

// ── Canvas Setup ─────────────────────────────────────────────────────────────
const ctx = el.canvas.getContext("2d");

function resizeCanvas() {
  const parent = el.canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  // Save image
  const img = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height);
  el.canvas.width  = w * dpr;
  el.canvas.height = h * dpr;
  el.canvas.style.width  = w + "px";
  el.canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  try { ctx.putImageData(img, 0, 0); } catch(e) {}
}

function getPos(e) {
  const r = el.canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - r.left, y: src.clientY - r.top };
}

function startDraw(e) {
  if (state.role !== "drawer") return;
  state.drawing = true;
  const pos = getPos(e);
  state.lastX = pos.x;
  state.lastY = pos.y;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!state.drawing || state.role !== "drawer") return;
  e.preventDefault();
  const pos = getPos(e);
  ctx.lineWidth   = state.currentTool === "eraser" ? state.brushSize * 3 : state.brushSize;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.strokeStyle = state.currentTool === "eraser" ? "#ffffff" : state.currentColor;
  ctx.beginPath();
  ctx.moveTo(state.lastX, state.lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  state.lastX = pos.x;
  state.lastY = pos.y;
  throttledSyncCanvas();
}

function endDraw() {
  if (!state.drawing) return;
  state.drawing = false;
  syncCanvas();
}

function clearCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, el.canvas.width / (window.devicePixelRatio||1), el.canvas.height / (window.devicePixelRatio||1));
  syncCanvas();
}

// Throttle canvas sync (max 15 fps over network)
let lastSync = 0;
function throttledSyncCanvas() {
  const now = Date.now();
  if (now - lastSync > 66) { lastSync = now; syncCanvas(); }
}

async function syncCanvas() {
  if (!state.lobbyId || state.role !== "drawer") return;
  const dataUrl = el.canvas.toDataURL("image/jpeg", 0.55);
  try {
    await setDoc(doc(db, "canvases", state.lobbyId), {
      data: dataUrl,
      ts: Date.now()
    });
  } catch(e) { console.warn("Canvas sync err", e); }
}

function loadCanvasFromUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    ctx.drawImage(img, 0, 0, el.canvas.width / dpr, el.canvas.height / dpr);
  };
  img.src = dataUrl;
}

// ── Build Toolbar ─────────────────────────────────────────────────────────────
function buildToolbar() {
  // Tool buttons
  document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn[data-tool]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTool = btn.dataset.tool;
    });
  });

  // Color swatches
  el.colorSwatches.innerHTML = "";
  PALETTE.forEach((color, i) => {
    const s = document.createElement("button");
    s.className = "color-swatch" + (i === 0 ? " selected" : "");
    s.style.background = color;
    s.style.border = color === "#ffffff" ? "2px solid #ddd" : "";
    s.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach(c => c.classList.remove("selected"));
      s.classList.add("selected");
      state.currentColor = color;
      state.currentTool = "pen";
      document.querySelectorAll(".tool-btn[data-tool]").forEach(b =>
        b.classList.toggle("active", b.dataset.tool === "pen"));
    });
    el.colorSwatches.appendChild(s);
  });

  // Brush size
  el.brushSize.addEventListener("input", () => {
    state.brushSize = parseInt(el.brushSize.value);
  });

  // Clear
  $("btn-clear").addEventListener("click", clearCanvas);
}

// ── Timer ────────────────────────────────────────────────────────────────────
const TOTAL_TIME = 90;
const CIRC = 2 * Math.PI * 34; // 213.6

function startTimer() {
  clearInterval(state.timerInterval);
  state.timeLeft = TOTAL_TIME;
  updateTimerUI();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerUI();
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      if (state.isHost) handleTimeUp();
    }
  }, 1000);
}

function updateTimerUI() {
  el.timerText.textContent = state.timeLeft;
  const pct = state.timeLeft / TOTAL_TIME;
  el.arcFg.style.strokeDashoffset = CIRC * (1 - pct);
  el.arcFg.classList.toggle("urgent", state.timeLeft <= 15);
}

function stopTimer() { clearInterval(state.timerInterval); }

// ── Lobby ────────────────────────────────────────────────────────────────────
async function createLobby() {
  const lobbyId = generateId();
  state.lobbyId  = lobbyId;
  state.isHost   = true;
  state.playerId = generateId(8);

  const player = { id: state.playerId, name: state.playerName, host: true };
  await setDoc(doc(db, "lobbies", lobbyId), {
    code:    lobbyId,
    host:    state.playerId,
    status:  "waiting",
    players: { [state.playerId]: player },
    scores:  { [state.playerId]: 0 },
    round:   1,
    createdAt: serverTimestamp()
  });

  subscribeLobby(lobbyId);
  showLobbyScreen(lobbyId);
}

async function joinLobby(code) {
  const ref  = doc(db, "lobbies", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Lobby not found.");
  const data = snap.data();
  if (data.status !== "waiting") throw new Error("Game already in progress.");
  if (Object.keys(data.players).length >= 2) throw new Error("Lobby is full.");

  state.lobbyId  = code;
  state.isHost   = false;
  state.playerId = generateId(8);

  const player = { id: state.playerId, name: state.playerName, host: false };
  await updateDoc(ref, {
    [`players.${state.playerId}`]: player,
    [`scores.${state.playerId}`]: 0
  });

  subscribeLobby(code);
  showLobbyScreen(code);
}

function showLobbyScreen(code) {
  el.lobbyCode.textContent = code;
  showScreen("lobby");
}

function subscribeLobby(code) {
  if (state.lobbyUnsub) state.lobbyUnsub();
  state.lobbyUnsub = onSnapshot(doc(db, "lobbies", code), snap => {
    if (!snap.exists()) { handleLobbyGone(); return; }
    const data = snap.data();
    renderPlayers(data.players, data.scores);

    const count = Object.keys(data.players).length;
    el.lobbyWaiting.style.display = count < 2 ? "block" : "none";
    el.lobbyReady.style.display   = count >= 2 ? "block" : "none";
    el.btnStart.style.display     = (count >= 2 && state.isHost) ? "block" : "none";

    if (data.status === "playing") {
      startGameFromLobby(data);
    }
  });
}

function renderPlayers(players, scores) {
  el.playersList.innerHTML = "";
  Object.values(players).forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "player-card";
    div.innerHTML = `
      <div class="player-avatar" style="background:${avatarColor(i)}">${initials(p.name)}</div>
      <span class="player-name-display">${escHtml(p.name)}</span>
      ${p.host ? '<span class="player-host-badge">Host</span>' : ""}
    `;
    el.playersList.appendChild(div);
  });
}

function handleLobbyGone() {
  toast("Lobby closed.");
  resetAndGoHome();
}

// ── Start Game ───────────────────────────────────────────────────────────────
async function startGame() {
  if (!state.isHost || !state.lobbyId) return;
  const ref  = doc(db, "lobbies", state.lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

  const playerIds = Object.keys(data.players);
  if (playerIds.length < 2) return;

  // Assign roles: host is drawer first
  const drawerId  = state.playerId;
  const guesserId = playerIds.find(id => id !== drawerId);
  const word      = randomWord();

  await updateDoc(ref, {
    status:   "playing",
    drawerId,
    guesserId,
    word,
    round:    1,
    guessed:  false,
    timeUp:   false
  });
}

function startGameFromLobby(data) {
  if (state.lobbyUnsub) { state.lobbyUnsub(); state.lobbyUnsub = null; }
  state.round  = data.round || 1;
  state.scores = data.scores || {};
  assignRole(data);
  showScreen("game");
  initGameScreen(data);
  subscribeGame();
  subscribeCanvas();
}

function assignRole(data) {
  if (data.drawerId === state.playerId) {
    state.role = "drawer";
    state.word = data.word;
  } else {
    state.role    = "guesser";
    state.word    = null;
  }
}

// ── Game Screen ──────────────────────────────────────────────────────────────
async function initGameScreen(data) {
  // Reset canvas
  resizeCanvas();
  clearCanvas();
  el.chatLog.innerHTML = "";
  el.guessFeedback.textContent = "";
  el.guessFeedback.className = "guess-feedback";

  // Role UI
  el.roundDisplay.textContent = state.round;
  el.roleValue.textContent    = state.role === "drawer" ? "Drawer 🖊" : "Guesser 🔍";
  el.roleValue.className      = "role-value " + state.role;

  if (state.role === "drawer") {
    el.wordCard.style.display = "block";
    el.wordDisplay.textContent = state.word;
    el.toolbar.style.display  = "flex";
    el.guessArea.style.display = "none";
    el.canvasOverlay.classList.add("hidden");
  } else {
    el.wordCard.style.display   = "none";
    el.toolbar.style.display    = "none";
    el.guessArea.style.display  = "flex";
    el.canvasOverlay.classList.remove("hidden");
    el.overlayMsg.textContent = "Waiting for drawer…";
  }

  renderMiniPlayers(data.players, data.scores);
  startTimer();
  addChatEntry("Game started! Round " + state.round + " of " + state.maxRounds, "system");
}

function renderMiniPlayers(players, scores) {
  el.playersMini.innerHTML = "";
  Object.values(players).forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "mini-player";
    div.innerHTML = `
      <div class="mini-avatar" style="background:${avatarColor(i)}">${initials(p.name)}</div>
      <span class="mini-name">${escHtml(p.name)}</span>
      <span class="mini-score">${scores[p.id] || 0}</span>
    `;
    el.playersMini.appendChild(div);
  });
}

// ── Game Subscription ────────────────────────────────────────────────────────
function subscribeGame() {
  if (state.gameUnsub) state.gameUnsub();
  state.gameUnsub = onSnapshot(doc(db, "lobbies", state.lobbyId), snap => {
    if (!snap.exists()) { resetAndGoHome(); return; }
    const data = snap.data();

    // Update scores display
    state.scores = data.scores || {};
    if (data.players) renderMiniPlayers(data.players, state.scores);

    // Guessed!
    if (data.guessed && data.status === "playing") {
      stopTimer();
      setTimeout(() => showRoundEnd(data, true), 400);
    }

    // Time up
    if (data.timeUp && data.status === "playing" && !data.guessed) {
      stopTimer();
      setTimeout(() => showRoundEnd(data, false), 400);
    }

    // Guess log entries
    if (data.lastGuess && data.lastGuess.ts > (state._lastGuessTs || 0)) {
      state._lastGuessTs = data.lastGuess.ts;
      addChatEntry(`${escHtml(data.lastGuess.player)}: ${escHtml(data.lastGuess.text)}`);
      if (state.role === "guesser" && !data.guessed) {
        showGuessFeedback(data.lastGuess.text, data.word);
      }
    }
  });
}

function subscribeCanvas() {
  if (state.canvasUnsub) state.canvasUnsub();
  if (state.role !== "guesser") return;
  state.canvasUnsub = onSnapshot(doc(db, "canvases", state.lobbyId), snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.data) {
      el.canvasOverlay.classList.add("hidden");
      loadCanvasFromUrl(data.data);
    }
  });
}

// ── Guess Logic ──────────────────────────────────────────────────────────────
async function submitGuess() {
  const guess = el.guessInput.value.trim();
  if (!guess || state.role !== "guesser") return;
  el.guessInput.value = "";

  const ref  = doc(db, "lobbies", state.lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

  const correct = guess.toLowerCase() === (data.word || "").toLowerCase();

  // Log guess
  await updateDoc(ref, {
    lastGuess: { player: state.playerName, text: guess, ts: Date.now() }
  });

  if (correct) {
    // Award points: guesser gets 3, drawer gets 2
    const guesserId = state.playerId;
    const drawerId  = data.drawerId;
    const pts = { ...data.scores };
    pts[guesserId] = (pts[guesserId] || 0) + 3;
    pts[drawerId]  = (pts[drawerId]  || 0) + 2;
    addChatEntry(`✓ ${escHtml(state.playerName)} guessed it!`, "correct");
    await updateDoc(ref, { guessed: true, scores: pts });
  }
}

function showGuessFeedback(guess, word) {
  if (!word) return;
  const g = guess.toLowerCase().trim();
  const w = word.toLowerCase().trim();
  if (g === w) {
    el.guessFeedback.textContent = "Correct! 🎉";
    el.guessFeedback.className = "guess-feedback correct";
    return;
  }
  // Proximity check
  const dist = levenshtein(g, w);
  if (dist <= 2) {
    el.guessFeedback.textContent = "So close! Keep going…";
    el.guessFeedback.className = "guess-feedback close";
  } else {
    el.guessFeedback.textContent = "Not quite, try again!";
    el.guessFeedback.className = "guess-feedback wrong";
  }
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_, i) => Array.from({length:n+1}, (_, j) => j === 0 ? i : (i === 0 ? j : 0)));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ── Time Up (host handles) ───────────────────────────────────────────────────
async function handleTimeUp() {
  const ref = doc(db, "lobbies", state.lobbyId);
  await updateDoc(ref, { timeUp: true });
}

// ── Round End ────────────────────────────────────────────────────────────────
async function showRoundEnd(data, guessed) {
  stopTimer();
  if (state.canvasUnsub) { state.canvasUnsub(); state.canvasUnsub = null; }
  if (state.gameUnsub)   { state.gameUnsub();   state.gameUnsub   = null; }

  el.resultIcon.textContent  = guessed ? "🎉" : "⏰";
  el.resultTitle.textContent = guessed ? "Correct!" : "Time's up!";
  el.resultSub.textContent   = `The word was: ${data.word}`;

  el.scoreSummary.innerHTML = "";
  Object.entries(data.scores || {}).forEach(([id, pts]) => {
    const name = data.players?.[id]?.name || "Player";
    el.scoreSummary.innerHTML += `
      <div class="score-row-item">
        <span class="score-name">${escHtml(name)}</span>
        <span class="score-pts">${pts} pts</span>
      </div>`;
  });

  showScreen("roundend");

  const nextRound = (data.round || 1) + 1;
  if (nextRound > state.maxRounds) {
    // Game over
    el.btnNextRound.style.display = "none";
    el.waitingNext.style.display  = "none";
    setTimeout(() => showGameOver(data), 2500);
  } else {
    if (state.isHost) {
      el.btnNextRound.style.display = "block";
      el.waitingNext.style.display  = "none";
    } else {
      el.btnNextRound.style.display = "none";
      el.waitingNext.style.display  = "block";
      // Guest watches for next round
      listenForNextRound(nextRound);
    }
  }
}

function listenForNextRound(targetRound) {
  const unsub = onSnapshot(doc(db, "lobbies", state.lobbyId), snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.round === targetRound && data.status === "playing") {
      unsub();
      state.round = targetRound;
      assignRole(data);
      showScreen("game");
      initGameScreen(data);
      subscribeGame();
      subscribeCanvas();
    }
    if (data.status === "gameover") {
      unsub();
      showGameOver(data);
    }
  });
}

async function nextRound() {
  if (!state.isHost || !state.lobbyId) return;
  const ref  = doc(db, "lobbies", state.lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

  const nextRoundNum = (data.round || 1) + 1;
  if (nextRoundNum > state.maxRounds) {
    await updateDoc(ref, { status: "gameover" });
    showGameOver(data);
    return;
  }

  // Swap roles
  const playerIds = Object.keys(data.players);
  const newDrawer = playerIds.find(id => id !== data.drawerId) || data.drawerId;
  const newGuesser = playerIds.find(id => id !== newDrawer) || data.guesserId;
  const newWord = randomWord();

  // Clear canvas
  try { await deleteDoc(doc(db, "canvases", state.lobbyId)); } catch(e) {}

  await updateDoc(ref, {
    round:    nextRoundNum,
    drawerId: newDrawer,
    guesserId: newGuesser,
    word:     newWord,
    guessed:  false,
    timeUp:   false,
    lastGuess: null,
    status:   "playing"
  });

  state.round = nextRoundNum;
  // Re-fetch to get fresh data
  const freshSnap = await getDoc(ref);
  const freshData = freshSnap.data();
  assignRole(freshData);
  showScreen("game");
  initGameScreen(freshData);
  subscribeGame();
  subscribeCanvas();
}

// ── Game Over ────────────────────────────────────────────────────────────────
function showGameOver(data) {
  stopTimer();
  showScreen("gameover");

  const scores = data.scores || {};
  const players = data.players || {};
  let maxPts = -1, winner = null;
  Object.entries(scores).forEach(([id, pts]) => {
    if (pts > maxPts) { maxPts = pts; winner = players[id]?.name || "Someone"; }
  });

  el.winnerAnnounce.innerHTML = `<strong>${escHtml(winner)}</strong> wins with ${maxPts} points!`;

  el.finalScores.innerHTML = "";
  Object.entries(scores)
    .sort(([,a],[,b]) => b - a)
    .forEach(([id, pts]) => {
      const name = players[id]?.name || "Player";
      el.finalScores.innerHTML += `
        <div class="score-row-item">
          <span class="score-name">${escHtml(name)}</span>
          <span class="score-pts">${pts} pts</span>
        </div>`;
    });
}

// ── Chat ─────────────────────────────────────────────────────────────────────
function addChatEntry(text, type) {
  const div = document.createElement("div");
  div.className = "chat-entry" + (type ? ` ${type}-entry` : "");
  div.textContent = text;
  el.chatLog.appendChild(div);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
function cleanupListeners() {
  if (state.lobbyUnsub)  { state.lobbyUnsub();  state.lobbyUnsub  = null; }
  if (state.gameUnsub)   { state.gameUnsub();   state.gameUnsub   = null; }
  if (state.canvasUnsub) { state.canvasUnsub(); state.canvasUnsub = null; }
  stopTimer();
}

async function resetAndGoHome() {
  cleanupListeners();
  // If host, mark lobby closed
  if (state.isHost && state.lobbyId) {
    try { await updateDoc(doc(db, "lobbies", state.lobbyId), { status: "closed" }); } catch(e) {}
  }
  state.lobbyId = null;
  state.isHost  = false;
  state.role    = null;
  state.word    = null;
  state.pendingAction = null;
  el.joinInput.value = "";
  el.nameInput.value = "";
  el.namePrompt.style.display = "none";
  showScreen("home");
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Event Listeners ──────────────────────────────────────────────────────────

// Home
document.getElementById("btn-create").addEventListener("click", () => {
  state.pendingAction = "create";
  el.namePrompt.style.display = "flex";
  el.nameInput.focus();
  el.homeError.style.display = "none";
});

document.getElementById("btn-join").addEventListener("click", () => {
  const code = el.joinInput.value.trim().toUpperCase();
  if (!code || code.length < 4) { showError("Enter a valid lobby code."); return; }
  state.pendingAction = "join";
  el.namePrompt.style.display = "flex";
  el.nameInput.focus();
  el.homeError.style.display = "none";
});

document.getElementById("btn-confirm-name").addEventListener("click", async () => {
  const name = el.nameInput.value.trim();
  if (!name) { showError("Please enter your name."); return; }
  state.playerName = name;

  try {
    if (state.pendingAction === "create") {
      await createLobby();
    } else if (state.pendingAction === "join") {
      const code = el.joinInput.value.trim().toUpperCase();
      await joinLobby(code);
    }
  } catch(err) {
    showError(err.message || "Something went wrong.");
  }
});

el.nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btn-confirm-name").click();
});
el.joinInput.addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btn-join").click();
});

// Lobby
document.getElementById("btn-copy-code").addEventListener("click", () => {
  navigator.clipboard.writeText(state.lobbyId || "").then(() => toast("Code copied!"));
});

document.getElementById("btn-start-game").addEventListener("click", startGame);

document.getElementById("btn-leave-lobby").addEventListener("click", resetAndGoHome);

// Game – canvas
el.canvas.addEventListener("mousedown", startDraw);
el.canvas.addEventListener("mousemove", draw);
el.canvas.addEventListener("mouseup", endDraw);
el.canvas.addEventListener("mouseleave", endDraw);
el.canvas.addEventListener("touchstart", e => { e.preventDefault(); startDraw(e); }, { passive: false });
el.canvas.addEventListener("touchmove",  e => { e.preventDefault(); draw(e); },      { passive: false });
el.canvas.addEventListener("touchend",   endDraw);

// Game – guess
document.getElementById("btn-guess").addEventListener("click", submitGuess);
el.guessInput.addEventListener("keydown", e => { if (e.key === "Enter") submitGuess(); });

// Round end
document.getElementById("btn-next-round").addEventListener("click", nextRound);

// Game over
document.getElementById("btn-play-again").addEventListener("click", async () => {
  if (!state.isHost || !state.lobbyId) { resetAndGoHome(); return; }
  // Reset lobby to waiting for a fresh game
  const ref  = doc(db, "lobbies", state.lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) { resetAndGoHome(); return; }
  const data = snap.data();
  const emptyScores = {};
  Object.keys(data.players).forEach(id => emptyScores[id] = 0);
  await updateDoc(ref, {
    status:  "waiting",
    scores:  emptyScores,
    round:   1,
    guessed: false,
    timeUp:  false,
    word:    null
  });
  try { await deleteDoc(doc(db, "canvases", state.lobbyId)); } catch(e) {}
  subscribeLobby(state.lobbyId);
  showLobbyScreen(state.lobbyId);
});

document.getElementById("btn-home").addEventListener("click", resetAndGoHome);

// Resize
window.addEventListener("resize", () => {
  if (screens.game.classList.contains("active")) resizeCanvas();
});

// ── Init ─────────────────────────────────────────────────────────────────────
buildToolbar();
showScreen("home");
