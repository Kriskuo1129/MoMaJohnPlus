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
  setAttribute() {}
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
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
globalThis.phase1CTest = {
  definitions: PRE_ROUND_EVENT_DEFINITIONS,
  inRoundEvents: EVENT_DEFINITIONS,
  drawOptions: () => drawPreRoundEvents().map(event => event.id),
  commit(eventId, leverage = 1) {
    game = freshGameState("TEST");
    const event = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === eventId);
    game.round = createRound(RULES.baseFormalDrawCount, [event]);
    game.round.preRound.eventSelectionType = "EVENT";
    game.round.preRound.selectedEventId = eventId;
    game.round.preRound.selectedLeverage = leverage;
    game.state = GAME_STATES.PRE_ROUND;
    const first = commitRoundConfiguration();
    const second = commitRoundConfiguration();
    return { first, second, state: game.state, attemptsConsumed: game.attemptsConsumed, config: game.round.config, handLength: game.round.hand.length, remainingLength: game.round.remaining.length };
  },
  rps(playerChoice, randomValue, leverage = 1) {
    game = freshGameState("TEST");
    const event = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === "rock-paper-scissors");
    game.round = createRound(RULES.baseFormalDrawCount, [event]);
    game.round.preRound.eventSelectionType = "EVENT";
    game.round.preRound.selectedEventId = event.id;
    game.round.preRound.selectedLeverage = leverage;
    game.state = GAME_STATES.PRE_ROUND;
    commitRoundConfiguration();
    const original = Math.random;
    Math.random = () => randomValue;
    playRockPaperScissors(event, leverage, playerChoice);
    Math.random = original;
    return { state: game.state, attemptsConsumed: game.attemptsConsumed, config: game.round.config };
  },
  settle(eventId, won, startingScore = 100) {
    game = freshGameState("TEST");
    game.score = startingScore;
    const bet = PRE_ROUND_EVENT_DEFINITIONS.find(item => item.id === eventId);
    game.round = createRound();
    game.round.config = { activeBetId: eventId };
    if (bet.effectKey === "REQUIRE_TILES" && won) bet.tileIds.forEach(id => game.round.drawn.add(id));
    if (bet.effectKey === "MIN_LINES") game.round.roundLines = won ? bet.minimum : 0;
    if (bet.effectKey === "EVER_WAITED") game.round.everWaited = won;
    if (bet.effectKey === "UNFINISHED_WAITING_LINE" && won) game.round.everWaitingLines.add("row-0");
    const result = settleBets()[0];
    return { score: game.score, won: result.won, points: result.points, betsPlaced: game.stats.betsPlaced };
  },
  restart(eventId, leverage = 1) {
    const committed = this.commit(eventId, leverage);
    const config = game.round.config;
    const optionIds = game.round.preRound.eventOptions.map(event => event.id).join(",");
    const attempts = game.attemptsConsumed;
    restartCurrentRound();
    return { committed, sameConfig: game.round.config === config, sameOptions: game.round.preRound.eventOptions.map(event => event.id).join(",") === optionIds, attemptsUnchanged: game.attemptsConsumed === attempts, state: game.state, formalDrawCount: game.round.formalDrawCount, finalMultiplier: game.round.finalMultiplier };
  },
  dynamicLastTile(formalDrawCount) {
    game = freshGameState("TEST");
    game.round = createRound(formalDrawCount);
    game.round.board = [...GAME_TILES];
    LINE_DEFINITIONS[0].indexes.forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.drawIndex = formalDrawCount;
    scoreLines();
    return game.round.achievements.has("last-tile-first-line");
  },
  dynamicBonus(formalDrawCount) {
    game = freshGameState("TEST");
    game.round = createRound(formalDrawCount);
    game.round.board = [...GAME_TILES];
    const line = LINE_DEFINITIONS[0];
    line.indexes.slice(0, 5).forEach(index => game.round.drawn.add(game.round.board[index].id));
    game.round.activeWaiting.add(line.id);
    game.round.drawIndex = formalDrawCount;
    game.state = GAME_STATES.DRAWING;
    finishRegularDraws();
    return game.state;
  },
  bonusSuccessGain() {
    game = freshGameState("TEST");
    game.attemptsConsumed = game.totalAttemptsGranted;
    game.round = createRound();
    game.round.bonusMissing.add("red");
    game.round.bonusCandidates = [CORE_TILES.find(tile => tile.id === "red")];
    game.state = GAME_STATES.BONUS_DRAW;
    resolveBonusDraw();
    return { gain: game.round.bonusAttemptGain, remaining: attemptsRemaining() };
  }
};`;
vm.runInContext(source, context, { filename: "phase1c-bundle.js" });
const api = context.phase1CTest;

assert.equal(api.definitions.filter(event => event.type === "BET").length, 9);
assert.equal(api.definitions.filter(event => event.type === "SPECIAL").length, 6);
assert.equal(api.definitions.filter(event => event.type === "ITEM").length, 1);
assert.equal(new Set(api.definitions.map(event => event.id)).size, 16);
assert.equal(api.definitions.some(event => event.id === "open-eye" || event.title === "大開天眼" || event.effectKey === "CHOOSE_FIRST_TILE"), false);
for (let index = 0; index < 100; index += 1) {
  const options = api.drawOptions();
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
}
assert.equal(api.inRoundEvents.some(event => event.id === "double-round" || event.effectType === "DOUBLE_FINAL_MULTIPLIER"), false);

const base = api.commit("chiikawa", 2);
assert.equal(base.first, true);
assert.equal(base.second, false);
assert.equal(base.attemptsConsumed, 2);
assert.equal(base.config.activeBetId, "chiikawa");
assert.equal(base.config.finalMultiplier, 2);
assert.equal(base.handLength, 15);

const fourteen = api.commit("boss-leverage", 3);
assert.equal(fourteen.config.formalDrawCount, 14);
assert.equal(fourteen.config.finalMultiplier, 6);
assert.equal(fourteen.handLength, 14);
assert.equal(fourteen.remainingLength, 22);
const sixteen = api.commit("more-tiles");
assert.equal(sixteen.config.formalDrawCount, 16);
assert.equal(sixteen.handLength, 16);
assert.equal(sixteen.remainingLength, 20);
assert.equal(api.commit("boss-boost", 3).config.finalMultiplier, 6);

assert.equal(api.commit("pearl-baby").config.forcedMiniGame13, "pinball");
assert.equal(api.commit("pearl-baby").config.excludedMiniGame8, "pinball");
assert.equal(api.commit("home-team-wins").config.forcedMiniGame13, "nine-grid");
assert.equal(api.commit("home-team-wins").config.excludedMiniGame8, "nine-grid");

const rpsTie = api.rps("rock", 0);
assert.equal(rpsTie.state, "COMMITTING");
assert.equal(rpsTie.config, null);
assert.equal(rpsTie.attemptsConsumed, 0);
assert.equal(api.rps("rock", 0.4, 3).config.finalMultiplier, 6);
assert.equal(api.rps("rock", 0.8, 3).config.finalMultiplier, 1.5);

const winningBet = api.settle("chiikawa", true);
assert.equal(JSON.stringify(winningBet), JSON.stringify({ score: 115, won: true, points: 15, betsPlaced: 1 }));
const losingBet = api.settle("chiikawa", false);
assert.equal(JSON.stringify(losingBet), JSON.stringify({ score: 90, won: false, points: -10, betsPlaced: 1 }));
const flooredBet = api.settle("believe-guoju", false, 5);
assert.equal(flooredBet.points, -30);
assert.equal(flooredBet.score, 0);
assert.equal(api.settle("stop-at-waiting", true).won, true);
for (const bet of api.definitions.filter(event => event.type === "BET")) {
  assert.equal(api.settle(bet.id, true).won, true, `${bet.id} should pass its success fixture`);
  assert.equal(api.settle(bet.id, false).won, false, `${bet.id} should fail its failure fixture`);
}

const restarted = api.restart("boss-leverage", 3);
assert.equal(restarted.sameConfig, true);
assert.equal(restarted.sameOptions, true);
assert.equal(restarted.attemptsUnchanged, true);
assert.equal(restarted.state, "DRAWING");
assert.equal(restarted.formalDrawCount, 14);
assert.equal(restarted.finalMultiplier, 6);
for (const formalDrawCount of [14, 15, 16]) {
  assert.equal(api.dynamicLastTile(formalDrawCount), true);
  assert.equal(api.dynamicBonus(formalDrawCount), "BONUS_PENDING");
}
assert.equal(JSON.stringify(api.bonusSuccessGain()), JSON.stringify({ gain: 1, remaining: 1 }));

console.log("Phase 1-C transaction tests: PASS");
