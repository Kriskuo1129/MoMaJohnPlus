const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList { constructor() { this.values = new Set(); } add(...v) { v.forEach(x => this.values.add(x)); } remove(...v) { v.forEach(x => this.values.delete(x)); } contains(v) { return this.values.has(v); } toggle(v, force) { const on = force ?? !this.values.has(v); if (on) this.values.add(v); else this.values.delete(v); return on; } }
class FakeElement {
  constructor() { this.classList = new FakeClassList(); this.style = { setProperty() {} }; this.dataset = {}; this.children = []; this.listeners = new Map(); this.textContent = ""; this.innerHTML = ""; this.disabled = false; }
  addEventListener(type, fn) { this.listeners.set(type, fn); } append(...v) { this.children.push(...v); } appendChild(v) { this.append(v); } replaceChildren(...v) { this.children = v; }
  querySelector() { return new FakeElement(); } querySelectorAll() { return []; } closest() { return this; } setAttribute() {} focus() {} remove() {}
  getBoundingClientRect() { return { width: 100, height: 60, left: 0, top: 0 }; } get offsetWidth() { return 100; }
}
const elements = new Map();
const getElement = selector => { if (!elements.has(selector)) elements.set(selector, new FakeElement()); return elements.get(selector); };
const document = { querySelector: getElement, querySelectorAll: () => [], createElement: () => new FakeElement(), documentElement: new FakeElement(), body: new FakeElement(), fonts: { check: () => true } };
const inert = { start() { return { round: { language: "zh", themeName: "測試" }, destroy() {} }; } };
const context = vm.createContext({ console, document, MemoryMaster: inert, PaJuR: inert, Baseball9: inert, localStorage: { getItem: () => "", setItem() {} }, performance: { now: () => 0 }, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, AbortController, fetch: async () => ({ ok: true, json: async () => ({ success: true, ranking: [] }) }), Math, Object, Array, Set, Map, String, Number, Boolean, Promise, JSON, encodeURIComponent });
const root = path.resolve(__dirname, "..");
const source = `${fs.readFileSync(path.join(root, "game-config.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}\n
const sidePrompts = [];
notifyScore = message => { sidePrompts.push(message); };
globalThis.sideChallengeTest = {
  definitions: SIDE_CHALLENGE_DEFINITIONS,
  setup(index, multiplier = 1, mode = GAME_MODES.EXPERIMENTAL) {
    game = freshGameState("TEST", mode); game.round = createRound(15, []); game.round.committed = true; game.round.started = true; game.round.finalMultiplier = multiplier; game.round.config = { finalMultiplier: multiplier, activeBetId: null }; game.state = GAME_STATES.DRAWING; sidePrompts.length = 0;
    const before = game.round.sideChallenge;
    const selected = initializeSideChallenge(() => (index + 0.01) / SIDE_CHALLENGE_DEFINITIONS.length);
    return { before, selected: selected?.id ?? null, runtime: game.round.sideChallenge };
  },
  acquire(id) { const tile = GAME_TILES.find(candidate => candidate.id === id); game.round.drawn.add(id); evaluateSideChallengeAfterAcquisition(tile); return { status: game.round.sideChallenge.status, raw: game.round.rawPoints, prompts: sidePrompts.slice() }; },
  end() { resolveSideChallengeAtRoundEnd(); settleRoundPoints(); return { status: game.round.sideChallenge.status, raw: game.round.rawPoints, multiplierPoints: game.round.multiplierPoints, score: game.score, prompts: sidePrompts.slice(), settlement: renderSideChallengeSettlement() }; },
  pool(mode) { return getEligiblePreRoundEvents(mode).map(event => event.id); },
  production() { game = freshGameState("TEST", GAME_MODES.PRODUCTION); game.round = createRound(15, []); game.round.started = true; game.state = GAME_STATES.DRAWING; return { initialized: initializeSideChallenge(() => 0), sideChallenge: game.round.sideChallenge }; },
  freeTicketConfirmation() { game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.items = ["free-ticket"]; game.round = createRound(15, []); game.state = GAME_STATES.PRE_ROUND; game.round.preRound.eventSelectionType = "SKIP"; commitRoundConfiguration(); return { state: game.state, sideChallenge: game.round.sideChallenge }; },
  statusHtml() { renderSideChallengeStatus(); return elements.sideChallengeStatus.innerHTML; },
  reveal(index, mode = GAME_MODES.EXPERIMENTAL) {
    this.setup(index, 1, mode);
    const definition = sideChallengeDefinition();
    const scheduled = [];
    const opened = openSideChallengeReveal(definition, callback => { scheduled.push(callback); return scheduled.length; });
    const before = { opened, locked: game.uiOverlayOpen, ready: game.round.sideChallenge?.revealReady, confirmed: game.round.sideChallenge?.revealConfirmed, scheduled: scheduled.length };
    const earlyConfirm = confirmSideChallengeReveal();
    scheduled.forEach(callback => callback());
    const committedId = game.round.sideChallenge?.id;
    const confirmed = confirmSideChallengeReveal();
    return { before, earlyConfirm, committedId, confirmed, lockedAfter: game.uiOverlayOpen, revealConfirmed: game.round.sideChallenge?.revealConfirmed };
  },
  preRoundInventory(mode) {
    game = freshGameState("TEST", mode); game.items = ["multiplier-ticket", "free-ticket"]; game.round = createRound(15, []); game.state = GAME_STATES.PRE_ROUND;
    game.round.preRound.eventSelectionType = "SKIP"; game.round.preRound.selectedLeverage = mode === GAME_MODES.EXPERIMENTAL ? 2 : 1;
    const before = { selection: game.round.preRound.eventSelectionType, leverage: game.round.preRound.selectedLeverage, items: game.items.slice(), rounds: game.roundsPlayed };
    const opened = openPreRoundInventory(); const body = elements.modalBody.innerHTML; closeItemStatus();
    return { opened, body, before, after: { selection: game.round.preRound.eventSelectionType, leverage: game.round.preRound.selectedLeverage, items: game.items.slice(), rounds: game.roundsPlayed }, state: game.state };
  },
  preRoundOptions(mode) { game = freshGameState("TEST", mode); game.round = createRound(); return game.round.preRound.eventOptions.map(option => ({ id: option.id, title: option.title, type: option.type })); },
  categoryPool(categoryId) { return getAdvancedPreRoundCategoryPool(categoryId).map(event => event.id); },
  setupCategory(items = []) {
    game = freshGameState("TEST", GAME_MODES.EXPERIMENTAL); game.items = items.slice(); game.round = createRound(); game.state = GAME_STATES.PRE_ROUND;
    return this.categoryState();
  },
  chooseCategory(categoryId) { const selected = selectAdvancedPreRoundCategory(categoryId); return { selected, ...this.categoryState() }; },
  skipCategory() { selectPreRoundSkip(); return this.categoryState(); },
  categoryState() { return { selection: game.round.preRound.eventSelectionType, selectedCategoryId: game.round.preRound.selectedCategoryId, categoryCommitted: game.round.preRound.categoryCommitted, selectedEventId: game.round.preRound.selectedEventId, pendingItemId: game.round.pendingItemId, items: game.items.slice(), state: game.state, committed: game.round.committed, modal: elements.modalBody.innerHTML }; },
  startCategory(values = [0, 0]) { let index = 0; let calls = 0; const random = () => { calls += 1; return values[index++] ?? values.at(-1) ?? 0; }; const started = commitRoundConfiguration(random); return { started, calls, ...this.categoryState(), pendingRewardOnly: itemById(game.round.pendingItemId)?.rewardOnly ?? false, sideChallenge: game.round.sideChallenge }; },
  confirmCategoryReveal() { const confirmed = closeAdvancedCategoryReveal(); return { confirmed, ...this.categoryState(), config: game.round.config, sideChallenge: game.round.sideChallenge, title: elements.modalTitle.textContent }; },
  acceptCategoryItem() { const event = game.round.preRound.selectedEvent; return { accepted: acceptRevealedItem(event, 1), items: game.items.slice(), state: game.state, committed: game.round.committed, config: game.round.config, sideChallenge: game.round.sideChallenge }; },
  replaceCategoryItem(index) { const event = game.round.preRound.selectedEvent; confirmItemReplacement(event, 1); return { replaced: completeItemReplacement(event, 1, index), items: game.items.slice(), state: game.state, committed: game.round.committed }; },
  freeCategory(useTicket, values = [0]) { let calls = 0; let index = 0; const random = () => { calls += 1; return values[index++] ?? values.at(-1) ?? 0; }; const before = commitRoundConfiguration(random); const beforeDecision = { calls, committed: game.round.committed, eventId: game.round.preRound.selectedEventId, state: game.state }; const after = resolveFreeTicketDecision(useTicket, random); return { before, beforeDecision, after, calls, ...this.categoryState() }; },
  modeOverrides() {
    const configs = {
      production: { selection: "CONCRETE_OPTIONS", overrides: { "believe-guoju": { reward: 31 } } },
      experimental: { selection: "FIXED_CATEGORIES", overrides: { "believe-guoju": { reward: 99 } }, categories: PRE_ROUND_MODE_CONFIG.experimental.categories }
    };
    const source = PRE_ROUND_EVENT_DEFINITIONS.find(event => event.id === "believe-guoju");
    return { source: source.reward, production: resolvePreRoundEventForMode(source, "production", configs).reward, experimental: resolvePreRoundEventForMode(source, "experimental", configs).reward };
  }
};`;
vm.runInContext(source, context, { filename: "experimental-side-challenges-bundle.js" });
const api = context.sideChallengeTest;
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(api.definitions.length, 10);
assert.equal(new Set(api.definitions.map(definition => definition.id)).size, 10);
let setup = api.setup(0);
assert.equal(setup.before, null, "PRE_ROUND has no announced challenge");
assert.deepEqual(plain(api.freeTicketConfirmation()), { state: "PRE_ROUND", sideChallenge: null }, "free-ticket confirmation does not reveal a challenge");
setup = api.setup(0);
assert.equal(setup.selected, "chiikawa"); assert.equal(setup.runtime.status, "ACTIVE");
assert.match(api.statusHtml(), /吉一卡哇|進行中/);
assert.match(api.statusHtml(), /一萬 <b>×<\/b>/);
assert.doesNotMatch(api.statusHtml(), /🀇|已取得|未取得/);
assert.equal(api.acquire("wan-1").status, "ACTIVE"); assert.match(api.statusHtml(), /一萬 <b>✓<\/b>/); assert.equal(api.acquire("tong-1").status, "ACTIVE");
let result = plain(api.acquire("suo-1"));
assert.equal(result.status, "SUCCESS"); assert.equal(result.raw, 10); assert.equal(result.prompts.filter(text => /小任務挑戰完成/.test(text)).length, 1);
result = plain(api.acquire("suo-1")); assert.equal(result.raw, 10); assert.equal(result.prompts.filter(text => /小任務挑戰完成/.test(text)).length, 1);

api.setup(0); result = plain(api.end()); assert.equal(result.status, "FAILURE"); assert.equal(result.raw, 0); assert.match(result.settlement, /吉一卡哇|失敗 \+0/);
api.setup(8); result = plain(api.acquire("wan-9")); assert.equal(result.status, "FAILURE"); assert.equal(result.prompts.filter(text => /小任務挑戰失敗/.test(text)).length, 1);
assert.match(api.statusHtml(), /九萬 <b>✕<\/b>|danger/);
assert.doesNotMatch(api.statusHtml(), /安全|踩到|🀏/);
result = plain(api.acquire("tong-9")); assert.equal(result.status, "FAILURE"); assert.equal(result.prompts.filter(text => /小任務挑戰失敗/.test(text)).length, 1);
api.setup(8, 6); result = plain(api.end()); assert.equal(result.status, "SUCCESS"); assert.equal(result.raw, 10); assert.equal(result.multiplierPoints, 60); assert.equal(result.score, 60); assert.match(result.settlement, /\+10 ×6 = \+60/);
api.setup(9); result = plain(api.acquire("wan-8")); assert.equal(result.status, "FAILURE");
api.setup(9); result = plain(api.end()); assert.equal(result.status, "SUCCESS");

for (const multiplier of [1, 2, 3, 4, 6]) { api.setup(8, multiplier); result = plain(api.end()); assert.equal(result.multiplierPoints, 10 * multiplier); }
api.setup(8, 6); api.acquire("wan-9"); result = plain(api.end()); assert.equal(result.multiplierPoints, 0);

api.setup(0); api.acquire("wan-1"); api.acquire("tong-1"); result = plain(api.acquire("suo-1")); assert.equal(result.status, "SUCCESS", "self-selected formal acquisition shares the same evaluator");
api.setup(8); result = plain(api.acquire("wan-9")); assert.equal(result.status, "FAILURE", "self-selected forbidden tile fails immediately");
api.setup(0); result = plain(api.acquire("event-1")); assert.equal(result.status, "ACTIVE", "event tile is irrelevant to current challenges");

const moved = ["chiikawa", "three-set", "five-set", "seven-set", "compass", "pearl-baby", "home-team-wins"];
const retained = ["mystery-gift", "believe-guoju", "ever-waiting", "complete-line", "stop-at-waiting", "rock-paper-scissors", "more-tiles", "boss-leverage"];
const experimentalPool = plain(api.pool("experimental")); const productionPool = plain(api.pool("production"));
moved.forEach(id => assert.equal(experimentalPool.includes(id), false, `${id} is excluded only from Experimental`));
retained.forEach(id => assert.equal(experimentalPool.includes(id), true, `${id} remains in Experimental`));
moved.forEach(id => assert.equal(productionPool.includes(id), true, `${id} remains in Production`));
assert.deepEqual(plain(api.production()), { initialized: false, sideChallenge: null });

const reveal = plain(api.reveal(3));
assert.deepEqual(reveal.before, { opened: true, locked: true, ready: false, confirmed: false, scheduled: 7 });
assert.equal(reveal.earlyConfirm, false, "drawing stays locked until the committed reveal finishes");
assert.equal(reveal.committedId, "five-set");
assert.equal(reveal.confirmed, true);
assert.equal(reveal.lockedAfter, false);
assert.equal(reveal.revealConfirmed, true);
assert.equal(api.reveal(0, "production").before.opened, false, "Classic mode never opens a challenge reveal");

for (const mode of ["production", "experimental"]) {
  const inventory = plain(api.preRoundInventory(mode));
  assert.equal(inventory.opened, true);
  assert.match(inventory.body, /倍率券|免費券|空道具格/);
  assert.doesNotMatch(inventory.body, /data-use-item-index|data-use-self-select-index|目前狀態|聽牌/);
  assert.doesNotMatch(inventory.body, /進階模式資源|Advanced|Experimental|Production/);
  assert.deepEqual(inventory.after, inventory.before, "read-only PRE_ROUND inventory preserves round choices and resources");
  assert.equal(inventory.state, "PRE_ROUND");
}

const classicOptions = plain(api.preRoundOptions("production"));
assert.equal(classicOptions.length, 3);
assert.equal(classicOptions.every(option => !["item", "chance", "destiny"].includes(option.id)), true, "Classic keeps concrete weighted event cards");
assert.deepEqual(plain(api.preRoundOptions("experimental")), [
  { id: "item", title: "獲得道具", type: "ITEM" },
  { id: "chance", title: "機會", type: "BET" },
  { id: "destiny", title: "命運", type: "SPECIAL" }
]);
assert.deepEqual(plain(api.categoryPool("chance")), ["believe-guoju", "ever-waiting", "complete-line", "stop-at-waiting"]);
assert.deepEqual(plain(api.categoryPool("destiny")), ["rock-paper-scissors", "more-tiles", "boss-leverage"]);
assert.deepEqual(plain(api.categoryPool("item")), ["mystery-gift"]);

api.setupCategory();
let category = plain(api.chooseCategory("chance"));
assert.equal(category.selected, true); assert.equal(category.selection, "CATEGORY"); assert.equal(category.selectedCategoryId, "chance"); assert.equal(category.categoryCommitted, false); assert.equal(category.selectedEventId, null); assert.equal(category.pendingItemId, null);
category = plain(api.chooseCategory("destiny")); assert.equal(category.selectedCategoryId, "destiny"); assert.equal(category.selectedEventId, null);
category = plain(api.chooseCategory("item")); assert.equal(category.selectedCategoryId, "item"); assert.equal(category.pendingItemId, null); assert.equal(category.items.length, 0);
category = plain(api.skipCategory()); assert.equal(category.selection, "SKIP"); assert.equal(category.selectedCategoryId, null); assert.equal(category.items.length, 0);
category = plain(api.chooseCategory("chance")); assert.equal(category.selectedCategoryId, "chance"); assert.equal(category.selectedEventId, null);
let started = plain(api.startCategory([0.01])); assert.equal(started.started, true); assert.equal(started.calls, 1); assert.equal(started.selectedEventId, "believe-guoju"); assert.equal(started.categoryCommitted, true); assert.equal(started.state, "COMMITTING"); assert.equal(started.sideChallenge, null); assert.match(started.modal, /東南西北中發白取得其中 6 張|成功 \+30/);
let confirmed = plain(api.confirmCategoryReveal()); assert.equal(confirmed.confirmed, true); assert.equal(confirmed.state, "DRAWING"); assert.equal(confirmed.config.eventId, "believe-guoju"); assert.ok(confirmed.sideChallenge, "small-task reveal starts only after category reveal confirmation"); assert.equal(confirmed.title, "小任務挑戰");

api.setupCategory(); api.chooseCategory("destiny"); started = plain(api.startCategory([0.999])); assert.equal(started.selectedEventId, "boss-leverage"); assert.equal(started.calls, 1); confirmed = plain(api.confirmCategoryReveal()); assert.equal(confirmed.config.formalDrawCount, 14); assert.equal(confirmed.config.specialMultiplier, 2);
api.setupCategory(); api.chooseCategory("destiny"); started = plain(api.startCategory([0.4])); assert.equal(started.selectedEventId, "more-tiles"); confirmed = plain(api.confirmCategoryReveal()); assert.equal(confirmed.config.formalDrawCount, 16);
api.setupCategory(); api.chooseCategory("destiny"); started = plain(api.startCategory([0])); assert.equal(started.selectedEventId, "rock-paper-scissors"); confirmed = plain(api.confirmCategoryReveal()); assert.equal(confirmed.state, "COMMITTING"); assert.equal(confirmed.config, null); assert.equal(confirmed.sideChallenge, null); assert.equal(confirmed.title, "猜拳決勝負");

api.setupCategory(); api.chooseCategory("item"); started = plain(api.startCategory([0, 0])); assert.equal(started.selectedEventId, "mystery-gift"); assert.ok(started.pendingItemId); assert.equal(started.pendingRewardOnly, false); assert.equal(started.items.length, 0);
let itemResult = plain(api.acceptCategoryItem()); assert.equal(itemResult.accepted, true); assert.equal(itemResult.items.length, 1); assert.equal(itemResult.state, "DRAWING"); assert.ok(itemResult.config); assert.ok(itemResult.sideChallenge);
api.setupCategory(["chance-maker", "empty-cup", "disposable-charm"]); api.chooseCategory("item"); started = plain(api.startCategory([0, 0.2])); const incoming = started.pendingItemId;
itemResult = plain(api.replaceCategoryItem(1)); assert.equal(itemResult.replaced, true); assert.equal(itemResult.items[1], incoming); assert.equal(itemResult.items.length, 3); assert.equal(itemResult.state, "DRAWING");

api.setupCategory(); api.skipCategory(); started = plain(api.startCategory([0.25])); assert.equal(started.calls, 0); assert.equal(started.selectedEventId, null); assert.equal(started.state, "DRAWING");
api.setupCategory(["free-ticket"]); api.chooseCategory("chance"); const freeCategory = plain(api.freeCategory(true, [0.01])); assert.equal(freeCategory.beforeDecision.calls, 0); assert.equal(freeCategory.beforeDecision.committed, false); assert.equal(freeCategory.beforeDecision.eventId, null); assert.equal(freeCategory.calls, 1); assert.equal(freeCategory.selectedEventId, "believe-guoju"); assert.equal(freeCategory.state, "COMMITTING");
api.setupCategory(["free-ticket"]); api.chooseCategory("chance"); const declinedFreeCategory = plain(api.freeCategory(false, [0.01])); assert.equal(declinedFreeCategory.beforeDecision.calls, 0); assert.equal(declinedFreeCategory.calls, 1); assert.equal(declinedFreeCategory.selectedEventId, "believe-guoju");
assert.deepEqual(plain(api.modeOverrides()), { source: 30, production: 31, experimental: 99 }, "mode overrides remain isolated from shared definitions");

console.log("Experimental side challenge tests: PASS");
