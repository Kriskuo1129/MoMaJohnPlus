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
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.listeners = new Map(); this.textContent = ""; this.innerHTML = ""; this.value = "TEST"; this.disabled = false; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  closest() { return this; }
  setAttribute() {}
  focus() {}
  remove() {}
  getBoundingClientRect() { return { width: 100, height: 60, left: 0, top: 0 }; }
  get offsetWidth() { return 100; }
}

const elements = new Map();
const getElement = selector => { if (!elements.has(selector)) elements.set(selector, new FakeElement()); return elements.get(selector); };
const document = { querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(), documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true } };
const inertMiniGame = { start() { return { round: { language: "zh", themeName: "測試" }, destroy() {} }; } };
const context = vm.createContext({
  console, document, MemoryMaster: inertMiniGame, PaJuR: inertMiniGame, Baseball9: inertMiniGame,
  localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, clearInterval() {}, AbortController,
  fetch: async () => ({ ok: true, json: async () => ({ success: true, ranking: [] }) }),
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const config = fs.readFileSync(path.join(root, "game-config.js"), "utf8");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
const startedModes = [];
beginGameWithLeaderboardSnapshot = async (playerName, mode) => { startedModes.push(mode); game = freshGameState(playerName, mode); return true; };
globalThis.modeIdentityTest = {
  async click(selector) { await document.querySelector(selector).listeners.get("click")(); return startedModes.at(-1); },
  async replay(mode) { game = freshGameState("TEST", mode); await resetGame(); return startedModes.at(-1); },
  displayName(mode) { return gameModeDisplayName(mode); },
  postAllowed(mode) { return gameModeAllowsLeaderboardPost(mode); },
  help() { game = freshGameState("TEST", GAME_MODES.PRODUCTION); game.round = createRound(); return buildModeGuideContent(); }
};`;
vm.runInContext(source, context, { filename: "mode-identity-bundle.js" });
const api = context.modeIdentityTest;

(async () => {
  const startScreen = html.match(/<section id="start-screen"[\s\S]*?<main id="game-shell"/)?.[0] || "";
  const startScreenText = startScreen.replace(/<[^>]+>/g, " ");
  assert.match(startScreen, />經典模式</);
  assert.match(startScreen, />進階模式</);
  assert.match(startScreen, />比較純粹的摸麻將體驗</);
  assert.match(startScreen, />更多策略的摸麻將體驗</);
  assert.match(html, /id="pre-round-item-button"[^>]*>道具/);
  assert.match(html, /id="start-round-button"[^>]*>開始摸牌</);
  assert.doesNotMatch(html, />開牌局</);
  assert.match(css, /\.pre-round-actions\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\)/);
  assert.match(config, /id: "multiplier-ticket", title: "倍率券", icon: "倍"/);
  assert.doesNotMatch(startScreenText, /新玩法測試|測試模式|Experimental|Production|🧪|Beta/i);
  assert.equal(await api.click("#start-game-button"), "production");
  assert.equal(await api.click("#start-experimental-button"), "experimental");
  assert.equal(await api.replay("production"), "production");
  assert.equal(await api.replay("experimental"), "experimental");
  assert.equal(api.displayName("production"), "經典模式");
  assert.equal(api.displayName("experimental"), "進階模式");
  assert.equal(api.postAllowed("production"), true);
  assert.equal(api.postAllowed("experimental"), false);
  assert.match(api.help(), /經典模式/);
  assert.match(api.help(), /進階模式/);
  console.log("Classic and Advanced mode identity tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
