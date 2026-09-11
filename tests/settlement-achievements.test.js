const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  add() {} remove() {} toggle() {} contains() { return false; }
}
class FakeElement {
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.textContent = ""; this.disabled = false; this.innerHTML = ""; this.value = ""; }
  addEventListener() {} append(child) { this.children.push(child); } replaceChildren(...children) { this.children = children; }
  querySelector() { return new FakeElement(); } querySelectorAll() { return []; } closest() { return this; }
  setAttribute() {} focus() {} remove() {} getBoundingClientRect() { return { width: 100, height: 50, left: 0, top: 0 }; }
  get offsetWidth() { return 100; }
}

const elements = new Map();
const getElement = selector => { if (!elements.has(selector)) elements.set(selector, new FakeElement()); return elements.get(selector); };
const document = { querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(), documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true } };
const context = vm.createContext({
  console, document, localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  requestAnimationFrame: () => 1, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  Math, Object, Array, Set, Map, String, Number, Boolean
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
updateHUD = () => {};
globalThis.settlementTest = {
  fresh() { game = freshGameState("TEST"); game.round = createRound(15, []); return game; },
  add(points, source) { addRoundPoints(points, source); },
  addBreakdown(entry) { addRoundScoreBreakdown(entry); },
  renderBreakdown() { return renderScoreBreakdown(); },
  settle() { const before = game.score; settleRoundPoints(); game.round.finalRoundChange = game.score - before; return { score: game.score, change: game.round.finalRoundChange, breakdown: game.round.scoreBreakdown }; },
  record(tileIds, activeItemUses = 0, everWaited = false) { game.round.drawn = new Set(tileIds); game.round.activeItemUses = activeItemUses; game.round.everWaited = everWaited; return recordCompletedRoundStats(); },
  restartRoundData() { game.round = createRound(15, []); return game.round.scoreBreakdown; },
  discardRoundAndRecord(tileIds) { game.round = createRound(15, []); game.round.drawn = new Set(tileIds); recordCompletedRoundStats(); return game; },
  definitions: ACHIEVEMENT_DEFINITIONS,
  evaluate(stats) { return evaluateAchievements(stats).map(item => item.id); },
  achievementStats(source) { return buildAchievementStats(source); },
  emptyReport() { return buildScoreReport(); }
};`;
vm.runInContext(source, context);
const api = context.settlementTest;

function achievementStats(overrides = {}) {
  return {
    completedRounds: 0, waitingRounds: 0, totalLines: 0, betsPlaced: 0, betsWon: 0, betsLost: 0,
    lastTileFirstLineCount: 0, earlyWaitingCount: 0, activeItemUses: 0,
    everyRoundRed: false, everyRoundGreen: false, everyRoundWhite: false,
    wanTiles: 0, tongTiles: 0, suoTiles: 0, windTiles: 0, ...overrides
  };
}
const earned = overrides => api.evaluate(achievementStats(overrides));

(() => {
  const game = api.fresh();
  api.add(30, { key: "line", label: "連線" });
  api.add(60, { key: "line", label: "連線" });
  assert.deepEqual(JSON.parse(JSON.stringify(game.round.scoreBreakdown)), [{ key: "line", label: "連線", count: 2, points: 90, affectedByMultiplier: true }]);
  assert.match(api.renderBreakdown(), /連線 ×2/);
  assert.doesNotMatch(api.renderBreakdown(), /<small>×1<\/small>/);
  game.round.finalMultiplier = 2; assert.match(api.renderBreakdown(), /\+90/); assert.match(api.renderBreakdown(), /<small>×2<\/small>/);
  for (const multiplier of [3, 4, 6]) { game.round.finalMultiplier = multiplier; assert.match(api.renderBreakdown(), new RegExp(`<small>×${multiplier}<\\/small>`)); }

  api.addBreakdown({ key: "bet:test:lost", label: "下注失敗", points: -15, affectedByMultiplier: false });
  assert.match(api.renderBreakdown(), /下注失敗/); assert.match(api.renderBreakdown(), /-15/);
  assert.equal((api.renderBreakdown().match(/<small>×6<\/small>/g) || []).length, 1);

  const floorGame = api.fresh(); floorGame.score = 5;
  api.add(-30, { key: "event:test", label: "負面事件" });
  const floor = api.settle(); assert.equal(floor.score, 0); assert.equal(floor.change, -5); assert.equal(floor.breakdown[0].points, -30);
  api.add(5, { key: "chance-maker", label: "嗆司Maker" }); assert.equal(api.restartRoundData().length, 0);
  assert.equal(floorGame.stats.activeItemUses, 0);

  assert.equal(api.definitions.length, 15);
  assert.equal(earned({ completedRounds: 6, waitingRounds: 2 }).includes("chanceMaker"), false);
  assert.equal(earned({ completedRounds: 6, waitingRounds: 3 }).includes("chanceMaker"), true);
  assert.equal(earned({ completedRounds: 5, waitingRounds: 2 }).includes("chanceMaker"), false);
  assert.equal(earned({ completedRounds: 5, waitingRounds: 3 }).includes("chanceMaker"), true);
  assert.equal(earned().includes("chanceMaker"), false);
  assert.equal(earned({ totalLines: 1 }).includes("lineMaster"), false);
  assert.equal(earned({ totalLines: 2 }).includes("lineMaster"), true);
  assert.equal(earned({ totalLines: 4 }).includes("lineLegend"), false);
  const bothLines = earned({ totalLines: 5 }); assert.ok(bothLines.includes("lineMaster")); assert.ok(bothLines.includes("lineLegend"));
  assert.equal(earned({ betsPlaced: 2, betsWon: 2 }).includes("investmentSuccess"), false);
  assert.equal(earned({ betsPlaced: 3, betsWon: 2, betsLost: 1 }).includes("investmentSuccess"), true);
  assert.equal(earned({ betsPlaced: 4, betsWon: 2, betsLost: 2 }).includes("investmentSuccess"), false);
  assert.equal(earned({ betsPlaced: 3, betsWon: 1, betsLost: 2 }).includes("investmentFailure"), true);
  assert.equal(earned({ betsPlaced: 4, betsWon: 2, betsLost: 2 }).includes("investmentFailure"), false);
  assert.equal(earned({ lastTileFirstLineCount: 0 }).includes("lastTileMaster"), false);
  assert.equal(earned({ lastTileFirstLineCount: 1 }).includes("lastTileMaster"), true);
  assert.equal(earned({ earlyWaitingCount: 0 }).includes("earlyWaitingMaster"), false);
  assert.equal(earned({ earlyWaitingCount: 1 }).includes("earlyWaitingMaster"), true);
  assert.equal(earned({ activeItemUses: 2 }).includes("tacticsMaster"), false);
  assert.equal(earned({ activeItemUses: 3 }).includes("tacticsMaster"), true);
  for (const [key, id] of [["wanTiles", "wanMaster"], ["suoTiles", "suoMaster"], ["tongTiles", "tongMaster"]]) {
    assert.equal(earned({ [key]: 29 }).includes(id), false); assert.equal(earned({ [key]: 30 }).includes(id), true);
  }
  assert.equal(earned({ windTiles: 9 }).includes("windMaster"), false); assert.equal(earned({ windTiles: 10 }).includes("windMaster"), true);

  const source = api.fresh();
  source.stats.completedRoundStats = [
    { tileIds: ["red", "green", "white", "wan-1", "east"], everWaited: true, activeItemUses: 1 },
    { tileIds: ["red", "green", "white", "wan-2", "south"], everWaited: false, activeItemUses: 2 }
  ];
  source.stats.activeItemUses = 3;
  let derived = api.achievementStats(source);
  assert.equal(derived.everyRoundRed, true); assert.equal(derived.everyRoundGreen, true); assert.equal(derived.everyRoundWhite, true); assert.equal(derived.wanTiles, 2); assert.equal(derived.windTiles, 2);
  source.stats.completedRoundStats[1].tileIds = ["red", "green"];
  derived = api.achievementStats(source); assert.equal(derived.everyRoundWhite, false);
  const recorded = api.fresh(); assert.equal(api.record(["red", "green", "white", "wan-1"], 1, true), true); assert.equal(api.record(["red"], 9, false), false);
  assert.equal(recorded.stats.completedRoundStats.length, 1); assert.equal(recorded.stats.activeItemUses, 1); assert.deepEqual(JSON.parse(JSON.stringify(recorded.stats.completedRoundStats[0].tileIds)), ["wan-1", "red", "green", "white"]);
  const bonusOnly = api.fresh(); bonusOnly.round.selectedBonusTiles = [{ id: "red" }]; assert.equal(api.record([], 0, false), true);
  assert.equal(api.achievementStats(bonusOnly).everyRoundRed, false);
  const restarted = api.fresh(); restarted.round.drawn.add("red"); api.discardRoundAndRecord(["green"]);
  const restartedStats = api.achievementStats(restarted); assert.equal(restartedStats.everyRoundRed, false); assert.equal(restartedStats.everyRoundGreen, true);
  api.fresh();
  const emptyReport = api.emptyReport(); assert.match(emptyReport, /這場沒有取得稱號/); assert.doesNotMatch(emptyReport, /總局數|補牌|事件總損益|下注總損益/);
  console.log("Settlement and Achievement V1 tests: PASS");
})();
