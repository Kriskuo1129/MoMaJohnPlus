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
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.listeners = new Map(); this.textContent = ""; this.innerHTML = ""; this.disabled = false; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  append(...children) { this.children.push(...children); }
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

function miniGameStub() {
  return {
    starts: 0, destroys: 0, completion: null,
    start({ onComplete }) {
      this.starts += 1;
      this.completion = onComplete;
      let destroyed = false;
      return { round: { language: "zh", themeName: "測試" }, destroy: () => { if (destroyed) return false; destroyed = true; this.destroys += 1; return true; } };
    },
    complete(result) { return this.completion(result); },
    reset() { this.starts = 0; this.destroys = 0; this.completion = null; }
  };
}

const MemoryMaster = miniGameStub();
const PaJuR = miniGameStub();
const Baseball9 = miniGameStub();
const requests = [];
const context = vm.createContext({
  console, document, MemoryMaster, PaJuR, Baseball9, requests,
  localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  AbortController, fetch: async (url, options = {}) => { requests.push({ url, options }); return { ok: true, json: async () => ({ success: true, ranking: [] }) }; },
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});

const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
globalThis.experimentalInterRoundTest = {
  setup(mode = GAME_MODES.EXPERIMENTAL, drawIndex = 0, forcedMiniGameId = null) {
    game = freshGameState("TEST", mode);
    game.round = createRound(15, []);
    game.round.committed = true;
    game.round.started = true;
    game.round.drawIndex = drawIndex;
    game.round.config = { formalDrawCount: 15, forcedMiniGameId, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null };
    game.state = GAME_STATES.DRAWING;
    elements.drawStack.disabled = false;
    MemoryMaster.reset(); PaJuR.reset(); Baseball9.reset();
    return game.round;
  },
  async draw13(mode) {
    const round = this.setup(mode, 12);
    const tile = round.hand[12];
    const result = await drawTile();
    return { result, tileId: tile.id, drawIndex: round.drawIndex, drawn: round.drawn.has(tile.id), state: game.state, offered: round.miniGame.offered, picker: round.tilePicker };
  },
  async draw13Event() {
    const round = this.setup(GAME_MODES.EXPERIMENTAL, 12);
    const order = [...round.hand, ...round.remaining];
    const eventIndex = order.findIndex(tile => tile.id === "event-1");
    [order[12], order[eventIndex]] = [order[eventIndex], order[12]];
    round.hand = order.slice(0, round.formalDrawCount); round.remaining = order.slice(round.formalDrawCount);
    await drawTile();
    return { drawIndex: round.drawIndex, drawn: round.drawn.has("event-1"), state: game.state, offered: round.miniGame.offered };
  },
  productionOffer() { this.setup(GAME_MODES.PRODUCTION, 12); return openMiniGameOffer(); },
  selection(random, forcedMiniGameId = null) { this.setup(GAME_MODES.EXPERIMENTAL, 15, forcedMiniGameId); game.state = GAME_STATES.ROUND_END; return openInterRoundMiniGameInvitation(() => random); },
  participate() { return startInterRoundMiniGame(); },
  skip() { const result = skipInterRoundMiniGame(); return { result, state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts, stats: { invitations: game.stats.miniGameInvitationCount, participated: game.stats.miniGameParticipatedCount, skipped: game.stats.miniGameSkipCount } }; },
  active() { return { state: game.state, selectedId: game.round.miniGame.selectedId, interRound: game.round.miniGame.interRound }; },
  completeSelected(success) {
    const selected = game.round.miniGame.selectedId;
    const endedRound = game.round;
    const before = { drawIndex: endedRound.drawIndex, items: JSON.stringify(game.items), score: game.score };
    ({ memoryMaster: MemoryMaster, pachinko: PaJuR, baseball9: Baseball9 })[selected].complete({ success });
    return { selected, endedRound, before, after: { drawIndex: endedRound.drawIndex, items: JSON.stringify(game.items), score: game.score }, state: game.state, results: game.interRoundMiniGameResults.slice() };
  },
  chooseReward(itemId) { const chosen = selectInterRoundReward(itemId); return { chosen, state: game.state, items: game.items.slice(), body: elements.modalBody.innerHTML }; },
  finalRound() { this.setup(GAME_MODES.EXPERIMENTAL, 15); game.state = GAME_STATES.ROUND_END; game.attemptsConsumed = game.totalAttemptsGranted; return { hasNext: hasNextRoundAfterSettlement(), started: openInterRoundMiniGameInvitation(() => 0), state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts }; },
  settlementBoundary() {
    this.setup(GAME_MODES.EXPERIMENTAL, 15);
    endRound(false, false);
    const before = { state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts };
    const nextAction = elements.modalActions.children[0].listeners.get("click");
    nextAction({ type: "click", pointerType: "touch" });
    return { before, after: { state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts, kicker: elements.modalKicker.textContent, title: elements.modalTitle.textContent } };
  },
  finalSettlementButton() {
    this.setup(GAME_MODES.EXPERIMENTAL, 15);
    game.attemptsConsumed = game.totalAttemptsGranted;
    endRound(false, false);
    elements.modalActions.children[0].listeners.get("click")({ type: "click", pointerType: "touch" });
    return { state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts };
  },
  productionSettlementButton() {
    this.setup(GAME_MODES.PRODUCTION, 15);
    endRound(false, false);
    elements.modalActions.children[0].listeners.get("click")({ type: "click", pointerType: "touch" });
    return { state: game.state, starts: MemoryMaster.starts + PaJuR.starts + Baseball9.starts };
  },
  sixRoundLifecycle() {
    game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL);
    let miniGames = 0;
    for (let completed = 1; completed <= 6; completed += 1) {
      game.round = createRound(15, []); game.round.committed = true; game.round.drawIndex = 15; game.state = GAME_STATES.ROUND_END; game.attemptsConsumed = completed;
      if (hasNextRoundAfterSettlement()) { miniGames += 1; openInterRoundMiniGameInvitation(() => 0); startInterRoundMiniGame(); const success = completed % 2 === 0; PaJuR.complete({ success }); if (success) selectInterRoundReward("multiplier-ticket"); }
    }
    return { miniGames, completedRounds: 6, results: game.interRoundMiniGameResults.length, state: game.state };
  },
  cleanupSequence() {
    this.selection(0); this.participate(); PaJuR.complete({ success: true }); selectInterRoundReward("multiplier-ticket");
    const first = { starts: PaJuR.starts, destroys: PaJuR.destroys };
    game.state = GAME_STATES.ROUND_END; openInterRoundMiniGameInvitation(() => 0.4); startInterRoundMiniGame(); Baseball9.complete({ success: false });
    return { first, baseballStarts: Baseball9.starts, baseballDestroys: Baseball9.destroys, state: game.state, results: game.interRoundMiniGameResults.length };
  },
  async replayExperimental() { game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.interRoundMiniGameResults.push({ id: "pachinko", success: true }); requests.length = 0; await resetGame(); return { mode: game.mode, results: game.interRoundMiniGameResults.length, state: game.state, requests: requests.length }; }
};`;
vm.runInContext(source, context);
const api = context.experimentalInterRoundTest;

(async () => {
  assert.equal(api.productionOffer(), true, "Production formal draw #13 keeps its offer");
  const experimental13 = await api.draw13("experimental");
  assert.equal(experimental13.drawIndex, 13);
  assert.equal(experimental13.drawn, true);
  assert.equal(experimental13.offered, false);
  assert.equal(experimental13.picker, null);
  assert.notEqual(experimental13.state, "MINIGAME_OFFER");
  assert.notEqual(experimental13.state, "MINIGAME_REWARD");
  assert.deepEqual(JSON.parse(JSON.stringify(await api.draw13Event())), { drawIndex: 13, drawn: true, state: "EVENT_REVEAL", offered: false }, "Experimental event tile #13 follows the normal event path");

  assert.equal(api.selection(0, "baseball9"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.active())), { state: "INTER_ROUND_INVITATION", selectedId: "pachinko", interRound: true }, "forced PRE_ROUND mini-game is ignored");
  assert.equal(PaJuR.starts, 0, "invitation does not start the selected controller");
  assert.equal(api.participate(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.active())), { state: "INTER_ROUND_MINIGAME", selectedId: "pachinko", interRound: true });
  const success = api.completeSelected(true);
  assert.deepEqual(success.after, success.before, "success grants no tile, item, score or formal draw");
  assert.equal(success.endedRound.tilePicker, null);
  assert.equal(success.state, "INTER_ROUND_REWARD");
  assert.equal(success.results.at(-1).success, true);
  const successReward = api.chooseReward("multiplier-ticket");
  assert.equal(successReward.chosen, true);
  assert.equal(successReward.state, "PRE_ROUND");

  assert.equal(api.selection(0.4, "pachinko"), true);
  assert.equal(api.active().selectedId, "baseball9");
  assert.equal(api.participate(), true);
  const failure = api.completeSelected(false);
  assert.deepEqual(failure.after, failure.before, "failure grants no draw or other reward");
  assert.equal(failure.endedRound.tilePicker, null);
  assert.equal(failure.state, "PRE_ROUND");
  assert.equal(failure.results.at(-1).success, false);

  assert.equal(api.selection(0.8), true);
  assert.equal(api.active().selectedId, "memoryMaster");
  assert.equal(api.participate(), true);
  api.completeSelected(true);
  api.chooseReward("free-ticket");

  assert.equal(api.selection(0), true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.skip())), { result: true, state: "PRE_ROUND", starts: 0, stats: { invitations: 1, participated: 0, skipped: 1 } }, "skip launches no controller or reward flow");

  assert.deepEqual(JSON.parse(JSON.stringify(api.finalRound())), { hasNext: false, started: false, state: "ROUND_END", starts: 0 });
  const boundary = api.settlementBoundary();
  assert.equal(JSON.stringify(boundary.before), JSON.stringify({ state: "ROUND_END", starts: 0 }), "Settlement remains visible before the player continues");
  assert.equal(boundary.after.state, "INTER_ROUND_INVITATION");
  assert.equal(boundary.after.starts, 0, "Settlement continue opens the invitation before starting a controller");
  assert.equal(boundary.after.kicker, "參加小遊戲 好禮等著你");
  assert.match(boundary.after.title, /^這次的遊戲是：/);
  assert.equal(JSON.stringify(api.finalSettlementButton()), JSON.stringify({ state: "GAME_OVER", starts: 0 }), "final Settlement button launches no mini-game");
  assert.equal(JSON.stringify(api.productionSettlementButton()), JSON.stringify({ state: "PRE_ROUND", starts: 0 }), "Production Settlement keeps its original next-round path");
  assert.deepEqual(JSON.parse(JSON.stringify(api.sixRoundLifecycle())), { miniGames: 5, completedRounds: 6, results: 5, state: "ROUND_END" });

  const cleanup = api.cleanupSequence();
  assert.equal(JSON.stringify(cleanup.first), JSON.stringify({ starts: 1, destroys: 1 }));
  assert.equal(cleanup.baseballStarts, 1);
  assert.equal(cleanup.baseballDestroys, 1);
  assert.equal(cleanup.state, "PRE_ROUND");
  assert.equal(cleanup.results, 2);

  assert.deepEqual(JSON.parse(JSON.stringify(await api.replayExperimental())), { mode: "experimental", results: 0, state: "PRE_ROUND", requests: 2 });
  console.log("Experimental inter-round mini-game lifecycle tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
