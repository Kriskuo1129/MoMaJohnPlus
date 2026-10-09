const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : force;
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.style = { setProperty() {} };
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.disabled = false;
    this.attributes = {};
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    if (selector === ".modal-card") return getElement(".modal-card");
    if (selector === "button") return this.children.find(child => child.tagName === "BUTTON") || null;
    if (selector === "[data-leaderboard-submit-status]") return getElement(selector);
    return new FakeElement();
  }
  querySelectorAll() { return []; }
  closest() { return this; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
  remove() {}
  getBoundingClientRect() { return { width: 100, height: 50, left: 0, top: 0 }; }
  get offsetWidth() { return 100; }
}

const elements = new Map();
const getElement = selector => {
  if (!elements.has(selector)) elements.set(selector, new FakeElement(selector === "button" ? "button" : "div"));
  return elements.get(selector);
};
const document = {
  querySelector: getElement,
  querySelectorAll: () => [],
  createElement: tagName => new FakeElement(tagName),
  documentElement: new FakeElement("html"),
  body: new FakeElement("body"),
  fonts: { check: () => true }
};

const requests = [];
let fetchImplementation = async (url, options = {}) => {
  requests.push({ url, options });
  return { ok: true, status: 200, json: async () => ({ success: true, ranking: [] }) };
};
const quietConsole = { log: console.log, error() {}, warn() {} };
const context = vm.createContext({
  console: quietConsole,
  document,
  localStorage: { getItem: () => "", setItem() {} },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 1,
  setInterval: () => 1,
  clearInterval() {},
  setTimeout,
  clearTimeout,
  AbortController,
  fetch: (...args) => fetchImplementation(...args),
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});

const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
globalThis.leaderboardTest = {
  begin: beginGameWithLeaderboardSnapshot,
  replay: resetGame,
  startWithSnapshot(name, score, highest, lowest, gameMode = GAME_MODES.PRODUCTION) {
    game = freshGameState(name, gameMode);
    game.score = score;
    game.round = createRound(15, []);
    game.leaderboardSnapshotValid = true;
    game.leaderboardSnapshot = { highest, lowest };
  },
  showGameOver,
  report: buildScoreReport,
  qualification: evaluateLeaderboardQualification,
  state() {
    return {
      state: game.state,
      submitted: game.leaderboardSubmitted,
      status: game.leaderboardSubmissionStatus,
      snapshotValid: game.leaderboardSnapshotValid,
      snapshot: game.leaderboardSnapshot,
      gameMode: game.mode,
      preparedPayload: game.leaderboardPreparedPayload,
      high: game.leaderboardQualifiedHighest,
      low: game.leaderboardQualifiedLowest,
      mode: game.leaderboardQualificationMode,
      complete: game.leaderboardGameOverComplete
    };
  },
  renderLeaderboard,
  openLeaderboard,
  closeLeaderboard,
  loadLeaderboard,
  setMode: setLeaderboardMode,
  mode() { return leaderboardMode; },
  overlayOpen() { return elements.leaderboardOverlay.classList.contains("open"); },
  openingUi() {
    return {
      startHidden: elements.startScreen.classList.contains("hidden"),
      modalOpen: elements.modal.classList.contains("open"),
      loading: elements.modalBody.innerHTML
    };
  }
};`;
vm.runInContext(source, context);
const api = context.leaderboardTest;

const ranking = (count, start, step) => Array.from({ length: count }, (_, index) => ({
  rank: index + 1,
  name: `Player ${index + 1}`,
  score: start + step * index
}));

(async () => {
  requests.length = 0;
  const snapshotResolvers = [];
  fetchImplementation = (url, options = {}) => {
    requests.push({ url, options });
    return new Promise(resolve => snapshotResolvers.push(resolve));
  };
  getElement("#player-name-input").value = "First Start";
  const loadingStart = getElement("#start-game-button").listeners.get("click")();
  assert.equal(api.openingUi().startHidden, true, "first Start hides the higher-z-index home screen before loading");
  assert.equal(api.openingUi().modalOpen, true, "first Start opens the existing loading modal immediately");
  assert.match(api.openingUi().loading, /攤位準備中/);
  assert.equal(requests.length, 2, "first Start triggers exactly one highest and one lowest request");
  assert.equal(api.state().state, "READY", "gameplay waits while the snapshot is loading");
  snapshotResolvers.forEach((resolve, index) => resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true, ranking: index ? ranking(20, 1, 1) : ranking(20, 1000, -10) })
  }));
  assert.equal(await loadingStart, true);
  assert.equal(api.state().gameMode, "production");

  requests.length = 0;
  const replayResolvers = [];
  fetchImplementation = (url, options = {}) => {
    requests.push({ url, options });
    return new Promise(resolve => replayResolvers.push(resolve));
  };
  const replayStart = api.replay();
  assert.equal(api.openingUi().modalOpen, true, "Replay keeps the existing loading behavior");
  assert.match(api.openingUi().loading, /攤位準備中/);
  assert.equal(requests.length, 2, "Replay refreshes both snapshots once");
  replayResolvers.forEach(resolve => resolve({ ok: true, status: 200, json: async () => ({ success: true, ranking: [] }) }));
  assert.equal(await replayStart, true);
  assert.equal(api.state().state, "PRE_ROUND");
  assert.equal(api.state().gameMode, "production", "Production Replay preserves its mode");

  requests.length = 0;
  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true, ranking: [] }) };
  };
  const experimentalStart = getElement("#start-experimental-button").listeners.get("click")();
  assert.equal(await experimentalStart, false, "hidden Advanced entry is blocked for players");
  assert.equal(requests.length, 0, "blocked Advanced entry does not start leaderboard requests");
  assert.equal(await api.begin("Advanced Internal", "experimental"), true, "Advanced implementation remains available to internal tests");
  assert.equal(requests.length, 2, "Experimental Start still fetches both snapshots");
  assert.equal(api.state().gameMode, "experimental");
  assert.equal(api.state().state, "PRE_ROUND");
  requests.length = 0;
  await api.replay();
  assert.equal(requests.length, 2, "Experimental Replay refreshes both snapshots");
  assert.equal(api.state().gameMode, "experimental", "Experimental Replay preserves its mode");

  requests.length = 0;
  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    const lowest = String(url).includes("mode=lowest");
    return { ok: true, status: 200, json: async () => ({ success: true, ranking: lowest ? ranking(20, 1, 1) : ranking(20, 1000, -10) }) };
  };
  const snapshotValid = await api.begin("Kris");
  assert.equal(snapshotValid, true);
  assert.equal(requests.length, 2, "opening a game fetches both snapshots");
  assert.match(requests[0].url, /mode=highest/);
  assert.match(requests[1].url, /mode=lowest/);
  assert.equal(api.state().state, "PRE_ROUND", "gameplay starts only after snapshots resolve");
  assert.equal(api.state().snapshotValid, true);
  assert.equal(api.state().snapshot.highest.length, 20);
  assert.equal(api.state().snapshot.lowest.length, 20);

  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    throw new Error("offline");
  };
  assert.equal(await api.begin("Offline"), false);
  assert.equal(api.state().state, "PRE_ROUND", "snapshot failure must not block gameplay");
  assert.equal(api.state().snapshotValid, false);
  assert.equal(api.openingUi().modalOpen, false, "snapshot failure closes the loading modal");
  requests.length = 0;
  assert.equal(await api.begin("Experimental Offline", "experimental"), false);
  assert.equal(api.state().gameMode, "experimental");
  assert.equal(api.state().state, "PRE_ROUND");
  assert.equal(api.state().snapshotValid, false, "Experimental GET failure keeps the same safe fallback");

  const high = ranking(20, 1000, -10);
  const low = ranking(20, 0, 10);
  assert.equal(JSON.stringify(api.qualification(500, { highest: high.slice(0, 19), lowest: low })), JSON.stringify({ mode: "highest", highest: true, lowest: false }));
  assert.equal(api.qualification(810, { highest: high, lowest: low }).highest, true, "equal highest rank 20 qualifies");
  assert.equal(api.qualification(811, { highest: high, lowest: low }).highest, true);
  assert.equal(api.qualification(809, { highest: high, lowest: low }).highest, false);
  assert.equal(api.qualification(190, { highest: high, lowest: low }).lowest, true, "equal lowest rank 20 qualifies");
  assert.equal(api.qualification(189, { highest: high, lowest: low }).lowest, true);
  assert.equal(api.qualification(191, { highest: high, lowest: low }).lowest, false);
  assert.equal(api.qualification(50, { highest: high, lowest: low.slice(0, 19) }).lowest, true);
  assert.equal(JSON.stringify(api.qualification(999, null)), JSON.stringify({ mode: null, highest: false, lowest: false }));

  requests.length = 0;
  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  requests.length = 0;
  api.startWithSnapshot("Experimental High", 900, high, low, "experimental");
  await api.showGameOver();
  assert.equal(api.state().high, true, "Experimental still evaluates highest qualification");
  assert.equal(requests.length, 0, "Experimental highest qualification is blocked at the POST gate");
  assert.equal(JSON.stringify(api.state().preparedPayload), JSON.stringify({ mode: "highest", name: "Experimental High", score: 900 }));
  assert.doesNotMatch(api.report(), /進入最高 TOP 20/);
  assert.match(api.report(), /進階模式：成績不會上傳排行榜/);

  api.startWithSnapshot("Experimental Low", 100, high, low, "experimental");
  await api.showGameOver();
  assert.equal(api.state().low, true, "Experimental still evaluates lowest qualification");
  assert.equal(requests.length, 0, "Experimental lowest qualification is blocked at the POST gate");
  assert.equal(JSON.stringify(api.state().preparedPayload), JSON.stringify({ mode: "lowest", name: "Experimental Low", score: 100 }));
  assert.doesNotMatch(api.report(), /進入最低 TOP 20/);

  api.startWithSnapshot("Middle", 500, high, low);
  await api.showGameOver();
  assert.equal(requests.length, 0, "a score outside both boards is not posted");
  assert.doesNotMatch(api.report(), /進入最高|進入最低/);

  api.startWithSnapshot("High", 900, high, low);
  const highPromise = api.showGameOver();
  assert.match(getElement("#modal-body").innerHTML, /有不得了的事正在發生/);
  await highPromise;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { mode: "highest", name: "High", score: 900 });
  assert.match(api.report(), /進入最高 TOP 20/);
  assert.doesNotMatch(api.report(), /進入最低 TOP 20/);
  await api.showGameOver();
  assert.equal(requests.length, 1, "GAME OVER rerender cannot post again");

  requests.length = 0;
  api.startWithSnapshot("Low", 100, high, low);
  const lowPromise = api.showGameOver();
  assert.match(getElement("#modal-body").innerHTML, /欸你好像\.\.\.\./);
  await lowPromise;
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), { mode: "lowest", name: "Low", score: 100 });
  assert.match(api.report(), /進入最低 TOP 20/);
  assert.doesNotMatch(api.report(), /進入最高 TOP 20/);

  requests.length = 0;
  api.startWithSnapshot("Both", 500, [], []);
  const bothPromise = api.showGameOver();
  assert.match(getElement("#modal-body").innerHTML, /有不得了的事正在發生/);
  await bothPromise;
  assert.equal(requests.length, 1, "a score that fits both boards posts once");
  assert.deepEqual(JSON.parse(requests[0].options.body), { mode: "highest", name: "Both", score: 500 });
  assert.match(api.report(), /進入最高 TOP 20/);
  assert.doesNotMatch(api.report(), /進入最低 TOP 20/, "highest takes priority and is mutually exclusive");
  assert.equal(api.state().mode, "highest");
  assert.equal(api.state().low, false);

  requests.length = 0;
  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    throw new Error("POST failed");
  };
  api.startWithSnapshot("Failed", 900, high, low);
  await api.showGameOver();
  assert.equal(api.state().complete, true);
  assert.equal(api.state().status, "failure");
  assert.doesNotMatch(api.report(), /進入最高|進入最低/, "failed POST cannot claim ranking success");

  const entries = ranking(22, 1000, -1);
  entries[3].name = "<img src=x onerror=alert(1)>";
  api.renderLeaderboard(entries);
  const list = getElement("#leaderboard-content").children[0];
  assert.equal(list.children.length, 21);
  assert.equal(list.children[1].children[0].textContent, "🥇");
  assert.equal(list.children[4].children[1].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(list.children[4].children[1].innerHTML, "");

  requests.length = 0;
  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true, ranking: [] }) };
  };
  api.openLeaderboard();
  assert.equal(api.overlayOpen(), true);
  assert.equal(api.mode(), "highest");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(requests.at(-1).url, /mode=highest/);
  api.setMode("lowest", false);
  await api.loadLeaderboard();
  assert.match(requests.at(-1).url, /mode=lowest/);
  assert.equal(getElement("#leaderboard-highest").attributes["aria-pressed"], "false");
  assert.equal(getElement("#leaderboard-lowest").attributes["aria-pressed"], "true");
  api.renderLeaderboard(entries);
  assert.equal(getElement("#leaderboard-content").children[0].children[1].children[0].textContent, "1", "lowest ranking uses normal numeric ranks");
  requests.length = 0;
  getElement("#leaderboard-retry").listeners.get("click")();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(requests.at(-1).url, /mode=lowest/, "retry keeps the currently selected mode");
  api.closeLeaderboard();
  assert.equal(api.overlayOpen(), false);

  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="leaderboard-highest"/);
  assert.match(html, /id="leaderboard-lowest"/);
  assert.match(html, /id="start-experimental-button"/);
  assert.match(html, /id="game-mode-indicator"[^>]*>經典模式</);
  assert.match(css, /\.mode-options \.advanced-mode-button\{[^}]*background:/);
  assert.match(source, /game\.round\.drawIndex === 12/, "the existing formal draw #13 mini-game opportunity remains unchanged");
  assert.match(css, /\.leaderboard-overlay\{[^}]*position:fixed[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(css, /\.leaderboard-content\{[^}]*min-height:0[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
  assert.match(css, /@media\(max-width:759px\)\{\.leaderboard-overlay\{padding:0\}\.leaderboard-card\{[^}]*height:100dvh/);

  const appsScriptSource = fs.readFileSync(path.join(root, "docs", "leaderboard", "google-apps-script.js"), "utf8");
  const appsContext = vm.createContext({ console, Date, Array, Object, JSON, isFinite });
  vm.runInContext(appsScriptSource, appsContext);
  assert.equal(appsContext.getRankingMode_(), "highest");
  assert.equal(appsContext.getRankingMode_({ parameter: { mode: "highest" } }), "highest");
  assert.equal(appsContext.getRankingMode_({ parameter: { mode: "lowest" } }), "lowest");
  const rows = Array.from({ length: 22 }, (_, index) => [new Date(2026, 0, index + 1), `P${index}`, index % 2 ? 10 : 20]);
  const entriesForMigration = rows.map((row, rowIndex) => ({ timestamp: row[0], name: row[1], score: row[2], rowIndex }));
  const migration = appsContext.buildMigrationRankings_(entriesForMigration);
  const highestRows = migration.highest;
  const lowestRows = migration.lowest;
  assert.equal(highestRows.length, 20);
  assert.equal(lowestRows.length, 20);
  assert.ok(highestRows[0].score >= highestRows.at(-1).score);
  assert.ok(lowestRows[0].score <= lowestRows.at(-1).score);
  const tiedHighestDates = highestRows.filter(entry => entry.score === highestRows[0].score).map(entry => entry.timestamp.getTime());
  assert.deepEqual(tiedHighestDates, [...tiedHighestDates].sort((a, b) => b - a));
  const tiedLowestDates = lowestRows.filter(entry => entry.score === lowestRows[0].score).map(entry => entry.timestamp.getTime());
  assert.deepEqual(tiedLowestDates, [...tiedLowestDates].sort((a, b) => b - a));
  assert.equal(highestRows[0].timestamp, entriesForMigration.find(entry => entry.timestamp === highestRows[0].timestamp).timestamp, "migration preserves timestamps");
  const overlap = highestRows.filter(highEntry => lowestRows.includes(highEntry));
  assert.ok(overlap.length > 0, "independent seed lists may contain the same historical record");
  const rerun = appsContext.buildMigrationRankings_(entriesForMigration);
  assert.deepEqual(JSON.stringify(rerun), JSON.stringify(migration), "migration ranking is repeatable without appending duplicates");
  const smallSeed = entriesForMigration.slice(0, 3);
  assert.equal(appsContext.buildMigrationRankings_(smallSeed).highest.length, 3, "migration supports fewer than 20 valid rows");
  assert.equal(appsContext.buildMigrationRankings_(smallSeed).lowest.length, 3);
  assert.match(appsScriptSource, /LEGACY_SHEET_NAME = 'Ranking'/);
  assert.match(appsScriptSource, /highest: 'HighestRanking'/);
  assert.match(appsScriptSource, /lowest: 'LowestRanking'/);
  assert.match(appsScriptSource, /function initializeDualLeaderboards\(\)/);
  assert.match(appsScriptSource, /LockService\.getScriptLock\(\)/);
  assert.match(appsScriptSource, /validateMode_\(payload\.mode\)/);

  class FakeSheet {
    constructor(name, rows = []) { this.name = name; this.rows = rows.map(row => row.slice()); }
    getLastRow() { return this.rows.length; }
    appendRow(row) { this.rows.push(row.slice()); }
    setFrozenRows() {}
    clearContents() { this.rows = []; }
    getRange(row, column, rowCount, columnCount) {
      return {
        getValues: () => Array.from({ length: rowCount }, (_, y) => Array.from({ length: columnCount }, (_, x) => this.rows[row - 1 + y]?.[column - 1 + x])),
        setValues: values => { values.forEach((valuesRow, y) => { if (!this.rows[row - 1 + y]) this.rows[row - 1 + y] = []; valuesRow.forEach((value, x) => { this.rows[row - 1 + y][column - 1 + x] = value; }); }); }
      };
    }
  }
  class FakeSpreadsheet {
    constructor(sheets) { this.sheets = sheets; }
    getSheetByName(name) { return this.sheets[name] || null; }
    insertSheet(name) { return (this.sheets[name] = new FakeSheet(name)); }
  }
  const seedData = entriesForMigration.map(entry => [entry.timestamp, entry.name, entry.score]);
  seedData.push(["invalid", "Broken", 9999]);
  const fakeSheets = { Ranking: new FakeSheet("Ranking", [["timestamp", "name", "score"], ...seedData]) };
  const fakeSpreadsheet = new FakeSpreadsheet(fakeSheets);
  let lockDepth = 0;
  const backendContext = vm.createContext({
    console: quietConsole, Date, Array, Object, JSON, isFinite,
    SpreadsheetApp: { openById: () => fakeSpreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() { lockDepth += 1; }, releaseLock() { lockDepth -= 1; } }) },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(appsScriptSource, backendContext);
  const legacyBefore = JSON.stringify(fakeSheets.Ranking.rows);
  backendContext.initializeDualLeaderboards();
  assert.equal(lockDepth, 0, "migration releases its script lock");
  assert.equal(JSON.stringify(fakeSheets.Ranking.rows), legacyBefore, "migration never changes Ranking");
  assert.equal(fakeSheets.HighestRanking.rows.length, 21);
  assert.equal(fakeSheets.LowestRanking.rows.length, 21);
  assert.equal(fakeSheets.HighestRanking.rows[1][2], 20);
  assert.equal(fakeSheets.LowestRanking.rows[1][2], 10);
  assert.ok(fakeSheets.HighestRanking.rows.slice(1).every(row => row[0] instanceof Date), "migration preserves original timestamp values");
  const firstMigration = JSON.stringify({ high: fakeSheets.HighestRanking.rows, low: fakeSheets.LowestRanking.rows });
  backendContext.initializeDualLeaderboards();
  assert.equal(JSON.stringify({ high: fakeSheets.HighestRanking.rows, low: fakeSheets.LowestRanking.rows }), firstMigration, "rerunning migration replaces instead of appending");

  const getHigh = JSON.parse(backendContext.doGet({ parameter: { mode: "highest" } }).text);
  const getLow = JSON.parse(backendContext.doGet({ parameter: { mode: "lowest" } }).text);
  const getDefault = JSON.parse(backendContext.doGet({ parameter: {} }).text);
  assert.equal(getHigh.ranking[0].score, 20);
  assert.equal(getLow.ranking[0].score, 10);
  assert.equal(getDefault.ranking[0].score, 20);

  const post = payload => JSON.parse(backendContext.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  const legacyBeforePosts = JSON.stringify(fakeSheets.Ranking.rows);
  assert.equal(post({ mode: "highest", name: "New High", score: 999 }).success, true);
  assert.equal(fakeSheets.HighestRanking.rows.length, 21);
  assert.equal(fakeSheets.HighestRanking.rows[1][1], "New High");
  assert.equal(post({ mode: "lowest", name: "New Low", score: -999 }).success, true);
  assert.equal(fakeSheets.LowestRanking.rows.length, 21);
  assert.equal(fakeSheets.LowestRanking.rows[1][1], "New Low");
  const highestAfterValidPosts = JSON.stringify(fakeSheets.HighestRanking.rows);
  const lowestAfterValidPosts = JSON.stringify(fakeSheets.LowestRanking.rows);
  assert.equal(post({ mode: "invalid", name: "No Write", score: 1 }).success, false);
  assert.equal(JSON.stringify(fakeSheets.HighestRanking.rows), highestAfterValidPosts);
  assert.equal(JSON.stringify(fakeSheets.LowestRanking.rows), lowestAfterValidPosts);
  assert.equal(JSON.stringify(fakeSheets.Ranking.rows), legacyBeforePosts, "POST never modifies Ranking");
  assert.equal(lockDepth, 0, "POST releases its script lock");

  console.log("Dual leaderboard snapshot, qualification, submission and overlay tests: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
