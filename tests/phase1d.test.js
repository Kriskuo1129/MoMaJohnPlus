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
  }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML; }
  addEventListener() {}
  append(child) { this.children.push(child); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  closest() { return this; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() {}
  remove() {}
  setPointerCapture() {}
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
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
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
    const used = completePocketItemUse(0, sourceTileId);
    const order = [...game.round.hand, ...game.round.remaining].map(tile => tile.id);
    return { used, beforeIndex, afterIndex: game.round.drawIndex, items: [...game.items], drawn: [...game.round.drawn], order, board: game.round.board.map(tile => tile.id), target: item.targetTileId };
  },
  overview() {
    game = freshGameState("TEST");
    game.round = createRound();
    game.round.drawn.add("wan-1");
    game.state = GAME_STATES.DRAWING;
    showTileOverview({ currentTarget: document.createElement("button"), pointerId: 1 });
    const html = elements.tileOverviewGrid.innerHTML;
    const opened = elements.tileOverviewOverlay.classList.contains("open");
    hideTileOverview();
    return { html, opened, closed: !elements.tileOverviewOverlay.classList.contains("open"), hidden: elements.tileOverviewOverlay.attributes["aria-hidden"] };
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

const overview = api.overview();
assert.equal(overview.opened, true);
assert.equal(overview.closed, true);
assert.equal(overview.hidden, "true");
assert.equal((overview.html.match(/class="overview-tile/g) || []).length, 34);
assert.equal(overview.html.includes("事件 A"), false);
assert.match(overview.html, /overview-tile acquired[^>]*aria-label="一萬，已取得"/);

assert.equal(JSON.stringify(api.floorScore()), JSON.stringify({ score: 0, delta: -5 }));

console.log("Phase 1-D Item and quick-overview tests: PASS");
