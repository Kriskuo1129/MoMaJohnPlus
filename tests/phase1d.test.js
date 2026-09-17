const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : force;
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.style = { setProperty() {} };
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this._innerHTML = "";
    this.listeners = new Map();
  }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { (this.listeners.get(type) ?? []).forEach(listener => listener({ currentTarget: this })); }
  append(child) { this.children.push(child); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  closest() { return this; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() {}
  remove() {}
  getBoundingClientRect() { return { width: 100, height: 50, left: 0, top: 0 }; }
  get offsetWidth() { return 100; }
}

const elements = new Map();
const getElement = selector => {
  if (!elements.has(selector)) elements.set(selector, new FakeElement());
  return elements.get(selector);
};
const document = {
  querySelector: getElement,
  querySelectorAll: () => [],
  createElement: () => new FakeElement(),
  documentElement: new FakeElement(),
  body: new FakeElement(),
  fonts: { check: () => true }
};
const context = vm.createContext({
  console, document,
  localStorage: { getItem: () => "", setItem() {} },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  setTimeout() {}, clearTimeout() {},
  Math, Object, Array, Set, Map, String, Number, Boolean
});
const root = path.resolve(__dirname, "..");
const pageHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${gameSource}\n
globalThis.phase1DTest = {
  definitions: ITEM_DEFINITIONS,
  preRoundDefinitions: PRE_ROUND_EVENT_DEFINITIONS,
  freshItems() { return freshGameState("TEST").items; },
  selectedWithoutCommit() {
    game = freshGameState("TEST");
    const event = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === "mystery-gift");
    game.round = createRound(15, [event]);
    game.state = GAME_STATES.PRE_ROUND;
    selectPreRoundEvent({ currentTarget: { dataset: { eventId: event.id } } });
    return [...game.items];
  },
  acquire(existing = [], randomValue = 0) {
    game = freshGameState("TEST");
    game.items = [...existing];
    const event = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === "mystery-gift");
    game.round = createRound(15, [event]);
    game.round.preRound.eventSelectionType = "EVENT";
    game.round.preRound.selectedEventId = event.id;
    game.state = GAME_STATES.PRE_ROUND;
    const original = Math.random;
    Math.random = () => randomValue;
    const first = commitRoundConfiguration();
    const second = commitRoundConfiguration();
    Math.random = original;
    const before = { first, second, items: [...game.items], state: game.state, attempts: game.attemptsConsumed, config: game.round.config, pending: game.round.pendingItemId, revealConfirmed: game.round.itemRevealConfirmed };
    const accepted = existing.length < 3 ? acceptRevealedItem(event, 1) : null;
    const duplicateAccept = existing.length < 3 ? acceptRevealedItem(event, 1) : null;
    return { before, accepted, duplicateAccept, after: { items: [...game.items], state: game.state, attempts: game.attemptsConsumed, config: game.round.config } };
  },
  replace(existing, index, randomValue = 0.9) {
    const started = this.acquire(existing, randomValue);
    const event = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === "mystery-gift");
    const replacementOpened = confirmItemReplacement(event, 1);
    const attemptsBeforeReplacement = game.attemptsConsumed;
    const completed = completeItemReplacement(event, 1, index);
    return { started, replacementOpened, attemptsBeforeReplacement, completed, items: [...game.items], attempts: game.attemptsConsumed, state: game.state, config: game.round.config };
  },
  skip(leverage = 1) {
    game = freshGameState("TEST");
    game.round = createRound();
    game.state = GAME_STATES.PRE_ROUND;
    const initial = { selection: game.round.preRound.eventSelectionType, eventId: game.round.preRound.selectedEventId };
    selectPreRoundSkip();
    game.round.preRound.selectedLeverage = leverage;
    const selected = { selection: game.round.preRound.eventSelectionType, eventId: game.round.preRound.selectedEventId };
    const committed = commitRoundConfiguration();
    const config = game.round.config;
    const status = currentRoundStatusText();
    const attempts = game.attemptsConsumed;
    restartCurrentRound();
    return { initial, selected, committed, config, status, attempts, restartState: game.state, sameConfig: game.round.config === config, restartAttempts: game.attemptsConsumed, items: [...game.items] };
  },
  switchSelection() {
    game = freshGameState("TEST");
    const event = game.round = createRound(), option = event.preRound.eventOptions[0];
    game.state = GAME_STATES.PRE_ROUND;
    selectPreRoundEvent({ currentTarget: { dataset: { eventId: option.id } } });
    const eventSelected = { type: game.round.preRound.eventSelectionType, id: game.round.preRound.selectedEventId };
    selectPreRoundSkip();
    const skipSelected = { type: game.round.preRound.eventSelectionType, id: game.round.preRound.selectedEventId };
    selectPreRoundEvent({ currentTarget: { dataset: { eventId: option.id } } });
    return { eventSelected, skipSelected, eventAgain: { type: game.round.preRound.eventSelectionType, id: game.round.preRound.selectedEventId } };
  },
  persistence() {
    game = freshGameState("TEST");
    game.items = ["chance-maker", "empty-cup"];
    startRound();
    const afterRound = [...game.items];
    game = freshGameState("TEST");
    return { afterRound, afterNewGame: [...game.items] };
  },
  itemRestart() {
    const acquired = this.acquire([], 0);
    const config = game.round.config;
    const items = [...game.items];
    const attempts = game.attemptsConsumed;
    restartCurrentRound();
    return { acquired, sameConfig: game.round.config === config, sameItems: JSON.stringify(game.items) === JSON.stringify(items), attempts, restartAttempts: game.attemptsConsumed, state: game.state, pending: game.round.pendingItemId, revealConfirmed: game.round.itemRevealConfirmed };
  },
  chanceMaker() {
    game = freshGameState("TEST");
    game.items = ["chance-maker"];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    LINE_DEFINITIONS[0].indexes.slice(0, 5).forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.drawIndex = 6;
    updateWaitingLines();
    const first = game.round.rawPoints;
    updateWaitingLines();
    const second = game.round.rawPoints;
    game.round.config = Object.freeze({ formalDrawCount: 15, leverageMultiplier: 1, finalMultiplier: 1 });
    game.round.preRound.eventOptions = [];
    game.round.started = true;
    restartCurrentRound();
    return { first, second, reset: game.round.chanceMakerTriggered };
  },
  earlyWaiting(drawIndex) {
    game = freshGameState("TEST");
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    LINE_DEFINITIONS[0].indexes.slice(0, 5).forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.drawIndex = drawIndex;
    updateWaitingLines();
    return { points: game.round.rawPoints, earned: game.round.achievements.has("early-waiting") };
  },
  pocket(itemId, acquiredTarget = false) {
    game = freshGameState("TEST");
    game.items = [itemId];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    game.round.hand = GAME_TILES.slice(0, 15);
    game.round.remaining = GAME_TILES.slice(15);
    game.round.drawn.add("wan-1");
    const item = itemById(itemId);
    if (acquiredTarget) game.round.drawn.add(item.targetTileId);
    game.round.drawIndex = 4;
    game.state = GAME_STATES.DRAWING;
    const beforeIndex = game.round.drawIndex;
    const beforeDrawn = [...game.round.drawn];
    const used = beginPocketItemUse(0);
    const order = [...game.round.hand, ...game.round.remaining].map(tile => tile.id);
    return { used, beforeIndex, afterIndex: game.round.drawIndex, items: [...game.items], beforeDrawn, drawn: [...game.round.drawn], order, target: item.targetTileId, activeItemUses: game.round.activeItemUses, picker: game.round.tilePicker, overlay: game.uiOverlayOpen };
  },
  multiPocket() {
    game = freshGameState("TEST");
    game.items = ["pocket-red", "pocket-green", "pocket-white"];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    game.round.hand = GAME_TILES.slice(0, 15);
    game.round.remaining = GAME_TILES.slice(15);
    game.round.drawIndex = 4;
    game.state = GAME_STATES.DRAWING;
    const results = [beginPocketItemUse(0), beginPocketItemUse(0), beginPocketItemUse(0)];
    recordCompletedRoundStats();
    const earned = evaluateAchievements(buildAchievementStats()).map(achievement => achievement.id);
    return { results, drawIndex: game.round.drawIndex, items: [...game.items], drawn: [...game.round.drawn], order: [...game.round.hand, ...game.round.remaining].map(tile => tile.id), activeItemUses: game.round.activeItemUses, tacticsMaster: earned.includes("tacticsMaster") };
  },
  pocketEffects(completeLine = true) {
    game = freshGameState("TEST");
    game.items = ["pocket-red"];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    const line = LINE_DEFINITIONS[0];
    const targetIndex = line.indexes[completeLine ? 5 : 4];
    const redIndex = game.round.board.findIndex(tile => tile.id === "red");
    [game.round.board[targetIndex], game.round.board[redIndex]] = [game.round.board[redIndex], game.round.board[targetIndex]];
    line.indexes.slice(0, completeLine ? 5 : 4).forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.drawn.add("green"); game.round.drawn.add("white");
    game.state = GAME_STATES.DRAWING;
    beginPocketItemUse(0);
    return { line: game.round.completedLines.has(line.id), waited: game.round.everWaited, collection: game.round.achievements.has("dragons"), targetDrawn: isOfficiallyDrawn("red") };
  },
  pocketBetAndRestart() {
    game = freshGameState("TEST"); game.items = ["pocket-red", "pocket-green", "pocket-white"]; game.round = createRound(); game.round.board = [...GAME_TILES];
    game.round.hand = GAME_TILES.slice(0, 15); game.round.remaining = GAME_TILES.slice(15); game.round.config = { formalDrawCount: 15, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: "believe-guoju" }; game.round.preRound.eventOptions = [];
    ["east", "south", "west"].forEach(id => game.round.drawn.add(id)); game.state = GAME_STATES.DRAWING;
    beginPocketItemUse(0); beginPocketItemUse(0); beginPocketItemUse(0);
    const betWon = betConditionMet(PRE_ROUND_EVENT_DEFINITIONS.find(event => event.id === "believe-guoju"));
    const beforeRestart = { items: [...game.items], uses: game.round.activeItemUses, honors: ["red", "green", "white"].every(isOfficiallyDrawn) };
    restartCurrentRound();
    return { betWon, beforeRestart, afterRestart: { items: [...game.items], uses: game.round.activeItemUses, honors: ["red", "green", "white"].some(isOfficiallyDrawn) } };
  },
  guojuBoundary(count) {
    game = freshGameState("TEST"); game.score = 100; game.round = createRound(); game.round.config = { activeBetId: "believe-guoju" };
    ["east", "south", "west", "north", "red", "green", "white"].slice(0, count).forEach(id => game.round.drawn.add(id));
    const result = settleBets()[0]; return { won: result.won, points: result.points };
  },
  overview() {
    game = freshGameState("TEST");
    game.round = createRound();
    game.round.drawn.add("wan-1");
    game.state = GAME_STATES.DRAWING;
    const stateBefore = game.state;
    elements.tilePeekButton.dispatch("click");
    const html = elements.tileOverviewGrid.innerHTML;
    const opened = elements.tileOverviewOverlay.classList.contains("open");
    const backgroundLocked = elements.drawStack.disabled && elements.itemStatusButton.disabled && elements.optionsButton.disabled;
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(type => elements.tilePeekButton.dispatch(type));
    const stayedOpen = elements.tileOverviewOverlay.classList.contains("open");
    elements.tileOverviewClose.dispatch("click");
    const closed = !elements.tileOverviewOverlay.classList.contains("open");
    const stateAfter = game.state;
    elements.tilePeekButton.dispatch("click");
    game.round.config = Object.freeze({ formalDrawCount: 15, leverageMultiplier: 1, finalMultiplier: 1 });
    game.round.preRound.eventOptions = [];
    game.round.started = true;
    restartCurrentRound();
    return { html, opened, backgroundLocked, stayedOpen, closed, stateBefore, stateAfter, uiUnlocked: !game.uiOverlayOpen, restartClosed: !elements.tileOverviewOverlay.classList.contains("open"), hidden: elements.tileOverviewOverlay.attributes["aria-hidden"] };
  },
  optionsNavigation() {
    game = freshGameState("TEST");
    game.round = createRound();
    game.state = GAME_STATES.DRAWING;
    game.score = 25;
    game.round.drawIndex = 3;
    game.round.finalMultiplier = 2;
    const snapshot = () => JSON.stringify({ score: game.score, drawIndex: game.round?.drawIndex, multiplier: game.round?.finalMultiplier, attempts: game.attemptsConsumed, items: game.items });
    const before = snapshot();
    openOptions();
    const opened = elements.modal.classList.contains("open");
    const optionActions = elements.modalActions.children.map(button => button.textContent);
    const optionClasses = elements.modalActions.children.map(button => button.className);
    closeOptions();
    const closePreserved = snapshot() === before && !game.uiOverlayOpen;
    openOptions();
    openHelpFromOptions();
    const helpTitle = elements.modalTitle.textContent;
    returnToOptions();
    const returnedToOptions = elements.modalTitle.textContent === "選項" && game.uiOverlayOpen;
    closeOptions();
    const helpPreserved = snapshot() === before && !game.uiOverlayOpen;
    openOptions();
    requestMainMenuFromOptions();
    const usesMainMenuConfirmation = elements.modalTitle.textContent === "確定離開目前遊戲？" && game.uiOverlayOpen;
    cancelMainMenu();
    const controlsUnlockedAfterCancel = !elements.optionsButton.disabled && !elements.drawStack.disabled;
    for (let index = 0; index < 10; index += 1) { openOptions(); closeOptions(); }
    return { opened, optionActions, optionClasses, closePreserved, helpTitle, returnedToOptions, helpPreserved, usesMainMenuConfirmation, controlsUnlockedAfterCancel, optionListenerCount: elements.optionsButton.listeners.get("click")?.length ?? 0, finalOverlayOpen: game.uiOverlayOpen };
  },
  floorScore() {
    game = freshGameState("TEST");
    game.score = 5;
    const delta = addTotalPoints(-30);
    return { score: game.score, delta };
  }
};`;
vm.runInContext(source, context, { filename: "phase1d-bundle.js" });
const api = context.phase1DTest;

assert.equal(api.definitions.length, 10);
assert.equal(new Set(api.definitions.map(item => item.id)).size, 10);
assert.equal(JSON.stringify(api.definitions.map(item => item.title)), JSON.stringify(["大吉的籤", "小吉的籤", "小凶的籤", "大凶的籤", "嗆司Maker", "喝完的飲料杯", "免洗護身符", "口袋中的發", "口袋中的中", "口袋中的白板"]));
assert.equal(api.preRoundDefinitions.filter(event => event.type === "ITEM").length, 1);
assert.match(pageHtml, /id="pre-round-skip-button"[^>]*>這局不選事件<\/button>/);
assert.match(pageHtml, /id="options-button"[^>]*class="guide-button"[^>]*>選項<\/button>/);
assert.doesNotMatch(pageHtml, /id="help-button"|id="main-menu-button"/);
assert.equal(JSON.stringify(api.freshItems()), "[]");
assert.equal(JSON.stringify(api.selectedWithoutCommit()), "[]");

const acquired = api.acquire();
assert.equal(acquired.before.first, true);
assert.equal(acquired.before.second, false);
assert.equal(JSON.stringify(acquired.before.items), "[]");
assert.equal(acquired.before.attempts, 0);
assert.equal(acquired.before.state, "COMMITTING");
assert.equal(acquired.before.config, null);
assert.equal(acquired.before.pending, "great-fortune");
assert.equal(acquired.before.revealConfirmed, false);
assert.equal(acquired.accepted, true);
assert.equal(acquired.duplicateAccept, false);
assert.equal(JSON.stringify(acquired.after.items), '["great-fortune"]');
assert.equal(acquired.after.attempts, 1);
assert.equal(acquired.after.state, "DRAWING");
assert.equal(acquired.after.config.eventType, "ITEM");

const replacement = api.replace(["chance-maker", "empty-cup", "pocket-red"], 1);
assert.equal(replacement.started.before.state, "COMMITTING");
assert.equal(replacement.started.before.attempts, 0);
assert.equal(replacement.started.before.config, null);
assert.equal(replacement.started.before.items.length, 3);
assert.equal(replacement.replacementOpened, true);
assert.equal(replacement.attemptsBeforeReplacement, 0);
assert.equal(replacement.completed, true);
assert.equal(replacement.items.length, 3);
assert.equal(replacement.items[1], replacement.started.before.pending);
assert.equal(replacement.attempts, 1);
assert.equal(replacement.state, "DRAWING");

const itemRestart = api.itemRestart();
assert.equal(itemRestart.sameConfig, true);
assert.equal(itemRestart.sameItems, true);
assert.equal(itemRestart.restartAttempts, itemRestart.attempts);
assert.equal(itemRestart.state, "DRAWING");
assert.equal(itemRestart.pending, null);
assert.equal(itemRestart.revealConfirmed, false);

for (const leverage of [1, 2, 3]) {
  const skipped = api.skip(leverage);
  assert.equal(JSON.stringify(skipped.initial), JSON.stringify({ selection: "UNSELECTED", eventId: null }));
  assert.equal(JSON.stringify(skipped.selected), JSON.stringify({ selection: "SKIP", eventId: null }));
  assert.equal(skipped.committed, true);
  assert.equal(skipped.config.eventId, null);
  assert.equal(skipped.config.eventType, "NONE");
  assert.equal(skipped.config.activeBetId, null);
  assert.equal(skipped.config.specialMultiplier, 1);
  assert.equal(skipped.config.leverageMultiplier, leverage);
  assert.equal(skipped.config.finalMultiplier, leverage);
  assert.equal(skipped.config.formalDrawCount, 15);
  assert.equal(skipped.status, "本局未選擇場中事件");
  assert.equal(skipped.attempts, leverage);
  assert.equal(skipped.restartState, "DRAWING");
  assert.equal(skipped.sameConfig, true);
  assert.equal(skipped.restartAttempts, leverage);
  assert.equal(JSON.stringify(skipped.items), "[]");
}

const switched = api.switchSelection();
assert.equal(switched.eventSelected.type, "EVENT");
assert.equal(switched.skipSelected.type, "SKIP");
assert.equal(switched.skipSelected.id, null);
assert.equal(switched.eventAgain.type, "EVENT");
assert.equal(switched.eventAgain.id, switched.eventSelected.id);

const persistence = api.persistence();
assert.equal(JSON.stringify(persistence.afterRound), '["chance-maker","empty-cup"]');
assert.equal(JSON.stringify(persistence.afterNewGame), "[]");

const chance = api.chanceMaker();
assert.equal(JSON.stringify(chance), JSON.stringify({ first: 5, second: 5, reset: false }));

for (const [itemId, target] of [["pocket-green", "green"], ["pocket-red", "red"], ["pocket-white", "white"]]) {
  const result = api.pocket(itemId);
  assert.equal(result.used, true);
  assert.equal(result.target, target);
  assert.equal(result.beforeIndex, result.afterIndex);
  assert.equal(JSON.stringify(result.items), "[]");
  assert.equal(result.drawn.includes(target), true);
  assert.equal(result.drawn.includes("wan-1"), true);
  assert.equal(JSON.stringify(result.beforeDrawn), '["wan-1"]');
  assert.equal(result.order.length, 35);
  assert.equal(new Set(result.order).size, 35);
  assert.equal(result.order.includes(target), false);
  assert.equal(result.activeItemUses, 1);
  assert.equal(result.picker, null);
  assert.equal(result.overlay, false);
}
const unavailablePocket = api.pocket("pocket-green", true);
assert.equal(unavailablePocket.used, false);
assert.equal(JSON.stringify(unavailablePocket.items), '["pocket-green"]');
assert.equal(unavailablePocket.activeItemUses, 0);

const multiPocket = api.multiPocket();
assert.equal(JSON.stringify(multiPocket.results), "[true,true,true]");
assert.equal(multiPocket.drawIndex, 4);
assert.equal(JSON.stringify(multiPocket.items), "[]");
assert.equal(["red", "green", "white"].every(id => multiPocket.drawn.includes(id)), true);
assert.equal(["red", "green", "white"].every(id => !multiPocket.order.includes(id)), true);
assert.equal(multiPocket.activeItemUses, 3);
assert.equal(multiPocket.tacticsMaster, true);

const linePocket = api.pocketEffects(true); assert.equal(linePocket.line, true); assert.equal(linePocket.collection, true); assert.equal(linePocket.targetDrawn, true);
const waitingPocket = api.pocketEffects(false); assert.equal(waitingPocket.waited, true); assert.equal(waitingPocket.targetDrawn, true);
const pocketTransaction = api.pocketBetAndRestart();
assert.equal(pocketTransaction.betWon, true); assert.equal(pocketTransaction.beforeRestart.uses, 3); assert.equal(pocketTransaction.beforeRestart.honors, true);
assert.equal(JSON.stringify(pocketTransaction.afterRestart.items), "[]"); assert.equal(pocketTransaction.afterRestart.uses, 0); assert.equal(pocketTransaction.afterRestart.honors, false);
assert.equal(JSON.stringify(api.guojuBoundary(5)), JSON.stringify({ won: false, points: -30 }));
assert.equal(JSON.stringify(api.guojuBoundary(6)), JSON.stringify({ won: true, points: 30 }));
assert.equal(JSON.stringify(api.guojuBoundary(7)), JSON.stringify({ won: true, points: 30 }));

const overview = api.overview();
assert.equal(overview.opened, true);
assert.equal(overview.backgroundLocked, true);
assert.equal(overview.stayedOpen, true);
assert.equal(overview.closed, true);
assert.equal(overview.stateBefore, "DRAWING");
assert.equal(overview.stateAfter, "DRAWING");
assert.equal(overview.uiUnlocked, true);
assert.equal(overview.restartClosed, true);
assert.equal(overview.hidden, "true");
assert.equal((overview.html.match(/class="overview-tile/g) || []).length, 34);
assert.match(overview.html, /mini-board-tile[^>]*event-tile[^>]*aria-label="事件 A/);
assert.doesNotMatch(overview.html, /overview-tile[^>]*aria-label="事件 A/);
assert.match(overview.html, /overview-tile acquired[^>]*aria-label="一萬，已取得"/);
assert.match(pageHtml, /id="tile-overview-close"[^>]*>關閉<\/button>/);
assert.doesNotMatch(gameSource, /tilePeekButton\.addEventListener\("pointerdown"/);
for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
  assert.doesNotMatch(gameSource, new RegExp(`tilePeekButton\\.addEventListener\\([^\\n]*${type}`));
}
assert.doesNotMatch(gameSource, /setPointerCapture|releasePointerCapture/);
assert.match(gameSource, /tilePeekButton\.addEventListener\("click", showTileOverview\)/);
assert.match(gameSource, /tileOverviewClose\.addEventListener\("click", hideTileOverview\)/);
assert.match(styleSource, /\.tile-overview-overlay\.open\{display:grid;pointer-events:auto\}/);
assert.match(pageHtml, /<h1>摸麻將Plus<\/h1>/);
assert.doesNotMatch(pageHtml, /MoMaJohnPlus/);
assert.match(styleSource, /\.player-name-field input\{[^}]*text-align:center/);
assert.match(gameSource, /hasDecorativeSingleCharacterIcon = \/\^\\p\{Script=Han\}\$\/u/);
assert.match(gameSource, /modalIcon\.textContent = hasDecorativeSingleCharacterIcon \? "" : icon/);

const options = api.optionsNavigation();
assert.equal(options.opened, true);
assert.equal(JSON.stringify(options.optionActions), JSON.stringify(["說明", "回主選單", "關閉"]));
assert.equal(JSON.stringify(options.optionClasses), JSON.stringify(["secondary", "secondary", null]));
assert.equal(options.closePreserved, true);
assert.equal(options.helpTitle, "說明");
assert.equal(options.returnedToOptions, true);
assert.equal(options.helpPreserved, true);
assert.equal(options.usesMainMenuConfirmation, true);
assert.equal(options.controlsUnlockedAfterCancel, true);
assert.equal(options.optionListenerCount, 1);
assert.equal(options.finalOverlayOpen, false);

assert.equal(JSON.stringify(api.earlyWaiting(5)), JSON.stringify({ points: 100, earned: true }));
assert.equal(JSON.stringify(api.earlyWaiting(6)), JSON.stringify({ points: 0, earned: false }));

assert.equal(JSON.stringify(api.floorScore()), JSON.stringify({ score: 0, delta: -5 }));

console.log("Phase 1-D Item and quick-overview tests: PASS");
