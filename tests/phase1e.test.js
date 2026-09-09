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
const source = fs.readFileSync(path.join(root, "game-config.js"), "utf8") + "\n" + fs.readFileSync(path.join(root, "game.js"), "utf8");
vm.runInContext(source, context, { filename: "phase1e-bundle.js" });
context.assert = assert;
// All randomness in this suite is deterministic, including board shuffles.
vm.runInContext('Math = Object.create(Math); Math.random = () => 0.314159;', context);
vm.runInContext(`
const charm = "disposable-charm";
const eventById = id => EVENT_DEFINITIONS.find(event => event.id === id);
function setup(items = []) {
  game = freshGameState("Phase 1-E");
  game.items = [...items];
  game.score = 30;
  game.round = createRound(15, []);
  game.round.config = Object.freeze({ formalDrawCount: 15, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null, eventType: "NONE" });
  game.round.started = game.round.committed = true;
  game.round.drawIndex = 4;
  game.round.drawn.add("wan-1");
  game.attemptsConsumed = 1;
  game.state = GAME_STATES.DRAWING;
}
function reveal(id) {
  game.state = GAME_STATES.EVENT_REVEAL;
  game.pendingSpecial = { tile: GAME_TILES.find(tile => tile.id === "event-1"), resolved: false, result: null };
  const pool = EVENT_DEFINITIONS.filter(event => event.enabled);
  const index = pool.findIndex(event => event.id === id);
  const total = pool.reduce((sum, event) => sum + getEffectiveEventWeight(event), 0);
  const offset = pool.slice(0, index).reduce((sum, event) => sum + getEffectiveEventWeight(event), 0);
  const original = Math.random;
  Math.random = () => (offset + getEffectiveEventWeight(pool[index]) / 2) / total;
  try { revealSpecialEvent(); } finally { Math.random = original; }
  assert.equal(game.pendingSpecial.eventId, id);
  return game.pendingSpecial.result;
}
const snapshot = () => JSON.stringify({
  score: game.score, raw: game.round.rawPoints, attempts: game.attemptsConsumed,
  granted: game.totalAttemptsGranted, drawn: [...game.round.drawn], index: game.round.drawIndex,
  loss: game.stats.eventScoreLoss, earlyEnd: game.stats.eventEarlyEndCount,
  gameOver: game.stats.gameOverByEvent, removed: game.stats.boardRemoveEventCount
});

setup();
assert.equal(PRE_ROUND_EVENT_DEFINITIONS.filter(e => e.type === "BET").length, 9);
assert.equal(PRE_ROUND_EVENT_DEFINITIONS.filter(e => e.type === "SPECIAL").length, 6);
const gift = PRE_ROUND_EVENT_DEFINITIONS.find(e => e.type === "ITEM");
assert.equal(getPreRoundEventWeight(gift), ITEM_DEFINITIONS.length);
assert.equal(getPreRoundEventWeight(gift), 10);
assert.equal(PRE_ROUND_EVENT_DEFINITIONS.reduce((sum, e) => sum + getPreRoundEventWeight(e), 0), 25);
assert.equal(PRE_ROUND_EVENT_DEFINITIONS.some(e => e.type === "SKIP" || /skip/i.test(e.id)), false);
for (let i = 0; i < 1000; i += 1) {
  const options = drawPreRoundEvents(() => (i + 0.5) / 1000);
  assert.equal(options.length, 3);
  assert.equal(new Set(options.map(e => e.id)).size, 3);
  assert.ok(options.filter(e => e.type === "ITEM").length <= 1);
}
assert.equal(drawPreRoundEvents(() => 0)[0], gift);
assert.equal(drawPreRoundEvents(() => 0)[0], drawPreRoundEvents(() => 0)[0]);
assert.equal(weightedRandom(PRE_ROUND_EVENT_DEFINITIONS, 0.3999, getPreRoundEventWeight), gift);
assert.notEqual(weightedRandom(PRE_ROUND_EVENT_DEFINITIONS, 0.4, getPreRoundEventWeight), gift);
let values = [10.5 / 25, 10.5 / 24, 10.5 / 23];
assert.ok(drawPreRoundEvents(() => values.shift()).every(e => e.type === "BET"));
assert.ok(drawPreRoundEvents(() => 0.9999).every(e => e.type === "SPECIAL"));

for (const [items, score] of [
  [["great-fortune"], 2], [["small-fortune"], 1], [["small-misfortune"], -1], [["great-misfortune"], -2],
  [["great-fortune", "great-misfortune"], 0], [["great-fortune", "small-misfortune"], 1],
  [["small-fortune", "great-misfortune"], -1], [["great-fortune", "small-fortune"], 3],
  [["great-misfortune", "small-misfortune"], -3], [["great-fortune", "great-fortune", "great-fortune"], 6],
  [["great-misfortune", "great-misfortune", "great-misfortune"], -6], [[charm, "empty-cup"], 0]
]) { setup(items); assert.equal(getFortuneScore(), score); }
const expected = [[0.25,4],[0.5,2.5],[0.75,1.5],[1,1],[1.5,0.75],[2.5,0.5],[4,0.25]];
for (let score = -6; score <= 6; score += 1) {
  const [positive, negative] = expected[Math.max(-3, Math.min(3, score)) + 3];
  assert.equal(getFortuneModifier("POSITIVE", score), positive);
  assert.equal(getFortuneModifier("NEGATIVE", score), negative);
  assert.equal(getFortuneModifier("NEUTRAL", score), 1);
}
const base = JSON.stringify(EVENT_DEFINITIONS);
for (const items of [[], ["great-fortune", "small-fortune"], ["great-misfortune", "small-misfortune"], ["great-fortune", "great-misfortune"]]) {
  setup(items);
  const pool = EVENT_DEFINITIONS.filter(e => e.enabled);
  const total = pool.reduce((sum, e) => sum + getEffectiveEventWeight(e), 0);
  let offset = 0;
  for (const event of pool) {
    const weight = getEffectiveEventWeight(event);
    assert.ok(weight > 0);
    if (event.sentiment === "NEUTRAL" || getFortuneScore() === 0) assert.equal(weight, event.weight);
    // Every event remains reachable, even positive at -3 and negative at +3.
    assert.equal(drawInRoundEvent((offset + weight / 2) / total), event);
    offset += weight;
  }
  for (let i = 0; i < 100; i += 1) drawInRoundEvent((i + 0.5) / 100);
  assert.equal(JSON.stringify(EVENT_DEFINITIONS), base);
}
// Production calls drawInRoundEvent() without an argument. Its default must
// evaluate Math.random(), rather than pass the Math.random function object.
setup();
const productionRandomResults = [];
const originalRandom = Math.random;
try {
  for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
    Math.random = () => value;
    const expectedEvent = weightedRandom(
      EVENT_DEFINITIONS.filter(event => event.enabled),
      value,
      getEffectiveEventWeight
    );
    const productionEvent = drawInRoundEvent();
    assert.equal(productionEvent, expectedEvent);
    productionRandomResults.push(productionEvent.id);
  }
} finally {
  Math.random = originalRandom;
}
assert.equal(productionRandomResults[0], EVENT_DEFINITIONS.find(event => event.enabled).id);
assert.equal(productionRandomResults.at(-1), EVENT_DEFINITIONS.filter(event => event.enabled).at(-1).id);
assert.ok(new Set(productionRandomResults).size > 1);
assert.equal(Math.random, originalRandom);
setup(["great-fortune"]);
const positive = eventById("boss-happy");
assert.equal(getEffectiveEventWeight(positive), positive.weight * 2.5);
game.items[0] = "great-misfortune";
assert.equal(getEffectiveEventWeight(positive), positive.weight * 0.5);
game.items.splice(0, 1);
assert.equal(getEffectiveEventWeight(positive), positive.weight);
// Disabled definitions are excluded regardless of their effective weight.
const first = EVENT_DEFINITIONS[0];
first.enabled = false;
assert.notEqual(drawInRoundEvent(0), first);
first.enabled = true;

for (const event of EVENT_DEFINITIONS.filter(e => e.sentiment === "NEGATIVE")) {
  setup([charm]);
  const before = snapshot();
  const handler = EVENT_EFFECT_HANDLERS[event.effectType];
  EVENT_EFFECT_HANDLERS[event.effectType] = () => { throw new Error("Blocked handler executed: " + event.id); };
  try { assert.equal(reveal(event.id).blocked, true); }
  finally { EVENT_EFFECT_HANDLERS[event.effectType] = handler; }
  assert.equal(game.items.length, 0);
  assert.equal(snapshot(), before);
  assert.equal(elements.modalTitle.textContent, "免洗護身符發動！");
  assert.ok(elements.modalBody.innerHTML.includes(event.title));
  assert.ok(elements.modalBody.innerHTML.includes("護身符已消耗"));
  revealSpecialEvent(); // Duplicate reveal cannot rerun or redraw an effect.
  assert.equal(snapshot(), before);
  finishSpecialEvent();
  assert.equal(game.state, GAME_STATES.DRAWING);
  assert.equal(game.round.pointsSettled, false);
  assert.equal(snapshot(), before);
  openItemStatus();
  assert.equal((elements.modalBody.innerHTML.match(/空道具格/g) || []).length, 3);
  closeItemStatus();
}
assert.equal(eventById("blackout").sentiment, "NEGATIVE");
setup([charm]);
assert.equal(reveal("drain").blocked, true);
finishSpecialEvent();
assert.equal(reveal("drain").blocked, undefined);
assert.equal(game.round.rawPoints, -2);
assert.equal(game.stats.eventScoreLoss, 2);
setup([charm, "empty-cup", charm]);
assert.equal(reveal("explosion").blocked, true);
assert.equal(JSON.stringify(game.items), JSON.stringify(["empty-cup", charm]));
finishSpecialEvent();
assert.equal(reveal("blackout").blocked, true);
assert.equal(JSON.stringify(game.items), JSON.stringify(["empty-cup"]));
for (const id of ["boss-happy", "five-tiao-mistake", "sleight-of-hand", "baseball-reset"]) {
  setup([charm]);
  assert.equal(reveal(id).blocked, undefined);
  assert.equal(game.items[0], charm);
  finishSpecialEvent();
  assert.equal(game.items[0], charm);
}
setup([charm]);
game.round.config = { activeBetId: "believe-guoju" };
game.score = 5;
const bet = settleBets()[0];
assert.equal(bet.points, -30);
assert.equal(game.score, 0);
assert.equal(game.items[0], charm);
setup();
assert.equal(reveal("explosion").gameOver, true);
assert.equal(game.stats.gameOverByEvent, true);
assert.equal(attemptsRemaining(), 0);
finishSpecialEvent();
assert.equal(game.state, GAME_STATES.ROUND_END);
showGameOver();
assert.equal(game.state, GAME_STATES.GAME_OVER);
setup();
assert.equal(reveal("blackout").endRound, true);
finishSpecialEvent();
assert.equal(game.state, GAME_STATES.ROUND_END);
setup();
reveal("on-purpose-accident");
assert.equal(game.round.drawn.has("wan-1"), false);

for (const consumed of [false, true]) {
  setup([charm, "great-fortune"]);
  if (consumed) { reveal("drain"); finishSpecialEvent(); }
  reveal("baseball-reset");
  finishSpecialEvent();
  assert.equal(game.items.includes(charm), !consumed);
  // Use the actual replacement transaction before the baseball restart.
  const giftEvent = PRE_ROUND_EVENT_DEFINITIONS.find(e => e.id === "mystery-gift");
  game.items = ["great-fortune", "empty-cup", ...(consumed ? ["empty-cup"] : [charm])];
  game.round.pendingItemId = "great-misfortune";
  game.round.itemRevealConfirmed = true;
  game.state = GAME_STATES.COMMITTING;
  game.round.config = null;
  assert.equal(completeItemReplacement(giftEvent, 1, 0), true);
  assert.equal(getEffectiveEventWeight(positive), positive.weight * 0.5);
  const items = JSON.stringify(game.items), attempts = game.attemptsConsumed, config = game.round.config;
  reveal("baseball-reset");
  finishSpecialEvent();
  assert.equal(JSON.stringify(game.items), items);
  assert.equal(game.items.includes(charm), !consumed);
  assert.equal(getFortuneScore(), -2);
  assert.equal(getEffectiveEventWeight(positive), positive.weight * 0.5);
  assert.equal(game.attemptsConsumed, attempts);
  assert.equal(game.round.config, config);
  assert.equal(game.state, GAME_STATES.DRAWING);
}
// Blocking a last-card event still follows the normal last-card BONUS path.
setup([charm]);
game.round.board = [...GAME_TILES];
game.round.drawn = new Set(LINE_DEFINITIONS[0].indexes.slice(0, 5).map(i => game.round.board[i].id));
game.round.activeWaiting.add("row-0");
game.round.drawIndex = 15;
reveal("blackout");
const originalTimeout = setTimeout;
let scheduledFinish;
setTimeout = (callback, delay) => { if (delay === 250) scheduledFinish = callback; };
finishSpecialEvent();
setTimeout = originalTimeout;
assert.equal(scheduledFinish, finishRegularDraws);
scheduledFinish();
assert.equal(game.state, GAME_STATES.BONUS_PENDING);
assert.equal(game.stats.eventEarlyEndCount, 0);
setup();
game.score = 1;
addRoundPoints(-5);
assert.equal(game.round.rawPoints, -5);
settleRoundPoints();
assert.equal(game.round.multiplierPoints, -5);
assert.equal(game.score, 0);
assert.equal(JSON.stringify(EVENT_DEFINITIONS), base);
`, context, { filename: "phase1e-cases.js" });
console.log("Phase 1-E weighted selection, fortune, shield and restart tests: PASS");
