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
  requestAnimationFrame() { return 1; }, setTimeout(callback) { callback?.(); return 1; }, clearTimeout() {}, setInterval() {}, clearInterval() {}, AbortController,
  fetch: async () => ({ ok: true, json: async () => ({ success: true, ranking: [] }) }),
  Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent
});
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
globalThis.activationTest = {
  setupPre(items = [], mode = GAME_MODES.EXPERIMENTAL) {
    game = freshGameState("TEST", mode); game.items = items.slice(); game.round = createRound(15, []); game.state = GAME_STATES.PRE_ROUND;
    game.round.preRound.eventSelectionType = "SKIP"; renderPreRound(); return game;
  },
  leverageButtons() { return elements.preRoundLeverageOptions.children.map(button => ({ value: Number(button.dataset.leverage), disabled: button.disabled, selected: button.classList.contains("selected"), text: button.innerHTML })); },
  selectMultiplier(value) { selectPreRoundLeverage({ currentTarget: { dataset: { leverage: String(value) } } }); return { selected: game.round.preRound.selectedLeverage, items: game.items.slice() }; },
  removeLastItem() { return game.items.pop(); },
  commit() { const first = commitRoundConfiguration(); const second = commitRoundConfiguration(); return { first, second, state: game.state, items: game.items.slice(), attempts: game.attemptsConsumed, multiplier: game.round.finalMultiplier, config: game.round.config }; },
  freeDecision(use) { const result = resolveFreeTicketDecision(use); return { result, state: game.state, items: game.items.slice(), attempts: game.attemptsConsumed, config: game.round.config }; },
  special(multiplier, items = []) { this.setupPre(items); game.round.preRound.selectedLeverage = multiplier; game.round.preRound.eventSelectionType = "EVENT"; game.round.preRound.eventOptions = [PRE_ROUND_EVENT_DEFINITIONS.find(event => event.id === "boss-leverage")]; game.round.preRound.selectedEventId = "boss-leverage"; commitRoundConfiguration(); return { final: game.round.finalMultiplier, ticket: game.round.config.ticketMultiplier, special: game.round.config.specialMultiplier }; },
  bet(multiplier, won) { game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.score = 500; game.round = createRound(); game.round.config = { activeBetId: "believe-guoju" }; game.round.finalMultiplier = multiplier; if (won) ["east", "south", "west", "north", "red", "green"].forEach(id => game.round.drawn.add(id)); const result = settleBets()[0]; return { points: result.points, score: game.score, breakdown: game.round.scoreBreakdown[0] }; },
  setupDraw(items = [], mode = GAME_MODES.EXPERIMENTAL) { game = freshGameState("TEST", mode); game.items = items.slice(); game.round = createRound(); game.round.committed = true; game.round.started = true; game.state = GAME_STATES.DRAWING; renderBoard(); updateHUD(); return game; },
  openInventory() { openItemStatus(); return { items: game.items.slice(), body: elements.modalBody.innerHTML }; },
  beginSelf(index) { const result = beginSelfSelectTicketDraw(index); return { result, state: game.state, items: game.items.slice(), picker: game.round.tilePicker ? { ...game.round.tilePicker, onConfirm: undefined } : null }; },
  async confirmSelf(tileId) { const before = game.round.drawIndex; const result = await confirmSelfSelectTicketDraw(tileId); return { result, indexDelta: game.round.drawIndex - before, drawn: game.round.drawn.has(tileId), state: game.state, pendingSpecial: game.pendingSpecial }; },
  async randomEvent() { const event = GAME_TILES.find(tile => tile.id === "event-1"); placeTileAtNextFormalDraw(event.id); await acquireFormalTile(event); return { state: game.state, index: game.round.drawIndex, pending: Boolean(game.pendingSpecial) }; },
  sorted(ids) { return sortFormalTilesForPicker(ids.map(id => GAME_TILES.find(tile => tile.id === id))).map(tile => tile.id); },
  production(items) { this.setupPre(items, GAME_MODES.PRODUCTION); const buttons = this.leverageButtons(); const committed = commitRoundConfiguration(); return { buttons, committed, items: game.items.slice(), attempts: game.attemptsConsumed, multiplier: game.round.finalMultiplier, state: game.state }; },
  freeRoundLifecycle() { this.setupPre(["free-ticket"]); commitRoundConfiguration(); resolveFreeTicketDecision(true); endRound(false, false); const hasNext = hasNextRoundAfterSettlement(); const invited = openInterRoundMiniGameInvitation(() => 0); const startedMiniGame = startInterRoundMiniGame(); return { attempts: game.attemptsConsumed, hasNext, invited, startedMiniGame, state: game.state }; },
  twoFreeRounds() { this.setupPre(["free-ticket"]); commitRoundConfiguration(); resolveFreeTicketDecision(true); const firstAttempts = game.attemptsConsumed; startRound(); game.items.push("free-ticket"); game.round.preRound.eventSelectionType = "SKIP"; commitRoundConfiguration(); resolveFreeTicketDecision(true); return { firstAttempts, secondAttempts: game.attemptsConsumed, roundsPlayed: game.roundsPlayed }; },
  badgeHidden() { return elements.inventoryFullBadge.classList.contains("hidden"); }
};`;
vm.runInContext(source, context, { filename: "experimental-ticket-activation-bundle.js" });
const api = context.activationTest;
const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
api.setupPre([]);
assert.deepEqual(plain(api.leverageButtons()).map(({ value, disabled }) => ({ value, disabled })), [{ value: 2, disabled: true }, { value: 3, disabled: true }]);
assert.equal(api.selectMultiplier(2).selected, 1);
api.setupPre(["multiplier-ticket"]);
assert.deepEqual(plain(api.leverageButtons()).map(({ value, disabled }) => ({ value, disabled })), [{ value: 2, disabled: false }, { value: 3, disabled: true }]);
assert.deepEqual(plain(api.selectMultiplier(2)), { selected: 2, items: ["multiplier-ticket"] });
assert.deepEqual(plain(api.selectMultiplier(2)), { selected: 1, items: ["multiplier-ticket"] });
api.setupPre(["multiplier-ticket", "multiplier-ticket"]);
assert.deepEqual(plain(api.leverageButtons()).map(({ value, disabled }) => ({ value, disabled })), [{ value: 2, disabled: false }, { value: 3, disabled: false }]);
api.selectMultiplier(2); api.selectMultiplier(3);
assert.equal(api.selectMultiplier(3).selected, 1);
assert.equal(api.selectMultiplier(3).items.length, 2, "preview never consumes tickets");

api.setupPre(["multiplier-ticket"]); api.selectMultiplier(2);
let committed = plain(api.commit());
assert.equal(committed.first, true); assert.equal(committed.second, false); assert.equal(committed.items.length, 0); assert.equal(committed.attempts, 1); assert.equal(committed.multiplier, 2);
api.setupPre(["multiplier-ticket", "multiplier-ticket"]); api.selectMultiplier(3);
committed = plain(api.commit());
assert.equal(committed.items.length, 0); assert.equal(committed.attempts, 1); assert.equal(committed.multiplier, 3);
api.setupPre([]); committed = plain(api.commit()); assert.equal(committed.attempts, 1); assert.equal(committed.multiplier, 1);

assert.deepEqual(plain(api.special(2, ["multiplier-ticket"])), { final: 4, ticket: 2, special: 2 });
assert.deepEqual(plain(api.special(3, ["multiplier-ticket", "multiplier-ticket"])), { final: 6, ticket: 3, special: 2 });
for (const multiplier of [1, 2, 3, 6]) {
  assert.equal(api.bet(multiplier, true).points, 30 * multiplier);
  assert.equal(api.bet(multiplier, false).points, -30 * multiplier);
}
assert.deepEqual(plain(api.bet(6, true)), { points: 180, score: 680, breakdown: { key: "bet:believe-guoju:won", label: "下注成功", count: 1, points: 30, affectedByMultiplier: true } });

api.setupPre(["multiplier-ticket", "multiplier-ticket"]); api.selectMultiplier(3); api.removeLastItem();
const invalidCommit = plain(api.commit());
assert.equal(invalidCommit.first, false); assert.equal(invalidCommit.state, "PRE_ROUND"); assert.equal(invalidCommit.items.length, 1); assert.equal(invalidCommit.config, null);

api.setupDraw(["self-select-ticket"]);
const inventoryPreview = plain(api.openInventory());
assert.deepEqual(inventoryPreview.items, ["self-select-ticket"], "opening inventory does not consume the ticket");
let self = plain(api.beginSelf(0));
assert.equal(self.result, true); assert.equal(self.state, "SELF_SELECT_DRAW"); assert.equal(self.items.length, 0); assert.equal(self.picker.allowCancel, false);
const normalId = self.picker.tiles.find(id => id === "wan-1") || self.picker.tiles.find(id => !id.startsWith("event-"));
let selfResult = plain(await api.confirmSelf(normalId));
assert.equal(selfResult.indexDelta, 1); assert.equal(selfResult.drawn, true); assert.equal(selfResult.state, "DRAWING");

api.setupDraw(["self-select-ticket"]); self = plain(api.beginSelf(0));
const eventId = self.picker.tiles.find(id => id === "event-1");
selfResult = plain(await api.confirmSelf(eventId));
assert.equal(selfResult.indexDelta, 1); assert.equal(selfResult.drawn, true); assert.equal(selfResult.state, "DRAWING"); assert.equal(selfResult.pendingSpecial, null);
api.setupDraw([]); assert.deepEqual(plain(await api.randomEvent()), { state: "EVENT_REVEAL", index: 1, pending: true });

const shuffled = ["event-2", "white", "wan-9", "east", "tong-1", "suo-5", "event-1", "wan-1", "red", "green", "north", "south", "west"];
assert.deepEqual(plain(api.sorted(shuffled)), ["wan-1", "wan-9", "tong-1", "suo-5", "east", "south", "west", "north", "red", "green", "white", "event-1", "event-2"]);

api.setupPre(["free-ticket"]);
assert.equal(api.commit().state, "PRE_ROUND", "owned free ticket opens confirmation before commit");
assert.equal(api.freeDecision(false).items[0], "free-ticket");
assert.equal(api.freeDecision(false).attempts, 1);
api.setupPre(["free-ticket"]); api.commit();
let free = plain(api.freeDecision(true));
assert.equal(free.items.length, 0); assert.equal(free.attempts, 0); assert.equal(free.config.freeTicketUsed, true);
assert.deepEqual(plain(api.freeRoundLifecycle()), { attempts: 0, hasNext: true, invited: true, startedMiniGame: true, state: "INTER_ROUND_MINIGAME" });
assert.deepEqual(plain(api.twoFreeRounds()), { firstAttempts: 0, secondAttempts: 0, roundsPlayed: 2 });

api.setupPre(["multiplier-ticket", "multiplier-ticket", "free-ticket"]); api.selectMultiplier(3); api.commit();
const combined = plain(api.freeDecision(true));
assert.equal(combined.items.length, 0); assert.equal(combined.attempts, 0); assert.equal(combined.config.finalMultiplier, 3); assert.equal(api.badgeHidden(), true);

const production = plain(api.production(["multiplier-ticket", "self-select-ticket", "free-ticket"]));
assert.deepEqual(production.buttons.map(button => button.value), [1, 2, 3]);
assert.equal(production.committed, true); assert.equal(production.attempts, 1); assert.equal(production.multiplier, 1); assert.equal(production.items.length, 3);
api.setupDraw(["self-select-ticket"], "production"); assert.equal(api.beginSelf(0).result, false);

console.log("Experimental ticket activation tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
