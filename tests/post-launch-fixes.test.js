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
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
  }
  addEventListener() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    const tileId = selector.match(/\[data-tile-id="([^"]+)"\]/)?.[1];
    if (tileId) return this.children.find(child => child.dataset.tileId === tileId) || new FakeElement();
    if (selector === ".modal-card") return new FakeElement();
    return new FakeElement();
  }
  querySelectorAll(selector) {
    if (selector === ".tile.waiting") return this.children.filter(child => child.classList.contains("waiting"));
    return [];
  }
  closest() { return this; }
  setAttribute() {}
  focus() {}
  remove() {}
  getBoundingClientRect() { return { width: 60, height: 78, left: 0, top: 0 }; }
  get offsetWidth() { return 60; }
}

const nodes = new Map();
const getNode = selector => {
  if (!nodes.has(selector)) nodes.set(selector, new FakeElement());
  return nodes.get(selector);
};
const document = {
  querySelector: getNode,
  querySelectorAll: () => [],
  createElement: () => new FakeElement(),
  documentElement: new FakeElement(),
  body: new FakeElement(),
  fonts: { check: () => true }
};
const timers = [];
const context = vm.createContext({
  console,
  document,
  localStorage: { getItem: () => "", setItem() {} },
  performance: { now: () => 0 },
  requestAnimationFrame() { return 1; },
  setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
  clearTimeout() {},
  AbortController,
  fetch: async () => ({ ok: true, json: async () => ({ success: true, ranking: [] }) }),
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});
context.timers = timers;

const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
animateStackTile = async () => {};
globalThis.postLaunchTest = {
  async eventCreatesWaiting() {
    game = freshGameState("TEST");
    game.round = createRound();
    const eventTile = GAME_TILES.find(tile => tile.id === "event-1");
    const row = [eventTile, ...CORE_TILES.slice(0, 5)];
    game.round.board = [...row, ...GAME_TILES.filter(tile => !row.some(item => item.id === tile.id))];
    game.round.board.forEach(tile => {
      const cell = new FakeElement();
      cell.dataset.tileId = tile.id;
      elements.board.children.push(cell);
    });
    row.slice(1, 5).forEach(tile => game.round.drawn.add(tile.id));
    game.round.committed = true;
    game.state = GAME_STATES.DRAWING;
    await acquireFormalTile(eventTile);
    return {
      state: game.state,
      waiting: [...game.round.activeWaiting],
      announcements: game.round.waitingAnnouncements,
      everWaited: game.round.everWaited,
      visual: elements.board.children.slice(0, 6).every(cell => cell.classList.contains("waiting"))
    };
  },
  bonus(tileId, missingId) {
    game = freshGameState("TEST");
    game.attemptsConsumed = game.totalAttemptsGranted;
    game.round = createRound();
    game.round.bonusMissing.add(missingId);
    game.round.bonusCandidates = [GAME_TILES.find(tile => tile.id === tileId)];
    game.state = GAME_STATES.BONUS_DRAW;
    resolveBonusDraw();
    return {
      successCount: game.stats.bonusSuccessCount,
      gain: game.round.bonusAttemptGain,
      result: elements.bonusResult.innerHTML
    };
  },
  lastTileCelebration() {
    timers.length = 0;
    elements.board.children = [];
    game = freshGameState("TEST");
    game.round = createRound(15);
    game.round.board = [...GAME_TILES];
    game.round.board.forEach(tile => {
      const cell = new FakeElement();
      cell.dataset.tileId = tile.id;
      elements.board.children.push(cell);
    });
    const line = LINE_DEFINITIONS[0];
    line.indexes.forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.drawIndex = game.round.formalDrawCount;
    game.round.lastAcquiredTileId = game.round.board[line.indexes.at(-1)].id;
    game.state = GAME_STATES.DRAWING;
    scoreLines();
    const points = game.round.rawPoints;
    const drawIndex = game.round.drawIndex;
    continueAfterDraw();
    const firstTimerCount = timers.filter(timer => timer.delay === 1100).length;
    continueAfterDraw();
    const secondTimerCount = timers.filter(timer => timer.delay === 1100).length;
    scoreLines();
    const celebrationTimer = timers.find(timer => timer.delay === 1100);
    celebrationTimer.fn();
    return {
      achievement: game.round.achievements.has("last-tile-first-line"),
      played: game.round.lastTileCelebrationPlayed,
      firstTimerCount,
      secondTimerCount,
      points,
      pointsAfter: game.round.rawPoints,
      drawIndex,
      drawIndexAfter: game.round.drawIndex,
      formalDrawCount: game.round.formalDrawCount
    };
  },
  noCelebration() {
    game = freshGameState("TEST");
    game.round = createRound(15);
    game.state = GAME_STATES.DRAWING;
    return playLastTileCelebration();
  }
};`;
context.FakeElement = FakeElement;
vm.runInContext(source, context);
const api = context.postLaunchTest;

(async () => {
  const eventWaiting = await api.eventCreatesWaiting();
  assert.equal(eventWaiting.state, "EVENT_REVEAL", "event flow remains active");
  assert.equal(JSON.stringify(eventWaiting.waiting), JSON.stringify(["row-0"]));
  assert.equal(eventWaiting.announcements, 1, "event tile is evaluated once");
  assert.equal(eventWaiting.everWaited, true);
  assert.equal(eventWaiting.visual, true, "existing waiting line effect is applied");

  const ordinarySuccess = api.bonus("red", "red");
  assert.equal(ordinarySuccess.successCount, 1);
  assert.equal(ordinarySuccess.gain, 1);
  assert.match(ordinarySuccess.result, /補牌成功！獲得 \+1 次！/);

  const eventSuccess = api.bonus("event-1", "event-1");
  assert.equal(eventSuccess.successCount, 1);
  assert.equal(eventSuccess.gain, 1);
  assert.match(eventSuccess.result, /補牌成功！獲得 \+1 次！/);

  const eventFailure = api.bonus("event-2", "event-1");
  assert.equal(eventFailure.successCount, 0);
  assert.equal(eventFailure.gain, 0);
  assert.match(eventFailure.result, /補牌失敗，差一點！/);

  const celebration = api.lastTileCelebration();
  assert.equal(celebration.achievement, true);
  assert.equal(celebration.played, true);
  assert.equal(celebration.firstTimerCount, 1);
  assert.equal(celebration.secondTimerCount, 1, "celebration cannot schedule twice");
  assert.equal(celebration.points, 35);
  assert.equal(celebration.pointsAfter, 35, "presentation cannot duplicate scoring");
  assert.equal(celebration.drawIndexAfter, celebration.drawIndex);
  assert.equal(celebration.formalDrawCount, 15);
  assert.equal(api.noCelebration(), false);

  console.log("Post-launch Event Tile, Bonus Draw and last-tile presentation tests: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
