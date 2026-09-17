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
context.PaJuR = {
  startCount: 0, destroyCount: 0, onComplete: null,
  start({ onComplete }) {
    this.startCount += 1;
    this.onComplete = onComplete;
    let destroyed = false;
    const owner = this;
    return { destroy() { if (destroyed) return false; destroyed = true; owner.destroyCount += 1; return true; } };
  },
  complete(result) { return this.onComplete(result); },
  reset() { this.startCount = 0; this.destroyCount = 0; this.onComplete = null; }
};
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "minigames", "memory-master.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
let phase2AcquireCount = 0;
let phase2RandomTileCount = 0;
let phase2EventChoiceCount = 0;
const phase2OriginalAcquire = acquireFormalTile;
const phase2OriginalRandomTile = selectRandomRemainingTile;
const phase2OriginalEventChoice = openEventChoice;
acquireFormalTile = async (tile, options) => { phase2AcquireCount += 1; return phase2OriginalAcquire(tile, options); };
selectRandomRemainingTile = (tiles, random) => { phase2RandomTileCount += 1; return phase2OriginalRandomTile(tiles, random); };
openEventChoice = tile => { phase2EventChoiceCount += 1; return phase2OriginalEventChoice(tile); };
globalThis.phase2Test = {
  definitions: MINIGAME_DEFINITIONS,
  setup(formalDrawCount = 15, forcedMiniGameId = null) {
    game = freshGameState("TEST"); game.round = createRound(formalDrawCount, []);
    game.round.committed = true; game.round.started = true;
    game.round.config = { formalDrawCount, forcedMiniGameId, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null };
    game.state = GAME_STATES.DRAWING; phase2AcquireCount = 0; phase2RandomTileCount = 0; phase2EventChoiceCount = 0; PaJuR.reset(); return game.round;
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
  async challenge(success, forced = null, futureTileIds = []) {
    const round = this.setup(15, forced); round.drawIndex = 12;
    const order = [...round.hand, ...round.remaining];
    const futureTiles = futureTileIds.map(id => order.splice(order.findIndex(tile => tile.id === id), 1)[0]);
    order.splice(round.drawIndex, 0, ...futureTiles); round.hand = order.slice(0, round.formalDrawCount); round.remaining = order.slice(round.formalDrawCount);
    openMiniGameOffer(); startMiniGame();
    const before = { drawIndex: round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount };
    const resolution = await resolveMiniGameChallenge({ success });
    return { round, resolution, before, state: game.state, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount, picker: round.tilePicker };
  },
  pajurChallenge(success) {
    const round = this.setup(15, "pachinko"); round.drawIndex = 12;
    const before = { score: game.score, attempts: game.attemptsConsumed, multiplier: round.finalMultiplier, items: JSON.stringify(game.items), drawIndex: round.drawIndex };
    openMiniGameOffer(); const started = startMiniGame(); PaJuR.complete({ success });
    return { started, starts: PaJuR.startCount, destroys: PaJuR.destroyCount, controller: round.miniGame.pajur, result: round.miniGame.challengeResult, state: game.state, picker: round.tilePicker, before, after: { score: game.score, attempts: game.attemptsConsumed, multiplier: round.finalMultiplier, items: JSON.stringify(game.items), drawIndex: round.drawIndex } };
  },
  async finishFailure(doubleClick = false) {
    const first = completeFailureMiniGameDraw();
    const second = doubleClick ? completeFailureMiniGameDraw() : false;
    const result = await first;
    return { result, second, drawIndex: game.round.drawIndex, acquired: phase2AcquireCount, randomTiles: phase2RandomTileCount, completed: game.round.miniGame.completed, state: game.state };
  },
  selectTile(tileId) { return selectTilePickerTile(tileId); },
  async confirm() { return confirmTilePicker(); },
  pickerHtml() { return document.querySelector("#modal-body").innerHTML; },
  async rewardEvent(tileId) {
    const result = await this.challenge(true, null, [tileId]); this.selectTile(tileId); const selected = await this.confirm();
    return { selected, drawIndex: result.round.drawIndex, drawn: result.round.drawn.has(tileId), state: game.state, eventChoices: phase2EventChoiceCount };
  },
  async normalEvent(tileId) {
    const round = this.setup(); const tile = GAME_TILES.find(item => item.id === tileId); await acquireFormalTile(tile);
    return { drawIndex: round.drawIndex, drawn: round.drawn.has(tileId), state: game.state, eventChoices: phase2EventChoiceCount };
  },
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
  uncommittedOverview() {
    const round = this.setup(); round.board = [...CORE_TILES, ...GAME_TILES.filter(tile => tile.special)]; round.drawn.add("wan-1");
    round.drawIndex = 12; round.miniGame.challengeResolved = true; round.miniGame.challengeResult = "SUCCESS"; game.state = GAME_STATES.MINIGAME_ACTIVE; openMiniGameRewardPicker();
    const selected = game.round.tilePicker.tiles.find(id => !GAME_TILES.find(tile => tile.id === id)?.special && id !== "wan-1"); selectTilePickerTile(selected);
    return { selected, target: selected, targetLabel: CORE_TILES.find(tile => tile.id === selected).label, html: renderMiniBoardOverview(), drawn: game.round.drawn.has(selected) };
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

  const pajurSuccess = api.pajurChallenge(true);
  assert.equal(pajurSuccess.started, true); assert.equal(pajurSuccess.starts, 1); assert.equal(pajurSuccess.destroys, 1); assert.equal(pajurSuccess.controller, null); assert.equal(pajurSuccess.result, "SUCCESS"); assert.equal(pajurSuccess.state, "MINIGAME_REWARD"); assert.ok(pajurSuccess.picker); assert.deepEqual(pajurSuccess.after, pajurSuccess.before);
  api.selectTile(pajurSuccess.picker.tiles[0]); await api.confirm(); assert.equal(api.pickerState().drawIndex, 13);
  const pajurFailure = api.pajurChallenge(false);
  assert.equal(pajurFailure.started, true); assert.equal(pajurFailure.starts, 1); assert.equal(pajurFailure.destroys, 1); assert.equal(pajurFailure.controller, null); assert.equal(pajurFailure.result, "FAILURE"); assert.equal(pajurFailure.state, "MINIGAME_ACTIVE"); assert.equal(pajurFailure.picker, null); assert.deepEqual(pajurFailure.after, pajurFailure.before);
  assert.equal((await api.finishFailure()).drawIndex, 13);

  const success = await api.challenge(true, null, ["event-1", "event-2"]);
  assert.equal(success.state, "MINIGAME_REWARD"); assert.ok(success.picker.tiles.length > 0); assert.ok(success.picker.tiles.some(id => !id.startsWith("event-"))); assert.ok(success.picker.tiles.includes("event-1")); assert.ok(success.picker.tiles.includes("event-2")); assert.equal(success.acquired, 0); assert.equal(success.randomTiles, 0); assert.equal(api.pickerState().confirmDisabled, true);
  assert.match(api.pickerHtml(), /data-picker-tile-id="event-1"/); assert.match(api.pickerHtml(), /data-picker-tile-id="event-2"/); assert.match(api.pickerHtml(), /special-face/);
  const ordinary = success.picker.tiles.filter(id => !id.startsWith("event-")); const first = ordinary[0]; const second = ordinary[1];
  api.selectTile(first); assert.equal(api.pickerState().selected, first); assert.equal(api.pickerState().confirmDisabled, false); assert.equal(api.pickerState().acquired, 0);
  api.selectTile(second); assert.equal(api.pickerState().selected, second); assert.equal(api.overviewRoundTrip(), second);
  const confirmed = await api.confirm(); assert.equal(confirmed, second); assert.equal(api.pickerState().drawIndex, 13); assert.equal(api.pickerState().acquired, 1); assert.equal(api.pickerState().randomTiles, 0); assert.equal(success.round.drawn.has(second), true);

  for (const eventId of ["event-1", "event-2"]) {
    const rewardEvent = await api.rewardEvent(eventId);
    assert.equal(rewardEvent.selected, eventId); assert.equal(rewardEvent.drawIndex, 13); assert.equal(rewardEvent.drawn, true); assert.equal(rewardEvent.state, "DRAWING"); assert.equal(rewardEvent.eventChoices, 0);
  }
  const normalEvent = await api.normalEvent("event-1");
  assert.equal(normalEvent.drawIndex, 1); assert.equal(normalEvent.drawn, true); assert.equal(normalEvent.state, "EVENT_REVEAL"); assert.equal(normalEvent.eventChoices, 1);

  for (const forced of ["pachinko", "baseball9"]) {
    const forcedSuccess = await api.challenge(true, forced); assert.equal(forcedSuccess.round.miniGame.selectedId, forced); assert.ok(forcedSuccess.picker);
    const forcedFailure = await api.challenge(false, forced); assert.equal(forcedFailure.round.drawIndex, 12); assert.equal((await api.finishFailure()).drawIndex, 13); assert.equal((await api.direct(forced)).drawIndex, 13);
  }
  const miniBoard = api.miniBoardState();
  assert.equal(miniBoard.cells, 36); assert.deepEqual(miniBoard.order, api.miniBoardState().order); assert.match(miniBoard.html, /mini-line-completed/); assert.match(miniBoard.html, /mini-line-waiting/); assert.match(miniBoard.html, /tile-acquired/); assert.match(miniBoard.html, /tile-unclaimed/); assert.doesNotMatch(miniBoard.html, /<button/);
  const pending = api.uncommittedOverview(); assert.equal(pending.drawn, false); assert.match(pending.html, new RegExp(`aria-label="${pending.targetLabel}，尚未取得"`));
  const line = await api.formalEffects(); assert.equal(line.drawIndex, 13); assert.equal(line.drawn, true); assert.equal(line.line, true);
  const waiting = await api.waitingEffect(); assert.equal(waiting.everWaited, true); assert.ok(waiting.waiting > 0); assert.equal(await api.betEffect(), true);
  const restarted = api.restart("pachinko");
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.miniGame)), { offered: false, completed: false, selectedId: null, challengeResult: null, challengeResolved: false, failureDrawStarted: false, memory: null, pajur: null });
  assert.equal(restarted.tilePicker, null); assert.equal(restarted.forced, "pachinko"); assert.equal(restarted.attemptsSame, true); assert.equal(api.bonusDoesNotOffer(), false);
  console.log("Phase 2 challenge contract and shared tile picker tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
