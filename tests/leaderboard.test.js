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
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.disabled = false;
    this.attributes = {};
  }
  addEventListener() {}
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
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON
});

const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
globalThis.leaderboardTest = {
  start(name, score) { game = freshGameState(name); game.score = score; game.round = createRound(15, []); },
  showGameOver,
  submitGameOverScore,
  state() { return { state: game.state, submitted: game.leaderboardSubmitted, status: game.leaderboardSubmissionStatus }; },
  fresh(name) { game = freshGameState(name); return { submitted: game.leaderboardSubmitted, status: game.leaderboardSubmissionStatus }; },
  renderLeaderboard,
  renderLeaderboardMessage,
  openLeaderboard,
  closeLeaderboard,
  loadLeaderboard,
  overlayOpen() { return elements.leaderboardOverlay.classList.contains("open"); }
};`;
vm.runInContext(source, context);
const api = context.leaderboardTest;
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  api.start("Kris", 1280);
  api.showGameOver();
  await settle();
  assert.equal(requests.length, 1, "GAME OVER should submit once");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { name: "Kris", score: 1280 });
  assert.equal(requests[0].options.headers["Content-Type"], "text/plain;charset=utf-8");
  assert.equal(api.state().status, "success");

  api.showGameOver();
  await settle();
  assert.equal(requests.length, 1, "GAME OVER rerender must not submit again");
  assert.equal(api.fresh("Kris").submitted, false, "a new game state resets the submit flag");

  api.start("-沒輸入名稱-", 500);
  await api.submitGameOverScore();
  assert.deepEqual(JSON.parse(requests[1].options.body), { name: "-沒輸入名稱-", score: 500 });

  fetchImplementation = async (url, options = {}) => {
    requests.push({ url, options });
    throw new Error("offline");
  };
  api.start("Offline", 88);
  api.showGameOver();
  await settle();
  assert.equal(api.state().state, "GAME_OVER", "POST failure must not leave GAME OVER");
  assert.equal(api.state().status, "failure");

  const rankings = Array.from({ length: 22 }, (_, index) => ({ rank: index + 1, name: index < 2 ? "Same" : `Player ${index + 1}`, score: 1000 - index }));
  rankings[3].name = "<img src=x onerror=alert(1)>";
  api.renderLeaderboard(rankings);
  const list = getElement("#leaderboard-content").children[0];
  assert.equal(list.children.length, 21, "heading plus Top 20 rows should render");
  assert.equal(list.children[1].children[0].textContent, "🥇");
  assert.equal(list.children[2].children[0].textContent, "🥈");
  assert.equal(list.children[3].children[0].textContent, "🥉");
  assert.equal(list.children[1].children[1].textContent, "Same");
  assert.equal(list.children[2].children[1].textContent, "Same", "duplicate names remain separate");
  assert.equal(list.children[4].children[1].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(list.children[4].children[1].innerHTML, "", "external names are assigned with textContent");

  api.renderLeaderboard([]);
  assert.equal(getElement("#leaderboard-content").children[0].textContent, "目前還沒有排行榜紀錄");

  await api.loadLeaderboard();
  assert.equal(getElement("#leaderboard-content").children[0].textContent, "排行榜讀取失敗");
  assert.equal(getElement("#leaderboard-retry").classList.contains("hidden"), false);

  api.start("State", 10);
  const stateBeforeOverlay = api.state().state;
  api.openLeaderboard();
  assert.equal(api.overlayOpen(), true);
  assert.equal(api.state().state, stateBeforeOverlay, "opening leaderboard must not change game state");
  api.closeLeaderboard();
  assert.equal(api.overlayOpen(), false);
  assert.equal(api.state().state, stateBeforeOverlay, "closing leaderboard must restore the same game state");

  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  assert.match(css, /\.leaderboard-overlay\{[^}]*position:fixed[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(css, /\.leaderboard-content\{[^}]*min-height:0[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
  assert.match(css, /@media\(max-width:759px\)\{\.leaderboard-overlay\{padding:0\}\.leaderboard-card\{[^}]*height:100dvh/);

  console.log("Leaderboard Phase 2 tests: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
