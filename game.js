const GAME_STATES = Object.freeze({
  READY: "READY", PRE_ROUND: "PRE_ROUND", COMMITTING: "COMMITTING", DRAWING: "DRAWING",
  SELF_SELECT_DRAW: "SELF_SELECT_DRAW",
  MINIGAME_OFFER: "MINIGAME_OFFER", MINIGAME_ACTIVE: "MINIGAME_ACTIVE", MINIGAME_REWARD: "MINIGAME_REWARD",
  INTER_ROUND_INVITATION: "INTER_ROUND_INVITATION", INTER_ROUND_MINIGAME: "INTER_ROUND_MINIGAME",
  INTER_ROUND_REWARD: "INTER_ROUND_REWARD", INTER_ROUND_REWARD_REPLACEMENT: "INTER_ROUND_REWARD_REPLACEMENT",
  EVENT_REVEAL: "EVENT_REVEAL", BONUS_PENDING: "BONUS_PENDING", BONUS_DRAW: "BONUS_DRAW",
  ROUND_END: "ROUND_END", GAME_OVER: "GAME_OVER"
});
const GAME_MODES = Object.freeze({ PRODUCTION: "production", EXPERIMENTAL: "experimental" });
function gameModeAllowsLeaderboardPost(mode) { return mode === GAME_MODES.PRODUCTION; }
function gameModeDisplayName(mode) { return mode === GAME_MODES.EXPERIMENTAL ? "進階模式" : "經典模式"; }

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
  "board", "draw-stack", "total-score", "round-score", "rounds-display", "player-display", "game-mode-indicator",
  "player-name-input", "player-name-error", "options-button", "start-screen", "game-shell", "play-area",
  "item-status-button", "inventory-full-badge", "tile-peek-button", "tile-overview-overlay", "tile-overview-grid", "tile-overview-close",
  "pre-round-panel", "pre-round-event-options", "pre-round-skip-button", "pre-round-leverage-title", "pre-round-leverage-options", "pre-round-error", "pre-round-item-button", "pre-round-inventory-count", "start-round-button",
  "final-waiting-overlay", "final-waiting-title", "final-waiting-missing",
  "bonus-modal", "bonus-waiting", "bonus-instruction", "bonus-count", "bonus-grid", "bonus-result",
  "message", "side-challenge-status",
  "toast-stack", "leaderboard-overlay", "leaderboard-content", "leaderboard-retry", "leaderboard-close", "leaderboard-highest", "leaderboard-lowest",
  "modal", "modal-icon", "modal-kicker", "modal-title", "modal-body", "modal-actions"
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

function freshGameState(playerName = "", mode = GAME_MODES.PRODUCTION) {
  const betStats = Object.fromEntries(PRE_ROUND_EVENT_DEFINITIONS.filter(event => event.type === "BET").map(event => [event.id, { played: 0, won: 0, lost: 0 }]));
  return {
    playerName, mode, state: GAME_STATES.READY, score: 0, totalLines: 0, items: [], pendingInterRoundRewardId: null,
    totalAttemptsGranted: RULES.initialAttempts, attemptsConsumed: 0, roundsPlayed: 0, interRoundMiniGameResults: [],
    achievementCount: 0, round: null, busy: false, pendingSpecial: null, uiOverlayOpen: false,
    leaderboardSubmitted: false, leaderboardSubmissionStatus: "idle", leaderboardPreparedPayload: null,
    leaderboardSnapshotValid: false, leaderboardSnapshot: null,
    leaderboardQualifiedHighest: false, leaderboardQualifiedLowest: false, leaderboardQualificationMode: null,
    leaderboardGameOverProcessing: false, leaderboardGameOverComplete: false,
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
      miniGameInvitationCount: 0, miniGameParticipatedCount: 0, miniGameSuccessCount: 0, miniGameFailureCount: 0, miniGameSkipCount: 0,
      miniGameSuccessById: { pachinko: 0, baseball9: 0, memoryMaster: 0 },
      highestRoundRawPoints: 0, highestRoundSettledPoints: 0, highestMultiplier: 1, highestRoundLines: 0, totalAchievements: 0,
      completedRoundStats: [], activeItemUses: 0, earnedAchievements: []
    }
  };
}

function getRandomItemDefinitions() { return ITEM_DEFINITIONS.filter(item => !item.rewardOnly); }
function getTicketDefinitions() { return ITEM_DEFINITIONS.filter(item => item.rewardOnly); }
function getPreRoundEventWeight(event) { return event.weight ?? (event.type === "ITEM" ? getRandomItemDefinitions().length : 1); }

function getPreRoundModeConfig(mode = game?.mode ?? GAME_MODES.PRODUCTION, configs = PRE_ROUND_MODE_CONFIG) {
  return configs[mode] ?? configs.production;
}

function resolvePreRoundEventForMode(event, mode = game?.mode ?? GAME_MODES.PRODUCTION, configs = PRE_ROUND_MODE_CONFIG) {
  const override = getPreRoundModeConfig(mode, configs)?.overrides?.[event.id];
  return override ? Object.freeze({ ...event, ...override }) : event;
}

function getEligiblePreRoundEvents(mode = game?.mode ?? GAME_MODES.PRODUCTION, configs = PRE_ROUND_MODE_CONFIG) {
  const modeConfig = getPreRoundModeConfig(mode, configs);
  const categoryIds = modeConfig.selection === "FIXED_CATEGORIES" ? new Set(modeConfig.categories.flatMap(category => category.eventIds)) : null;
  return PRE_ROUND_EVENT_DEFINITIONS
    .map(event => resolvePreRoundEventForMode(event, mode, configs))
    .filter(event => event.enabled !== false && (!categoryIds || categoryIds.has(event.id)));
}

function drawPreRoundEvents(random = Math.random, mode = game?.mode ?? GAME_MODES.PRODUCTION) {
  const pool = [...getEligiblePreRoundEvents(mode)];
  const selected = [];
  while (selected.length < 3 && pool.length) {
    const event = weightedRandom(pool, random(), getPreRoundEventWeight);
    selected.push(event);
    // Remove the selected definition, not one unit of its virtual weight.
    pool.splice(pool.indexOf(event), 1);
  }
  return selected;
}

function getPreRoundCategoryOptions(mode = game?.mode ?? GAME_MODES.PRODUCTION) {
  const config = getPreRoundModeConfig(mode);
  return config.selection === "FIXED_CATEGORIES" ? [...config.categories] : drawPreRoundEvents(Math.random, mode);
}

function createRound(formalDrawCount = RULES.baseFormalDrawCount, eventOptions = getPreRoundCategoryOptions()) {
  const board = shuffle(GAME_TILES);
  const order = shuffle(GAME_TILES);
  return {
    board, formalDrawCount, hand: order.slice(0, formalDrawCount), remaining: order.slice(formalDrawCount), drawIndex: 0, drawn: new Set(), discarded: new Set(), started: false, attemptStart: game.attemptsConsumed,
    preRound: { eventOptions, eventSelectionType: "UNSELECTED", selectedEventId: null, selectedEvent: null, selectedCategoryId: null, categoryCommitted: false, selectedLeverage: 1, freeTicketDecision: null }, config: null, committed: false,
    completedLines: new Set(), activeWaiting: new Set(), announcedWaiting: new Set(), everWaitingLines: new Set(), achievements: new Set(),
    rawPoints: 0, roundScore: 0, roundLines: 0, roundMultiplier: 1, finalMultiplier: 1, leverageConfigured: false, betSettled: false, betResult: null, everWaited: false, waitingAnnouncements: 0, chanceMakerTriggered: false, pendingItemId: null, itemRevealConfirmed: false, rpsResult: null,
    miniGame: createMiniGameState(), tilePicker: null,
    pointsSettled: false, multiplierPoints: 0, actualMultiplierPoints: 0, betNetPoints: 0, finalRoundChange: 0, scoreBeforeSettlement: 0, scoreBreakdown: [], activeItemUses: 0, completedStatsRecorded: false, eventAttemptDelta: 0, eventAddedAttempts: 0,
    bonusMissing: new Set(), bonusCandidates: [], selectedBonusTiles: [], bonusResolved: false, bonusPendingStarted: false, bonusAttemptGain: 0,
    lastAcquiredTileId: null, lastTileCelebrationPending: false, lastTileCelebrationPlayed: false,
    sideChallenge: null
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

function weightedRandom(events, random = Math.random(), getWeight = event => event.weight) {
  const total = events.reduce((sum, event) => sum + getWeight(event), 0);
  let cursor = random * total;
  for (const event of events) {
    cursor -= getWeight(event);
    if (cursor < 0) return event;
  }
  return events[events.length - 1];
}

function startRound() {
  clearSideChallengeRevealPresentation();
  hideTileOverview();
  closeModal();
  closeBonusModal();
  closeFinalWaitingPrompt();
  game.round = createRound();
  game.state = GAME_STATES.PRE_ROUND;
  game.busy = false;
  game.pendingSpecial = null;
  elements.playArea.classList.add("hidden");
  elements.preRoundPanel.classList.remove("hidden");
  elements.message.textContent = "";
  renderPreRound();
  updateHUD();
}

function renderPreRound() {
  if (game.state !== GAME_STATES.PRE_ROUND || !game.round || game.round.committed) return;
  const { eventOptions, eventSelectionType, selectedEventId, selectedLeverage } = game.round.preRound;
  const categoryMode = game.mode === GAME_MODES.EXPERIMENTAL && getPreRoundModeConfig().selection === "FIXED_CATEGORIES";
  elements.preRoundEventOptions.replaceChildren(...eventOptions.map(event => {
    const button = document.createElement("button");
    button.type = "button";
    const selected = categoryMode ? eventSelectionType === "CATEGORY" && game.round.preRound.selectedCategoryId === event.id : eventSelectionType === "EVENT" && selectedEventId === event.id;
    button.className = `pre-round-event-card ${categoryMode ? "pre-round-category-card" : `pre-round-event-${event.type.toLowerCase()}`}${selected ? " selected" : ""}`;
    if (categoryMode) button.dataset.categoryId = event.id;
    else button.dataset.eventId = event.id;
    button.setAttribute("aria-pressed", String(selected));
    const description = !categoryMode && event.type === "BET" ? `${event.description} 成功 +${event.reward}／失敗 -${event.penalty}` : event.description;
    button.innerHTML = `<b>${event.title}</b><span>${description}</span>`;
    button.addEventListener("click", selectPreRoundEvent);
    return button;
  }));
  elements.preRoundSkipButton.classList.toggle("selected", eventSelectionType === "SKIP");
  elements.preRoundSkipButton.setAttribute("aria-pressed", String(eventSelectionType === "SKIP"));
  const leverageOptions = game.mode === GAME_MODES.EXPERIMENTAL ? [2, 3] : [1, 2, 3];
  const multiplierTickets = itemCount("multiplier-ticket");
  elements.preRoundLeverageTitle.textContent = game.mode === GAME_MODES.EXPERIMENTAL ? "券倍率（未選擇為 ×1）" : "開槓桿";
  elements.preRoundLeverageOptions.classList.toggle("experimental-ticket-multipliers", game.mode === GAME_MODES.EXPERIMENTAL);
  elements.preRoundLeverageOptions.replaceChildren(...leverageOptions.map(leverage => {
    const button = document.createElement("button");
    const available = game.mode === GAME_MODES.EXPERIMENTAL
      ? multiplierTickets >= ticketMultiplierCost(leverage)
      : leverage <= attemptsRemaining();
    button.type = "button";
    button.className = `pre-round-leverage${selectedLeverage === leverage ? " selected" : ""}`;
    button.dataset.leverage = leverage;
    button.disabled = !available;
    button.setAttribute("aria-pressed", String(selectedLeverage === leverage));
    button.innerHTML = game.mode === GAME_MODES.EXPERIMENTAL
      ? `<b>×${leverage}</b><span><i class="ticket-icon">倍</i> ×${ticketMultiplierCost(leverage)}</span>`
      : `<b>×${leverage}</b><span>消耗 ${leverage} 局</span>`;
    button.addEventListener("click", selectPreRoundLeverage);
    return button;
  }));
  elements.preRoundError.textContent = "";
  elements.startRoundButton.disabled = eventSelectionType === "UNSELECTED";
}

function selectPreRoundEvent(event) {
  if (game.state !== GAME_STATES.PRE_ROUND || game.round.committed) return;
  const categoryId = event.currentTarget.dataset.categoryId;
  if (categoryId) return selectAdvancedPreRoundCategory(categoryId);
  const eventId = event.currentTarget.dataset.eventId;
  if (!game.round.preRound.eventOptions.some(option => option.id === eventId)) return;
  game.round.preRound.eventSelectionType = "EVENT";
  game.round.preRound.selectedEventId = eventId;
  renderPreRound();
}

function selectPreRoundSkip() {
  if (game.state !== GAME_STATES.PRE_ROUND || game.round.committed) return;
  game.round.preRound.eventSelectionType = "SKIP";
  game.round.preRound.selectedEventId = null;
  game.round.preRound.selectedEvent = null;
  game.round.preRound.selectedCategoryId = null;
  renderPreRound();
}

function selectPreRoundLeverage(event) {
  if (game.state !== GAME_STATES.PRE_ROUND || game.round.committed) return;
  const leverage = Number(event.currentTarget.dataset.leverage);
  if (![1, 2, 3].includes(leverage)) return;
  if (game.mode === GAME_MODES.EXPERIMENTAL) {
    if (![2, 3].includes(leverage) || itemCount("multiplier-ticket") < ticketMultiplierCost(leverage)) return;
    game.round.preRound.selectedLeverage = game.round.preRound.selectedLeverage === leverage ? 1 : leverage;
  } else {
    if (leverage > attemptsRemaining()) return;
    game.round.preRound.selectedLeverage = leverage;
  }
  renderPreRound();
}

function getAdvancedPreRoundCategory(categoryId) {
  return getPreRoundModeConfig(GAME_MODES.EXPERIMENTAL).categories.find(category => category.id === categoryId) ?? null;
}

function getAdvancedPreRoundCategoryPool(categoryId, configs = PRE_ROUND_MODE_CONFIG) {
  const category = getPreRoundModeConfig(GAME_MODES.EXPERIMENTAL, configs).categories.find(option => option.id === categoryId);
  if (!category) return [];
  const ids = new Set(category.eventIds);
  return getEligiblePreRoundEvents(GAME_MODES.EXPERIMENTAL, configs).filter(event => ids.has(event.id) && event.type === category.type);
}

function selectAdvancedPreRoundCategory(categoryId) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.PRE_ROUND || game.round.committed) return false;
  if (!getAdvancedPreRoundCategory(categoryId)) return false;
  game.round.preRound.eventSelectionType = "CATEGORY";
  game.round.preRound.selectedCategoryId = categoryId;
  game.round.preRound.selectedEventId = null;
  game.round.preRound.selectedEvent = null;
  game.round.preRound.categoryCommitted = false;
  game.round.pendingItemId = null;
  game.round.itemRevealConfirmed = false;
  renderPreRound();
  return true;
}

function closeAdvancedCategoryReveal() {
  if (game.state !== GAME_STATES.COMMITTING || !game.round.preRound.categoryCommitted) return false;
  const selectedEvent = game.round.preRound.selectedEvent;
  const leverage = game.round.preRound.selectedLeverage;
  game.uiOverlayOpen = false;
  closeModal();
  return continueCommittedRound(selectedEvent, leverage);
}

function openAdvancedCategoryReveal(category, selectedEvent) {
  game.uiOverlayOpen = true;
  const description = selectedEvent.type === "BET"
    ? `${selectedEvent.description} 成功 +${selectedEvent.reward}／失敗 -${selectedEvent.penalty}`
    : selectedEvent.description;
  openModal({
    icon: category.type === "BET" ? "機" : "命", kicker: category.title, title: selectedEvent.title,
    body: `<div class="pre-round-category-result"><p>${description}</p></div>`,
    actions: [{ label: "確定", action: closeAdvancedCategoryReveal }]
  });
  return true;
}

function commitAdvancedPreRoundCategory(random = Math.random) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.COMMITTING || !game.round.committed || game.round.preRound.categoryCommitted) return false;
  const categoryId = game.round.preRound.selectedCategoryId;
  const category = getAdvancedPreRoundCategory(categoryId);
  const pool = getAdvancedPreRoundCategoryPool(categoryId);
  if (!category || !pool.length) return false;
  const selectedEvent = weightedRandom(pool, random(), getPreRoundEventWeight);
  game.round.preRound.categoryCommitted = true;
  game.round.preRound.selectedCategoryId = categoryId;
  game.round.preRound.selectedEventId = selectedEvent.id;
  game.round.preRound.selectedEvent = selectedEvent;
  if (category.type === "ITEM") {
    const randomItems = getRandomItemDefinitions();
    game.round.pendingItemId = randomItems[Math.floor(random() * randomItems.length)].id;
    return openItemReveal(selectedEvent, game.round.preRound.selectedLeverage);
  }
  return openAdvancedCategoryReveal(category, selectedEvent);
}

let sideChallengeRevealTimerIds = [];

function selectSideChallenge(random = Math.random) {
  return SIDE_CHALLENGE_DEFINITIONS[Math.floor(random() * SIDE_CHALLENGE_DEFINITIONS.length)] ?? null;
}

function initializeSideChallenge(random = Math.random) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || !game.round?.started || game.round.sideChallenge) return false;
  const definition = selectSideChallenge(random);
  if (!definition) return false;
  game.round.sideChallenge = { id: definition.id, status: "ACTIVE", promptShown: false, baseReward: 10, awarded: false, revealReady: false, revealConfirmed: false };
  renderSideChallengeStatus();
  return definition;
}

function clearSideChallengeRevealPresentation() {
  sideChallengeRevealTimerIds.forEach(timerId => clearTimeout(timerId));
  sideChallengeRevealTimerIds = [];
}

function finishSideChallengeReveal(definition) {
  const runtime = game.round?.sideChallenge;
  if (!runtime || runtime.id !== definition?.id || runtime.revealConfirmed) return false;
  runtime.revealReady = true;
  const reel = elements.modalBody.querySelector("[data-side-challenge-reel]");
  if (reel) {
    reel.classList.add("revealed");
    reel.innerHTML = `<b>${definition.title}</b><span>${definition.description}</span>`;
  }
  const confirmButton = elements.modalActions.querySelector("button");
  if (confirmButton) confirmButton.disabled = false;
  return true;
}

function openSideChallengeReveal(definition, scheduler = setTimeout) {
  const runtime = game.round?.sideChallenge;
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.DRAWING || !runtime || runtime.id !== definition?.id) return false;
  clearSideChallengeRevealPresentation();
  game.uiOverlayOpen = true;
  runtime.revealReady = false;
  runtime.revealConfirmed = false;
  openModal({
    icon: "任", kicker: "本局任務揭曉", title: "小任務挑戰",
    body: `<div class="side-challenge-reveal"><small>任務抽選中</small><div class="side-challenge-reel" data-side-challenge-reel><b>？？？</b><span>準備揭曉本局任務</span></div></div>`,
    actions: [{ label: "確定", action: confirmSideChallengeReveal, disabled: true }]
  });
  elements.modal.classList.add("side-challenge-reveal-modal");
  updateHUD();
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cycleCount = reducedMotion ? 0 : 6;
  for (let index = 0; index < cycleCount; index += 1) {
    sideChallengeRevealTimerIds.push(scheduler(() => {
      const reel = elements.modalBody.querySelector("[data-side-challenge-reel]");
      const preview = SIDE_CHALLENGE_DEFINITIONS[(SIDE_CHALLENGE_DEFINITIONS.indexOf(definition) + index + 1) % SIDE_CHALLENGE_DEFINITIONS.length];
      if (reel && !runtime.revealConfirmed) reel.innerHTML = `<b>${preview.title}</b><span>抽選中……</span>`;
    }, 120 + index * 120));
  }
  sideChallengeRevealTimerIds.push(scheduler(() => finishSideChallengeReveal(definition), reducedMotion ? 40 : 960));
  return true;
}

function confirmSideChallengeReveal() {
  const runtime = game.round?.sideChallenge;
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.DRAWING || !runtime?.revealReady || runtime.revealConfirmed) return false;
  runtime.revealConfirmed = true;
  clearSideChallengeRevealPresentation();
  game.uiOverlayOpen = false;
  closeModal();
  updateHUD();
  return true;
}

function sideChallengeDefinition() {
  return SIDE_CHALLENGE_DEFINITIONS.find(definition => definition.id === game.round?.sideChallenge?.id) ?? null;
}

function renderSideChallengeStatus() {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  const visible = game.mode === GAME_MODES.EXPERIMENTAL && runtime && definition && game.round?.started;
  elements.sideChallengeStatus.classList.toggle("hidden", !visible);
  if (!visible) { elements.sideChallengeStatus.textContent = ""; return; }
  const status = { ACTIVE: "進行中", SUCCESS: "完成", FAILURE: "失敗" }[runtime.status];
  const reverse = definition.type === "AVOID";
  const tiles = definition.tileIds.map(tileId => {
    const tile = CORE_TILES.find(candidate => candidate.id === tileId);
    const acquired = isOfficiallyDrawn(tileId);
    const stateClass = reverse ? (acquired ? "danger" : "safe") : (acquired ? "complete" : "incomplete");
    const marker = reverse ? (acquired ? "✕" : "✓") : (acquired ? "✓" : "×");
    return `<span class="side-challenge-progress ${stateClass}">${tile?.label ?? tileId} <b>${marker}</b></span>`;
  }).join("");
  elements.sideChallengeStatus.innerHTML = `<header><b>小任務　${definition.title}</b><em>${status}</em></header><div class="side-challenge-progress-list">${tiles}</div>`;
}

function completeSideChallenge(status) {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  if (!runtime || !definition || runtime.status !== "ACTIVE" || !["SUCCESS", "FAILURE"].includes(status)) return false;
  runtime.status = status;
  if (status === "SUCCESS" && !runtime.awarded) {
    runtime.awarded = true;
    game.round.rawPoints += runtime.baseReward;
    game.round.roundScore = game.round.rawPoints;
  }
  if (!runtime.promptShown) {
    runtime.promptShown = true;
    notifyScore(status === "SUCCESS" ? `小任務挑戰完成！${definition.title}` : `小任務挑戰失敗！${definition.title}`, { type: "achievement", duration: 2300 });
  }
  renderSideChallengeStatus();
  updateHUD();
  return true;
}

function evaluateSideChallengeAfterAcquisition(tile) {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  if (game.mode !== GAME_MODES.EXPERIMENTAL || !runtime || runtime.status !== "ACTIVE" || !definition || !tile) return false;
  if (definition.type === "AVOID" && definition.tileIds.includes(tile.id)) return completeSideChallenge("FAILURE");
  if (definition.type === "COLLECT" && definition.tileIds.every(isOfficiallyDrawn)) return completeSideChallenge("SUCCESS");
  return false;
}

function resolveSideChallengeAtRoundEnd() {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  if (game.mode !== GAME_MODES.EXPERIMENTAL || !runtime || runtime.status !== "ACTIVE" || !definition) return false;
  return completeSideChallenge(definition.type === "AVOID" ? "SUCCESS" : "FAILURE");
}

function renderSideChallengeSettlement() {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  if (game.mode !== GAME_MODES.EXPERIMENTAL || !runtime || !definition) return "";
  const multiplier = game.round.finalMultiplier;
  const result = runtime.status === "SUCCESS"
    ? `<strong>+${runtime.baseReward} ×${multiplier} = +${runtime.baseReward * multiplier}</strong>`
    : "<strong>失敗 +0</strong>";
  return `<section class="side-challenge-result"><span>小任務挑戰｜${definition.title}</span>${result}</section>`;
}

function openFreeTicketConfirmation() {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.PRE_ROUND || !hasItem("free-ticket")) return false;
  openModal({
    icon: "免", kicker: "免費券", title: "要使用免費券嗎？",
    body: "<p>使用後，本局不消耗局數。</p>",
    actions: [
      { label: "不用", className: "secondary", action: () => resolveFreeTicketDecision(false) },
      { label: "使用", action: () => resolveFreeTicketDecision(true) }
    ]
  });
  return true;
}

function resolveFreeTicketDecision(useTicket, random = Math.random) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.PRE_ROUND || game.round.committed) return false;
  game.round.preRound.freeTicketDecision = useTicket ? "USE" : "DECLINE";
  closeModal();
  return commitRoundConfiguration(random);
}

function commitRoundConfiguration(randomSource = Math.random) {
  if (game.state !== GAME_STATES.PRE_ROUND || !game.round || game.round.committed) return false;
  const random = typeof randomSource === "function" ? randomSource : Math.random;
  const { eventOptions, eventSelectionType, selectedEventId, selectedLeverage } = game.round.preRound;
  const advancedCategory = game.mode === GAME_MODES.EXPERIMENTAL && eventSelectionType === "CATEGORY";
  const selectedEvent = eventSelectionType === "EVENT" ? eventOptions.find(event => event.id === selectedEventId) : null;
  const selectionValid = eventSelectionType === "SKIP" || (advancedCategory && getAdvancedPreRoundCategory(game.round.preRound.selectedCategoryId)) || (eventSelectionType === "EVENT" && selectedEvent);
  if (!selectionValid) {
    elements.preRoundError.textContent = "請選擇一張場中事件，或明確選擇這局不選事件。";
    return false;
  }
  const leverageValid = game.mode === GAME_MODES.EXPERIMENTAL
    ? [1, 2, 3].includes(selectedLeverage) && itemCount("multiplier-ticket") >= ticketMultiplierCost(selectedLeverage)
    : [1, 2, 3].includes(selectedLeverage) && selectedLeverage <= attemptsRemaining();
  if (!leverageValid) {
    renderPreRound();
    elements.preRoundError.textContent = game.mode === GAME_MODES.EXPERIMENTAL ? "倍率券數量不足，請重新選擇倍率。" : "目前剩餘局數不足，請重新選擇槓桿。";
    return false;
  }
  if (game.mode === GAME_MODES.EXPERIMENTAL && hasItem("free-ticket") && game.round.preRound.freeTicketDecision === null) return openFreeTicketConfirmation();
  game.round.committed = true;
  elements.startRoundButton.disabled = true;
  game.state = GAME_STATES.COMMITTING;
  if (advancedCategory) return commitAdvancedPreRoundCategory(random);
  return continueCommittedRound(selectedEvent, selectedLeverage);
}

function continueCommittedRound(selectedEvent, selectedLeverage) {
  if (game.state !== GAME_STATES.COMMITTING || !game.round?.committed || game.round.config) return false;
  if (selectedEvent?.effectKey === "ROCK_PAPER_SCISSORS") {
    openRockPaperScissors(selectedEvent, selectedLeverage);
    return true;
  }
  if (selectedEvent?.type === "ITEM") {
    if (game.round.itemRevealConfirmed) finalizeRoundConfiguration(selectedEvent, selectedLeverage);
    else beginItemAcquisition(selectedEvent, selectedLeverage);
    return true;
  }
  finalizeRoundConfiguration(selectedEvent, selectedLeverage);
  return true;
}

function specialEventConfig(event = null) {
  return {
    specialMultiplier: event?.multiplier ?? 1,
    formalDrawCount: event?.formalDrawCount ?? RULES.baseFormalDrawCount,
    forcedMiniGameId: event?.forcedMiniGameId ?? null
  };
}

function itemById(itemId) { return ITEM_DEFINITIONS.find(item => item.id === itemId); }

function getFortuneScore() {
  return game.items.reduce((score, itemId) => score + (itemById(itemId)?.fortuneScore ?? 0), 0);
}

function getFortuneModifier(sentiment, score = getFortuneScore()) {
  if (sentiment === "NEUTRAL") return 1;
  const clamped = Math.max(-3, Math.min(3, score));
  return FORTUNE_MODIFIERS[clamped][sentiment] ?? 1;
}

function getEffectiveEventWeight(event) {
  return event.weight * getFortuneModifier(event.sentiment);
}

function drawInRoundEvent(random = Math.random()) {
  return weightedRandom(EVENT_DEFINITIONS.filter(event => event.enabled), random, getEffectiveEventWeight);
}
function hasItem(itemId) { return game.items.includes(itemId); }
function itemCount(itemId) { return game.items.filter(id => id === itemId).length; }
function ticketMultiplierCost(multiplier) { return multiplier === 3 ? 2 : multiplier === 2 ? 1 : 0; }
function consumeItems(itemId, count) {
  if (count < 1) return true;
  if (itemCount(itemId) < count) return false;
  for (let removed = 0; removed < count; removed += 1) game.items.splice(game.items.indexOf(itemId), 1);
  return true;
}

function beginItemAcquisition(event, leverage) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config) return false;
  const randomItems = getRandomItemDefinitions();
  if (!game.round.pendingItemId) game.round.pendingItemId = randomItems[Math.floor(Math.random() * randomItems.length)].id;
  openItemReveal(event, leverage);
  return true;
}

function isAdvancedPreRoundItemSelection() {
  return game.mode === GAME_MODES.EXPERIMENTAL && game.round?.preRound?.categoryCommitted && game.round.preRound.selectedCategoryId === "item";
}

function openItemReveal(event, leverage) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || game.round.itemRevealConfirmed) return false;
  const incoming = itemById(game.round.pendingItemId);
  const isFull = game.items.length >= 3;
  openModal({
    icon: "禮", kicker: isAdvancedPreRoundItemSelection() ? "獲得道具" : "神秘禮物！", title: "你抽到了",
    body: `<article class="item-reveal"><b>${incoming.title}</b><p>${incoming.description}</p></article>`,
    actions: [{ label: isFull ? "選擇替換" : "收下", action: () => isFull ? confirmItemReplacement(event, leverage) : acceptRevealedItem(event, leverage) }]
  });
  return true;
}

function acceptRevealedItem(event, leverage) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || game.round.itemRevealConfirmed || game.items.length >= 3) return false;
  game.round.itemRevealConfirmed = true;
  game.items.push(game.round.pendingItemId);
  notifyScore(`獲得道具：${itemById(game.round.pendingItemId).title}`, { type: "achievement", duration: 2200 });
  return finalizeRoundConfiguration(event, leverage);
}

function confirmItemReplacement(event, leverage) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || game.round.itemRevealConfirmed || game.items.length < 3) return false;
  game.round.itemRevealConfirmed = true;
  openItemReplacement(event, leverage);
  return true;
}

function openItemReplacement(event, leverage) {
  const incoming = itemById(game.round.pendingItemId);
  openModal({ icon: "禮", kicker: isAdvancedPreRoundItemSelection() ? "獲得道具" : "神秘禮物到來", title: `獲得：${incoming.title}`, body: `<p>道具欄已滿，請選擇一個舊道具替換。</p><div class="item-replacement-options">${game.items.map((itemId, index) => { const item = itemById(itemId); return `<button type="button" data-replace-item-index="${index}"><b>${item.title}</b><span>${item.description}</span></button>`; }).join("")}</div>`, actions: [] });
  elements.modalBody.querySelectorAll("[data-replace-item-index]").forEach(button => button.addEventListener("click", () => completeItemReplacement(event, leverage, Number(button.dataset.replaceItemIndex))));
}

function completeItemReplacement(event, leverage, index) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || !game.round.itemRevealConfirmed || index < 0 || index >= game.items.length) return false;
  game.items[index] = game.round.pendingItemId;
  notifyScore(`道具已替換為：${itemById(game.round.pendingItemId).title}`, { type: "achievement", duration: 2200 });
  return finalizeRoundConfiguration(event, leverage);
}

function finalizeRoundConfiguration(event, leverage, specialMultiplierOverride = null) {
  if (game.state !== GAME_STATES.COMMITTING || !game.round?.committed || game.round.config) return false;
  const experimental = game.mode === GAME_MODES.EXPERIMENTAL;
  const multiplierTicketCost = experimental ? ticketMultiplierCost(leverage) : 0;
  const useFreeTicket = experimental && game.round.preRound.freeTicketDecision === "USE";
  if (itemCount("multiplier-ticket") < multiplierTicketCost || (useFreeTicket && !hasItem("free-ticket"))) {
    game.round.committed = false;
    game.state = GAME_STATES.PRE_ROUND;
    if (experimental && game.round.preRound.eventSelectionType === "CATEGORY") {
      game.round.preRound.categoryCommitted = false;
      game.round.preRound.selectedEventId = null;
      game.round.preRound.selectedEvent = null;
      game.round.pendingItemId = null;
      game.round.itemRevealConfirmed = false;
      game.round.rpsResult = null;
    }
    game.uiOverlayOpen = false;
    game.round.preRound.selectedLeverage = itemCount("multiplier-ticket") >= multiplierTicketCost ? leverage : 1;
    if (useFreeTicket && !hasItem("free-ticket")) game.round.preRound.freeTicketDecision = null;
    closeModal();
    renderPreRound();
    elements.preRoundError.textContent = "道具狀態已變更，請重新確認本局設定。";
    return false;
  }
  const special = specialEventConfig(event);
  if (specialMultiplierOverride !== null) special.specialMultiplier = specialMultiplierOverride;
  const finalMultiplier = leverage * special.specialMultiplier;
  const roundOpportunityCost = experimental ? (useFreeTicket ? 0 : 1) : leverage;
  consumeItems("multiplier-ticket", multiplierTicketCost);
  if (useFreeTicket) consumeItems("free-ticket", 1);
  game.round.config = Object.freeze({
    eventId: event?.id ?? null, eventType: event?.type ?? "NONE", leverage, leverageMultiplier: leverage,
    eventConfig: event ? Object.freeze({ ...event }) : null,
    ticketMultiplier: experimental ? leverage : 1, specialMultiplier: special.specialMultiplier, finalMultiplier,
    roundOpportunityCost, freeTicketUsed: useFreeTicket,
    formalDrawCount: special.formalDrawCount,
    activeBetId: event?.type === "BET" ? event.id : null,
    forcedMiniGameId: special.forcedMiniGameId
  });
  const order = shuffle(GAME_TILES);
  game.round.formalDrawCount = special.formalDrawCount;
  game.round.hand = order.slice(0, special.formalDrawCount);
  game.round.remaining = order.slice(special.formalDrawCount);
  game.round.roundMultiplier = leverage;
  game.round.finalMultiplier = finalMultiplier;
  game.round.leverageConfigured = true;
  game.round.started = true;
  game.attemptsConsumed += roundOpportunityCost;
  game.roundsPlayed += 1;
  game.stats.roundsPlayed += 1;
  game.stats.totalRoundCost += roundOpportunityCost;
  game.stats[`multiplier${leverage}Count`] += 1;
  elements.preRoundPanel.classList.add("hidden");
  elements.playArea.classList.remove("hidden");
  renderBoard();
  closeModal();
  game.state = GAME_STATES.DRAWING;
  const sideChallenge = initializeSideChallenge();
  updateHUD();
  if (sideChallenge) openSideChallengeReveal(sideChallenge);
  return true;
}

function openRockPaperScissors(event, leverage, message = "請選擇你的出拳。") {
  const choices = [{ id: "rock", label: "石頭" }, { id: "scissors", label: "剪刀" }, { id: "paper", label: "布" }];
  openModal({ icon: "拳", kicker: "場中特殊・與老闆猜拳", title: "猜拳決勝負", body: `<p>${message}</p><div class="rps-options">${choices.map(choice => `<button type="button" data-rps-choice="${choice.id}">${choice.label}</button>`).join("")}</div>`, actions: [] });
  elements.modalBody.querySelectorAll("[data-rps-choice]").forEach(button => button.addEventListener("click", () => playRockPaperScissors(event, leverage, button.dataset.rpsChoice)));
}

function determineRockPaperScissorsResult(playerChoice, bossChoice) {
  if (playerChoice === bossChoice) return "TIE";
  const won = (playerChoice === "rock" && bossChoice === "scissors") || (playerChoice === "scissors" && bossChoice === "paper") || (playerChoice === "paper" && bossChoice === "rock");
  return won ? "WIN" : "LOSE";
}

function playRockPaperScissors(event, leverage, playerChoice) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || game.round.rpsResult) return false;
  const choices = ["rock", "scissors", "paper"];
  const labels = { rock: "石頭", scissors: "剪刀", paper: "布" };
  if (!choices.includes(playerChoice)) return false;
  const bossChoice = choices[Math.floor(Math.random() * choices.length)];
  const outcome = determineRockPaperScissorsResult(playerChoice, bossChoice);
  game.round.rpsResult = Object.freeze({ playerChoice, bossChoice, outcome });
  const resultText = { WIN: "猜贏了！", LOSE: "猜輸了！", TIE: "平手！" }[outcome];
  const detailText = { WIN: "老闆加碼倍率 ×2！", LOSE: "倍率不變", TIE: "再猜一次！" }[outcome];
  openModal({
    icon: "拳", kicker: "猜拳結果", title: resultText,
    body: `<div class="rps-result rps-result-${outcome.toLowerCase()}"><div><small>玩家</small><b>${labels[playerChoice]}</b></div><strong>VS</strong><div><small>老闆</small><b>${labels[bossChoice]}</b></div><p>${detailText}</p></div>`,
    actions: [{ label: outcome === "TIE" ? "再猜一次" : "進入牌局", action: () => completeRockPaperScissorsPresentation(event, leverage) }]
  });
  return game.round.rpsResult;
}

function completeRockPaperScissorsPresentation(event, leverage) {
  if (game.state !== GAME_STATES.COMMITTING || game.round.config || !game.round.rpsResult) return false;
  const result = game.round.rpsResult;
  if (result.outcome === "TIE") {
    game.round.rpsResult = null;
    openRockPaperScissors(event, leverage, "平手，再猜一次！");
    return true;
  }
  return finalizeRoundConfiguration(event, leverage, result.outcome === "WIN" ? 2 : 1);
}

function attemptsRemaining() { return Math.max(0, game.totalAttemptsGranted - game.attemptsConsumed); }
function grantAttempts(requested) {
  const granted = Math.max(0, Math.min(requested, RULES.maxAttempts - attemptsRemaining()));
  game.totalAttemptsGranted += granted;
  return granted;
}
function betPenalty(bet) { return Math.abs(Number(bet.penalty) || 0); }
function attemptDisplay() {
  const duringRound = game.round?.started && ![GAME_STATES.ROUND_END, GAME_STATES.GAME_OVER].includes(game.state);
  const numerator = duringRound ? game.round.attemptStart + 1 : Math.min(game.attemptsConsumed + 1, game.totalAttemptsGranted);
  return `${numerator} / ${game.totalAttemptsGranted}`;
}

function renderRoundStatusContent() {
  const lines = game.round?.roundLines ?? 0;
  const waiting = game.round?.activeWaiting.size ?? 0;
  const started = Boolean(game.round?.started);
  const achievements = game.round?.achievements ?? new Set();
  return `<div class="round-status-summary"><p><small>完成連線</small><strong>${lines}</strong></p><p><small>聽牌</small><strong>${game.round?.everWaited ? "已達成" : waiting ? `目前 ${waiting} 聽` : started ? "尚未達成" : "尚未開始"}</strong></p></div><div class="progress-list">${renderProgress()}</div><div class="special-progress"><span>天聽 <b>${achievements.has("early-waiting") ? "✓" : "—"}</b></span><span>海底撈月 <b>${achievements.has("last-tile-first-line") ? "✓" : "—"}</b></span></div>`;
}

function currentRoundStatusText() {
  if (game.round?.config?.eventType === "NONE") return "本局未選擇場中事件";
  const event = game.round?.config?.eventConfig ?? PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === game.round?.config?.eventId);
  if (!event) return "尚未開始本局。";
  if (event.type === "BET") return `${event.title}下注中`;
  if (event.id === "boss-boost" || event.id === "boss-leverage") return `${event.title}，本局 ×${game.round.config.finalMultiplier}`;
  if (event.id === "rock-paper-scissors") return `與老闆猜拳已分勝負，本局 ×${game.round.config.finalMultiplier}`;
  return event.title;
}

function renderSideChallengeDetail() {
  const runtime = game.round?.sideChallenge;
  const definition = sideChallengeDefinition();
  if (game.mode !== GAME_MODES.EXPERIMENTAL || !runtime || !definition) return "";
  const status = { ACTIVE: "進行中", SUCCESS: "完成", FAILURE: "失敗" }[runtime.status];
  return `<section class="side-challenge-detail"><h3>本局小任務挑戰</h3><b>${definition.title}</b><p>${definition.description}</p><strong>${status}</strong></section>`;
}

function canUsePocketItem(item) {
  return Boolean(item?.targetTileId) && game.state === GAME_STATES.DRAWING && !game.busy && !isOfficiallyDrawn(item.targetTileId);
}

function canAttemptPocketItemUse(item) {
  return canUsePocketItem(item);
}

function renderInventorySlots({ readOnly = false } = {}) {
  return Array.from({ length: 3 }, (_, index) => {
    const item = itemById(game.items[index]);
    if (!item) return `<article class="item-slot empty"><b>空道具格</b><span>尚未取得道具</span></article>`;
    const pocketAction = !readOnly && item.type === "ACTIVE" ? `<button type="button" data-use-item-index="${index}" ${canAttemptPocketItemUse(item) ? "" : "disabled"}>使用</button>` : "";
    const selfSelectAction = !readOnly && item.id === "self-select-ticket" && game.mode === GAME_MODES.EXPERIMENTAL
      ? `<button type="button" data-use-self-select-index="${index}" ${canUseSelfSelectTicket() ? "" : "disabled"}>使用</button>` : "";
    const action = pocketAction || selfSelectAction;
    return `<article class="item-slot"><b>${item.icon ? `${item.icon} ` : ""}${item.title}</b><span>${item.description}</span>${action}</article>`;
  }).join("");
}

function openPreRoundInventory() {
  if (game.state !== GAME_STATES.PRE_ROUND || game.busy || game.uiOverlayOpen) return false;
  game.uiOverlayOpen = true;
  const count = `${game.items.length}/3${game.items.length >= 3 ? "・已滿" : ""}`;
  openModal({ icon: "具", kicker: "INVENTORY", title: `目前道具 ${count}`, body: `<div class="item-status pre-round-inventory"><section><div class="item-slots">${renderInventorySlots({ readOnly: true })}</div></section><small>開局準備期間僅供查看，道具請於指定流程使用。</small></div>`, actions: [{ label: "關閉", action: closeItemStatus }] });
  return true;
}

function openItemStatus() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  const slots = renderInventorySlots();
  openModal({ icon: "具", kicker: "ITEM / STATUS", title: "道具 / 狀態", body: `<div class="item-status"><section><h3>目前道具</h3><div class="item-slots">${slots}</div></section>${renderSideChallengeDetail()}<section><h3>目前狀態</h3><p>${currentRoundStatusText()}</p></section><small>點一下右側「已抽牌型」即可查看牌型</small></div>`, actions: [{ label: "關閉", action: closeItemStatus }] });
  elements.modalBody.querySelectorAll("[data-use-item-index]").forEach(button => button.addEventListener("click", () => beginPocketItemUse(Number(button.dataset.useItemIndex))));
  elements.modalBody.querySelectorAll("[data-use-self-select-index]").forEach(button => button.addEventListener("click", () => beginSelfSelectTicketDraw(Number(button.dataset.useSelfSelectIndex))));
}

function closeItemStatus() { game.uiOverlayOpen = false; closeModal(); }

function beginPocketItemUse(index) {
  const item = itemById(game.items[index]);
  if (!item?.targetTileId || !canAttemptPocketItemUse(item)) return false;
  return completePocketItemUse(index);
}

function completePocketItemUse(index) {
  const item = itemById(game.items[index]);
  if (!item?.targetTileId || !canUsePocketItem(item)) return false;
  const targetTileId = item.targetTileId;
  const target = CORE_TILES.find(tile => tile.id === targetTileId);
  if (!target) return false;
  const fullOrder = [...game.round.hand, ...game.round.remaining].filter(tile => tile.id !== targetTileId);
  game.round.hand = fullOrder.slice(0, game.round.formalDrawCount);
  game.round.remaining = fullOrder.slice(game.round.formalDrawCount);
  game.round.discarded.delete(targetTileId);
  game.round.drawn.add(targetTileId);
  game.items.splice(index, 1);
  game.round.activeItemUses += 1;
  closeItemStatus();
  applyOfficialTileEffects(target);
  updateHUD();
  notifyScore(`${item.title}已使用，取得${target.label}`, { type: "achievement", duration: 1800 });
  return true;
}

function renderTileOverview() {
  const groups = [
    ["萬子", CORE_TILES.filter(tile => tile.suit === "wan")],
    ["筒子", CORE_TILES.filter(tile => tile.suit === "tong")],
    ["條子", CORE_TILES.filter(tile => tile.suit === "suo")],
    ["字牌", CORE_TILES.filter(tile => tile.group)]
  ];
  elements.tileOverviewGrid.innerHTML = `<section class="mini-board-overview">${renderMiniBoardOverview()}</section><div class="ordinary-tile-overview">${groups.map(([title, tiles]) => `<section><h3>${title}</h3><div>${tiles.map(tile => `<span class="overview-tile${isOfficiallyDrawn(tile.id) ? " acquired" : ""}" aria-label="${tile.label}${isOfficiallyDrawn(tile.id) ? "，已取得" : "，未取得"}">${tile.glyph}</span>`).join("")}</div></section>`).join("")}</div>`;
}

function miniBoardTileStateClass(tile, index) {
  const lineClasses = LINE_DEFINITIONS.filter(line => line.indexes.includes(index)).map(line => game.round.completedLines.has(line.id) ? "mini-line-completed" : game.round.activeWaiting.has(line.id) ? "mini-line-waiting" : "").filter(Boolean);
  return `${boardTileStateClass(tile)} ${lineClasses.join(" ")}`.trim();
}

function renderMiniBoardOverview() {
  const cells = game.round.board.map((tile, index) => {
    const stateClass = miniBoardTileStateClass(tile, index);
    const stateLabel = stateClass.includes("tile-discarded") ? "已丟掉" : stateClass.includes("tile-acquired") ? "已取得" : "尚未取得";
    return `<span class="${tileClass(tile, "mini-board-tile")} ${stateClass}" aria-label="${tile.label}，${stateLabel}" aria-rowindex="${Math.floor(index / 6) + 1}" aria-colindex="${index % 6 + 1}">${tileContent(tile)}</span>`;
  }).join("");
  return `<div class="mini-board-grid" role="grid" aria-label="目前棋盤縮圖">${cells}</div>`;
}

function showTileOverview() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  openTileOverview();
}

function openTileOverview() {
  renderTileOverview();
  const fromPicker = Boolean(game.round?.tilePicker);
  const overviewTitle = elements.tileOverviewOverlay.querySelector("#tile-overview-title");
  if (overviewTitle) overviewTitle.textContent = fromPicker ? "查看牌型" : "已抽牌型";
  elements.tileOverviewClose.textContent = fromPicker ? "返回選牌" : "關閉";
  game.uiOverlayOpen = true;
  elements.tileOverviewOverlay.classList.add("open");
  elements.tileOverviewOverlay.setAttribute("aria-hidden", "false");
  updateHUD();
  elements.tileOverviewClose.focus();
}

function hideTileOverview() {
  const wasOpen = elements.tileOverviewOverlay.classList.contains("open");
  elements.tileOverviewOverlay.classList.remove("open");
  elements.tileOverviewOverlay.setAttribute("aria-hidden", "true");
  if (wasOpen) {
    if (game.round?.tilePicker) return renderTilePicker();
    game.uiOverlayOpen = false;
    updateHUD();
    elements.tilePeekButton.focus();
  }
}

function openTilePicker({ title, message, tiles, confirmText, allowOverview = true, allowCancel = false, onConfirm, onCancel = null }) {
  if (!game.round || !Array.isArray(tiles)) return false;
  game.round.tilePicker = {
    title, message, tiles: tiles.map(tile => tile.id), confirmText, allowOverview, allowCancel,
    selectedTileId: null, confirming: false, onConfirm, onCancel
  };
  game.uiOverlayOpen = true;
  renderTilePicker();
  return true;
}

function renderTilePicker() {
  const picker = game.round?.tilePicker;
  if (!picker) return false;
  const candidates = picker.tiles.map(id => GAME_TILES.find(tile => tile.id === id)).filter(Boolean);
  const selected = candidates.find(tile => tile.id === picker.selectedTileId);
  const actions = [];
  if (picker.allowOverview) actions.push({ label: "查看牌型", className: "secondary", action: showTilePickerOverview });
  if (picker.allowCancel) actions.push({ label: "取消", className: "secondary", action: cancelTilePicker });
  actions.push({ label: picker.confirmText, disabled: !selected || picker.confirming, action: confirmTilePicker });
  openModal({
    icon: "🀄", kicker: "", title: picker.title,
    body: `<div class="shared-tile-picker"><p>${picker.message}</p><div class="tile-picker-grid">${candidates.map(tile => `<button type="button" class="hand-tile revealed${tile.id === picker.selectedTileId ? " selected" : ""}" data-picker-tile-id="${tile.id}" aria-pressed="${tile.id === picker.selectedTileId}" aria-label="${tile.label}">${tileContent(tile)}</button>`).join("")}</div><p class="tile-picker-selection">目前選擇：<strong>${selected?.label ?? "尚未選擇"}</strong></p></div>`,
    actions
  });
  elements.modalBody.querySelectorAll("[data-picker-tile-id]").forEach(button => button.addEventListener("click", () => selectTilePickerTile(button.dataset.pickerTileId)));
  return true;
}

function selectTilePickerTile(tileId) {
  const picker = game.round?.tilePicker;
  if (!picker || picker.confirming || !picker.tiles.includes(tileId)) return false;
  picker.selectedTileId = tileId;
  renderTilePicker();
  return true;
}

async function confirmTilePicker() {
  const picker = game.round?.tilePicker;
  if (!picker || picker.confirming || !picker.selectedTileId || !picker.tiles.includes(picker.selectedTileId)) return false;
  picker.confirming = true;
  const confirmed = await picker.onConfirm?.(picker.selectedTileId);
  if (game.round?.tilePicker === picker && !confirmed) {
    picker.confirming = false;
    renderTilePicker();
  }
  return confirmed;
}

function cancelTilePicker() {
  const picker = game.round?.tilePicker;
  if (!picker?.allowCancel || picker.confirming) return false;
  const onCancel = picker.onCancel;
  closeTilePicker();
  onCancel?.();
  return true;
}

function closeTilePicker() {
  if (game.round) game.round.tilePicker = null;
  game.uiOverlayOpen = false;
  closeModal();
}

function showTilePickerOverview() {
  if (!game.round?.tilePicker) return false;
  openTileOverview();
  return true;
}

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

function getAvailableMiniGames() {
  return Object.values(MINIGAME_DEFINITIONS).filter(definition => definition.enabled);
}

function selectMiniGameForRound(random = Math.random) {
  const forced = MINIGAME_DEFINITIONS[game.round.config?.forcedMiniGameId];
  if (forced?.enabled) return forced;
  const available = getAvailableMiniGames();
  return available[Math.floor(random() * available.length)] ?? null;
}

function canUseSelfSelectTicket() {
  return game.mode === GAME_MODES.EXPERIMENTAL && game.state === GAME_STATES.DRAWING && game.round?.committed && !game.busy && getRemainingFormalTiles({ includeSpecial: true }).length > 0;
}

function beginSelfSelectTicketDraw(index) {
  if (!canUseSelfSelectTicket() || game.items[index] !== "self-select-ticket") return false;
  const candidates = sortFormalTilesForPicker(getRemainingFormalTiles({ includeSpecial: true }));
  if (!candidates.length) return false;
  game.items.splice(index, 1);
  game.state = GAME_STATES.SELF_SELECT_DRAW;
  closeItemStatus();
  updateHUD();
  return openTilePicker({
    title: "使用自選券", message: "選一張牌取代本次普通摸牌", tiles: candidates,
    confirmText: "決定", allowOverview: true, allowCancel: false,
    onConfirm: confirmSelfSelectTicketDraw
  });
}

async function confirmSelfSelectTicketDraw(tileId) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.SELF_SELECT_DRAW) return false;
  const selected = getRemainingFormalTiles({ includeSpecial: true }).find(tile => tile.id === tileId);
  if (!selected || !placeTileAtNextFormalDraw(selected.id)) return false;
  closeTilePicker();
  game.state = GAME_STATES.DRAWING;
  return acquireFormalTile(selected, { suppressEvent: true });
}

function selectInterRoundMiniGame(random = Math.random) {
  const available = getAvailableMiniGames();
  return available[Math.floor(random() * available.length)] ?? null;
}

function getRemainingFormalTiles({ includeSpecial = false } = {}) {
  return [...game.round.hand.slice(game.round.drawIndex), ...game.round.remaining]
    .filter(tile => (includeSpecial || !tile.special) && !isOfficiallyDrawn(tile.id));
}

function selectRandomRemainingTile(remainingTiles, random = Math.random) {
  return remainingTiles[Math.floor(random() * remainingTiles.length)] ?? null;
}

function placeTileAtNextFormalDraw(tileId) {
  const index = game.round.drawIndex;
  const selectedIndex = game.round.hand.findIndex((tile, candidateIndex) => candidateIndex >= index && tile.id === tileId);
  if (selectedIndex >= 0) {
    [game.round.hand[index], game.round.hand[selectedIndex]] = [game.round.hand[selectedIndex], game.round.hand[index]];
    return game.round.hand[index];
  }
  const remainingIndex = game.round.remaining.findIndex(tile => tile.id === tileId);
  if (remainingIndex < 0) return null;
  const displaced = game.round.hand[index];
  game.round.hand[index] = game.round.remaining[remainingIndex];
  game.round.remaining[remainingIndex] = displaced;
  return game.round.hand[index];
}

function shouldOfferMiniGame() {
  return game.mode === GAME_MODES.PRODUCTION && game.state === GAME_STATES.DRAWING && game.round.drawIndex === 12 && !game.round.miniGame.offered && !game.round.miniGame.completed;
}

function openMiniGameOffer() {
  if (!shouldOfferMiniGame()) return false;
  const definition = selectMiniGameForRound();
  if (!definition) return false;
  game.round.miniGame.offered = true;
  game.round.miniGame.selectedId = definition.id;
  game.state = GAME_STATES.MINIGAME_OFFER;
  openModal({
    icon: "🎮", kicker: "小遊戲Time", title: "決定自己命運的機會！",
    body: `<article class="minigame-offer"><h3>${definition.name}</h3></article>`,
    actions: [
      { label: "進入", action: startMiniGame },
      { label: "直接摸牌", className: "secondary", action: directDrawMiniGameTile }
    ]
  });
  return true;
}

function startMiniGame() {
  if (game.state !== GAME_STATES.MINIGAME_OFFER || game.round.miniGame.completed || game.round.miniGame.challengeResolved) return false;
  const definition = MINIGAME_DEFINITIONS[game.round.miniGame.selectedId];
  if (!definition?.enabled) return directDrawMiniGameTile();
  game.state = GAME_STATES.MINIGAME_ACTIVE;
  return launchMiniGame(definition);
}

function sortFormalTilesForPicker(tiles) {
  const order = new Map(GAME_TILES.map((tile, index) => [tile.id, index]));
  return [...tiles].sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

function launchMiniGame(definition) {
  if (definition.implementation === "MEMORY_MASTER") return startMemoryMaster();
  if (definition.implementation === "PAJUR") return startPaJuR();
  if (definition.implementation === "BASEBALL9") return startBaseball9();
  openModal({
    icon: "🎮", kicker: "", title: definition.name,
    body: `<article class="minigame-placeholder"><p>小遊戲施工中！</p><span>這次先模擬挑戰結果。</span></article>`,
    actions: [{ label: "開始模擬挑戰", action: () => resolveMiniGameChallenge(runMiniGamePlaceholder()) }]
  });
  return true;
}

function startMemoryMaster(random = Math.random) {
  if (!isMiniGameChallengeState() || game.round.miniGame.memory) return false;
  openModal({ icon: "🧠", kicker: "", title: "記憶大師", body: '<div class="memory-master-host" data-memory-master-root></div>', actions: [] });
  const container = elements.modalBody.querySelector("[data-memory-master-root]");
  const controller = MemoryMaster.start({
    container,
    random,
    onComplete(result) {
      if (game.round?.miniGame.memory !== controller) return;
      game.round.miniGame.memory = null;
      resolveMiniGameChallenge(result);
    }
  });
  game.round.miniGame.memory = controller;
  elements.modalKicker.textContent = controller.round.language === "zh" ? `本次主題：${controller.round.themeName}` : `Theme: ${controller.round.themeName}`;
  return true;
}

function clearMemoryMasterState() {
  const controller = game.round?.miniGame.memory;
  if (!controller) return;
  controller.destroy();
  game.round.miniGame.memory = null;
}

function startPaJuR(random = Math.random) {
  if (!isMiniGameChallengeState() || game.round.miniGame.pajur) return false;
  openModal({ icon: "🎯", kicker: "", title: "彈珠台", body: '<div class="pajur-host" data-pajur-root></div>', actions: [] });
  const container = elements.modalBody.querySelector("[data-pajur-root]");
  const controller = PaJuR.start({
    container,
    random,
    onComplete(result) {
      if (game.round?.miniGame.pajur !== controller) return;
      controller.destroy();
      game.round.miniGame.pajur = null;
      resolveMiniGameChallenge(result);
    }
  });
  game.round.miniGame.pajur = controller;
  return true;
}

function clearPaJuRState() {
  const controller = game.round?.miniGame.pajur;
  if (!controller) return;
  controller.destroy();
  game.round.miniGame.pajur = null;
}

function startBaseball9(random = Math.random) {
  if (!isMiniGameChallengeState() || game.round.miniGame.baseball9) return false;
  openModal({ icon: "⚾", kicker: "", title: "棒球九宮格", body: '<div class="baseball9-host" data-baseball9-root></div>', actions: [] });
  const container = elements.modalBody.querySelector("[data-baseball9-root]");
  const controller = Baseball9.start({
    container,
    random,
    onComplete(result) {
      if (game.round?.miniGame.baseball9 !== controller) return;
      controller.destroy();
      game.round.miniGame.baseball9 = null;
      resolveMiniGameChallenge(result);
    }
  });
  game.round.miniGame.baseball9 = controller;
  return true;
}

function clearBaseball9State() {
  const controller = game.round?.miniGame.baseball9;
  if (!controller) return;
  controller.destroy();
  game.round.miniGame.baseball9 = null;
}

function runMiniGamePlaceholder(random = Math.random) {
  return { success: random() < 0.5 };
}

function directDrawMiniGameTile() {
  if (game.state !== GAME_STATES.MINIGAME_OFFER || game.round.miniGame.completed || game.round.miniGame.challengeResolved) return false;
  game.round.miniGame.challengeResolved = true;
  game.round.miniGame.challengeResult = "DIRECT";
  return completeRandomMiniGameDraw();
}

function resolveMiniGameChallenge(result) {
  if (!isMiniGameChallengeState() || game.round.miniGame.completed || game.round.miniGame.challengeResolved || typeof result?.success !== "boolean") return false;
  game.round.miniGame.challengeResolved = true;
  game.round.miniGame.challengeResult = result.success ? "SUCCESS" : "FAILURE";
  if (game.round.miniGame.interRound) return completeInterRoundMiniGame(result);
  if (!result.success) {
    openModal({
      icon: "🎮", kicker: "", title: "挑戰失敗",
      body: "<p>很可惜，這次沒有獲得自選牌的機會。</p>",
      actions: [{ label: "摸牌", action: completeFailureMiniGameDraw }]
    });
    return true;
  }
  notifyScore("挑戰成功！選一張你想要的牌", { type: "achievement", duration: 1800 });
  return openMiniGameRewardPicker();
}

function openInterRoundMiniGameInvitation(random = Math.random) {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.ROUND_END || attemptsRemaining() <= 0) return false;
  if (typeof random !== "function") random = Math.random;
  clearMiniGameLifecycle();
  const definition = selectInterRoundMiniGame(random);
  if (!definition) return startRound();
  game.round.miniGame = createMiniGameState({ interRound: true });
  game.round.miniGame.offered = true;
  game.round.miniGame.selectedId = definition.id;
  game.state = GAME_STATES.INTER_ROUND_INVITATION;
  game.stats.miniGameInvitationCount += 1;
  openModal({
    icon: "🎮", kicker: "參加小遊戲 好禮等著你", title: `這次的遊戲是：${definition.name}`,
    body: "<p>挑戰成功即可選擇一張獎勵券。</p>",
    actions: [{ label: "跳過", className: "secondary", action: skipInterRoundMiniGame }, { label: "參加", action: startInterRoundMiniGame }]
  });
  return true;
}

function startInterRoundMiniGame() {
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.INTER_ROUND_INVITATION || !game.round?.miniGame?.interRound) return false;
  const definition = MINIGAME_DEFINITIONS[game.round.miniGame.selectedId];
  if (!definition?.enabled) return skipInterRoundMiniGame();
  game.stats.miniGameParticipatedCount += 1;
  game.state = GAME_STATES.INTER_ROUND_MINIGAME;
  return launchMiniGame(definition);
}

function skipInterRoundMiniGame() {
  const miniGame = game.round?.miniGame;
  if (game.mode !== GAME_MODES.EXPERIMENTAL || game.state !== GAME_STATES.INTER_ROUND_INVITATION || !miniGame?.interRound || miniGame.completed) return false;
  miniGame.completed = true;
  game.stats.miniGameSkipCount += 1;
  closeModal();
  startRound();
  return true;
}

function completeInterRoundMiniGame(result) {
  const miniGame = game.round?.miniGame;
  if (game.state !== GAME_STATES.INTER_ROUND_MINIGAME || !miniGame?.interRound || miniGame.completed) return false;
  miniGame.completed = true;
  game.interRoundMiniGameResults.push({ id: miniGame.selectedId, success: result.success });
  game.stats[result.success ? "miniGameSuccessCount" : "miniGameFailureCount"] += 1;
  if (result.success && Object.hasOwn(game.stats.miniGameSuccessById, miniGame.selectedId)) game.stats.miniGameSuccessById[miniGame.selectedId] += 1;
  clearMiniGameLifecycle();
  if (result.success) return openInterRoundRewardSelection();
  closeModal();
  startRound();
  return true;
}

function openInterRoundRewardSelection() {
  if (game.mode !== GAME_MODES.EXPERIMENTAL) return false;
  const tickets = getTicketDefinitions();
  game.state = GAME_STATES.INTER_ROUND_REWARD;
  openModal({
    icon: "🎟️", kicker: "小遊戲成功！", title: "選擇一張獎勵券",
    body: `<div class="ticket-reward-options">${tickets.map(item => `<button type="button" data-ticket-reward-id="${item.id}"><b class="ticket-icon">${item.icon}</b><strong>${item.title}</strong><span>${item.description}</span></button>`).join("")}</div>`,
    actions: []
  });
  elements.modalBody.querySelectorAll("[data-ticket-reward-id]").forEach(button => button.addEventListener("click", () => selectInterRoundReward(button.dataset.ticketRewardId)));
  return true;
}

function selectInterRoundReward(itemId) {
  if (game.state !== GAME_STATES.INTER_ROUND_REWARD) return false;
  const ticket = getTicketDefinitions().find(item => item.id === itemId);
  if (!ticket) return false;
  if (game.items.length < 3) {
    game.state = GAME_STATES.INTER_ROUND_REWARD_REPLACEMENT;
    game.items.push(ticket.id);
    updateHUD();
    notifyScore(`獲得道具：${ticket.title}`, { type: "achievement", duration: 1800 });
    startRound();
    return true;
  }
  game.pendingInterRoundRewardId = ticket.id;
  game.state = GAME_STATES.INTER_ROUND_REWARD_REPLACEMENT;
  openInterRoundRewardReplacement();
  return true;
}

function openInterRoundRewardReplacement() {
  const incoming = itemById(game.pendingInterRoundRewardId);
  if (!incoming || game.state !== GAME_STATES.INTER_ROUND_REWARD_REPLACEMENT) return false;
  openModal({ icon: incoming.icon, kicker: "道具欄已滿", title: `獲得：${incoming.title}`, body: `<p>請選擇一個舊道具替換。</p><div class="item-replacement-options">${game.items.map((itemId, index) => { const item = itemById(itemId); return `<button type="button" data-ticket-replace-index="${index}"><b>${item.title}</b><span>${item.description}</span></button>`; }).join("")}</div>`, actions: [] });
  elements.modalBody.querySelectorAll("[data-ticket-replace-index]").forEach(button => button.addEventListener("click", () => completeInterRoundRewardReplacement(Number(button.dataset.ticketReplaceIndex))));
  return true;
}

function completeInterRoundRewardReplacement(index) {
  if (game.state !== GAME_STATES.INTER_ROUND_REWARD_REPLACEMENT || !game.pendingInterRoundRewardId || index < 0 || index >= game.items.length) return false;
  const ticket = itemById(game.pendingInterRoundRewardId);
  game.items[index] = ticket.id;
  game.pendingInterRoundRewardId = null;
  updateHUD();
  notifyScore(`道具已替換為：${ticket.title}`, { type: "achievement", duration: 1800 });
  startRound();
  return true;
}

function completeFailureMiniGameDraw() {
  const miniGame = game.round?.miniGame;
  if (game.state !== GAME_STATES.MINIGAME_ACTIVE || miniGame?.challengeResult !== "FAILURE" || miniGame.completed || miniGame.failureDrawStarted) return false;
  miniGame.failureDrawStarted = true;
  return completeRandomMiniGameDraw();
}

function completeRandomMiniGameDraw() {
  const legalTiles = getRemainingFormalTiles();
  const selected = selectRandomRemainingTile(legalTiles) ?? nextFormalTile();
  if (!selected || !placeTileAtNextFormalDraw(selected.id)) return false;
  return completeMiniGameFormalDraw(selected);
}

function openMiniGameRewardPicker() {
  if (game.state !== GAME_STATES.MINIGAME_ACTIVE || game.round.miniGame.challengeResult !== "SUCCESS" || game.round.miniGame.completed) return false;
  const candidates = sortFormalTilesForPicker(getRemainingFormalTiles({ includeSpecial: true }));
  if (!candidates.length) {
    console.warn("Mini-game reward has no legal tile candidates; using safe normal draw recovery.");
    return completeRandomMiniGameDraw();
  }
  game.state = GAME_STATES.MINIGAME_REWARD;
  openTilePicker({
    title: "挑戰成功！", message: "選一張你想要的牌", tiles: candidates,
    confirmText: "決定", allowOverview: true, allowCancel: false,
    onConfirm: confirmMiniGameReward
  });
  return true;
}

async function confirmMiniGameReward(tileId) {
  if (game.state !== GAME_STATES.MINIGAME_REWARD || game.round.miniGame.completed) return false;
  const selected = getRemainingFormalTiles({ includeSpecial: true }).find(tile => tile.id === tileId);
  if (!selected) {
    const candidates = sortFormalTilesForPicker(getRemainingFormalTiles({ includeSpecial: true }));
    if (!candidates.length) {
      console.warn("Mini-game reward selection became empty; using safe normal draw recovery.");
      closeTilePicker();
      return completeRandomMiniGameDraw();
    }
    game.round.tilePicker.tiles = candidates.map(tile => tile.id);
    game.round.tilePicker.selectedTileId = null;
    game.round.tilePicker.message = "原選擇已不可用，請重新選擇。";
    renderTilePicker();
    return false;
  }
  if (!placeTileAtNextFormalDraw(selected.id)) return false;
  closeTilePicker();
  return completeMiniGameFormalDraw(selected, { suppressEvent: true });
}

async function completeMiniGameFormalDraw(selected, acquireOptions = {}) {
  if (game.round.miniGame.completed) return false;
  game.round.miniGame.completed = true;
  game.state = GAME_STATES.DRAWING;
  closeModal();
  await acquireFormalTile(selected, acquireOptions);
  return selected.id;
}

function clearMiniGameLifecycle() {
  clearSideChallengeRevealPresentation();
  if (!game.round?.miniGame) return;
  clearMemoryMasterState();
  clearPaJuRState();
  clearBaseball9State();
  game.round.tilePicker = null;
  if ([GAME_STATES.MINIGAME_OFFER, GAME_STATES.MINIGAME_ACTIVE, GAME_STATES.MINIGAME_REWARD, GAME_STATES.INTER_ROUND_INVITATION, GAME_STATES.INTER_ROUND_MINIGAME].includes(game.state)) game.round.miniGame.completed = true;
}

async function drawTile() {
  if (game.state !== GAME_STATES.DRAWING || !game.round?.committed || game.busy || game.uiOverlayOpen) return;
  if (shouldOfferMiniGame()) return openMiniGameOffer();
  const tile = nextFormalTile();
  if (!tile || elements.drawStack.disabled) return;
  return acquireFormalTile(tile);
}

async function acquireFormalTile(tile, { suppressEvent = false } = {}) {
  if (game.state !== GAME_STATES.DRAWING || !tile || game.busy) return false;
  game.busy = true;
  game.round.drawn.add(tile.id);
  await animateStackTile(tile);
  game.round.drawIndex += 1;
  game.round.lastAcquiredTileId = tile.id;
  applyOfficialTileEffects(tile);
  game.busy = false;
  updateHUD();
  elements.message.textContent = "";
  if (tile.special && !suppressEvent) return openEventChoice(tile);
  continueAfterDraw();
  return true;
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

function applyOfficialTileEffects(tile) {
  markBoard(tile);
  scoreLines();
  scoreCollections();
  updateWaitingLines();
  evaluateSideChallengeAfterAcquisition(tile);
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
    addRoundPoints(points, { key: "line", label: "連線" });
    const label = ordinal === 1 ? "連線成功！" : ordinal === 2 ? "雙線！" : "三線以上！";
    notifyScore(`${label} +${points} 分`);
    flashLine(line, "line-flash");
    if (ordinal === 1 && game.round.drawIndex === game.round.formalDrawCount) {
      awardOnce("last-tile-first-line", SCORE_CONFIG.special.lastTileFirstLine, "海底撈月！");
      game.round.lastTileCelebrationPending = true;
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
  const breakdownLabel = ({ "wan-5": "萬子 5 張", "wan-7": "萬子 7 張", "wan-9": "萬子 9 張", "tong-5": "筒子 5 張", "tong-7": "筒子 7 張", "tong-9": "筒子 9 張", "suo-5": "條子 5 張", "suo-7": "條子 7 張", "suo-9": "條子 9 張", winds: "四風", dragons: "三元牌", "early-waiting": "天聽", "last-tile-first-line": "海底撈月" })[id] ?? label.replace(/[！!]/g, "");
  addRoundPoints(points, { key: `achievement:${id}`, label: breakdownLabel });
  const message = `${label} +${points} 分`;
  notifyScore(message, { type: "achievement", duration: 2500 });
}

function addRoundScoreBreakdown({ key, label, points, affectedByMultiplier = true }) {
  if (!game.round || !points) return;
  const existing = game.round.scoreBreakdown.find(item => item.key === key && item.affectedByMultiplier === affectedByMultiplier);
  if (existing) {
    existing.count += 1;
    existing.points += points;
    return;
  }
  game.round.scoreBreakdown.push({ key, label, count: 1, points, affectedByMultiplier });
}

function addRoundPoints(points, source = null) {
  game.round.rawPoints += points;
  game.round.roundScore = game.round.rawPoints;
  if (source) addRoundScoreBreakdown({ ...source, points, affectedByMultiplier: true });
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
    return true;
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
    game.round.everWaitingLines.add(line.id);
    flashLine(line, "waiting");
  });
  if (newlyWaiting.length) {
    game.round.everWaited = true;
    game.round.waitingAnnouncements += newlyWaiting.length;
    game.stats.waitingCount += newlyWaiting.length;
    const label = newlyWaiting.length === 1 ? "聽牌！" : newlyWaiting.length === 2 ? "雙聽！" : `聽牌 ×${newlyWaiting.length}`;
    notifyScore(label, true);
    if (hasItem("chance-maker") && !game.round.chanceMakerTriggered) {
      game.round.chanceMakerTriggered = true;
      addRoundPoints(5, { key: "chance-maker", label: "嗆司Maker" });
      notifyScore("嗆司Maker！第一次聽牌 +5 分", { type: "achievement", duration: 2200 });
    }
  }
}

function flashLine(line, className) {
  line.indexes.forEach(index => elements.board.children[index]?.classList.add(className));
  if (className === "line-flash") setTimeout(() => line.indexes.forEach(index => elements.board.children[index]?.classList.remove(className)), 750);
  if (className === "waiting") setTimeout(() => line.indexes.forEach(index => elements.board.children[index]?.classList.remove(className)), 1850);
}

function continueAfterDraw() {
  if (game.state !== GAME_STATES.DRAWING) return;
  if (game.round.lastTileCelebrationPending && !game.round.lastTileCelebrationPlayed) return playLastTileCelebration();
  if (game.round.drawIndex === game.round.formalDrawCount) setTimeout(finishRegularDraws, 250);
}

function createMiniGameState({ interRound = false } = {}) {
  return { offered: false, completed: false, selectedId: null, challengeResult: null, challengeResolved: false, failureDrawStarted: false, interRound, memory: null, pajur: null, baseball9: null };
}

function playLastTileCelebration(onComplete = continueAfterDraw) {
  if (!game.round?.lastTileCelebrationPending || game.round.lastTileCelebrationPlayed) return false;
  game.round.lastTileCelebrationPending = false;
  game.round.lastTileCelebrationPlayed = true;
  game.busy = true;
  const tile = elements.board.querySelector(`[data-tile-id="${game.round.lastAcquiredTileId}"]`);
  tile?.classList.add("last-tile-celebration");
  elements.board.classList.add("last-tile-board-celebration");
  notifyScore("海底撈月！", { type: "achievement", duration: 1100 });
  setTimeout(() => {
    tile?.classList.remove("last-tile-celebration");
    elements.board.classList.remove("last-tile-board-celebration");
    game.busy = false;
    onComplete();
  }, 1100);
  return true;
}

function isMiniGameChallengeState() {
  return game.state === GAME_STATES.MINIGAME_ACTIVE || game.state === GAME_STATES.INTER_ROUND_MINIGAME;
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
  const hit = game.round.bonusMissing.has(tile.id);
  if (hit || game.round.selectedBonusTiles.length === RULES.bonusChoices) {
    elements.bonusGrid.querySelectorAll("button").forEach(item => { item.disabled = true; });
    if (hit) {
      button.classList.add("bonus-hit", "bonus-success-hit");
      elements.bonusModal.classList.add("bonus-success-state");
      elements.bonusResult.innerHTML = "<strong>補牌成功！獲得 +1 次！</strong>";
      elements.bonusInstruction.textContent = "已命中聽牌，補牌立即結束";
    }
    setTimeout(resolveBonusDraw, hit ? 300 : 450);
  }
}

function resolveBonusDraw() {
  if (game.state !== GAME_STATES.BONUS_DRAW || game.round.bonusResolved) return;
  game.round.bonusResolved = true;
  const success = game.round.bonusCandidates.some(tile => game.round.bonusMissing.has(tile.id));
  if (success) {
    game.stats.bonusSuccessCount += 1;
    game.round.bonusAttemptGain = grantAttempts(1);
    game.stats.extraRoundsFromBonus += game.round.bonusAttemptGain;
  }
  const hits = game.round.bonusCandidates.filter(tile => game.round.bonusMissing.has(tile.id));
  hits.forEach(tile => {
    const index = game.round.remaining.findIndex(item => item.id === tile.id);
    elements.bonusGrid.querySelector(`[data-index="${index}"]`)?.classList.add("bonus-hit");
  });
  updateHUD();
  elements.bonusResult.innerHTML = success
    ? "<strong>補牌成功！獲得 +1 次！</strong>"
    : "<strong>補牌失敗，差一點！</strong>";
  elements.message.textContent = success ? "補牌成功！額外獲得 1 次！" : "補牌失敗，差一點！";
  notifyScore(success ? "補牌成功！額外獲得 1 次！" : "補牌失敗，差一點！", true);
  setTimeout(() => { closeBonusModal(); endRound(true, success); }, 1500);
}

function openEventChoice(tile) {
  game.state = GAME_STATES.EVENT_REVEAL;
  game.pendingSpecial = { tile, resolved: false, result: null };
  game.stats.eventTriggeredCount += 1;
  updateHUD();
  openModal({
    icon: tile.glyph, kicker: `${tile.label}・夜市事件牌`, title: "事件揭曉中……",
    body: "<p>夜市的霓虹燈閃了三下……</p>", actions: []
  });
  elements.modalIcon.classList.add("deciding");
  setTimeout(revealSpecialEvent, 700);
}

function revealSpecialEvent() {
  if (game.state !== GAME_STATES.EVENT_REVEAL || !game.pendingSpecial || game.pendingSpecial.resolved) return;
  game.pendingSpecial.resolved = true;
  const specialEvent = drawInRoundEvent();
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
  if (result.blocked) elements.modalTitle.textContent = "免洗護身符發動！";
  const resultClass = result.blocked ? "positive" : specialEvent.sentiment === "POSITIVE" ? "positive" : specialEvent.sentiment === "NEGATIVE" ? "negative" : "neutral";
  const story = result.blocked ? `「${specialEvent.title}」被擋下了，護身符已消耗。` : specialEvent.story;
  elements.modalBody.innerHTML = `<p class="event-story">${story}</p><p class="event-effect ${resultClass}">${result.effectLabel}</p>`;
  renderModalActions([{ label: "繼續", action: finishSpecialEvent }]);
  updateHUD();
}

const EVENT_EFFECT_HANDLERS = {
  ADD_SCORE(event) {
    addRoundPoints(event.value, { key: `event:${event.id}`, label: event.title });
    if (event.value >= 0) game.stats.eventScoreGain += event.value;
    else game.stats.eventScoreLoss += Math.abs(event.value);
    return { effectLabel: `${event.value >= 0 ? "+" : ""}${event.value} 分` };
  },
  SUB_SCORE(event) { return EVENT_EFFECT_HANDLERS.ADD_SCORE({ ...event, value: -Math.abs(event.value) }); },
  RANDOM_SCORE(event) {
    const value = event.randomMode === "PICK"
      ? event.value[Math.floor(Math.random() * event.value.length)]
      : Math.floor(Math.random() * (event.value[1] - event.value[0] + 1)) + event.value[0];
    addRoundPoints(value, { key: `event:${event.id}`, label: event.title });
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
  HALVE_ROUND_SCORE(event) {
    const before = game.round.rawPoints;
    const after = Math.trunc(before / 2);
    const delta = after - before;
    game.round.rawPoints = after;
    game.round.roundScore = after;
    addRoundScoreBreakdown({ key: `event:${event.id}`, label: event.title, points: delta, affectedByMultiplier: true });
    if (delta < 0) game.stats.eventScoreLoss += Math.abs(delta); else game.stats.eventScoreGain += delta;
    return { effectLabel: `本局目前分數減半（${formatSignedScore(delta * game.round.finalMultiplier)} 分）` };
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
  // This dispatcher is exclusively for in-round events; intercept before any handler.
  const charmIndex = event.sentiment === "NEGATIVE" ? game.items.indexOf("disposable-charm") : -1;
  if (charmIndex !== -1) {
    game.items.splice(charmIndex, 1);
    return { blocked: true, effectLabel: "護身符替你擋下了這次壞事。" };
  }
  return (EVENT_EFFECT_HANDLERS[event.effectType] ?? EVENT_EFFECT_HANDLERS.NONE)(event);
}

function finishSpecialEvent() {
  if (game.state !== GAME_STATES.EVENT_REVEAL || !game.pendingSpecial?.result) return;
  const result = game.pendingSpecial.result;
  game.pendingSpecial = null;
  closeModal();
  if (result.restartRound) return restartCurrentRound();
  if (result.gameOver) {
    if (game.round.lastTileCelebrationPending && !game.round.lastTileCelebrationPlayed) return playLastTileCelebration(() => endRound(false, false, true));
    return endRound(false, false, true);
  }
  if (result.endRound) {
    if (game.round.lastTileCelebrationPending && !game.round.lastTileCelebrationPlayed) return playLastTileCelebration(() => endRound(false, false));
    return endRound(false, false);
  }
  game.state = GAME_STATES.DRAWING;
  updateHUD();
  continueAfterDraw();
}

function restartCurrentRound() {
  hideTileOverview();
  const previous = game.round;
  clearMiniGameLifecycle();
  rollbackRoundOutcomeStats(previous);
  const replacement = createRound(previous.config.formalDrawCount, previous.preRound.eventOptions);
  replacement.preRound = previous.preRound;
  replacement.config = previous.config;
  replacement.committed = true;
  replacement.started = true;
  replacement.attemptStart = previous.attemptStart;
  replacement.roundMultiplier = previous.config.leverageMultiplier;
  replacement.finalMultiplier = previous.config.finalMultiplier;
  replacement.leverageConfigured = previous.leverageConfigured;
  replacement.sideChallenge = previous.sideChallenge ? { ...previous.sideChallenge, status: "ACTIVE", awarded: false } : null;
  game.round = replacement;
  game.busy = false;
  elements.preRoundPanel.classList.add("hidden");
  elements.playArea.classList.remove("hidden");
  renderBoard();
  game.state = GAME_STATES.DRAWING;
  updateHUD();
  notifyScore("本局重新開始！場中事件與槓桿已保留", { type: "achievement", duration: 2200 });
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
    REQUIRE_TILES: () => bet.tileIds.filter(isOfficiallyDrawn).length >= (bet.requiredCount ?? bet.tileIds.length),
    MIN_LINES: () => game.round.roundLines >= bet.minimum,
    EVER_WAITED: () => game.round.everWaited,
    UNFINISHED_WAITING_LINE: () => [...game.round.everWaitingLines].some(lineId => !game.round.completedLines.has(lineId))
  };
  return Boolean(handlers[bet.effectKey]?.());
}

function settleBets() {
  if (game.round.betSettled) return game.round.betResult ? [game.round.betResult] : [];
  game.round.betSettled = true;
  const betId = game.round.config?.activeBetId;
  const bet = game.round.config?.eventConfig?.type === "BET"
    ? game.round.config.eventConfig
    : PRE_ROUND_EVENT_DEFINITIONS.find(event => event.id === betId && event.type === "BET");
  if (!bet) return [];
  const won = betConditionMet(bet);
  const basePoints = won ? bet.reward : -betPenalty(bet);
  const multiplier = game.mode === GAME_MODES.EXPERIMENTAL ? game.round.finalMultiplier : 1;
  const requested = basePoints * multiplier;
  addTotalPoints(requested);
  addRoundScoreBreakdown({ key: `bet:${bet.id}:${won ? "won" : "lost"}`, label: won ? "下注成功" : "下注失敗", points: game.mode === GAME_MODES.EXPERIMENTAL ? basePoints : requested, affectedByMultiplier: game.mode === GAME_MODES.EXPERIMENTAL });
  const stat = game.stats.betStats[bet.id];
  game.stats.betsPlaced += 1;
  game.stats[won ? "betsWon" : "betsLost"] += 1;
  game.stats[won ? "betScoreGain" : "betScoreLoss"] += Math.abs(requested);
  stat.played += 1;
  stat[won ? "won" : "lost"] += 1;
  game.round.betResult = { bet, won, points: requested };
  return [game.round.betResult];
}

function settleRoundPoints() {
  if (game.round.pointsSettled) return game.round.actualMultiplierPoints;
  game.round.pointsSettled = true;
  game.round.scoreBeforeSettlement = game.score;
  game.round.multiplierPoints = game.round.rawPoints * game.round.finalMultiplier;
  game.round.actualMultiplierPoints = addTotalPoints(game.round.multiplierPoints);
  return game.round.actualMultiplierPoints;
}

function recordCompletedRoundStats() {
  if (!game.round || game.round.completedStatsRecorded) return false;
  const tileIds = CORE_TILES.filter(tile => isOfficiallyDrawn(tile.id)).map(tile => tile.id);
  game.round.completedStatsRecorded = true;
  game.stats.completedRoundStats.push({ tileIds, everWaited: game.round.everWaited, activeItemUses: game.round.activeItemUses });
  game.stats.activeItemUses += game.round.activeItemUses;
  return true;
}

function renderScoreBreakdown() {
  const multiplier = game.round.finalMultiplier;
  if (!game.round.scoreBreakdown.length) return '<p class="score-breakdown-empty">本局沒有分數變化</p>';
  return game.round.scoreBreakdown.map(item => {
    const shownPoints = item.points;
    const count = item.key === "line" || item.count > 1 ? ` ×${item.count}` : "";
    const multiplierBadge = item.affectedByMultiplier && multiplier > 1 ? `<small>×${multiplier}</small>` : "";
    return `<div class="score-breakdown-row"><span>${escapeHtml(item.label)}${count}</span><strong class="${getRoundPointColorClass(shownPoints)}">${formatSignedScore(shownPoints)}</strong>${multiplierBadge}</div>`;
  }).join("");
}

function hasNextRoundAfterSettlement(forceGameOver = false) {
  return !forceGameOver && attemptsRemaining() > 0;
}

function endRound(hadBonus, bonusSuccess, forceGameOver = false) {
  hideTileOverview();
  clearMiniGameLifecycle();
  game.state = GAME_STATES.ROUND_END;
  resolveSideChallengeAtRoundEnd();
  const totalBefore = game.score;
  settleRoundPoints();
  const betResults = settleBets();
  game.round.betNetPoints = betResults.reduce((sum, result) => sum + result.points, 0);
  game.round.finalRoundChange = game.score - totalBefore;
  recordCompletedRoundStats();
  recordRoundHighs();
  updateHUD();
  const gameEnded = !hasNextRoundAfterSettlement(forceGameOver);
  const continueAction = game.mode === GAME_MODES.EXPERIMENTAL ? openInterRoundMiniGameInvitation : startRound;
  openModal({
    icon: bonusSuccess ? "＋1" : "結", kicker: `ROUND RESULT・第 ${game.roundsPlayed} 局`, title: "單局結算",
    body: `<div class="round-result"><section class="round-result-change"><small>本局最終變化</small><strong class="${getRoundPointColorClass(game.round.finalRoundChange)}">${formatSignedScore(game.round.finalRoundChange)}</strong></section>${renderSideChallengeSettlement()}<section class="score-breakdown" aria-label="本局分數明細">${renderScoreBreakdown()}</section><section class="result-total"><small>目前總分</small><strong data-round-total>${totalBefore}</strong></section></div>`,
    actions: [{ label: gameEnded ? "查看最終成績" : game.mode === GAME_MODES.EXPERIMENTAL ? "繼續" : "下一局", action: gameEnded ? showGameOver : continueAction }]
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

async function showGameOver() {
  if (game.leaderboardGameOverComplete) return renderGameOverModal();
  if (game.leaderboardGameOverProcessing) return false;
  hideTileOverview();
  clearMiniGameLifecycle();
  game.state = GAME_STATES.GAME_OVER;
  game.busy = false;
  recordRoundHighs();
  updateHUD();
  const qualification = evaluateLeaderboardQualification(game.score, game.leaderboardSnapshotValid ? game.leaderboardSnapshot : null);
  game.leaderboardQualifiedHighest = qualification.mode === "highest";
  game.leaderboardQualifiedLowest = qualification.mode === "lowest";
  game.leaderboardQualificationMode = qualification.mode;
  game.leaderboardGameOverProcessing = true;
  if (qualification.mode) {
    showLeaderboardProcessing(qualification.mode === "highest" ? "有不得了的事正在發生..." : "欸你好像....");
    await submitGameOverScore();
  }
  game.leaderboardGameOverProcessing = false;
  game.leaderboardGameOverComplete = true;
  renderGameOverModal();
  return true;
}

function renderGameOverModal() {
  openModal({
    icon: "🏆", kicker: "", title: "今晚收攤啦！",
    body: buildScoreReport(),
    actions: [{ label: "🏆 排行榜", className: "secondary", action: openLeaderboardFromGameOver }, { label: "再玩一場", action: resetGame }, { label: "回主選單", className: "secondary", action: returnToMainMenu }]
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

const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  { id: "chanceMaker", name: "嗆司Maker", description: "一半以上的牌局成功進入聽牌。", evaluate: s => s.completedRounds > 0 && s.waitingRounds >= Math.ceil(s.completedRounds / 2) },
  { id: "lineMaster", name: "連線達人", description: "本場累計完成 2 條以上連線。", evaluate: s => s.totalLines >= 2 },
  { id: "lineLegend", name: "連線傳說", description: "本場累計完成 5 條以上連線。", evaluate: s => s.totalLines >= 5 },
  { id: "investmentSuccess", name: "投資成功", description: "下注至少 3 次，且成功次數多於失敗次數。", evaluate: s => s.betsPlaced >= 3 && s.betsWon > s.betsLost },
  { id: "investmentFailure", name: "投資失敗", description: "下注至少 3 次，且失敗次數多於成功次數。", evaluate: s => s.betsPlaced >= 3 && s.betsLost > s.betsWon },
  { id: "lastTileMaster", name: "撈哥", description: "本場至少完成一次海底撈月。", evaluate: s => s.lastTileFirstLineCount >= 1 },
  { id: "earlyWaitingMaster", name: "天哥", description: "本場至少完成一次天聽。", evaluate: s => s.earlyWaitingCount >= 1 },
  { id: "tacticsMaster", name: "戰術大師", description: "本場成功使用主動式道具 3 次以上。", evaluate: s => s.activeItemUses >= 3 },
  { id: "redEveryRound", name: "中信兄弟", description: "每一局都有取得紅中。", evaluate: s => s.completedRounds > 0 && s.everyRoundRed },
  { id: "greenEveryRound", name: "一路發發發", description: "每一局都有取得發。", evaluate: s => s.completedRounds > 0 && s.everyRoundGreen },
  { id: "whiteEveryRound", name: "超級白", description: "每一局都有取得白板。", evaluate: s => s.completedRounds > 0 && s.everyRoundWhite },
  { id: "wanMaster", name: "萬老師", description: "本場累計取得 30 張以上萬子。", evaluate: s => s.wanTiles >= 30 },
  { id: "suoMaster", name: "事情大條", description: "本場累計取得 30 張以上條子。", evaluate: s => s.suoTiles >= 30 },
  { id: "tongMaster", name: "筒神", description: "本場累計取得 30 張以上筒子。", evaluate: s => s.tongTiles >= 30 },
  { id: "windMaster", name: "風起雲湧", description: "本場累計取得 10 張以上風牌。", evaluate: s => s.windTiles >= 10 },
  { id: "gameKing", name: "遊戲王", description: "所有局間小遊戲都參加並挑戰成功。", evaluate: s => s.mode === GAME_MODES.EXPERIMENTAL && s.miniGameInvitations > 0 && s.miniGameParticipated === s.miniGameInvitations && s.miniGameSuccesses === s.miniGameInvitations },
  { id: "pajurMaster", name: "珠珠寶貝", description: "彈珠台挑戰成功至少 3 次。", evaluate: s => s.mode === GAME_MODES.EXPERIMENTAL && s.pajurSuccesses >= 3 },
  { id: "baseballAce", name: "王牌投手", description: "棒球九宮格挑戰成功至少 3 次。", evaluate: s => s.mode === GAME_MODES.EXPERIMENTAL && s.baseballSuccesses >= 3 },
  { id: "memoryMaster", name: "記憶體", description: "記憶大師挑戰成功至少 3 次。", evaluate: s => s.mode === GAME_MODES.EXPERIMENTAL && s.memorySuccesses >= 3 }
]);

function buildAchievementStats(source = game) {
  const rounds = source.stats.completedRoundStats;
  const allTileIds = rounds.flatMap(round => round.tileIds);
  const countSuit = suit => allTileIds.filter(id => GAME_TILES.find(tile => tile.id === id)?.suit === suit).length;
  return {
    completedRounds: rounds.length,
    waitingRounds: rounds.filter(round => round.everWaited).length,
    totalLines: source.stats.totalLines,
    betsPlaced: source.stats.betsPlaced, betsWon: source.stats.betsWon, betsLost: source.stats.betsLost,
    lastTileFirstLineCount: source.stats.lastTileFirstLineCount, earlyWaitingCount: source.stats.earlyWaitingCount,
    activeItemUses: source.stats.activeItemUses,
    mode: source.mode,
    miniGameInvitations: source.stats.miniGameInvitationCount ?? 0,
    miniGameParticipated: source.stats.miniGameParticipatedCount ?? 0,
    miniGameSuccesses: source.stats.miniGameSuccessCount ?? 0,
    miniGameFailures: source.stats.miniGameFailureCount ?? 0,
    miniGameSkips: source.stats.miniGameSkipCount ?? 0,
    pajurSuccesses: source.stats.miniGameSuccessById?.pachinko ?? 0,
    baseballSuccesses: source.stats.miniGameSuccessById?.baseball9 ?? 0,
    memorySuccesses: source.stats.miniGameSuccessById?.memoryMaster ?? 0,
    everyRoundRed: rounds.every(round => round.tileIds.includes("red")),
    everyRoundGreen: rounds.every(round => round.tileIds.includes("green")),
    everyRoundWhite: rounds.every(round => round.tileIds.includes("white")),
    wanTiles: countSuit("wan"), tongTiles: countSuit("tong"), suoTiles: countSuit("suo"),
    windTiles: allTileIds.filter(id => ["east", "south", "west", "north"].includes(id)).length
  };
}

function evaluateAchievements(stats = buildAchievementStats()) {
  return ACHIEVEMENT_DEFINITIONS.filter(definition => definition.evaluate(stats));
}

function buildScoreReport() {
  const earned = evaluateAchievements();
  game.stats.earnedAchievements = earned.map(achievement => achievement.id);
  const list = earned.length
    ? earned.map(achievement => `<article class="achievement-card"><b>🏆 ${escapeHtml(achievement.name)}</b><p>${escapeHtml(achievement.description)}</p></article>`).join("")
    : '<p class="achievement-empty">這場沒有取得稱號</p>';
  const leaderboardResults = game.leaderboardSubmissionStatus === "success"
    ? [game.leaderboardQualificationMode === "highest" ? "🏆 本次成績進入最高 TOP 20！" : "", game.leaderboardQualificationMode === "lowest" ? "💀 本次成績進入最低 TOP 20！" : ""].filter(Boolean)
    : [];
  const qualification = leaderboardResults.length ? `<div class="leaderboard-qualified">${leaderboardResults.map(message => `<span>${message}</span>`).join("")}</div>` : "";
  return `<div class="game-over-report"><section class="game-over-final"><strong class="game-over-score">${game.score}</strong><small>最終分數</small>${qualification}<p class="leaderboard-submit-status" data-leaderboard-submit-status>${leaderboardSubmissionLabel()}</p></section><section class="achievement-report"><h3>本場獲得稱號</h3><div class="achievement-list">${list}</div></section></div>`;
}

function leaderboardSubmissionLabel() {
  return ({ success: "成績已登錄排行榜！", failure: "排行榜上傳失敗", disabled: "進階模式：成績不會上傳排行榜" })[game.leaderboardSubmissionStatus] || "";
}

function updateLeaderboardSubmissionStatus() {
  const status = elements.modalBody.querySelector("[data-leaderboard-submit-status]");
  if (status) status.textContent = leaderboardSubmissionLabel();
}

function leaderboardUrl(mode = null) {
  if (!mode) return LEADERBOARD_API_URL;
  const separator = LEADERBOARD_API_URL.includes("?") ? "&" : "?";
  return `${LEADERBOARD_API_URL}${separator}mode=${encodeURIComponent(mode)}`;
}

async function leaderboardRequest(options = {}, mode = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LEADERBOARD_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(leaderboardUrl(mode), { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.success !== true) throw new Error(data?.error || "Leaderboard API error");
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function submitGameOverScore() {
  if (game.leaderboardSubmitted) return game.leaderboardSubmissionStatus === "success";
  game.leaderboardSubmitted = true;
  game.leaderboardPreparedPayload = { mode: game.leaderboardQualificationMode, name: game.playerName || EMPTY_PLAYER_DISPLAY_NAME, score: game.score };
  if (!gameModeAllowsLeaderboardPost(game.mode)) {
    game.leaderboardSubmissionStatus = "disabled";
    return false;
  }
  game.leaderboardSubmissionStatus = "loading";
  try {
    await leaderboardRequest({
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(game.leaderboardPreparedPayload)
    });
    game.leaderboardSubmissionStatus = "success";
    return true;
  } catch (error) {
    game.leaderboardSubmissionStatus = "failure";
    console.warn("Leaderboard score submission failed.", error);
    return false;
  }
}

function normalizeLeaderboardRanking(data) {
  if (!data || !Array.isArray(data.ranking)) throw new Error("Malformed leaderboard response");
  const ranking = data.ranking.slice(0, 20).map(entry => ({ ...entry, score: Number(entry.score) }));
  if (ranking.some(entry => !Number.isFinite(entry.score))) throw new Error("Malformed leaderboard score");
  return ranking;
}

async function captureLeaderboardSnapshot() {
  try {
    const [highestData, lowestData] = await Promise.all([
      leaderboardRequest({}, "highest"),
      leaderboardRequest({}, "lowest")
    ]);
    const highest = normalizeLeaderboardRanking(highestData);
    const lowest = normalizeLeaderboardRanking(lowestData);
    return { valid: true, highest, lowest };
  } catch (error) {
    console.warn("Leaderboard snapshot unavailable; this game will not submit a score.", error);
    return { valid: false, highest: [], lowest: [] };
  }
}

function evaluateLeaderboardQualification(score, snapshot) {
  if (!snapshot) return { mode: null, highest: false, lowest: false };
  const highest = snapshot.highest.length < 20 || score >= snapshot.highest[19].score;
  if (highest) return { mode: "highest", highest: true, lowest: false };
  const lowest = snapshot.lowest.length < 20 || score <= snapshot.lowest[19].score;
  return { mode: lowest ? "lowest" : null, highest: false, lowest };
}

function showLeaderboardProcessing(message) {
  openModal({
    icon: "🏆", kicker: "", title: "",
    body: `<div class="leaderboard-processing"><strong>${message}</strong><span class="leaderboard-loading-dots" aria-label="處理中"><i></i><i></i><i></i></span></div>`,
    actions: []
  });
}

function openLeaderboardFromGameOver() {
  openLeaderboard(showGameOver);
}

let leaderboardCloseAction = null;
let leaderboardMode = "highest";

function openLeaderboard(closeAction = null) {
  leaderboardCloseAction = closeAction;
  setLeaderboardMode("highest", false);
  elements.leaderboardOverlay.classList.add("open");
  elements.leaderboardOverlay.setAttribute("aria-hidden", "false");
  renderLeaderboardMessage("排行榜載入中…", false);
  elements.leaderboardClose.focus();
  void loadLeaderboard();
}

function setLeaderboardMode(mode, shouldLoad = true) {
  leaderboardMode = mode === "lowest" ? "lowest" : "highest";
  elements.leaderboardHighest.classList.toggle("active", leaderboardMode === "highest");
  elements.leaderboardLowest.classList.toggle("active", leaderboardMode === "lowest");
  elements.leaderboardHighest.setAttribute("aria-pressed", String(leaderboardMode === "highest"));
  elements.leaderboardLowest.setAttribute("aria-pressed", String(leaderboardMode === "lowest"));
  if (shouldLoad) void loadLeaderboard();
}

async function loadLeaderboard() {
  renderLeaderboardMessage("排行榜載入中…", false);
  try {
    const data = await leaderboardRequest({}, leaderboardMode);
    renderLeaderboard(data.ranking);
  } catch (error) {
    console.warn("Leaderboard fetch failed.", error);
    renderLeaderboardMessage("排行榜讀取失敗", true);
  }
}

function renderLeaderboardMessage(message, canRetry) {
  const status = document.createElement("p");
  status.className = "leaderboard-message";
  status.textContent = message;
  elements.leaderboardContent.replaceChildren(status);
  elements.leaderboardRetry.classList.toggle("hidden", !canRetry);
}

function renderLeaderboard(ranking) {
  const entries = Array.isArray(ranking) ? ranking.slice(0, 20) : [];
  elements.leaderboardRetry.classList.add("hidden");
  if (!entries.length) {
    renderLeaderboardMessage("目前還沒有排行榜紀錄", false);
    return;
  }

  const list = document.createElement("div");
  list.className = "leaderboard-list";
  const heading = document.createElement("div");
  heading.className = "leaderboard-row leaderboard-column-heading";
  ["排名", "玩家", "分數"].forEach(label => {
    const cell = document.createElement("span");
    cell.textContent = label;
    heading.append(cell);
  });
  list.append(heading);

  entries.forEach((entry, index) => {
    const rank = Number.isInteger(entry.rank) && entry.rank > 0 ? entry.rank : index + 1;
    const row = document.createElement("div");
    row.className = `leaderboard-row${leaderboardMode === "highest" && rank <= 3 ? ` leaderboard-top-${rank}` : ""}`;
    const rankCell = document.createElement("strong");
    rankCell.textContent = leaderboardMode === "highest" ? (["🥇", "🥈", "🥉"][rank - 1] || String(rank)) : String(rank);
    const nameCell = document.createElement("span");
    nameCell.textContent = String(entry.name ?? "");
    const scoreCell = document.createElement("strong");
    scoreCell.textContent = String(entry.score ?? "");
    row.append(rankCell, nameCell, scoreCell);
    list.append(row);
  });

  elements.leaderboardContent.replaceChildren(list);
}

function closeLeaderboard() {
  elements.leaderboardOverlay.classList.remove("open");
  elements.leaderboardOverlay.setAttribute("aria-hidden", "true");
  const closeAction = leaderboardCloseAction;
  leaderboardCloseAction = null;
  if (closeAction) closeAction();
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
  elements.gameModeIndicator.textContent = gameModeDisplayName(game.mode);
  elements.gameModeIndicator.classList.remove("hidden");
  elements.inventoryFullBadge.classList.toggle("hidden", game.items.length < 3);
  elements.preRoundInventoryCount.textContent = game.items.length >= 3 ? "滿 3/3" : `${game.items.length}/3`;
  elements.preRoundItemButton.classList.toggle("full", game.items.length >= 3);
  renderSideChallengeStatus();
  const uiLocked = game.busy || game.uiOverlayOpen;
  elements.optionsButton.disabled = uiLocked || game.state !== GAME_STATES.DRAWING;
  elements.itemStatusButton.disabled = uiLocked || game.state !== GAME_STATES.DRAWING;
  elements.tilePeekButton.disabled = uiLocked || game.state !== GAME_STATES.DRAWING;
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
  const hasDecorativeSingleCharacterIcon = /^\p{Script=Han}$/u.test(icon);
  elements.modalIcon.classList.remove("deciding");
  elements.modalIcon.classList.toggle("hidden", hasDecorativeSingleCharacterIcon);
  elements.modalIcon.textContent = hasDecorativeSingleCharacterIcon ? "" : icon;
  elements.modalKicker.textContent = kicker;
  elements.modalTitle.textContent = title;
  elements.modalBody.innerHTML = body;
  elements.modal.querySelector(".modal-card").classList.toggle("modal-card-wide", /betting-panel|report-grid|event-guide|memory-master|pajur-host/.test(body));
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
  return `<section class="help-section"><h3>分數獲得方式</h3><div class="rules-list scoring-guide"><p><b>玩法</b><span>${gameRule}</span></p><p><b>倍率</b><span>本局分數依倍率即時顯示</span></p><p><b>連線</b><span>第 1 條 +30 分<br>第 2 條 +60 分<br>第 3 條起每條 +90 分</span></p><p><b>牌型</b><span>萬／筒／條：5 張 +${SCORE_CONFIG.suit.five}、7 張累計 +${SCORE_CONFIG.suit.seven}、9 張累計 +${SCORE_CONFIG.suit.nine}<br>四風 +${SCORE_CONFIG.honor.fourWinds}／三元 +${SCORE_CONFIG.honor.threeDragons}</span></p><p><b>特殊成就</b><span>天聽 +${SCORE_CONFIG.special.earlyWaiting}<br>海底撈月 +${SCORE_CONFIG.special.lastTileFirstLine}</span></p></div></section>`;
}

function buildModeGuideContent() {
  return `<section class="help-section"><h3>玩法模式</h3><div class="rules-list scoring-guide"><p><b>經典模式</b><span>專注原本摸麻將玩法，規則直接，挑戰高分。</span></p><p><b>進階模式</b><span>加入小任務挑戰、局間小遊戲與資源策略。</span></p></div></section>`;
}

function showHelp(closeAction) {
  const enabledEvents = EVENT_DEFINITIONS.filter(event => event.enabled);
  const totalWeight = enabledEvents.reduce((sum, event) => sum + event.weight, 0);
  const eventContent = `<section class="help-section"><h3>事件一覽</h3><div class="event-guide">${buildEventGuideSection("一般事件", enabledEvents.filter(event => event.category === "NORMAL"), totalWeight)}${buildEventGuideSection("特殊事件", enabledEvents.filter(event => event.category === "SPECIAL"), totalWeight)}</div></section>`;
  openModal({
    icon: "說", kicker: "遊戲說明", title: "說明",
    body: `<div class="help-guide">${buildModeGuideContent()}${buildScoringGuideContent()}${eventContent}</div>`,
    actions: [{ label: closeAction === returnToOptions ? "返回" : "關閉", action: closeAction }]
  });
  elements.modal.classList.add("status-sheet", "help-sheet");
}

function openHelp() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  showHelp(closeInfoModal);
}

function showOptions() {
  openModal({
    icon: "⚙", kicker: "", title: "選項", body: "",
    actions: [
      { label: "說明", className: "secondary", action: openHelpFromOptions },
      { label: "回主選單", className: "secondary", action: requestMainMenuFromOptions },
      { label: "關閉", action: closeOptions }
    ]
  });
  elements.modal.classList.add("options-sheet");
}

function openOptions() {
  if (game.state !== GAME_STATES.DRAWING || game.busy || game.uiOverlayOpen) return;
  game.uiOverlayOpen = true;
  showOptions();
  updateHUD();
}

function closeOptions() {
  game.uiOverlayOpen = false;
  closeModal();
  updateHUD();
}

function openHelpFromOptions() {
  closeModal();
  showHelp(returnToOptions);
}

function returnToOptions() {
  closeModal();
  showOptions();
}

function requestMainMenuFromOptions() {
  game.uiOverlayOpen = false;
  closeModal();
  requestMainMenu();
  updateHUD();
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
  elements.modal.classList.remove("status-sheet", "betting-sheet", "help-sheet", "options-sheet");
  elements.modal.classList.remove("normal-event-modal", "special-event-modal", "game-over-modal", "side-challenge-reveal-modal");
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

async function beginGameWithLeaderboardSnapshot(playerName, mode = GAME_MODES.PRODUCTION) {
  if (game.busy) return false;
  game = freshGameState(playerName, mode);
  game.busy = true;
  elements.startScreen.classList.add("hidden");
  showLeaderboardProcessing("攤位準備中…");
  const snapshot = await captureLeaderboardSnapshot();
  game.leaderboardSnapshotValid = snapshot.valid;
  game.leaderboardSnapshot = snapshot.valid ? { highest: snapshot.highest, lowest: snapshot.lowest } : null;
  game.busy = false;
  closeModal();
  hideTileOverview();
  elements.gameShell.classList.remove("hidden");
  startRound();
  enableGlyphFallback();
  return snapshot.valid;
}

function resetGame() {
  const playerName = game.playerName;
  const mode = game.mode;
  clearMiniGameLifecycle();
  return beginGameWithLeaderboardSnapshot(playerName, mode);
}

function startGameInMode(mode) {
  const enteredPlayerName = elements.playerNameInput.value.trim().slice(0, 12);
  const playerName = enteredPlayerName || EMPTY_PLAYER_DISPLAY_NAME;
  if (enteredPlayerName) {
    elements.playerNameInput.value = enteredPlayerName;
    savePlayerName(enteredPlayerName);
  }
  elements.playerNameError.textContent = "";
  return beginGameWithLeaderboardSnapshot(playerName, mode);
}

function startGame() { return startGameInMode(GAME_MODES.PRODUCTION); }
function startExperimentalGame() { return startGameInMode(GAME_MODES.EXPERIMENTAL); }

function showStartScreen() {
  hideTileOverview();
  clearMiniGameLifecycle();
  closeModal();
  closeBonusModal();
  elements.gameShell.classList.add("hidden");
  elements.startScreen.classList.remove("hidden");
  elements.playerNameInput.value = game.playerName === EMPTY_PLAYER_DISPLAY_NAME ? "" : (game.playerName || loadPlayerName());
  elements.playerNameError.textContent = "";
}

function requestMainMenu() {
  if (game.state === GAME_STATES.GAME_OVER) return returnToMainMenu();
  if (game.busy || game.uiOverlayOpen || ![GAME_STATES.PRE_ROUND, GAME_STATES.DRAWING].includes(game.state)) return;
  game.uiOverlayOpen = true;
  openModal({
    icon: "↩", kicker: "返回主選單", title: "確定離開目前遊戲？",
    body: "<p>目前遊戲進度與成績將會消失。</p>",
    actions: [{ label: "繼續遊戲", className: "secondary", action: cancelMainMenu }, { label: "確定返回", action: returnToMainMenu }]
  });
}

function cancelMainMenu() { game.uiOverlayOpen = false; closeModal(); updateHUD(); }

function returnToMainMenu() {
  const playerName = game.playerName || elements.playerNameInput.value.trim().slice(0, 12);
  clearMiniGameLifecycle();
  game = freshGameState(playerName);
  showStartScreen();
}

elements.optionsButton.addEventListener("click", openOptions);
elements.itemStatusButton.addEventListener("click", openItemStatus);
elements.preRoundItemButton.addEventListener("click", openPreRoundInventory);
elements.drawStack.addEventListener("click", drawTile);
elements.startRoundButton.addEventListener("click", commitRoundConfiguration);
elements.preRoundSkipButton.addEventListener("click", selectPreRoundSkip);
elements.tilePeekButton.addEventListener("click", showTileOverview);
elements.tileOverviewClose.addEventListener("click", hideTileOverview);
document.querySelector("#start-game-button").addEventListener("click", startGame);
document.querySelector("#start-experimental-button").addEventListener("click", startExperimentalGame);
document.querySelector("#start-leaderboard-button").addEventListener("click", () => openLeaderboard());
elements.leaderboardRetry.addEventListener("click", loadLeaderboard);
elements.leaderboardClose.addEventListener("click", closeLeaderboard);
elements.leaderboardHighest.addEventListener("click", () => setLeaderboardMode("highest"));
elements.leaderboardLowest.addEventListener("click", () => setLeaderboardMode("lowest"));
elements.playerNameInput.addEventListener("input", () => {
  elements.playerNameError.textContent = "";
  const playerName = elements.playerNameInput.value.trim().slice(0, 12);
  if (playerName) savePlayerName(playerName);
});
game = freshGameState(loadPlayerName());
showStartScreen();
