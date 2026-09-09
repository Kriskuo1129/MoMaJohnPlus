const GAME_STATES = Object.freeze({
  READY: "READY", DRAWING: "DRAWING",
  EVENT_REVEAL: "EVENT_REVEAL", BONUS_PENDING: "BONUS_PENDING", BONUS_DRAW: "BONUS_DRAW",
  ROUND_END: "ROUND_END", GAME_OVER: "GAME_OVER"
});

const RULES = Object.freeze({ initialAttempts: 6, maxAttempts: 6, bonusChoices: 3, baseFormalDrawCount: 15 });
const PLAYER_NAME_STORAGE_KEY = "momajohnPlayerName";
const NUMERALS = "一二三四五六七八九";
const SUIT_NAMES = Object.freeze({ wan: "萬子", tong: "筒子", suo: "條子" });

const CORE_TILES = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `wan-${i + 1}`, label: `${NUMERALS[i]}萬`, glyph: String.fromCodePoint(0x1f007 + i), suit: "wan" })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: `tong-${i + 1}`, label: `${NUMERALS[i]}筒`, glyph: String.fromCodePoint(0x1f019 + i), suit: "tong" })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: `suo-${i + 1}`, label: `${NUMERALS[i]}條`, glyph: String.fromCodePoint(0x1f010 + i), suit: "suo" })),
  { id: "east", label: "東", glyph: "🀀", group: "wind" }, { id: "south", label: "南", glyph: "🀁", group: "wind" },
  { id: "west", label: "西", glyph: "🀂", group: "wind" }, { id: "north", label: "北", glyph: "🀃", group: "wind" },
  { id: "red", label: "中", glyph: "🀄", group: "dragon" }, { id: "green", label: "發", glyph: "🀅", group: "dragon" },
  { id: "white", label: "白", glyph: "🀆", group: "dragon" }
];
const GAME_TILES = [...CORE_TILES,
  { id: "event-1", label: "事件 A", glyph: "A", special: "event" },
  { id: "event-2", label: "事件 B", glyph: "B", special: "event" }
];

const elements = Object.fromEntries([
  "board", "draw-stack", "total-score", "round-score", "rounds-display", "player-display",
  "player-name-input", "player-name-error", "help-button", "leverage-button",
  "main-menu-button", "start-screen", "game-shell",
  "final-waiting-overlay", "final-waiting-title", "final-waiting-missing",
  "bonus-modal", "bonus-waiting", "bonus-instruction", "bonus-count", "bonus-grid", "bonus-result",
  "message",
  "toast-stack", "modal", "modal-icon", "modal-kicker", "modal-title", "modal-body", "modal-actions"
].map(id => [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), document.querySelector(`#${id}`)]));

function buildLines() {
  const lines = [];
  for (let row = 0; row < 6; row += 1) lines.push({ id: `row-${row}`, indexes: Array.from({ length: 6 }, (_, col) => row * 6 + col) });
  for (let col = 0; col < 6; col += 1) lines.push({ id: `col-${col}`, indexes: Array.from({ length: 6 }, (_, row) => row * 6 + col) });
  lines.push({ id: "diag-main", indexes: Array.from({ length: 6 }, (_, i) => i * 7) });
  lines.push({ id: "diag-reverse", indexes: Array.from({ length: 6 }, (_, i) => (i + 1) * 5) });
  return lines;
}

const LINE_DEFINITIONS = buildLines();
const EMPTY_PLAYER_DISPLAY_NAME = "-沒輸入名稱-";
let game;

function freshGameState(playerName = "") {
  const betStats = Object.fromEntries(BET_DEFINITIONS.map(bet => [bet.id, { played: 0, won: 0, lost: 0 }]));
  return {
    playerName, state: GAME_STATES.READY, score: 0, totalLines: 0,
    totalAttemptsGranted: RULES.initialAttempts, attemptsConsumed: 0, roundsPlayed: 0,
    achievementCount: 0, round: null, busy: false, pendingSpecial: null, uiOverlayOpen: false,
    stats: {
      totalScore: 0, totalLines: 0, roundsPlayed: 0, totalRoundCost: 0,
      multiplier1Count: 0, multiplier2Count: 0, multiplier3Count: 0,
      wan5Count: 0, wan7Count: 0, wan9Count: 0, tong5Count: 0, tong7Count: 0, tong9Count: 0,
      tiao5Count: 0, tiao7Count: 0, tiao9Count: 0,
      fourWindsCount: 0, threeDragonsCount: 0, waitingCount: 0,
      bonusDrawCount: 0, bonusSuccessCount: 0, extraRoundsFromBonus: 0,
      eventTriggeredCount: 0, normalEventCount: 0, specialEventCount: 0, positiveEventCount: 0, negativeEventCount: 0, neutralEventCount: 0,
      boardReplaceEventCount: 0, boardRemoveEventCount: 0, boardSwapEventCount: 0, roundRestartEventCount: 0, multiplierBoostEventCount: 0,
      extraRoundsFromEvents: 0, eventScoreGain: 0, eventScoreLoss: 0, eventEarlyEndCount: 0, gameOverByEvent: false,
      betsPlaced: 0, betsWon: 0, betsLost: 0, betScoreGain: 0, betScoreLoss: 0, betStats,
      earlyWaitingCount: 0, lastTileFirstLineCount: 0,
      highestRoundRawPoints: 0, highestRoundSettledPoints: 0, highestMultiplier: 1, highestRoundLines: 0, totalAchievements: 0
    }
  };
}

function createRound(formalDrawCount = RULES.baseFormalDrawCount) {
  const board = shuffle(GAME_TILES);
  const order = shuffle(GAME_TILES);
  return {
    board, formalDrawCount, hand: order.slice(0, formalDrawCount), remaining: order.slice(formalDrawCount), drawIndex: 0, drawn: new Set(), discarded: new Set(), started: false, attemptStart: game.attemptsConsumed,
    completedLines: new Set(), activeWaiting: new Set(), announcedWaiting: new Set(), achievements: new Set(),
    rawPoints: 0, roundScore: 0, roundLines: 0, roundMultiplier: 1, finalMultiplier: 1, leverageConfigured: false, activeBets: [], betsSettled: false, betResults: [], everWaited: false, waitingAnnouncements: 0,
    pointsSettled: false, multiplierPoints: 0, actualMultiplierPoints: 0, betNetPoints: 0, finalRoundChange: 0, scoreBeforeSettlement: 0, eventAttemptDelta: 0, eventAddedAttempts: 0,
    bonusMissing: new Set(), bonusCandidates: [], selectedBonusTiles: [], bonusResolved: false, bonusPendingStarted: false, bonusAttemptGain: 0
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function weightedRandom(events, random = Math.random()) {
  const total = events.reduce((sum, event) => sum + event.weight, 0);
  let cursor = random * total;
  for (const event of events) {
    cursor -= event.weight;
    if (cursor < 0) return event;
  }
  return events[events.length - 1];
}

function startRound() {
  closeModal();
  closeBonusModal();
  closeFinalWaitingPrompt();
  game.round = createRound();
  game.state = GAME_STATES.DRAWING;
  game.busy = false;
  game.pendingSpecial = null;
  renderBoard();
  elements.message.textContent = "";
  updateHUD();
}

function attemptsRemaining() { return Math.max(0, game.totalAttemptsGranted - game.attemptsConsumed); }
function grantAttempts(requested) {
  const granted = Math.max(0, Math.min(requested, RULES.maxAttempts - attemptsRemaining()));
  game.totalAttemptsGranted += granted;
  return granted;
}
function betPenalty(bet) { return Math.abs(Number(bet.penalty) || 0); }
function selectedBetRisk(ids) { return ids.reduce((sum, id) => sum + betPenalty(BET_DEFINITIONS.find(bet => bet.id === id) ?? {}), 0); }
function attemptDisplay() {
  const duringRound = game.round?.started && ![GAME_STATES.ROUND_END, GAME_STATES.GAME_OVER].includes(game.state);
  const numerator = duringRound ? game.round.attemptStart + 1 : Math.min(game.attemptsConsumed + 1, game.totalAttemptsGranted);
  return `${numerator} / ${game.totalAttemptsGranted}`;
}

function openLeverage() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const readOnly = game.round.started;
  const currentBets = new Set(game.round.activeBets);
  const multiplierOptions = readOnly
    ? `<div class="locked-multiplier"><strong>${game.round.finalMultiplier}x</strong><span>本局實際倍率</span></div>`
    : [1, 2, 3].map(multiplier => `<label class="bet-option multiplier-option"><input type="radio" name="round-multiplier" value="${multiplier}" ${game.round.roundMultiplier === multiplier ? "checked" : ""} ${multiplier > attemptsRemaining() ? "disabled" : ""}><b>${multiplier}x</b><span>消耗 ${multiplier} 次${multiplier === 3 ? "・高風險" : ""}</span></label>`).join("");
  const betOptions = readOnly
    ? (game.round.activeBets.length ? `<ul class="locked-bets">${game.round.activeBets.map(id => { const bet = BET_DEFINITIONS.find(item => item.id === id); return `<li><b>${bet?.title ?? id}</b><small>${bet?.description ?? ""}<br>成功 +${bet?.reward ?? 0}｜失敗 -${betPenalty(bet ?? {})}</small></li>`; }).join("")}</ul>` : `<p class="empty-bets">本局沒有額外下注</p>`)
    : BET_DEFINITIONS.filter(bet => bet.enabled).map(bet => {
    const penalty = betPenalty(bet);
    const checked = currentBets.has(bet.id);
    const disabled = !checked && penalty > game.score;
    return `<label class="bet-option${disabled ? " bet-unavailable" : ""}"><input type="checkbox" name="active-bet" value="${bet.id}" data-penalty="${penalty}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span><b>${bet.title}</b><small>${bet.description}<br>成功 +${bet.reward}｜失敗 -${penalty}<br>門檻 ${penalty} 分${disabled ? `｜目前 ${game.score}｜🔒 分數不足` : ""}</small></span></label>`;
  }).join("");
  const riskSummary = readOnly ? "" : `<aside class="bet-risk-summary"><p>目前總分數 <strong data-risk-score>${game.score}</strong></p><p>最大可能損失 <strong data-risk-total>0</strong></p><p>下注後最低可能剩餘分數 <strong data-risk-remaining>${game.score}</strong></p><p class="bet-risk-message" data-risk-message aria-live="polite"></p></aside>`;
  openModal({
    icon: "注", kicker: `局數 ${attemptDisplay()}・剩餘 ${attemptsRemaining()} 局`, title: readOnly ? "本局下注與狀態" : "本局下注",
    body: `<div class="betting-panel${readOnly ? " betting-readonly" : ""}"><section><h3>本局倍率</h3>${readOnly ? "" : "<p>本局分數依倍率即時顯示，第一次摸牌才消耗局數。</p>"}<div class="multiplier-options">${multiplierOptions}</div></section><section><h3>${readOnly ? "本局下注" : "額外下注"}</h3>${readOnly ? "" : "<p>可複選；總分數必須足以承擔所有下注的最大損失。</p>"}<div class="bet-options">${betOptions}</div></section>${riskSummary}<section class="round-status-panel"><h3>本局狀態</h3>${renderRoundStatusContent()}</section></div>`,
    actions: readOnly ? [{ label: "關閉", action: closeLeverage }] : [{ label: "取消", className: "secondary", action: closeLeverage }, { label: "確認下注", action: confirmLeverage }]
  });
  elements.modal.classList.add("betting-sheet");
  if (!readOnly) setupBettingControls();
}

function renderRoundStatusContent() {
  const lines = game.round?.roundLines ?? 0;
  const waiting = game.round?.activeWaiting.size ?? 0;
  const started = Boolean(game.round?.started);
  const lineTarget = game.round?.activeBets.includes("three-lines") ? " / 3" : game.round?.activeBets.includes("one-line") ? " / 1" : "";
  const waitingTarget = game.round?.activeBets.includes("waiting");
  const achievements = game.round?.achievements ?? new Set();
  return `<div class="round-status-summary"><p class="${lineTarget ? "bet-target" : ""}"><small>完成連線</small><strong>${lines}${lineTarget}</strong></p><p class="${waitingTarget ? "bet-target" : ""}"><small>聽牌</small><strong>${game.round?.everWaited ? "已達成" : waiting ? `目前 ${waiting} 聽` : started ? "尚未達成" : "尚未開始"}</strong></p></div><div class="progress-list">${renderProgress()}</div><div class="special-progress"><span>天聽 <b>${achievements.has("early-waiting") ? "✓" : "—"}</b></span><span>海底撈月 <b>${achievements.has("last-tile-first-line") ? "✓" : "—"}</b></span></div>`;
}

function setupBettingControls() {
  const inputs = [...elements.modalBody.querySelectorAll('input[name="active-bet"]')];
  const message = elements.modalBody.querySelector("[data-risk-message]");
  const updateRisk = () => {
    const selected = inputs.filter(input => input.checked).map(input => input.value);
    const risk = selectedBetRisk(selected);
    elements.modalBody.querySelector("[data-risk-total]").textContent = risk;
    elements.modalBody.querySelector("[data-risk-remaining]").textContent = Math.max(0, game.score - risk);
    inputs.forEach(input => {
      if (input.checked) return;
      const unavailable = risk + Number(input.dataset.penalty) > game.score;
      input.disabled = unavailable;
      input.closest(".bet-option")?.classList.toggle("bet-unavailable", unavailable);
    });
  };
  inputs.forEach(input => input.addEventListener("change", () => {
    const selected = inputs.filter(item => item.checked).map(item => item.value);
    if (selectedBetRisk(selected) > game.score) {
      input.checked = false;
      message.textContent = "目前分數不足以承擔這項下注。";
    } else message.textContent = "";
    updateRisk();
  }));
  updateRisk();
}

function confirmLeverage() {
  const multiplier = Number(elements.modalBody.querySelector('input[name="round-multiplier"]:checked')?.value ?? 1);
  if (game.state !== GAME_STATES.DRAWING || game.round.started || multiplier > attemptsRemaining()) return;
  const selectedBets = [...elements.modalBody.querySelectorAll('input[name="active-bet"]:checked')].map(input => input.value);
  if (selectedBetRisk(selectedBets) > game.score) {
    elements.modalBody.querySelector("[data-risk-message]").textContent = "目前分數不足以承擔這組下注。";
    return;
  }
  game.round.roundMultiplier = multiplier;
  game.round.finalMultiplier = multiplier;
  game.round.leverageConfigured = true;
  game.round.activeBets = selectedBets;
  game.uiOverlayOpen = false;
  closeModal();
  elements.message.textContent = "";
  updateHUD();
}

function closeLeverage() { game.uiOverlayOpen = false; closeModal(); }

function tileContent(tile) {
  if (tile.special) {
    return `<span class="special-face" aria-hidden="true"><b>${tile.glyph}</b><small>事件</small></span>`;
  }
  return `<span class="glyph" aria-hidden="true">${tile.glyph}</span><span class="text-fallback hidden-fallback" aria-hidden="true">${tile.label}</span>`;
}

function tileClass(tile, base) {
  if (!tile.special) return base;
  return `${base} special special-tile event-tile`;
}

function boardTileStateClass(tile) {
  if (game.round.discarded.has(tile.id)) return "tile-discarded";
  if (game.round.drawn.has(tile.id)) return "tile-acquired marked";
  return "tile-unclaimed";
}

function renderBoard() {
  elements.board.replaceChildren();
  game.round.board.forEach((tile, index) => {
    const cell = document.createElement("div");
    const stateClass = boardTileStateClass(tile);
    cell.className = `${tileClass(tile, "tile")} ${stateClass}`;
    cell.dataset.tileId = tile.id;
    cell.innerHTML = tileContent(tile);
    cell.title = tile.label;
    cell.setAttribute("role", "gridcell");
    const stateLabel = stateClass.includes("discarded") ? "已丟掉" : stateClass.includes("acquired") ? "已取得" : "尚未取得";
    cell.setAttribute("aria-label", `${tile.label}，${stateLabel}`);
    cell.setAttribute("aria-rowindex", Math.floor(index / 6) + 1);
    cell.setAttribute("aria-colindex", index % 6 + 1);
    elements.board.append(cell);
  });
}

function revealButton(button, tile) {
  const isBonusTile = button.classList.contains("bonus-tile");
  button.innerHTML = tileContent(tile);
  button.title = tile.label;
  button.className = tileClass(tile, "hand-tile revealed");
  if (isBonusTile) button.classList.add("bonus-tile");
  button.setAttribute("aria-label", tile.label);
  button.disabled = true;
}

function nextFormalTile() {
  return game.round.hand[game.round.drawIndex] ?? null;
}

async function drawTile() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  const tile = nextFormalTile();
  if (!tile || elements.drawStack.disabled) return;
  game.busy = true;
  startRoundCostIfNeeded();
  game.round.drawn.add(tile.id);
  await animateStackTile(tile);
  game.round.drawIndex += 1;
  if (!tile.special) {
    markBoard(tile);
    scoreLines();
    scoreCollections();
    updateWaitingLines();
  }
  game.busy = false;
  updateHUD();
  elements.message.textContent = "";
  if (tile.special) return openEventChoice(tile);
  continueAfterDraw();
}

function startRoundCostIfNeeded() {
  if (game.round.started) return;
  const multiplier = game.round.roundMultiplier;
  game.round.started = true;
  game.attemptsConsumed = Math.min(game.totalAttemptsGranted, game.attemptsConsumed + multiplier);
  game.roundsPlayed += 1;
  game.stats.roundsPlayed += 1;
  game.stats.totalRoundCost += multiplier;
  game.stats[`multiplier${multiplier}Count`] += 1;
  updateHUD();
}

function animateStackTile(tile) {
  const buttonRect = elements.drawStack.getBoundingClientRect();
  const sourceWidth = Math.min(64, buttonRect.width * .42);
  const sourceHeight = sourceWidth / .78;
  const source = { left: buttonRect.left + (buttonRect.width - sourceWidth) / 2, top: buttonRect.top + (buttonRect.height - sourceHeight) / 2, width: sourceWidth, height: sourceHeight };
  const target = elements.board.querySelector(`[data-tile-id="${tile.id}"]`).getBoundingClientRect();
  const clone = document.createElement("div");
  clone.className = tileClass(tile, "hand-tile revealed flying-tile");
  clone.innerHTML = tileContent(tile);
  Object.assign(clone.style, { left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px` });
  document.body.append(clone);
  clone.style.transform = "rotateY(88deg) scale(.94)";
  requestAnimationFrame(() => {
    clone.style.transform = `translate(${target.left - source.left}px,${target.top - source.top}px) scale(${target.width / source.width}) rotateY(0)`;
    clone.style.opacity = ".3";
  });
  return new Promise(resolve => setTimeout(() => { clone.remove(); resolve(); }, 320));
}

function markBoard(tile) {
  const cell = elements.board.querySelector(`[data-tile-id="${tile.id}"]`);
  cell.classList.remove("tile-unclaimed", "tile-discarded");
  cell.classList.add("marked", "tile-acquired");
  cell.setAttribute("aria-label", `${tile.label}，已取得`);
}

function lineTileIds(line) { return line.indexes.map(index => game.round.board[index].id); }
function isOfficiallyDrawn(id) { return game.round.drawn.has(id) && !game.round.discarded.has(id); }

function scoreLines() {
  const newLines = LINE_DEFINITIONS.filter(line => !game.round.completedLines.has(line.id) && lineTileIds(line).every(isOfficiallyDrawn));
  for (const line of newLines) {
    game.round.completedLines.add(line.id);
    game.round.activeWaiting.delete(line.id);
    const ordinal = game.round.roundLines + 1;
    const base = ordinal === 1 ? SCORE_CONFIG.line.first : ordinal === 2 ? SCORE_CONFIG.line.second : SCORE_CONFIG.line.thirdPlus;
    const points = base;
    game.round.roundLines += 1;
    game.totalLines += 1;
    game.stats.totalLines += 1;
    addRoundPoints(points);
    const label = ordinal === 1 ? "連線成功！" : ordinal === 2 ? "雙線！" : "三線以上！";
    notifyScore(`${label} +${points} 分`);
    flashLine(line, "line-flash");
    if (ordinal === 1 && game.round.drawIndex === game.round.formalDrawCount) {
      awardOnce("last-tile-first-line", SCORE_CONFIG.special.lastTileFirstLine, "海底撈月！");
    }
  }
}

function scoreCollections() {
  const drawnTiles = GAME_TILES.filter(tile => isOfficiallyDrawn(tile.id));
  for (const [suit, name] of Object.entries(SUIT_NAMES)) {
    const count = drawnTiles.filter(tile => tile.suit === suit).length;
    if (count >= 5) awardOnce(`${suit}-5`, SCORE_CONFIG.suit.five, `${name} 5 張！`, SCORE_CONFIG.suit.five);
    if (count >= 7) awardOnce(`${suit}-7`, SCORE_CONFIG.suit.seven - SCORE_CONFIG.suit.five, `${name} 7 張！`, SCORE_CONFIG.suit.seven);
    if (count >= 9) awardOnce(`${suit}-9`, SCORE_CONFIG.suit.nine - SCORE_CONFIG.suit.seven, `${name} 9 張！`, SCORE_CONFIG.suit.nine);
  }
  if (["east", "south", "west", "north"].every(isOfficiallyDrawn)) awardOnce("winds", SCORE_CONFIG.honor.fourWinds, "四風齊聚！");
  if (["red", "green", "white"].every(isOfficiallyDrawn)) awardOnce("dragons", SCORE_CONFIG.honor.threeDragons, "三元到手！");
}

function awardOnce(id, points, label, suitTotalBase = null) {
  if (game.round.achievements.has(id)) return;
  game.round.achievements.add(id);
  game.achievementCount += 1;
  game.stats.totalAchievements += 1;
  const statKey = ({ "wan-5": "wan5Count", "wan-7": "wan7Count", "wan-9": "wan9Count", "tong-5": "tong5Count", "tong-7": "tong7Count", "tong-9": "tong9Count", "suo-5": "tiao5Count", "suo-7": "tiao7Count", "suo-9": "tiao9Count", winds: "fourWindsCount", dragons: "threeDragonsCount", "early-waiting": "earlyWaitingCount", "last-tile-first-line": "lastTileFirstLineCount" })[id];
  if (statKey) game.stats[statKey] += 1;
  addRoundPoints(points);
  const message = `${label} +${points} 分`;
  notifyScore(message, { type: "achievement", duration: 2500 });
}

function addRoundPoints(points) {
  game.round.rawPoints += points;
  game.round.roundScore = game.round.rawPoints;
  updateHUD();
}

function addTotalPoints(points) {
  const previous = game.score;
  game.score = Math.max(0, game.score + points);
  game.stats.totalScore = game.score;
  return game.score - previous;
}

function currentWaitingLines() {
  return LINE_DEFINITIONS.filter(line => {
    if (game.round.completedLines.has(line.id)) return false;
    const ids = lineTileIds(line);
    if (ids.filter(isOfficiallyDrawn).length !== 5) return false;
    const missingId = ids.find(id => !isOfficiallyDrawn(id));
    return !GAME_TILES.find(tile => tile.id === missingId)?.special;
  });
}

function updateWaitingLines() {
  const previousWaitingIds = new Set(game.round.activeWaiting);
  const waiting = currentWaitingLines();
  const currentWaitingIds = new Set(waiting.map(line => line.id));
  game.round.activeWaiting = currentWaitingIds;
  if (waiting.length && game.round.drawIndex <= 5) awardOnce("early-waiting", SCORE_CONFIG.special.earlyWaiting, "天聽！");
  elements.board.querySelectorAll(".tile.waiting").forEach(cell => cell.classList.remove("waiting"));
  const newlyWaiting = waiting.filter(line => !previousWaitingIds.has(line.id) && !game.round.announcedWaiting.has(line.id));
  newlyWaiting.forEach(line => {
    game.round.announcedWaiting.add(line.id);
    flashLine(line, "waiting");
  });
  if (newlyWaiting.length) {
    game.round.everWaited = true;
    game.round.waitingAnnouncements += newlyWaiting.length;
    game.stats.waitingCount += newlyWaiting.length;
    const label = newlyWaiting.length === 1 ? "聽牌！" : newlyWaiting.length === 2 ? "雙聽！" : `聽牌 ×${newlyWaiting.length}`;
    notifyScore(label, true);
  }
}

function flashLine(line, className) {
  line.indexes.forEach(index => elements.board.children[index]?.classList.add(className));
  if (className === "line-flash") setTimeout(() => line.indexes.forEach(index => elements.board.children[index]?.classList.remove(className)), 750);
  if (className === "waiting") setTimeout(() => line.indexes.forEach(index => elements.board.children[index]?.classList.remove(className)), 1850);
}

function continueAfterDraw() {
  if (game.state !== GAME_STATES.DRAWING) return;
  if (game.round.drawIndex === game.round.formalDrawCount) setTimeout(finishRegularDraws, 250);
}

function findWaitingMissingTiles() {
  const missing = new Set();
  LINE_DEFINITIONS.filter(line => game.round.activeWaiting.has(line.id))
    .forEach(line => lineTileIds(line).filter(id => !isOfficiallyDrawn(id)).forEach(id => missing.add(id)));
  return missing;
}

function finishRegularDraws() {
  if (game.state !== GAME_STATES.DRAWING) return;
  updateWaitingLines();
  game.round.bonusMissing = findWaitingMissingTiles();
  if (game.round.activeWaiting.size > 0 && game.round.bonusMissing.size > 0) startBonusPending();
  else endRound(false, false);
}

function startBonusPending() {
  if (game.state !== GAME_STATES.DRAWING || game.round.bonusPendingStarted) return;
  game.round.bonusPendingStarted = true;
  game.state = GAME_STATES.BONUS_PENDING;
  game.busy = true;
  updateHUD();
  highlightFinalWaitingLines();
  showFinalWaitingPrompt();
  setTimeout(() => {
    if (game.state !== GAME_STATES.BONUS_PENDING) return;
    closeFinalWaitingPrompt();
  }, 1400);
  setTimeout(() => {
    if (game.state !== GAME_STATES.BONUS_PENDING) return;
    clearFinalWaitingHighlight();
    startBonusDraw();
  }, 1650);
}

function highlightFinalWaitingLines() {
  const activeLines = LINE_DEFINITIONS.filter(line => game.round.activeWaiting.has(line.id));
  activeLines.forEach(line => line.indexes.forEach(index => {
    const cell = elements.board.children[index];
    const tileId = game.round.board[index].id;
    cell?.classList.add(isOfficiallyDrawn(tileId) ? "final-waiting-hit" : "final-waiting-gap");
  }));
}

function clearFinalWaitingHighlight() {
  elements.board.querySelectorAll(".final-waiting-hit,.final-waiting-gap").forEach(cell => {
    cell.classList.remove("final-waiting-hit", "final-waiting-gap");
  });
}

function showFinalWaitingPrompt() {
  const waitingCount = game.round.activeWaiting.size;
  const title = waitingCount === 1 ? "聽牌！" : waitingCount === 2 ? "雙聽！" : `聽牌 ×${waitingCount}`;
  const tiles = GAME_TILES;
  const chips = [...game.round.bonusMissing].map(id => {
    const tile = tiles.find(item => item.id === id);
    if (!tile) return "";
    const symbol = tile.special ? "事" : tile.glyph;
    return `<span><b>${symbol}</b><small>${tile.label}</small></span>`;
  }).join("");
  elements.finalWaitingTitle.textContent = title;
  elements.finalWaitingMissing.innerHTML = `<strong>目前聽：</strong>${chips}`;
  elements.finalWaitingOverlay.classList.add("open");
  elements.finalWaitingOverlay.setAttribute("aria-hidden", "false");
  elements.message.textContent = `${title} 最終確認中`;
}

function closeFinalWaitingPrompt() {
  elements.finalWaitingOverlay.classList.remove("open");
  elements.finalWaitingOverlay.setAttribute("aria-hidden", "true");
}

function startBonusDraw() {
  if (game.state !== GAME_STATES.BONUS_PENDING) return;
  game.state = GAME_STATES.BONUS_DRAW;
  game.busy = false;
  game.round.selectedBonusTiles = [];
  game.round.bonusCandidates = [];
  game.stats.bonusDrawCount += 1;
  openBonusModal();
  elements.message.textContent = `聽牌！進入 ${game.round.remaining.length} 張補牌`;
  updateHUD();
  notifyScore("聽牌！獲得補牌機會", true);
}

function openBonusModal() {
  const tiles = GAME_TILES;
  elements.bonusWaiting.innerHTML = [...game.round.bonusMissing].map(id => {
    const tile = tiles.find(item => item.id === id);
    return `<span class="waiting-chip"><b>${tile.glyph}</b><small>${tile.label}</small></span>`;
  }).join("");
  elements.bonusInstruction.textContent = `請從剩餘 ${game.round.remaining.length} 張中選擇 ${RULES.bonusChoices} 張`;
  elements.bonusCount.textContent = `已選 0 / ${RULES.bonusChoices}`;
  elements.bonusResult.textContent = "";
  elements.bonusGrid.replaceChildren();
  game.round.remaining.forEach((tile, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-tile bonus-tile";
    button.dataset.index = index;
    button.setAttribute("aria-label", `補牌牌背 ${index + 1}`);
    button.addEventListener("click", selectBonusTile);
    elements.bonusGrid.append(button);
  });
  elements.bonusModal.classList.add("open");
  elements.bonusModal.setAttribute("aria-hidden", "false");
}

function closeBonusModal() {
  elements.bonusModal.classList.remove("open");
  elements.bonusModal.classList.remove("bonus-success-state");
  elements.bonusModal.setAttribute("aria-hidden", "true");
}

function selectBonusTile(event) {
  if (game.state !== GAME_STATES.BONUS_DRAW || game.round.bonusResolved) return;
  const button = event.currentTarget;
  if (button.disabled) return;
  const tile = game.round.remaining[Number(button.dataset.index)];
  revealButton(button, tile);
  button.classList.add("selected");
  game.round.selectedBonusTiles.push(tile);
  elements.bonusCount.textContent = `已選 ${game.round.selectedBonusTiles.length} / ${RULES.bonusChoices}`;
  game.round.bonusCandidates = [...game.round.selectedBonusTiles];
  const hit = !tile.special && game.round.bonusMissing.has(tile.id);
  if (hit || game.round.selectedBonusTiles.length === RULES.bonusChoices) {
    elements.bonusGrid.querySelectorAll("button").forEach(item => { item.disabled = true; });
    if (hit) {
      button.classList.add("bonus-hit", "bonus-success-hit");
      elements.bonusModal.classList.add("bonus-success-state");
      elements.bonusResult.innerHTML = `<strong>命中！補牌成功！</strong><br>${tile.label}`;
      elements.bonusInstruction.textContent = "已命中聽牌，補牌立即結束";
    }
    setTimeout(resolveBonusDraw, hit ? 300 : 450);
  }
}

function resolveBonusDraw() {
  if (game.state !== GAME_STATES.BONUS_DRAW || game.round.bonusResolved) return;
  game.round.bonusResolved = true;
  const success = game.round.bonusCandidates.some(tile => !tile.special && game.round.bonusMissing.has(tile.id));
  if (success) {
    game.stats.bonusSuccessCount += 1;
    game.round.bonusAttemptGain = grantAttempts(1);
    game.stats.extraRoundsFromBonus += game.round.bonusAttemptGain;
  }
  const hits = game.round.bonusCandidates.filter(tile => !tile.special && game.round.bonusMissing.has(tile.id));
  hits.forEach(tile => {
    const index = game.round.remaining.findIndex(item => item.id === tile.id);
    elements.bonusGrid.querySelector(`[data-index="${index}"]`)?.classList.add("bonus-hit");
  });
  updateHUD();
  const hitLabel = hits.map(tile => tile.label).join("、");
  elements.bonusResult.innerHTML = success
    ? `<strong>${hits.length > 1 ? "雙重命中！" : "補牌成功！"}</strong><br>你摸中了：${hitLabel}<br>${game.round.bonusAttemptGain ? "獲得 +1 次！" : "剩餘次數已達上限 6 次"}`
    : `<strong>補牌失敗，差一點！</strong><br>你需要的是：${[...game.round.bonusMissing].map(id => GAME_TILES.find(tile => tile.id === id)?.label).join("、")}`;
  elements.message.textContent = success ? "補牌成功！額外獲得 1 次！" : "補牌失敗，差一點！";
  notifyScore(success ? "補牌成功！額外獲得 1 次！" : "補牌失敗，差一點！", true);
  setTimeout(() => { closeBonusModal(); endRound(true, success); }, 1500);
}

function openEventChoice(tile) {
  game.state = GAME_STATES.EVENT_REVEAL;
  game.pendingSpecial = { tile, resolved: false, result: null };
  game.stats.eventTriggeredCount += 1;
  markBoard(tile);
  scoreLines();
  scoreCollections();
  updateWaitingLines();
  updateHUD();
  openModal({
    icon: tile.glyph, kicker: `${tile.label}・夜市事件牌`, title: "事件揭曉中……",
    body: "<p>夜市的霓虹燈閃了三下……</p>", actions: []
  });
  elements.modalIcon.classList.add("deciding");
  setTimeout(revealSpecialEvent, 700);
}

function revealSpecialEvent() {
  if (game.state !== GAME_STATES.EVENT_REVEAL) return;
  const specialEvent = weightedRandom(EVENT_DEFINITIONS.filter(event => event.enabled));
  game.pendingSpecial.eventId = specialEvent.id;
  elements.modalIcon.classList.remove("deciding");
  const isSpecial = specialEvent.category === "SPECIAL";
  game.stats[isSpecial ? "specialEventCount" : "normalEventCount"] += 1;
  game.stats[`${specialEvent.sentiment.toLowerCase()}EventCount`] += 1;
  elements.modal.classList.toggle("special-event-modal", isSpecial);
  elements.modal.classList.toggle("normal-event-modal", !isSpecial);
  elements.modalKicker.textContent = `${game.pendingSpecial.tile.label}・${isSpecial ? "特殊事件" : "一般事件"}`;
  elements.modalTitle.textContent = `【${specialEvent.title}】`;
  const result = executeEvent(specialEvent);
  game.pendingSpecial.result = result;
  const resultClass = specialEvent.sentiment === "POSITIVE" ? "positive" : specialEvent.sentiment === "NEGATIVE" ? "negative" : "neutral";
  elements.modalBody.innerHTML = `<p class="event-story">${specialEvent.story}</p><p class="event-effect ${resultClass}">${result.effectLabel}</p>`;
  renderModalActions([{ label: "繼續", action: finishSpecialEvent }]);
  updateHUD();
}

const EVENT_EFFECT_HANDLERS = {
  ADD_SCORE(event) {
    addRoundPoints(event.value);
    if (event.value >= 0) game.stats.eventScoreGain += event.value;
    else game.stats.eventScoreLoss += Math.abs(event.value);
    return { effectLabel: `${event.value >= 0 ? "+" : ""}${event.value} 分` };
  },
  SUB_SCORE(event) { return EVENT_EFFECT_HANDLERS.ADD_SCORE({ ...event, value: -Math.abs(event.value) }); },
  RANDOM_SCORE(event) {
    const value = event.randomMode === "PICK"
      ? event.value[Math.floor(Math.random() * event.value.length)]
      : Math.floor(Math.random() * (event.value[1] - event.value[0] + 1)) + event.value[0];
    addRoundPoints(value);
    if (value >= 0) game.stats.eventScoreGain += value;
    else game.stats.eventScoreLoss += Math.abs(value);
    return { effectLabel: `${value >= 0 ? "+" : ""}${value} 分` };
  },
  ADD_ROUNDS(event) {
    const granted = grantAttempts(event.value);
    game.round.eventAttemptDelta += granted;
    game.round.eventAddedAttempts += granted;
    game.stats.extraRoundsFromEvents += granted;
    return { effectLabel: granted ? `+${granted} 次（剩餘 ${attemptsRemaining()} 次）` : "剩餘次數已達上限 6 次" };
  },
  SUB_ROUNDS(event) {
    const removable = Math.min(event.value, attemptsRemaining());
    game.totalAttemptsGranted = Math.max(game.attemptsConsumed, game.totalAttemptsGranted - removable);
    game.round.eventAttemptDelta -= removable;
    return { effectLabel: `-${removable} 次` };
  },
  HALVE_ROUND_SCORE() {
    const before = game.round.rawPoints;
    const after = Math.trunc(before / 2);
    const delta = after - before;
    game.round.rawPoints = after;
    game.round.roundScore = after;
    if (delta < 0) game.stats.eventScoreLoss += Math.abs(delta); else game.stats.eventScoreGain += delta;
    return { effectLabel: `本局目前分數減半（${formatSignedScore(delta * game.round.finalMultiplier)} 分）` };
  },
  DOUBLE_FINAL_MULTIPLIER() {
    game.round.finalMultiplier = Math.min(6, game.round.finalMultiplier * 2);
    game.stats.multiplierBoostEventCount += 1;
    game.stats.highestMultiplier = Math.max(game.stats.highestMultiplier, game.round.finalMultiplier);
    return { effectLabel: `本局最終倍率提升為 ${game.round.finalMultiplier}x` };
  },
  END_ROUND() { game.stats.eventEarlyEndCount += 1; return { effectLabel: "本局立即結束", endRound: true }; },
  END_GAME() { game.totalAttemptsGranted = game.attemptsConsumed; game.stats.eventEarlyEndCount += 1; game.stats.gameOverByEvent = true; return { effectLabel: "立即結束整場遊戲", gameOver: true }; },
  REPLACE_DRAWN_TILE(event) {
    const fromId = event.value.from;
    if (!isOfficiallyDrawn(fromId)) return { effectLabel: "五條根本還沒出現，老闆白忙一場。" };
    const candidates = CORE_TILES.filter(tile => tile.suit === event.value.targetSuit && tile.id !== fromId && !isOfficiallyDrawn(tile.id));
    if (!candidates.length) return { effectLabel: "所有條子都已取得，無法替換。" };
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    game.round.drawn.delete(fromId);
    game.round.drawn.add(target.id);
    renderBoard();
    animateBoardStateChange(fromId, "tile-state-removed");
    animateBoardStateChange(target.id, "tile-state-added");
    scoreLines(); scoreCollections(); updateWaitingLines();
    game.stats.boardReplaceEventCount += 1;
    return { effectLabel: `五條熄滅，${target.label}亮起！` };
  },
  REMOVE_DRAWN_TILE() {
    const candidates = CORE_TILES.filter(tile => isOfficiallyDrawn(tile.id));
    if (!candidates.length) return { effectLabel: "目前沒有可移除的普通麻將。" };
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    game.round.drawn.delete(target.id);
    renderBoard(); animateBoardStateChange(target.id, "tile-state-removed"); updateWaitingLines();
    game.stats.boardRemoveEventCount += 1;
    return { effectLabel: `${target.label}被偷偷拿走了！` };
  },
  SWAP_DRAWN_TILE() {
    const acquired = CORE_TILES.filter(tile => isOfficiallyDrawn(tile.id));
    const unclaimed = CORE_TILES.filter(tile => !isOfficiallyDrawn(tile.id));
    if (!acquired.length || !unclaimed.length) return { effectLabel: "目前沒有可交換的普通麻將。" };
    const from = acquired[Math.floor(Math.random() * acquired.length)];
    const target = unclaimed[Math.floor(Math.random() * unclaimed.length)];
    game.round.drawn.delete(from.id);
    game.round.drawn.add(target.id);
    renderBoard();
    animateBoardStateChange(from.id, "tile-state-removed");
    animateBoardStateChange(target.id, "tile-state-added");
    scoreLines(); scoreCollections(); updateWaitingLines();
    game.stats.boardSwapEventCount += 1;
    return { effectLabel: `${from.label}換成${target.label}！` };
  },
  RESTART_ROUND() {
    game.stats.roundRestartEventCount += 1;
    return { effectLabel: "牌桌重新擺好，本局重新開始！", restartRound: true };
  },
  NONE() { return { effectLabel: "無事發生" }; }
};

function animateBoardStateChange(tileId, className) {
  const cell = elements.board.querySelector(`[data-tile-id="${tileId}"]`);
  cell?.classList.add(className);
}

function executeEvent(event) {
  return (EVENT_EFFECT_HANDLERS[event.effectType] ?? EVENT_EFFECT_HANDLERS.NONE)(event);
}

function finishSpecialEvent() {
  if (game.state !== GAME_STATES.EVENT_REVEAL) return;
  const result = game.pendingSpecial.result;
  game.pendingSpecial = null;
  closeModal();
  if (result.restartRound) return restartCurrentRound();
  if (result.gameOver) return endRound(false, false, true);
  if (result.endRound) return endRound(false, false);
  game.state = GAME_STATES.DRAWING;
  updateHUD();
  continueAfterDraw();
}

function restartCurrentRound() {
  const previous = game.round;
  rollbackRoundOutcomeStats(previous);
  const replacement = createRound(previous.formalDrawCount);
  replacement.started = true;
  replacement.attemptStart = previous.attemptStart;
  replacement.roundMultiplier = previous.roundMultiplier;
  replacement.finalMultiplier = previous.roundMultiplier;
  replacement.leverageConfigured = previous.leverageConfigured;
  replacement.activeBets = [...previous.activeBets];
  game.round = replacement;
  game.state = GAME_STATES.DRAWING;
  game.busy = false;
  renderBoard();
  updateHUD();
  notifyScore("本局重新開始！下注與倍率已保留", { type: "achievement", duration: 2200 });
}

function rollbackRoundOutcomeStats(round) {
  game.totalAttemptsGranted = Math.max(game.attemptsConsumed, game.totalAttemptsGranted - round.eventAttemptDelta);
  game.stats.extraRoundsFromEvents = Math.max(0, game.stats.extraRoundsFromEvents - round.eventAddedAttempts);
  game.totalLines = Math.max(0, game.totalLines - round.roundLines);
  game.stats.totalLines = Math.max(0, game.stats.totalLines - round.roundLines);
  game.stats.waitingCount = Math.max(0, game.stats.waitingCount - round.waitingAnnouncements);
  const statMap = { "wan-5": "wan5Count", "wan-7": "wan7Count", "wan-9": "wan9Count", "tong-5": "tong5Count", "tong-7": "tong7Count", "tong-9": "tong9Count", "suo-5": "tiao5Count", "suo-7": "tiao7Count", "suo-9": "tiao9Count", winds: "fourWindsCount", dragons: "threeDragonsCount", "early-waiting": "earlyWaitingCount", "last-tile-first-line": "lastTileFirstLineCount" };
  round.achievements.forEach(id => {
    const key = statMap[id];
    if (key) game.stats[key] = Math.max(0, game.stats[key] - 1);
  });
  game.achievementCount = Math.max(0, game.achievementCount - round.achievements.size);
  game.stats.totalAchievements = Math.max(0, game.stats.totalAchievements - round.achievements.size);
}

function betConditionMet(bet) {
  const handlers = {
    MIN_HONORS: () => bet.conditionValue.tileIds.filter(isOfficiallyDrawn).length >= bet.conditionValue.minimum,
    MIN_LINES: () => game.round.roundLines >= bet.conditionValue,
    EVER_WAITED: () => game.round.everWaited
  };
  return Boolean(handlers[bet.conditionType]?.());
}

function settleBets() {
  if (game.round.betsSettled) return game.round.betResults;
  game.round.betsSettled = true;
  game.round.betResults = game.round.activeBets.map(id => {
    const bet = BET_DEFINITIONS.find(item => item.id === id);
    if (!bet) return null;
    const won = betConditionMet(bet);
    const requested = won ? bet.reward : -betPenalty(bet);
    const before = game.score;
    addTotalPoints(requested);
    const actual = game.score - before;
    const stat = game.stats.betStats[id];
    game.stats.betsPlaced += 1;
    game.stats[won ? "betsWon" : "betsLost"] += 1;
    game.stats[won ? "betScoreGain" : "betScoreLoss"] += won ? bet.reward : betPenalty(bet);
    stat.played += 1; stat[won ? "won" : "lost"] += 1;
    return { bet, won, points: actual };
  }).filter(Boolean);
  return game.round.betResults;
}

function settleRoundPoints() {
  if (game.round.pointsSettled) return game.round.actualMultiplierPoints;
  game.round.pointsSettled = true;
  game.round.scoreBeforeSettlement = game.score;
  game.round.multiplierPoints = game.round.rawPoints * game.round.finalMultiplier;
  game.round.actualMultiplierPoints = addTotalPoints(game.round.multiplierPoints);
  return game.round.actualMultiplierPoints;
}

function endRound(hadBonus, bonusSuccess, forceGameOver = false) {
  game.state = GAME_STATES.ROUND_END;
  const totalBefore = game.score;
  settleRoundPoints();
  const betResults = settleBets();
  game.round.betNetPoints = betResults.reduce((sum, result) => sum + result.points, 0);
  game.round.finalRoundChange = game.score - totalBefore;
  recordRoundHighs();
  updateHUD();
  const bonusText = hadBonus ? `<p><strong>${bonusSuccess ? (game.round.bonusAttemptGain ? "補牌成功！+1 次" : "補牌成功！次數已達上限") : "補牌未中"}</strong></p>` : "";
  const betText = betResults.length ? `<section class="result-bets${game.round.betNetPoints < 0 ? " negative" : ""}"><small>下注損益</small><strong>${formatSignedScore(game.round.betNetPoints)} 分</strong></section>` : "";
  const gameEnded = forceGameOver || attemptsRemaining() === 0;
  openModal({
    icon: bonusSuccess ? "＋1" : "結", kicker: `ROUND RESULT・第 ${game.roundsPlayed} 局`, title: "單局結算",
    body: `<div class="round-result"><section class="result-round-points${game.round.multiplierPoints < 0 ? " negative" : ""}"><small>本局分數</small><strong>${formatSignedScore(game.round.multiplierPoints)} 分</strong></section>${bonusText}${betText}<section class="result-final${game.round.finalRoundChange < 0 ? " negative" : ""}"><small>本局最終變化</small><strong>${formatSignedScore(game.round.finalRoundChange)} 分</strong></section><section class="result-total"><small>總分數</small><strong data-round-total>${totalBefore}</strong></section><p class="result-meta">完成連線 ${game.round.roundLines} 條・分數成就 ${game.round.achievements.size} 項</p></div>`,
    actions: [{ label: gameEnded ? "查看最終成績" : "下一局", action: gameEnded ? showGameOver : startRound }]
  });
  animateRoundTotal(totalBefore, game.score);
}

function animateRoundTotal(from, to) {
  const target = elements.modalBody.querySelector("[data-round-total]");
  if (!target || from === to) { if (target) target.textContent = to; return; }
  const startedAt = performance.now();
  const duration = 900;
  const tick = now => {
    const progress = Math.min(1, (now - startedAt) / duration);
    target.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1 && game.state === GAME_STATES.ROUND_END) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function showGameOver() {
  game.state = GAME_STATES.GAME_OVER;
  game.busy = false;
  recordRoundHighs();
  updateHUD();
  openModal({
    icon: "🏆", kicker: "", title: game.playerName || "玩家",
    body: buildScoreReport(),
    actions: [{ label: "再玩一次", action: resetGame }, { label: "回主選單", className: "secondary", action: returnToMainMenu }]
  });
}

function recordRoundHighs() {
  if (!game.round) return;
  game.stats.highestRoundRawPoints = Math.max(game.stats.highestRoundRawPoints, game.round.rawPoints);
  game.stats.highestRoundSettledPoints = Math.max(game.stats.highestRoundSettledPoints, game.round.multiplierPoints);
  game.stats.highestMultiplier = Math.max(game.stats.highestMultiplier, game.round.finalMultiplier);
  game.stats.highestRoundLines = Math.max(game.stats.highestRoundLines, game.round.roundLines);
  game.stats.totalScore = game.score;
  game.stats.totalLines = game.totalLines;
}

function buildScoreReport() {
  const s = game.stats;
  const successRate = s.bonusDrawCount ? Math.round(s.bonusSuccessCount / s.bonusDrawCount * 100) : 0;
  const eventNetProfit = s.eventScoreGain - s.eventScoreLoss;
  const betNetProfit = s.betScoreGain - s.betScoreLoss;
  return `<div class="game-over-report"><strong class="game-over-score">${game.score}</strong><div class="report-grid">
    <section><h3>總成績</h3><dl class="result-summary"><div><dt>連線數</dt><dd>${game.totalLines}</dd></div><div><dt>總局數</dt><dd>${s.roundsPlayed}</dd></div><div><dt>單局最高分數</dt><dd>${s.highestRoundSettledPoints}</dd></div><div><dt>補牌</dt><dd>${s.bonusSuccessCount} / ${s.bonusDrawCount}（${successRate}%）</dd></div></dl></section>
    <section><h3>牌型成就</h3><p>萬子 5／7／9 張：<strong>${s.wan5Count}／${s.wan7Count}／${s.wan9Count}</strong><br>筒子 5／7／9 張：<strong>${s.tong5Count}／${s.tong7Count}／${s.tong9Count}</strong><br>條子 5／7／9 張：<strong>${s.tiao5Count}／${s.tiao7Count}／${s.tiao9Count}</strong><br>四風：<strong>${s.fourWindsCount}</strong><br>三元：<strong>${s.threeDragonsCount}</strong><br>天聽：<strong>${s.earlyWaitingCount}</strong><br>海底撈月：<strong>${s.lastTileFirstLineCount}</strong></p></section>
    <section class="profit-summary"><h3>事件與下注</h3><p><span>事件總損益</span><strong>${formatSignedScore(eventNetProfit)}</strong></p><p><span>下注總損益</span><strong>${formatSignedScore(betNetProfit)}</strong></p></section>
  </div></div>`;
}

function formatSignedScore(value) { return value > 0 ? `+${value}` : String(value); }

function getProgress() {
  const drawn = GAME_TILES.filter(tile => game.round && isOfficiallyDrawn(tile.id));
  const suits = Object.entries(SUIT_NAMES).map(([suit, name]) => {
    const count = drawn.filter(tile => tile.suit === suit).length;
    const score = count >= 9 ? SCORE_CONFIG.suit.nine : count >= 7 ? SCORE_CONFIG.suit.seven : count >= 5 ? SCORE_CONFIG.suit.five : 0;
    return { label: name, value: `${count} / 9${score ? ` ✓ +${score}` : ""}`, done: count >= 5 };
  });
  const winds = ["east", "south", "west", "north"].filter(id => game.round && isOfficiallyDrawn(id)).length;
  const dragons = ["red", "green", "white"].filter(id => game.round && isOfficiallyDrawn(id)).length;
  const progress = [...suits, { label: "四風", value: `${winds} / 4${winds === 4 ? ` ✓ +${SCORE_CONFIG.honor.fourWinds}` : ""}`, done: winds === 4 }, { label: "三元", value: `${dragons} / 3${dragons === 3 ? ` ✓ +${SCORE_CONFIG.honor.threeDragons}` : ""}`, done: dragons === 3 }];
  return progress;
}

function renderProgress() {
  return getProgress().map(item => `<div class="progress-item${item.done ? " done" : ""}"><b>${item.label}</b><span>${item.value}</span></div>`).join("");
}

function getRoundPointColorClass(points) {
  if (points < 0) return "hud-score-negative";
  if (points >= 70) return "hud-score-purple";
  if (points >= 50) return "hud-score-red";
  if (points >= 20) return "hud-score-orange";
  return "hud-score-gold";
}

function updateHUD() {
  if (!game) return;
  elements.totalScore.textContent = game.score;
  elements.roundsDisplay.textContent = attemptDisplay().replace(/\s+/g, "");
  const rawPoints = game.round?.rawPoints ?? 0;
  const multiplier = game.round?.finalMultiplier ?? 1;
  const displayedRoundPoints = rawPoints * multiplier;
  const displayedText = formatSignedScore(displayedRoundPoints);
  if (elements.roundScore.textContent !== displayedText) {
    elements.roundScore.textContent = displayedText;
    elements.roundScore.classList.remove("score-refresh");
    void elements.roundScore.offsetWidth;
    elements.roundScore.classList.add("score-refresh");
  }
  elements.roundScore.classList.remove("hud-score-gold", "hud-score-orange", "hud-score-red", "hud-score-purple", "hud-score-negative");
  elements.roundScore.classList.add(getRoundPointColorClass(displayedRoundPoints));
  elements.playerDisplay.textContent = game.playerName;
  const operationLocked = game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen;
  [elements.helpButton, elements.mainMenuButton]
    .forEach(button => { button.disabled = operationLocked; });
  const betCount = game.round?.activeBets.length ?? 0;
  [elements.leverageButton].forEach(button => {
    button.disabled = operationLocked;
    button.classList.remove("multiplier-x1", "multiplier-x2", "multiplier-x3", "multiplier-x4", "multiplier-x6", "multiplier-status");
    const showSummary = game.round?.started || game.round?.leverageConfigured;
    button.textContent = showSummary ? `下注 · ${multiplier}x${betCount ? ` · ${betCount}項` : ""}` : "下注";
    if (showSummary) button.classList.add(`multiplier-x${multiplier}`, "multiplier-status");
  });
  const playArea = elements.board.closest(".play-area");
  [1, 2, 3, 4, 6].forEach(value => playArea.classList.toggle(`board-multiplier-${value}`, multiplier === value));
  updateDrawStackUI();
}

function updateDrawStackUI() {
  if (!game.round) return;
  const total = game.round.formalDrawCount;
  const drawn = game.round.drawIndex;
  const remaining = Math.max(0, total - drawn);
  elements.drawStack.textContent = `摸牌 (${remaining})`;
  elements.drawStack.setAttribute("aria-label", remaining ? `摸牌，剩餘 ${remaining} 張` : "本局摸牌完成");
  elements.drawStack.disabled = remaining === 0 || game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen;
}

function notifyScore(text, options = {}) {
  if (typeof options === "boolean") options = { type: options ? "waiting" : "default" };
  const type = options.type ?? "default";
  const duration = options.duration ?? 1500;
  const toast = document.createElement("div");
  toast.className = `score-toast${type === "waiting" ? " wait-toast" : ""}${type === "achievement" ? " achievement-toast" : ""}`;
  toast.style.setProperty("--toast-duration", `${duration}ms`);
  toast.textContent = text;
  elements.toastStack.append(toast);
  setTimeout(() => toast.remove(), duration + 50);
}

function openModal({ icon, kicker, title, body, actions }) {
  elements.modalIcon.classList.remove("deciding");
  elements.modalIcon.textContent = icon;
  elements.modalKicker.textContent = kicker;
  elements.modalTitle.textContent = title;
  elements.modalBody.innerHTML = body;
  elements.modal.querySelector(".modal-card").classList.toggle("modal-card-wide", /betting-panel|report-grid|event-guide/.test(body));
  elements.modal.classList.toggle("game-over-modal", /game-over-report/.test(body));
  renderModalActions(actions);
  elements.modal.classList.add("open");
  elements.modal.setAttribute("aria-hidden", "false");
  elements.modalActions.querySelector("button")?.focus();
}

function renderModalActions(actions) {
  elements.modalActions.replaceChildren();
  actions.forEach(action => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    if (action.className) button.className = action.className;
    button.disabled = Boolean(action.disabled);
    button.addEventListener("click", action.action, { once: true });
    elements.modalActions.append(button);
  });
}

function eventEffectDescription(event) {
  return event.displayEffect || event.effectType;
}

function buildEventGuideSection(title, events, totalWeight) {
  return `<section class="event-guide-section"><h3>${title}</h3><div class="event-guide-list">${events.map(event => {
    const probability = (event.weight / totalWeight * 100).toFixed(1);
    const danger = event.effectType === "END_GAME" ? " danger" : "";
    return `<article class="event-guide-item${danger}"><h4>${event.title}</h4><p>${event.story}</p><footer><b>${eventEffectDescription(event)}</b><span>Weight ${event.weight}｜${probability}%</span></footer></article>`;
  }).join("")}</div></section>`;
}

function buildScoringGuideContent() {
  const gameRule = `每局 ${game.round.formalDrawCount} 張，包含兩張事件牌`;
  const bets = BET_DEFINITIONS.filter(bet => bet.enabled).map(bet => `${bet.title}：${bet.description}<br>成功 +${bet.reward}／失敗 -${betPenalty(bet)}`).join("<br>");
  return `<section class="help-section"><h3>分數獲得方式</h3><div class="rules-list scoring-guide"><p><b>玩法</b><span>${gameRule}</span></p><p><b>倍率</b><span>本局分數依倍率即時顯示<br>額外下注不乘倍率</span></p><p><b>連線</b><span>第 1 條 +30 分<br>第 2 條 +60 分<br>第 3 條起每條 +90 分</span></p><p><b>牌型</b><span>萬／筒／條：5 張 +${SCORE_CONFIG.suit.five}、7 張累計 +${SCORE_CONFIG.suit.seven}、9 張累計 +${SCORE_CONFIG.suit.nine}<br>四風 +${SCORE_CONFIG.honor.fourWinds}／三元 +${SCORE_CONFIG.honor.threeDragons}</span></p><p><b>特殊成就</b><span>天聽 +${SCORE_CONFIG.special.earlyWaiting}<br>海底撈月 +${SCORE_CONFIG.special.lastTileFirstLine}</span></p><p><b>額外下注</b><span>${bets}</span></p></div></section>`;
}

function openHelp() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const enabledEvents = EVENT_DEFINITIONS.filter(event => event.enabled);
  const totalWeight = enabledEvents.reduce((sum, event) => sum + event.weight, 0);
  const eventContent = `<section class="help-section"><h3>事件一覽</h3><div class="event-guide">${buildEventGuideSection("一般事件", enabledEvents.filter(event => event.category === "NORMAL"), totalWeight)}${buildEventGuideSection("特殊事件", enabledEvents.filter(event => event.category === "SPECIAL"), totalWeight)}</div></section>`;
  openModal({
    icon: "說", kicker: "遊戲說明", title: "說明",
    body: `<div class="help-guide">${buildScoringGuideContent()}${eventContent}</div>`,
    actions: [{ label: "關閉", action: closeInfoModal }]
  });
  elements.modal.classList.add("status-sheet", "help-sheet");
}

function openRoundStatus() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const lines = game.round?.roundLines ?? 0;
  const waiting = game.round?.activeWaiting.size ?? 0;
  openModal({
    icon: "況", kicker: "ROUND STATUS", title: "本局狀態",
    body: `<div class="round-status-summary"><p><small>本局連線</small><strong>${lines}</strong></p><p><small>目前聽牌</small><strong>${waiting}</strong></p></div><div class="progress-list">${renderProgress()}</div>`,
    actions: [{ label: "關閉", action: closeInfoModal }]
  });
  elements.modal.classList.add("status-sheet");
}

function openScoringGuide() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const gameRule = `每局 ${game.round.formalDrawCount} 張，包含兩張事件牌`;
  openModal({
    icon: "分", kicker: "SCORE GUIDE", title: "分數獲得方式",
    body: `<div class="rules-list scoring-guide"><p><b>玩法</b><span>${gameRule}</span></p><p><b>局末倍率</b><span>本局所有正負分數於結算時統一 × 倍率<br>額外下注不乘倍率</span></p><p><b>連線</b><span>第 1 條 +30 分<br>第 2 條 +60 分<br>第 3 條起每條 +90 分</span></p><p><b>花色收集</b><span>萬／筒／條取最高級距、不累加<br>5 張 +${SCORE_CONFIG.suit.five}，7 張 +${SCORE_CONFIG.suit.seven}，9 張 +${SCORE_CONFIG.suit.nine}</span></p><p><b>四風／三元</b><span>東南西北 +${SCORE_CONFIG.honor.fourWinds}<br>中發白 +${SCORE_CONFIG.honor.threeDragons}</span></p><p><b>特殊成就</b><span>前 5 張形成聽牌：天聽 +${SCORE_CONFIG.special.earlyWaiting}<br>最後一張完成首條線：海底撈月 +${SCORE_CONFIG.special.lastTileFirstLine}</span></p></div>`,
    actions: [{ label: "關閉", action: closeInfoModal }]
  });
}

function closeInfoModal() {
  game.uiOverlayOpen = false;
  closeModal();
}

function openEventGuide() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const enabledEvents = EVENT_DEFINITIONS.filter(event => event.enabled);
  const totalWeight = enabledEvents.reduce((sum, event) => sum + event.weight, 0);
  openModal({
    icon: "覽", kicker: "WEIGHTED EVENT GUIDE", title: "事件一覽",
    body: `<div class="event-guide">${buildEventGuideSection("一般事件", enabledEvents.filter(event => event.category === "NORMAL"), totalWeight)}${buildEventGuideSection("特殊事件", enabledEvents.filter(event => event.category === "SPECIAL"), totalWeight)}</div>`,
    actions: [{ label: "關閉並繼續遊戲", action: closeEventGuide }]
  });
}

function closeEventGuide() {
  game.uiOverlayOpen = false;
  closeModal();
}

function closeModal() {
  elements.modal.classList.remove("open");
  elements.modal.classList.remove("status-sheet", "betting-sheet", "help-sheet");
  elements.modal.classList.remove("normal-event-modal", "special-event-modal", "game-over-modal");
  elements.modal.setAttribute("aria-hidden", "true");
}

function enableGlyphFallback() {
  if (!document.fonts?.check) {
    document.documentElement.classList.add("no-mahjong-glyphs");
    return;
  }
  const fontFamilies = ["Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2"];
  const supported = fontFamilies.some(font => document.fonts.check(`32px "${font}"`, "🀇"));
  document.documentElement.classList.toggle("no-mahjong-glyphs", !supported);
  if (!supported) document.querySelectorAll(".hidden-fallback").forEach(item => item.classList.remove("hidden-fallback"));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function loadPlayerName() {
  try { return (localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "").trim().slice(0, 12); }
  catch { return ""; }
}

function savePlayerName(name) {
  try { localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name); }
  catch { /* localStorage unavailable: the current game still keeps the name. */ }
}

function resetGame() {
  const playerName = game.playerName;
  game = freshGameState(playerName);
  elements.startScreen.classList.add("hidden");
  elements.gameShell.classList.remove("hidden");
  startRound();
  enableGlyphFallback();
}

function startGame() {
  const enteredPlayerName = elements.playerNameInput.value.trim().slice(0, 12);
  const playerName = enteredPlayerName || EMPTY_PLAYER_DISPLAY_NAME;
  if (enteredPlayerName) {
    elements.playerNameInput.value = enteredPlayerName;
    savePlayerName(enteredPlayerName);
  }
  elements.playerNameError.textContent = "";
  game = freshGameState(playerName);
  elements.startScreen.classList.add("hidden");
  elements.gameShell.classList.remove("hidden");
  startRound();
  enableGlyphFallback();
}

function showStartScreen() {
  closeModal();
  closeBonusModal();
  elements.gameShell.classList.add("hidden");
  elements.startScreen.classList.remove("hidden");
  elements.playerNameInput.value = game.playerName === EMPTY_PLAYER_DISPLAY_NAME ? "" : (game.playerName || loadPlayerName());
  elements.playerNameError.textContent = "";
}

function requestMainMenu() {
  if (game.state === GAME_STATES.GAME_OVER) return returnToMainMenu();
  if (game.busy || game.uiOverlayOpen || game.state !== GAME_STATES.DRAWING) return;
  game.uiOverlayOpen = true;
  openModal({
    icon: "↩", kicker: "返回主選單", title: "確定離開目前遊戲？",
    body: "<p>目前遊戲進度與成績將會消失。</p>",
    actions: [{ label: "繼續遊戲", className: "secondary", action: cancelMainMenu }, { label: "確定返回", action: returnToMainMenu }]
  });
}

function cancelMainMenu() { game.uiOverlayOpen = false; closeModal(); }

function returnToMainMenu() {
  const playerName = game.playerName || elements.playerNameInput.value.trim().slice(0, 12);
  game = freshGameState(playerName);
  showStartScreen();
}

elements.helpButton.addEventListener("click", openHelp);
elements.leverageButton.addEventListener("click", openLeverage);
elements.drawStack.addEventListener("click", drawTile);
elements.mainMenuButton.addEventListener("click", requestMainMenu);
document.querySelector("#start-game-button").addEventListener("click", startGame);
elements.playerNameInput.addEventListener("input", () => {
  elements.playerNameError.textContent = "";
  const playerName = elements.playerNameInput.value.trim().slice(0, 12);
  if (playerName) savePlayerName(playerName);
});
game = freshGameState(loadPlayerName());
showStartScreen();
