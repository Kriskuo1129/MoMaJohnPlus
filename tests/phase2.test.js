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
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.listeners = new Map(); this.textContent = ""; this.disabled = false; this._innerHTML = ""; }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
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
const document = { querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(), documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true } };
const context = vm.createContext({
  console, document, localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, Math, Object, Array, Set, Map, String, Number, Boolean
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
let phase2AcquireCount = 0;
let phase2RandomTileCount = 0;
const phase2OriginalAcquire = acquireFormalTile;
const phase2OriginalRandomTile = selectRandomRemainingTile;
acquireFormalTile = async tile => { phase2AcquireCount += 1; return phase2OriginalAcquire(tile); };
selectRandomRemainingTile = (tiles, random) => { phase2RandomTileCount += 1; return phase2OriginalRandomTile(tiles, random); };
globalThis.phase2Test = {
  definitions: MINIGAME_DEFINITIONS,
  setup(formalDrawCount = 15, forcedMiniGameId = null) {
    game = freshGameState("TEST"); game.round = createRound(formalDrawCount, []);
    game.round.committed = true; game.round.started = true;
    game.round.config = { formalDrawCount, forcedMiniGameId, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null };
    game.state = GAME_STATES.DRAWING; phase2AcquireCount = 0; phase2RandomTileCount = 0; return game.round;
  },
  putNext(round, tileId) { const order = [...round.hand, ...round.remaining]; const targetIndex = order.findIndex(tile => tile.id === tileId); [order[round.drawIndex], order[targetIndex]] = [order[targetIndex], order[round.drawIndex]]; round.hand = order.slice(0, round.formalDrawCount); round.remaining = order.slice(round.formalDrawCount); },
  available() { return getAvailableMiniGames().map(definition => definition.id); },
  select(random, forced = null) { this.setup(15, forced); return selectMiniGameForRound(() => random)?.id; },
  offerAt(drawIndex, formalDrawCount = 15, forced = null) { const round = this.setup(formalDrawCount, forced); round.drawIndex = drawIndex; return { offered: openMiniGameOffer(), state: game.state, selectedId: round.miniGame.selectedId }; },
  placeholder(random) { return runMiniGamePlaceholder(() => random); },
  async direct(forced = null) {
    const round = this.setup(15, forced); round.drawIndex = 12; openMiniGameOffer(); const result = await directDrawMiniGameTile();
    return { result, drawIndex: round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount, completed: round.miniGame.completed, state: game.state, secondOffer: openMiniGameOffer() };
  },
  async challenge(success, forced = null) {
    const round = this.setup(15, forced); round.drawIndex = 12; openMiniGameOffer(); startMiniGame();
    const before = { drawIndex: round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount };
    const resolution = await resolveMiniGameChallenge({ success });
    return { round, resolution, before, state: game.state, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount, picker: round.tilePicker };
  },
  async finishFailure(doubleClick = false) {
    const first = completeFailureMiniGameDraw();
    const second = doubleClick ? completeFailureMiniGameDraw() : false;
    const result = await first;
    return { result, second, drawIndex: game.round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount, completed: game.round.miniGame.completed, state: game.state };
  },
  selectTile(tileId) { return selectTilePickerTile(tileId); },
  async confirm() { return confirmTilePicker(); },
  pickerState() { const picker = game.round.tilePicker; return { selected: picker?.selectedTileId, confirmDisabled: document.querySelector("#modal-actions").children.at(-1)?.disabled, drawIndex: game.round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount }; },
  overviewRoundTrip() { showTilePickerOverview(); hideTileOverview(); return game.round.tilePicker?.selectedTileId; },
  miniBoardState() {
    const round = this.setup();
    round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)];
    round.drawn.add(round.board[0].id);
    round.activeWaiting.add(LINE_DEFINITIONS[1].id);
    round.completedLines.add(LINE_DEFINITIONS[0].id);
    const html = renderMiniBoardOverview();
    return { html, order: round.board.map(tile => tile.id), cells: (html.match(/class="mini-board-tile/g) || []).length };
  },
  uncommittedOverview(kind = "reward") {
    const round = this.setup(); round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)]; round.drawn.add("wan-1");
    if (kind === "reward") {
      round.drawIndex = 12; round.miniGame.challengeResolved = true; round.miniGame.challengeResult = "SUCCESS"; game.state = GAME_STATES.MINIGAME_ACTIVE; openMiniGameRewardPicker();
    } else {
      game.items = ["pocket-green"]; game.uiOverlayOpen = true; beginPocketItemUse(0);
    }
    const selected = kind === "reward" ? game.round.tilePicker.tiles.find(id => id !== "wan-1") : "wan-1"; selectTilePickerTile(selected);
    const target = kind === "pocket" ? "green" : selected;
    return { selected, target, targetLabel: CORE_TILES.find(tile => tile.id === target).label, html: renderMiniBoardOverview(), drawn: game.round.drawn.has(target) };
  },
  async formalEffects() {
    const round = this.setup(); round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)];
    const ids = LINE_DEFINITIONS[0].indexes.map(index => round.board[index].id); ids.slice(0, 5).forEach(id => round.drawn.add(id));
    round.drawIndex = 12; this.putNext(round, ids[5]); round.miniGame.challengeResolved = true; round.miniGame.challengeResult = "SUCCESS"; game.state = GAME_STATES.MINIGAME_ACTIVE; openMiniGameRewardPicker();
    selectTilePickerTile(ids[5]); await confirmTilePicker(); return { drawIndex: round.drawIndex, drawn: isOfficiallyDrawn(ids[5]), line: round.completedLines.has(LINE_DEFINITIONS[0].id) };
  },
  async waitingEffect() {
    const round = this.setup(); round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)];
    const ids = LINE_DEFINITIONS[0].indexes.map(index => round.board[index].id); ids.slice(0, 4).forEach(id => round.drawn.add(id));
    round.drawIndex = 12; this.putNext(round, ids[4]); round.miniGame.challengeResolved = true; round.miniGame.challengeResult = "SUCCESS"; game.state = GAME_STATES.MINIGAME_ACTIVE; openMiniGameRewardPicker();
    selectTilePickerTile(ids[4]); await confirmTilePicker(); return { everWaited: round.everWaited, waiting: round.activeWaiting.size };
  },
  async betEffect() {
    const round = this.setup(); game.score = 100; round.config.activeBetId = "chiikawa"; round.drawn.add("wan-1"); round.drawn.add("tong-1");
    round.drawIndex = 12; this.putNext(round, "suo-1"); round.miniGame.challengeResolved = true; round.miniGame.challengeResult = "SUCCESS"; game.state = GAME_STATES.MINIGAME_ACTIVE; openMiniGameRewardPicker();
    selectTilePickerTile("suo-1"); await confirmTilePicker(); return settleBets()[0]?.won;
  },
  pocketCancel(itemId) {
    const round = this.setup(); game.items = [itemId]; round.drawn.add("wan-1"); game.uiOverlayOpen = true;
    const before = { items: [...game.items], drawn: [...round.drawn], hand: round.hand.map(tile => tile.id), remaining: round.remaining.map(tile => tile.id) };
    beginPocketItemUse(0); selectTilePickerTile("wan-1"); cancelTilePicker();
    return { before, after: { items: [...game.items], drawn: [...round.drawn], hand: round.hand.map(tile => tile.id), remaining: round.remaining.map(tile => tile.id) } };
  },
  restart(forced) {
    const round = this.setup(15, forced); round.drawIndex = 12; openMiniGameOffer(); startMiniGame(); resolveMiniGameChallenge({ success: true }); selectTilePickerTile(game.round.tilePicker.tiles[0]);
    const attempts = game.attemptsConsumed; restartCurrentRound(); return { miniGame: game.round.miniGame, tilePicker: game.round.tilePicker, forced: game.round.config.forcedMiniGameId, attemptsSame: game.attemptsConsumed === attempts };
  },
  bonusDoesNotOffer() { const round = this.setup(); round.drawIndex = 12; game.state = GAME_STATES.BONUS_DRAW; return openMiniGameOffer(); }
};`;
vm.runInContext(source, context);
const api = context.phase2Test;

(async () => {
  assert.deepEqual([...api.available()], ["pachinko", "baseball9", "memoryMaster"]);
  assert.equal(api.select(0), "pachinko"); assert.equal(api.select(0.4), "baseball9"); assert.equal(api.select(0.8), "memoryMaster");
  assert.equal(api.select(0.8, "pachinko"), "pachinko"); assert.equal(api.select(0.2, "baseball9"), "baseball9");
  assert.deepEqual(JSON.parse(JSON.stringify(api.placeholder(0.1))), { success: true });
  assert.deepEqual(JSON.parse(JSON.stringify(api.placeholder(0.9))), { success: false });

  for (let index = 0; index < 12; index += 1) assert.equal(api.offerAt(index).offered, false);
  for (const count of [14, 15, 16]) assert.equal(api.offerAt(12, count).state, "MINIGAME_OFFER");
  for (const index of [13, 14, 15]) assert.equal(api.offerAt(index, 16).offered, false);

  const direct = await api.direct();
  assert.deepEqual({ drawIndex: direct.drawIndex, acquired: direct.acquired, randomTiles: direct.randomTiles, completed: direct.completed, state: direct.state, secondOffer: direct.secondOffer }, { drawIndex: 13, acquired: 1, randomTiles: 1, completed: true, state: "DRAWING", secondOffer: false });
  const failure = await api.challenge(false);
  assert.equal(failure.before.drawIndex, 12); assert.equal(failure.picker, null); assert.equal(failure.round.drawIndex, 12); assert.equal(failure.acquired, 0); assert.equal(failure.randomTiles, 0); assert.equal(failure.round.rawPoints, 0); assert.equal(failure.state, "MINIGAME_ACTIVE");
  const failedDraw = await api.finishFailure(true);
  assert.deepEqual({ drawIndex: failedDraw.drawIndex, acquired: failedDraw.acquired, randomTiles: failedDraw.randomTiles, completed: failedDraw.completed, state: failedDraw.state, second: failedDraw.second }, { drawIndex: 13, acquired: 1, randomTiles: 1, completed: true, state: "DRAWING", second: false });

  const success = await api.challenge(true);
  assert.equal(success.state, "MINIGAME_REWARD"); assert.ok(success.picker.tiles.length > 0); assert.equal(success.acquired, 0); assert.equal(success.randomTiles, 0); assert.equal(api.pickerState().confirmDisabled, true);
  const first = success.picker.tiles[0]; const second = success.picker.tiles[1];
  api.selectTile(first); assert.equal(api.pickerState().selected, first); assert.equal(api.pickerState().confirmDisabled, false); assert.equal(api.pickerState().acquired, 0);
  api.selectTile(second); assert.equal(api.pickerState().selected, second); assert.equal(api.overviewRoundTrip(), second);
  const confirmed = await api.confirm(); assert.equal(confirmed, second); assert.equal(api.pickerState().drawIndex, 13); assert.equal(api.pickerState().acquired, 1); assert.equal(api.pickerState().randomTiles, 0); assert.equal(success.round.drawn.has(second), true);

  for (const forced of ["pachinko", "baseball9"]) {
    const forcedSuccess = await api.challenge(true, forced); assert.equal(forcedSuccess.round.miniGame.selectedId, forced); assert.ok(forcedSuccess.picker);
    const forcedFailure = await api.challenge(false, forced); assert.equal(forcedFailure.round.drawIndex, 12); assert.equal((await api.finishFailure()).drawIndex, 13); assert.equal((await api.direct(forced)).drawIndex, 13);
  }
  const miniBoard = api.miniBoardState();
  assert.equal(miniBoard.cells, 36); assert.deepEqual(miniBoard.order, api.miniBoardState().order); assert.match(miniBoard.html, /mini-line-completed/); assert.match(miniBoard.html, /mini-line-waiting/); assert.match(miniBoard.html, /tile-acquired/); assert.match(miniBoard.html, /tile-unclaimed/); assert.doesNotMatch(miniBoard.html, /<button/);
  for (const kind of ["reward", "pocket"]) { const pending = api.uncommittedOverview(kind); assert.equal(pending.drawn, false); assert.match(pending.html, new RegExp(`aria-label="${pending.targetLabel}，尚未取得"`)); }
  const line = await api.formalEffects(); assert.equal(line.drawIndex, 13); assert.equal(line.drawn, true); assert.equal(line.line, true);
  const waiting = await api.waitingEffect(); assert.equal(waiting.everWaited, true); assert.ok(waiting.waiting > 0); assert.equal(await api.betEffect(), true);
  for (const itemId of ["pocket-green", "pocket-red", "pocket-white"]) { const cancelled = api.pocketCancel(itemId); assert.deepEqual(cancelled.after, cancelled.before); }

  const restarted = api.restart("pachinko");
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.miniGame)), { offered: false, completed: false, selectedId: null, challengeResult: null, challengeResolved: false, failureDrawStarted: false, memory: null });
  assert.equal(restarted.tilePicker, null); assert.equal(restarted.forced, "pachinko"); assert.equal(restarted.attemptsSame, true); assert.equal(api.bonusDoesNotOffer(), false);
  console.log("Phase 2 challenge contract and shared tile picker tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
