const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { const on = force ?? !this.values.has(name); if (on) this.values.add(name); else this.values.delete(name); return on; }
}

class FakeElement {
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.textContent = ""; this.disabled = false; this._innerHTML = ""; }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML; }
  addEventListener() {}
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  closest() { return this; }
  setAttribute() {}
  focus() {}
  remove() {}
  getBoundingClientRect() { return { width: 100, height: 50, left: 0, top: 0 }; }
  get offsetWidth() { return 100; }
}

const elements = new Map();
const getElement = selector => { if (!elements.has(selector)) elements.set(selector, new FakeElement()); return elements.get(selector); };
const document = {
  querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(),
  documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true }
};
const context = vm.createContext({
  console, document, localStorage: { getItem: () => "", setItem() {} },
  performance: { now: () => 0 }, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
  Math, Object, Array, Set, Map, String, Number, Boolean
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
globalThis.phase2Test = {
  definitions: MINIGAME_DEFINITIONS,
  setup(formalDrawCount = 15, forcedMiniGameId = null) {
    game = freshGameState("TEST");
    game.round = createRound(formalDrawCount, []);
    game.round.committed = true;
    game.round.started = true;
    game.round.config = { formalDrawCount, forcedMiniGameId, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null };
    game.state = GAME_STATES.DRAWING;
    return game.round;
  },
  available() { return getAvailableMiniGames().map(definition => definition.id); },
  select(random, forced = null) { this.setup(15, forced); return selectMiniGameForRound(() => random)?.id; },
  offerAt(drawIndex, formalDrawCount = 15, forced = null) { const round = this.setup(formalDrawCount, forced); round.drawIndex = drawIndex; return { offered: openMiniGameOffer(), state: game.state, selectedId: round.miniGame.selectedId, snapshot: [...round.miniGame.remainingTiles] }; },
  placeholder(id, random = 0) { this.setup(); game.round.drawIndex = 12; openMiniGameOffer(); game.round.miniGame.selectedId = id; const before = [...game.round.miniGame.remainingTiles]; return { before, result: runPlaceholderMiniGame(before, () => random), unchanged: before.join() === game.round.miniGame.remainingTiles.join() }; },
  async resolve({ direct = false, forced = null, invalid = null, alreadyAcquired = false } = {}) {
    const round = this.setup(15, forced); round.drawIndex = 12; openMiniGameOffer();
    const snapshot = [...round.miniGame.remainingTiles];
    const requested = invalid ?? snapshot[0];
    if (alreadyAcquired) round.drawn.add(requested);
    const result = direct ? await directDrawMiniGameTile() : await resolveMiniGame({ tileId: requested });
    return { requested, result, drawIndex: round.drawIndex, drawn: round.drawn.has(result), remaining: getRemainingFormalTiles().some(tile => tile.id === result), completed: round.miniGame.completed, state: game.state, secondOffer: openMiniGameOffer() };
  },
  async formalEffects() {
    const round = this.setup();
    round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)];
    const line = LINE_DEFINITIONS[0];
    const lineIds = line.indexes.map(index => round.board[index].id);
    lineIds.slice(0, 5).forEach(id => round.drawn.add(id));
    round.drawIndex = 12;
    const target = GAME_TILES.find(tile => tile.id === lineIds[5]);
    placeTileAtNextFormalDraw(target.id);
    await acquireFormalTile(target);
    return { drawIndex: round.drawIndex, drawn: isOfficiallyDrawn(target.id), completedLine: round.completedLines.has(line.id), everWaited: round.everWaited };
  },
  async waitingEffect() {
    const round = this.setup();
    round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)];
    const ids = LINE_DEFINITIONS[0].indexes.map(index => round.board[index].id);
    ids.slice(0, 4).forEach(id => round.drawn.add(id));
    round.drawIndex = 12;
    const target = GAME_TILES.find(tile => tile.id === ids[4]);
    placeTileAtNextFormalDraw(target.id);
    await acquireFormalTile(target);
    return { everWaited: round.everWaited, waitingLines: round.activeWaiting.size };
  },
  async betEffect() {
    const round = this.setup();
    game.score = 100;
    round.config.activeBetId = "chiikawa";
    round.drawn.add("wan-1"); round.drawn.add("tong-1");
    round.drawIndex = 12;
    const target = GAME_TILES.find(tile => tile.id === "suo-1");
    placeTileAtNextFormalDraw(target.id);
    await acquireFormalTile(target);
    return settleBets()[0]?.won;
  },
  restart(forced) { const round = this.setup(15, forced); round.drawIndex = 12; openMiniGameOffer(); const attempts = game.attemptsConsumed; restartCurrentRound(); return { miniGame: game.round.miniGame, forced: game.round.config.forcedMiniGameId, attemptsSame: game.attemptsConsumed === attempts }; },
  bonusDoesNotOffer() { const round = this.setup(); round.drawIndex = 12; game.state = GAME_STATES.BONUS_DRAW; return openMiniGameOffer(); }
};`;
vm.runInContext(source, context);
const api = context.phase2Test;

(async () => {
assert.deepEqual([...api.available()], ["pachinko", "baseball9", "memoryMatch"]);
assert.equal(api.select(0), "pachinko");
assert.equal(api.select(0.4), "baseball9");
assert.equal(api.select(0.8), "memoryMatch");
assert.equal(api.select(0.8, "pachinko"), "pachinko");

for (let drawIndex = 0; drawIndex < 12; drawIndex += 1) assert.equal(api.offerAt(drawIndex).offered, false);
for (const count of [14, 15, 16]) {
  const offer = api.offerAt(12, count);
  assert.equal(offer.offered, true);
  assert.equal(offer.state, "MINIGAME_OFFER");
  assert.ok(offer.snapshot.length > 0);
}
for (const drawIndex of [13, 14, 15]) assert.equal(api.offerAt(drawIndex, 16).offered, false);

for (const id of ["pachinko", "baseball9", "memoryMatch"]) {
  const placeholder = api.placeholder(id, 0.5);
  assert.ok(placeholder.before.includes(placeholder.result.tileId));
  assert.equal(placeholder.unchanged, true);
}

const direct = await api.resolve({ direct: true });
assert.equal(direct.drawIndex, 13);
assert.equal(direct.drawn, true);
assert.equal(direct.remaining, false);
assert.equal(direct.completed, true);
assert.equal(direct.state, "DRAWING");
assert.equal(direct.secondOffer, false);

for (const invalid of ["not-a-tile", "event-1"]) {
  const recovery = await api.resolve({ invalid });
  assert.equal(recovery.drawIndex, 13);
  assert.equal(recovery.drawn, true);
}
const acquiredRecovery = await api.resolve({ alreadyAcquired: true });
assert.notEqual(acquiredRecovery.result, acquiredRecovery.requested);
assert.equal(acquiredRecovery.drawn, true);

assert.equal((await api.resolve({ forced: "pachinko" })).drawIndex, 13);
assert.equal((await api.resolve({ forced: "baseball9" })).drawIndex, 13);
const effects = await api.formalEffects();
assert.equal(effects.drawIndex, 13);
assert.equal(effects.drawn, true);
assert.equal(effects.completedLine, true);
const waiting = await api.waitingEffect();
assert.equal(waiting.everWaited, true);
assert.ok(waiting.waitingLines > 0);
assert.equal(await api.betEffect(), true);

const restarted = api.restart("pachinko");
assert.deepEqual(JSON.parse(JSON.stringify(restarted.miniGame)), { offered: false, completed: false, selectedId: null, remainingTiles: [] });
assert.equal(restarted.forced, "pachinko");
assert.equal(restarted.attemptsSame, true);
assert.equal(api.bonusDoesNotOffer(), false);

console.log("Phase 2 mini-game framework and integration tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
