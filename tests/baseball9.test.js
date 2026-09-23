const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "minigames", "baseball9.js"), "utf8");
const context = vm.createContext({ console, Math, Object, Array, Set, Number, Boolean, globalThis: null });
context.globalThis = context;
vm.runInContext(source, context);
const api = context.Baseball9;

function sequence(values) { let index = 0; return () => values[index++ % values.length]; }
class FakeNode {
  constructor(type = "node") { this.type = type; this.listeners = new Map(); this.innerHTML = ""; this.captured = new Set(); }
  querySelector(selector) {
    if (selector === ".baseball9-canvas") return this.canvas ??= new FakeCanvas();
    if (selector === ".baseball9-game") return this.surface ??= new FakeNode("surface");
    return new FakeNode();
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}
class FakeCanvas extends FakeNode {
  constructor() { super("canvas"); this.context = new FakeContext(); }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 720, height: 1000 }; }
}
class FakeGradient { addColorStop() {} }
class FakeContext {
  setTransform() {} clearRect() {} beginPath() {} roundRect() {} fill() {} stroke() {} fillRect() {} strokeRect() {}
  moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} save() {} restore() {}
  createLinearGradient() { return new FakeGradient(); }
  createRadialGradient() { return new FakeGradient(); }
}
function fakeScheduler() {
  let id = 0;
  const frames = new Map();
  const timers = new Map();
  return {
    frames, timers,
    requestAnimationFrame(callback) { const key = ++id; frames.set(key, callback); return key; },
    cancelAnimationFrame(key) { frames.delete(key); },
    setTimeout(callback) { const key = ++id; timers.set(key, callback); return key; },
    clearTimeout(key) { timers.delete(key); }
  };
}

const firstGrid = api.createGrid(sequence([0, 0, 0, 0, 0]));
assert.equal(firstGrid.length, 9);
assert.equal(new Set(firstGrid.map(cell => cell.id)).size, 9);
assert.equal(firstGrid.filter(cell => cell.isGreen).length, 5);
assert.equal(firstGrid.filter(cell => !cell.isGreen).length, 4);
const secondGrid = api.createGrid(sequence([0.99, 0.75, 0.5, 0.25, 0]));
assert.notDeepEqual(firstGrid.map(cell => cell.isGreen), secondGrid.map(cell => cell.isGreen), "Injected random changes the layout deterministically");

const geometry = api.createGeometry();
for (let index = 0; index < 9; index += 1) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const point = { x: geometry.grid.left + geometry.cellWidth * (column + 0.5), y: geometry.grid.top + geometry.cellHeight * (row + 0.5) };
  assert.equal(api.cellIndexAtPoint(point, geometry), index);
}
assert.equal(api.cellIndexAtPoint({ x: geometry.grid.left - 1, y: geometry.grid.top }, geometry), null);
assert.equal(api.cellIndexAtPoint({ x: geometry.grid.left, y: geometry.grid.top + geometry.grid.height + 1 }, geometry), null);
const green = firstGrid.find(cell => cell.isGreen);
const red = firstGrid.find(cell => !cell.isGreen);
function centerOf(index) {
  return {
    x: geometry.grid.left + geometry.cellWidth * (index % 3 + 0.5),
    y: geometry.grid.top + geometry.cellHeight * (Math.floor(index / 3) + 0.5)
  };
}
assert.deepEqual(JSON.parse(JSON.stringify(api.resultForPoint(firstGrid, centerOf(green.id), geometry))), { success: true, cellIndex: green.id });
assert.deepEqual(JSON.parse(JSON.stringify(api.resultForPoint(firstGrid, centerOf(red.id), geometry))), { success: false, cellIndex: red.id });
assert.deepEqual(JSON.parse(JSON.stringify(api.resultForPoint(firstGrid, { x: 20, y: 20 }, geometry))), { success: false, cellIndex: null });

const middleWeak = api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 360, y: 700 }, durationMs: 500 }, geometry);
const middleStrong = api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 360, y: 420 }, durationMs: 500 }, geometry);
const left = api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 240, y: 560 }, durationMs: 500 }, geometry);
const right = api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 480, y: 560 }, durationMs: 500 }, geometry);
assert.ok(middleStrong.y < middleWeak.y, "More upward distance aims higher");
assert.ok(left.x < middleWeak.x && right.x > middleWeak.x, "Horizontal direction controls hit X");
assert.ok(Math.abs(api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 360, y: 560 }, durationMs: 220 }, geometry).y - api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 360, y: 560 }, durationMs: 800 }, geometry).y) < geometry.cellHeight, "Speed is only an assist");
const reachableCells = new Set();
for (const horizontal of [-106, 0, 106]) {
  for (const upward of [170, 300, 430]) {
    const hit = api.calculateThrow({ start: { x: 360, y: 884 }, end: { x: 360 + horizontal, y: 884 - upward }, durationMs: 500 }, geometry);
    reachableCells.add(api.cellIndexAtPoint(hit, geometry));
  }
}
assert.equal(reachableCells.size, 9, "Left/middle/right and weak/medium/strong gestures can reach all nine cells");

const scheduler = fakeScheduler();
const results = [];
const container = new FakeNode();
const controller = api.start({ container, scheduler, random: sequence([0, 0, 0, 0, 0]), onComplete: result => results.push(result) });
assert.equal(controller.throwAt(centerOf(green.id)), true);
assert.equal(controller.throwAt(centerOf(red.id)), false, "Only one throw is allowed");
assert.equal(controller.round.throwCount, 1);
assert.equal(controller.resolveImpact(720), true);
assert.equal(controller.resolveImpact(720), false, "Impact resolves once");
assert.equal(controller.round.hitCell, green.id);
assert.equal(scheduler.timers.size, 1);
const [, finish] = [...scheduler.timers.entries()][0];
finish();
finish();
assert.deepEqual(JSON.parse(JSON.stringify(results)), [{ success: true }], "Completion fires once");
assert.equal(controller.destroy(), true);
assert.equal(controller.destroy(), false);
assert.equal(scheduler.frames.size, 0);
assert.equal(scheduler.timers.size, 0);
assert.equal(container.surface.listeners.size, 0, "Destroy removes pointer listeners");

const failureScheduler = fakeScheduler();
const failureResults = [];
const failureRound = api.start({ container: new FakeNode(), scheduler: failureScheduler, random: sequence([0, 0, 0, 0, 0]), onComplete: result => failureResults.push(result) });
assert.equal(failureRound.throwAt(centerOf(red.id)), true);
assert.equal(failureRound.resolveImpact(720), true);
const [, finishFailure] = [...failureScheduler.timers.entries()][0];
finishFailure();
assert.deepEqual(JSON.parse(JSON.stringify(failureResults)), [{ success: false }]);
failureRound.destroy();

const pointerScheduler = fakeScheduler();
const pointerContainer = new FakeNode();
const pointerRound = api.start({ container: pointerContainer, scheduler: pointerScheduler, random: () => 0.5, onComplete() {} });
const pointerEvent = (pointerId, clientX, clientY, timeStamp) => ({ pointerId, clientX, clientY, timeStamp, preventDefault() {} });
const pointerSurface = pointerContainer.surface;
pointerSurface.listeners.get("pointerdown")(pointerEvent(8, geometry.ballStart.x, geometry.ballStart.y, 100));
assert.equal(pointerRound.round.phase, "AIMING");
assert.equal(pointerSurface.captured.has(8), true);
pointerSurface.listeners.get("pointermove")(pointerEvent(8, geometry.ballStart.x - 80, geometry.ballStart.y - 300, 400));
assert.equal(pointerSurface.listeners.get("pointerup")(pointerEvent(8, geometry.ballStart.x - 80, geometry.ballStart.y - 300, 450)), true);
assert.equal(pointerRound.round.phase, "FLYING");
assert.equal(pointerRound.round.throwCount, 1);
assert.equal(pointerSurface.captured.has(8), false);
pointerSurface.listeners.get("pointerdown")(pointerEvent(9, geometry.ballStart.x, geometry.ballStart.y, 500));
assert.equal(pointerRound.round.throwCount, 1, "Pointer input cannot launch a second ball");
pointerRound.destroy();

const restartScheduler = fakeScheduler();
const oldRound = api.start({ container: new FakeNode(), scheduler: restartScheduler, random: sequence([0, 0, 0, 0, 0]), onComplete() {} });
oldRound.destroy();
const newRound = api.start({ container: new FakeNode(), scheduler: restartScheduler, random: sequence([0.99, 0.75, 0.5, 0.25, 0]), onComplete() {} });
assert.notDeepEqual(oldRound.round.grid.map(cell => cell.isGreen), newRound.round.grid.map(cell => cell.isGreen));
newRound.destroy();

console.log("Baseball9 standalone gameplay tests: PASS");
