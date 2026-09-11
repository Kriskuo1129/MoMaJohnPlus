const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { const enabled = force ?? !this.values.has(name); if (enabled) this.values.add(name); else this.values.delete(name); return enabled; }
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
const intervals = new Map();
const timeouts = new Map();
const animationFrames = [];
let timerId = 0;
const fakeClock = { now: 0 };
const document = { querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(), documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true } };
const context = vm.createContext({
  console, document, localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  intervals, timeouts, animationFrames, fakeClock,
  requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
  setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; }, clearInterval(id) { intervals.delete(id); },
  setTimeout(callback, delay = 0) { const id = ++timerId; timeouts.set(id, { callback, dueAt: fakeClock.now + delay }); return id; }, clearTimeout(id) { timeouts.delete(id); },
  Math, Object, Array, Set, Map, String, Number, Boolean
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
let phase3ResolveCount = 0;
const phase3OriginalResolve = resolveMiniGameChallenge;
resolveMiniGameChallenge = result => { phase3ResolveCount += 1; return phase3OriginalResolve(result); };
globalThis.phase3aTest = {
  themes: MEMORY_MASTER_THEMES,
  definitions: MINIGAME_DEFINITIONS,
  cardCount: MEMORY_MASTER_CARD_COUNT,
  create(values) { let index = 0; return createMemoryMasterRound(() => values[index++ % values.length]); },
  setup(values = [0]) {
    game = freshGameState("TEST"); game.round = createRound(15, []); game.round.committed = true; game.round.started = true;
    game.round.config = { formalDrawCount: 15, forcedMiniGameId: null, leverageMultiplier: 1, finalMultiplier: 1, activeBetId: null };
    game.round.drawIndex = 12; game.round.miniGame.offered = true; game.round.miniGame.selectedId = "memoryMaster"; game.state = GAME_STATES.MINIGAME_ACTIVE;
    intervals.clear(); timeouts.clear(); animationFrames.length = 0; phase3ResolveCount = 0; fakeClock.now = 0;
    let index = 0; startMemoryMaster(() => values[index++ % values.length]);
    animationFrames.splice(0).forEach(callback => callback());
    return game.round.miniGame.memory;
  },
  tickCountdown(times = 1) { for (let count = 0; count < times; count += 1) [...intervals.values()].forEach(callback => callback()); return game.round.miniGame.memory?.phase; },
  guess(index) { const result = submitMemoryMasterGuess(index); return { result, phase: game.round.miniGame.memory?.phase, selected: game.round.miniGame.memory?.selectedIndex, html: document.querySelector("#modal-body").innerHTML, pendingResults: timeouts.size }; },
  advance(ms) { fakeClock.now += ms; let next; do { next = [...timeouts].find(([, timer]) => timer.dueAt <= fakeClock.now); if (next) { timeouts.delete(next[0]); next[1].callback(); } } while (next); return { html: document.querySelector("#modal-body").innerHTML, timers: timeouts.size, resolves: phase3ResolveCount }; },
  snapshot() { return { state: game.state, result: game.round.miniGame.challengeResult, picker: game.round.tilePicker, resolves: phase3ResolveCount }; },
  finishResult() { this.advance(10000); return { state: game.state, result: game.round.miniGame.challengeResult, picker: game.round.tilePicker, resolves: phase3ResolveCount }; },
  html() { return document.querySelector("#modal-body").innerHTML; },
  cleanupDuringReveal() { const memory = this.setup([0]); const callback = [...intervals.values()][0]; clearMiniGameLifecycle(); callback?.(); return { memory: game.round.miniGame.memory, timers: intervals.size, resolves: phase3ResolveCount }; },
  cleanupDuringResult() { const memory = this.setup([0]); this.tickCountdown(5); const targetIndex = memory.items.findIndex(item => item.id === memory.targetItemId); submitMemoryMasterGuess(targetIndex); const callback = [...timeouts.values()][0]?.callback; clearMiniGameLifecycle(); callback?.(); return { memory: game.round.miniGame.memory, timers: timeouts.size, resolves: phase3ResolveCount }; },
  cleanupDuringWrongDelay() { const memory = this.setup([0]); this.tickCountdown(5); const targetIndex = memory.items.findIndex(item => item.id === memory.targetItemId); submitMemoryMasterGuess((targetIndex + 1) % MEMORY_MASTER_CARD_COUNT); const callback = [...timeouts.values()][0]?.callback; clearMiniGameLifecycle(); callback?.(); return { memory: game.round.miniGame.memory, timers: timeouts.size, resolves: phase3ResolveCount }; },
  direct() { game = freshGameState("TEST"); game.round = createRound(15, []); game.round.committed = true; game.round.started = true; game.round.config = { formalDrawCount: 15, forcedMiniGameId: "memoryMaster" }; game.round.drawIndex = 12; game.state = GAME_STATES.DRAWING; openMiniGameOffer(); const before = game.round.miniGame.memory; return Promise.resolve(directDrawMiniGameTile()).then(() => ({ before, after: game.round.miniGame.memory, drawIndex: game.round.drawIndex, result: game.round.miniGame.challengeResult })); }
};`;
vm.runInContext(source, context);
const api = context.phase3aTest;

(async () => {
  assert.equal(api.definitions.memoryMaster.name, "記憶大師");
  assert.equal(api.definitions.memoryMatch, undefined);
  assert.equal(api.definitions.pachinko.implementation, undefined);
  assert.equal(api.definitions.baseball9.implementation, undefined);
  assert.equal(api.themes.length, 4);
  for (const theme of api.themes) { assert.equal(theme.items.length, 12); assert.ok(theme.name.zh); assert.ok(theme.name.en); }

  const deterministicValues = [0.3, 0.1, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.2, 0.4, 0.6, 0.8, 0.1, 0.5, 0.9];
  const first = api.create(deterministicValues); const second = api.create(deterministicValues);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(api.cardCount, 4);
  assert.equal(first.items.length, api.cardCount); assert.equal(new Set(first.items.map(item => item.id)).size, api.cardCount); assert.ok(first.items.some(item => item.id === first.targetItemId));
  for (const position of [0, 0.25, 0.5, 0.99]) assert.ok(api.create([position, 0]).themeId);
  assert.equal(api.create([0, 0.1]).language, "zh"); assert.equal(api.create([0, 0.9]).language, "en");

  const reveal = api.setup(deterministicValues);
  assert.equal(reveal.phase, "REVEAL"); assert.equal(reveal.countdown, 5); assert.equal((api.html().match(/data-memory-index=/g) || []).length, api.cardCount); assert.match(api.html(), /memory-master-grid/);
  for (const expected of [4, 3, 2, 1]) { assert.equal(api.tickCountdown(), "REVEAL"); assert.equal(reveal.countdown, expected); }
  assert.equal(api.tickCountdown(), "QUESTION"); assert.match(api.html(), /covered/); assert.match(api.html(), /Find this card|請翻出這張牌在哪/); assert.match(api.html(), /memory-question-emoji/); assert.match(api.html(), /memory-question-name/);
  const targetIndex = reveal.items.findIndex(item => item.id === reveal.targetItemId);
  const success = api.guess(targetIndex); assert.equal(success.result, true); assert.equal(success.phase, "RESOLVING"); assert.equal(success.selected, targetIndex); assert.equal(api.guess((targetIndex + 1) % api.cardCount).result, false);
  assert.equal(api.advance(799).resolves, 0); api.advance(1); const successIntegration = api.snapshot(); assert.equal(successIntegration.result, "SUCCESS"); assert.equal(successIntegration.state, "MINIGAME_REWARD"); assert.ok(successIntegration.picker); assert.equal(successIntegration.resolves, 1);

  const failureRound = api.setup([0.8, 0.8, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.2]); api.tickCountdown(5);
  const failureTarget = failureRound.items.findIndex(item => item.id === failureRound.targetItemId); const wrongIndex = (failureTarget + 1) % api.cardCount;
  const failure = api.guess(wrongIndex); assert.equal(failure.result, false); assert.match(failure.html, / wrong/); assert.doesNotMatch(failure.html, / target/); assert.equal(api.guess(failureTarget).result, false);
  const beforeCorrect = api.advance(999); assert.doesNotMatch(beforeCorrect.html, / target/); assert.equal(beforeCorrect.resolves, 0);
  const correctReveal = api.advance(1); assert.match(correctReveal.html, / wrong/); assert.match(correctReveal.html, / target/); assert.equal(correctReveal.resolves, 0);
  assert.equal(api.advance(799).resolves, 0); api.advance(1);
  const failureIntegration = api.snapshot(); assert.equal(failureIntegration.result, "FAILURE"); assert.equal(failureIntegration.state, "MINIGAME_ACTIVE"); assert.equal(failureIntegration.picker, null); assert.equal(failureIntegration.resolves, 1);

  assert.deepEqual(JSON.parse(JSON.stringify(api.cleanupDuringReveal())), { memory: null, timers: 0, resolves: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.cleanupDuringResult())), { memory: null, timers: 0, resolves: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.cleanupDuringWrongDelay())), { memory: null, timers: 0, resolves: 0 });
  const direct = await api.direct(); assert.equal(direct.before, null); assert.equal(direct.after, null); assert.equal(direct.drawIndex, 13); assert.equal(direct.result, "DIRECT");
  console.log("Phase 3-A Memory Master tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
