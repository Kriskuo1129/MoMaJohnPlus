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
const inertMiniGame = { start() { return { round: { language: "zh", themeName: "測試" }, destroy() {} }; } };
const context = vm.createContext({
  console, document, MemoryMaster: inertMiniGame, PaJuR: inertMiniGame, Baseball9: inertMiniGame,
  localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 },
  requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, AbortController,
  fetch: async () => ({ ok: true, json: async () => ({ success: true, ranking: [] }) }),
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
globalThis.ticketRewardTest = {
  definitions() { return getTicketDefinitions().map(item => ({ id: item.id, title: item.title, icon: item.icon, type: item.type, rewardOnly: item.rewardOnly })); },
  randomItemIds() { return getRandomItemDefinitions().map(item => item.id); },
  setup(items = [], mode = GAME_MODES.EXPERIMENTAL) {
    game = freshGameState("TEST", mode); game.items = items.slice(); game.round = createRound(15, []); game.round.committed = true;
    game.round.miniGame = createMiniGameState({ interRound: true }); game.round.miniGame.offered = true; game.round.miniGame.selectedId = "pachinko";
    game.state = GAME_STATES.INTER_ROUND_MINIGAME; updateHUD(); return game;
  },
  success(items = []) { this.setup(items); completeInterRoundMiniGame({ success: true }); return { state: game.state, items: game.items.slice(), body: elements.modalBody.innerHTML }; },
  failure(items = []) { this.setup(items); completeInterRoundMiniGame({ success: false }); return { state: game.state, items: game.items.slice(), body: elements.modalBody.innerHTML }; },
  choose(itemId) { const first = selectInterRoundReward(itemId); const second = selectInterRoundReward(itemId); return { first, second, state: game.state, items: game.items.slice(), pending: game.pendingInterRoundRewardId, body: elements.modalBody.innerHTML }; },
  replace(index) { const first = completeInterRoundRewardReplacement(index); const second = completeInterRoundRewardReplacement(index); return { first, second, state: game.state, items: game.items.slice(), pending: game.pendingInterRoundRewardId }; },
  badge(items) { game = freshGameState("TEST", GAME_MODES.PRODUCTION); game.items = items.slice(); game.round = createRound(); updateHUD(); return elements.inventoryFullBadge.classList.contains("hidden"); },
  overlay(items) { game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.items = items.slice(); game.round = createRound(); game.round.committed = true; game.state = GAME_STATES.DRAWING; openItemStatus(); return elements.modalBody.innerHTML; },
  productionRewardAttempt() { this.setup([], GAME_MODES.PRODUCTION); return { opened: openInterRoundRewardSelection(), state: game.state, items: game.items.slice() }; },
  heldTicketEffects() { game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.items = ["multiplier-ticket", "self-select-ticket", "free-ticket"]; game.round = createRound(); game.round.finalMultiplier = 1; return { multiplier: game.round.finalMultiplier, drawIndex: game.round.drawIndex, attempts: game.attemptsConsumed, picker: game.round.tilePicker }; }
};`;
vm.runInContext(source, context);
const api = context.ticketRewardTest;
const plain = value => JSON.parse(JSON.stringify(value));

const definitions = plain(api.definitions());
assert.deepEqual(definitions.map(item => item.id), ["multiplier-ticket", "self-select-ticket", "free-ticket"]);
assert.ok(definitions.every(item => item.type === "RESOURCE" && item.rewardOnly && item.icon));
assert.ok(api.randomItemIds().every(id => !definitions.some(ticket => ticket.id === id)), "Mystery Gift pool excludes tickets");

const reward = api.success();
assert.equal(reward.state, "INTER_ROUND_REWARD");
assert.equal(reward.items.length, 0);
assert.match(reward.body, /小遊戲成功|倍率券|自選券|免費券/);
for (const itemId of definitions.map(item => item.id)) {
  api.success();
  const chosen = api.choose(itemId);
  assert.equal(chosen.first, true);
  assert.equal(chosen.second, false, "double choice is ignored");
  assert.equal(chosen.state, "PRE_ROUND");
  assert.deepEqual(plain(chosen.items), [itemId]);
}

api.success(["multiplier-ticket", "multiplier-ticket"]);
const nonStacking = api.choose("free-ticket");
assert.deepEqual(plain(nonStacking.items), ["multiplier-ticket", "multiplier-ticket", "free-ticket"]);
assert.equal(nonStacking.items.length, 3, "each duplicate ticket consumes its own slot");

const existing = ["chance-maker", "empty-cup", "disposable-charm"];
api.success(existing);
const full = api.choose("self-select-ticket");
assert.equal(full.state, "INTER_ROUND_REWARD_REPLACEMENT");
assert.deepEqual(plain(full.items), existing, "full inventory is unchanged until the player replaces a slot");
assert.equal(full.pending, "self-select-ticket");
assert.match(full.body, /請選擇一個舊道具替換/);
const replaced = api.replace(1);
assert.equal(replaced.first, true);
assert.equal(replaced.second, false);
assert.deepEqual(plain(replaced.items), ["chance-maker", "self-select-ticket", "disposable-charm"]);
assert.equal(replaced.items.length, 3);
assert.equal(replaced.state, "PRE_ROUND");

const failure = api.failure(["chance-maker"]);
assert.equal(failure.state, "PRE_ROUND");
assert.deepEqual(plain(failure.items), ["chance-maker"]);
assert.equal(api.badge([]), true); assert.equal(api.badge(["chance-maker"]), true); assert.equal(api.badge(["chance-maker", "empty-cup"]), true);
assert.equal(api.badge(existing), false, "3/3 shows the full badge");
assert.equal(api.badge(existing.slice(0, 2)), true, "badge disappears immediately below 3/3");

const overlay = api.overlay(["multiplier-ticket", "self-select-ticket", "free-ticket"]);
assert.match(overlay, /倍率券/); assert.match(overlay, /自選券/); assert.match(overlay, /免費券/);
assert.doesNotMatch(overlay, /進階模式資源|於指定流程使用|Advanced|Experimental|Production/); assert.match(overlay, /data-use-self-select-index/); assert.doesNotMatch(overlay, /data-use-item-index/);
assert.deepEqual(JSON.parse(JSON.stringify(api.productionRewardAttempt())), { opened: false, state: "INTER_ROUND_MINIGAME", items: [] });
assert.deepEqual(JSON.parse(JSON.stringify(api.heldTicketEffects())), { multiplier: 1, drawIndex: 0, attempts: 0, picker: null });

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
assert.match(html, /id="inventory-full-badge"[^>]*>滿</);
assert.match(css, /\.ticket-reward-options\{[^}]*grid-template-columns:repeat\(3/);
assert.match(css, /@media\(max-width:759px\)\{\.ticket-reward-options\{grid-template-columns:1fr/);
console.log("Experimental ticket reward and inventory integration tests: PASS");
