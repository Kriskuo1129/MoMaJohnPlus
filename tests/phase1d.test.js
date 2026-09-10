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
  pocket(itemId, sourceTileId, acquiredTarget = false) {
    game = freshGameState("TEST");
    game.items = [itemId];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    game.round.hand = GAME_TILES.slice(0, 15);
    game.round.remaining = GAME_TILES.slice(15);
    game.round.drawn.add(sourceTileId);
    const item = itemById(itemId);
    if (acquiredTarget) game.round.drawn.add(item.targetTileId);
    game.round.drawIndex = 4;
    game.state = GAME_STATES.DRAWING;
    const beforeIndex = game.round.drawIndex;
    const originalRandom = Math.random;
    Math.random = () => { throw new Error("Pocket replacement must not use random selection"); };
    const used = completePocketItemUse(0, sourceTileId);
    Math.random = originalRandom;
    const order = [...game.round.hand, ...game.round.remaining].map(tile => tile.id);
    return { used, beforeIndex, afterIndex: game.round.drawIndex, items: [...game.items], drawn: [...game.round.drawn], order, board: game.round.board.map(tile => tile.id), target: item.targetTileId };
  },
  pocketSelection(itemId, drawnIds, selectedId = null) {
    game = freshGameState("TEST");
    game.items = [itemId];
    game.round = createRound();
    game.round.board = [...GAME_TILES];
    game.round.hand = GAME_TILES.slice(0, 15);
    game.round.remaining = GAME_TILES.slice(15);
    drawnIds.forEach(id => game.round.drawn.add(id));
    game.round.selectedBonusTiles = [GAME_TILES.find(tile => tile.id === "tong-9")];
    game.state = GAME_STATES.DRAWING;
    game.uiOverlayOpen = true;
    const item = itemById(itemId);
    const candidates = pocketReplacementCandidates(item).map(tile => tile.id);
    const opened = beginPocketItemUse(0);
    const modal = { body: elements.modalBody.innerHTML, title: elements.modalTitle.textContent, icon: elements.modalIcon.textContent };
    const before = { items: [...game.items], drawn: [...game.round.drawn], order: [...game.round.hand, ...game.round.remaining].map(tile => tile.id) };
    if (selectedId) completePocketItemUse(0, selectedId); else cancelTilePicker();
    return { candidates, opened, modal, before, after: { items: [...game.items], drawn: [...game.round.drawn], order: [...game.round.hand, ...game.round.remaining].map(tile => tile.id) }, target: item.targetTileId };
  },
  pocketWithoutCandidate() {
    game = freshGameState("TEST");
    game.items = ["pocket-red"];
    game.round = createRound();
    game.state = GAME_STATES.DRAWING;
    game.uiOverlayOpen = true;
    closeModal();
    const opened = beginPocketItemUse(0);
    return { opened, items: [...game.items], drawn: [...game.round.drawn], modalOpen: elements.modal.classList.contains("open"), toast: elements.toastStack.children.at(-1)?.textContent };
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
    const backgroundLocked = elements.drawStack.disabled && elements.itemStatusButton.disabled && elements.helpButton.disabled;
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
  const result = api.pocket(itemId, "wan-1");
  assert.equal(result.used, true);
  assert.equal(result.target, target);
  assert.equal(result.beforeIndex, result.afterIndex);
  assert.equal(JSON.stringify(result.items), "[]");
  assert.equal(result.drawn.includes(target), true);
  assert.equal(result.drawn.includes("wan-1"), false);
  assert.equal(result.order.length, 36);
  assert.equal(new Set(result.order).size, 36);
  assert.equal(new Set(result.board).size, 36);
  assert.equal(result.order.slice(result.afterIndex).includes(target), false);
}
assert.equal(api.pocket("pocket-green", "wan-1", true).used, false);
assert.equal(api.pocket("pocket-green", "event-1").used, false);

const selectedPocket = api.pocketSelection("pocket-red", ["wan-1", "wan-5", "event-1"], "wan-5");
assert.equal(JSON.stringify(selectedPocket.candidates), '["wan-1","wan-5"]');
assert.equal(selectedPocket.opened, true);
assert.equal(selectedPocket.modal.title, "口袋中的中");
assert.equal(selectedPocket.modal.icon, "🀄");
assert.match(selectedPocket.modal.body, /class="hand-tile revealed"[^>]*data-picker-tile-id="wan-1"/);
assert.match(selectedPocket.modal.body, /class="hand-tile revealed"[^>]*data-picker-tile-id="wan-5"/);
assert.doesNotMatch(selectedPocket.modal.body, /data-picker-tile-id="event-1"/);
assert.doesNotMatch(selectedPocket.modal.body, /data-picker-tile-id="tong-9"/);
assert.equal(selectedPocket.after.items.length, 0);
assert.equal(selectedPocket.after.drawn.includes("wan-1"), true);
assert.equal(selectedPocket.after.drawn.includes("wan-5"), false);
assert.equal(selectedPocket.after.drawn.includes(selectedPocket.target), true);
assert.equal(selectedPocket.after.order.includes("wan-5"), true);
assert.equal(selectedPocket.after.order.slice(15).includes(selectedPocket.target), false);

const cancelledPocket = api.pocketSelection("pocket-white", ["wan-1", "wan-5"]);
assert.equal(cancelledPocket.opened, true);
assert.equal(JSON.stringify(cancelledPocket.after), JSON.stringify(cancelledPocket.before));

const emptyPocket = api.pocketWithoutCandidate();
assert.equal(emptyPocket.opened, false);
assert.equal(JSON.stringify(emptyPocket.items), '["pocket-red"]');
assert.equal(JSON.stringify(emptyPocket.drawn), "[]");
assert.equal(emptyPocket.modalOpen, false);
assert.equal(emptyPocket.toast, "目前沒有可以替換的牌");

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

assert.equal(JSON.stringify(api.floorScore()), JSON.stringify({ score: 0, delta: -5 }));

console.log("Phase 1-D Item and quick-overview tests: PASS");
