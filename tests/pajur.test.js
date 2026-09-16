const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "minigames", "pajur.js"), "utf8");
const context = vm.createContext({ console, Math, Object, Array, Set, Number, Boolean, globalThis: null });
context.globalThis = context;
vm.runInContext(source, context);
const api = context.PaJuR;

function sequence(values) { let index = 0; return () => values[index++ % values.length]; }

class FakeStyle { setProperty(name, value) { this[name] = value; } }
class FakeNode {
  constructor(type = "node") { this.type = type; this.style = new FakeStyle(); this.listeners = new Map(); this.innerHTML = ""; this.captured = new Set(); }
  querySelector(selector) {
    if (selector === ".pajur-canvas") return this.canvas ??= new FakeCanvas();
    if (selector === ".pajur-game") return this.surface ??= new FakeNode("surface");
    return new FakeNode();
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  getBoundingClientRect() { return { height: 200 }; }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}
class FakeCanvas extends FakeNode {
  constructor() { super("canvas"); this.context = new FakeContext(); }
  getContext() { return this.context; }
}
class FakeContext {
  setTransform() {} clearRect() {} beginPath() {} roundRect() {} fill() {} stroke() {} fillRect() {} strokeRect() {}
  moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} fillText() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
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

const firstLayout = api.createSlotLayout(sequence([0, 0, 0]));
assert.equal(firstLayout.length, 12);
assert.equal(firstLayout.filter(slot => slot.isGreen).length, 5);
assert.equal(firstLayout.filter(slot => !slot.isGreen).length, 7);
assert.equal(new Set(firstLayout.filter(slot => slot.isGreen).map(slot => slot.id)).size, 5);
const secondLayout = api.createSlotLayout(sequence([0.99, 0.8, 0.6]));
assert.notDeepEqual(firstLayout.map(slot => slot.isGreen), secondLayout.map(slot => slot.isGreen));

const green = firstLayout.find(slot => slot.isGreen);
const red = firstLayout.find(slot => !slot.isGreen);
assert.deepEqual(JSON.parse(JSON.stringify(api.resultForSlot(firstLayout, green.id))), { success: true });
assert.deepEqual(JSON.parse(JSON.stringify(api.resultForSlot(firstLayout, red.id))), { success: false });

assert.equal(api.clampPullDistance(-10), 0);
assert.equal(api.clampPullDistance(60), 60);
assert.equal(api.clampPullDistance(999), api.MAX_PULL);
assert.equal(api.pullToPower(0), 0);
assert.equal(api.pullToPower(api.MAX_PULL), 1);
const weak = api.launchVelocity(10, api.MAX_PULL, () => 0.5);
const medium = api.launchVelocity(60, api.MAX_PULL, () => 0.5);
const strong = api.launchVelocity(120, api.MAX_PULL, () => 0.5);
assert.ok(weak.vy > medium.vy && medium.vy > strong.vy);
assert.notEqual(weak.power, medium.power);
assert.notEqual(medium.power, strong.power);

const geometry = api.createGeometry();
for (let index = 0; index < 12; index += 1) {
  const x = geometry.playLeft + geometry.slotWidth * (index + 0.5);
  assert.equal(api.slotIndexForX(x, geometry), index);
}

const pathStart = api.launchPathSample(0);
const ballStart = api.launchPathSample(api.LAUNCH_PATH.ballStartDistance);
const pathEnd = api.launchPathSample(api.LAUNCH_PATH.length);
assert.deepEqual({ x: pathStart.x, y: pathStart.y }, { x: 658, y: 966 });
assert.deepEqual({ x: ballStart.x, y: ballStart.y }, { x: 658, y: 815 });
assert.ok(pathEnd.x < ballStart.x && pathEnd.y < ballStart.y);
assert.ok(Math.abs(Math.hypot(pathEnd.tangent.x, pathEnd.tangent.y) - 1) < 1e-12);
assert.ok(pathEnd.tangent.x < 0 && pathEnd.tangent.y < 0, "Exit tangent must point up and left");
const earlierPathPoint = api.launchPathSample(api.LAUNCH_PATH.ballStartDistance + 10);
assert.ok(earlierPathPoint.y < ballStart.y, "Increasing launch distance advances the ball upward");
const outerRail = api.launchRailSample(api.LAUNCH_PATH.straightLength + 50, "outer");
const innerRail = api.launchRailSample(api.LAUNCH_PATH.straightLength + 50, "inner");
assert.ok(Math.abs(Math.hypot(outerRail.x - innerRail.x, outerRail.y - innerRail.y) - api.LAUNCH_PATH.railHalfWidth * 2) < 1e-9);
assert.deepEqual(outerRail.center, innerRail.center, "Both rails must derive from the same center path sample");
assert.ok(api.LAUNCH_PATH.railHalfWidth > api.PHYSICS.ballRadius, "Rail must clear the full ball radius");
assert.ok(weak.speed < medium.speed && medium.speed < strong.speed);
assert.ok(weak.speed * api.EXIT_SPEED_RETENTION < medium.speed * api.EXIT_SPEED_RETENTION);
assert.ok(medium.speed * api.EXIT_SPEED_RETENTION < strong.speed * api.EXIT_SPEED_RETENTION);

const scheduler = fakeScheduler();
const results = [];
const controller = api.start({ container: new FakeNode(), scheduler, random: sequence([0, 0, 0, 0.5]), onComplete: result => results.push(result) });
const greenIndex = controller.round.slots.find(slot => slot.isGreen).id;
assert.equal(controller.settleSlot(greenIndex), false, "A READY round cannot resolve before launch");
controller.round.phase = "RUNNING";
assert.equal(controller.settleSlot(greenIndex), true);
assert.equal(controller.settleSlot(greenIndex), false);
assert.equal(scheduler.timers.size, 1);
const [resultTimerId, resultCallback] = [...scheduler.timers.entries()][0];
scheduler.timers.delete(resultTimerId);
resultCallback();
assert.deepEqual(JSON.parse(JSON.stringify(results)), [{ success: true }]);
assert.equal(controller.destroy(), true);
assert.equal(controller.destroy(), false);
assert.equal(scheduler.frames.size, 0);
assert.equal(scheduler.timers.size, 0);

const restartScheduler = fakeScheduler();
const restartContainer = new FakeNode();
const oldRound = api.start({ container: restartContainer, scheduler: restartScheduler, random: sequence([0, 0, 0]), onComplete() {} });
const pointerEvent = (pointerId, clientY) => ({ pointerId, clientY, prevented: false, preventDefault() { this.prevented = true; } });
const surface = restartContainer.surface;
surface.listeners.get("pointerdown")(pointerEvent(1, 100));
assert.equal(oldRound.round.phase, "PULLING");
assert.equal(surface.captured.has(1), true);
surface.listeners.get("pointermove")(pointerEvent(1, 70));
assert.equal(oldRound.round.pullDistance, 0, "Upward movement must not add power");
surface.listeners.get("pointermove")(pointerEvent(1, 999));
assert.equal(oldRound.round.pullDistance, api.MAX_PULL, "Pull is capped at the shared maximum");
surface.listeners.get("pointermove")(pointerEvent(1, 180));
assert.ok(oldRound.round.pullDistance > 0 && oldRound.round.pullDistance < api.MAX_PULL);
surface.listeners.get("pointerup")(pointerEvent(1, 180));
assert.equal(oldRound.round.phase, "RUNNING");
assert.equal(surface.captured.has(1), false);
assert.equal(restartScheduler.frames.size, 1);
surface.listeners.get("pointerdown")(pointerEvent(2, 200));
assert.equal(oldRound.round.phase, "RUNNING", "Input is ignored after launch");
assert.equal(oldRound.destroy(), true);
assert.equal(restartScheduler.frames.size, 0);
const newRound = api.start({ container: new FakeNode(), scheduler: restartScheduler, random: sequence([0.99, 0.8, 0.6]), onComplete() {} });
assert.notDeepEqual(oldRound.round.slots.map(slot => slot.isGreen), newRound.round.slots.map(slot => slot.isGreen));
newRound.destroy();

const guidedScheduler = fakeScheduler();
const guidedContainer = new FakeNode();
const guidedRound = api.start({ container: guidedContainer, scheduler: guidedScheduler, random: () => 0.5, onComplete() {} });
const guidedSurface = guidedContainer.surface;
guidedSurface.listeners.get("pointerdown")(pointerEvent(11, 100));
guidedSurface.listeners.get("pointermove")(pointerEvent(11, 160));
guidedSurface.listeners.get("pointerup")(pointerEvent(11, 160));
const initialGuidedDistance = guidedRound.round.launchDistance;
guidedRound.step(0.01);
assert.ok(guidedRound.round.launchDistance > initialGuidedDistance);
const expectedGuidedPosition = api.launchPathSample(guidedRound.round.launchDistance);
assert.ok(Math.abs(guidedRound.ball.x - expectedGuidedPosition.x) < 1e-9);
assert.ok(Math.abs(guidedRound.ball.y - expectedGuidedPosition.y) < 1e-9);
assert.equal(guidedRound.round.guidedLaunch, true);
guidedRound.round.launchDistance = api.LAUNCH_PATH.length - 1;
guidedRound.step(0.01);
assert.equal(guidedRound.round.guidedLaunch, false);
assert.equal(guidedRound.round.exitCount, 1);
const exitVelocity = guidedRound.ball;
assert.ok(exitVelocity.vx * pathEnd.tangent.x + exitVelocity.vy * pathEnd.tangent.y > 0);
assert.ok(Math.abs(exitVelocity.vx * pathEnd.tangent.y - exitVelocity.vy * pathEnd.tangent.x) < 1e-9);
guidedRound.step(0.01);
assert.equal(guidedRound.round.exitCount, 1, "Guided launch exits only once");
guidedRound.destroy();

const cancelScheduler = fakeScheduler();
const cancelContainer = new FakeNode();
const cancelled = api.start({ container: cancelContainer, scheduler: cancelScheduler, random: sequence([0, 0, 0]), onComplete() {} });
const cancelSurface = cancelContainer.surface;
cancelSurface.listeners.get("pointerdown")(pointerEvent(7, 200));
cancelSurface.listeners.get("pointermove")(pointerEvent(7, 260));
cancelSurface.listeners.get("pointercancel")(pointerEvent(7, 260));
assert.equal(cancelled.round.phase, "READY");
assert.equal(cancelled.round.pullDistance, 0);
assert.equal(cancelSurface.captured.has(7), false);
assert.equal(cancelScheduler.frames.size, 0);
cancelled.destroy();

const movingBall = { x: 100, y: 100, vx: 80, vy: 40 };
const movingTracker = api.createStuckTracker(movingBall);
for (let step = 0; step < 20; step += 1) {
  movingBall.x += 10;
  movingBall.y += 7;
  assert.equal(api.updateStuckTracker(movingTracker, movingBall, 0.1), false);
}

const stuckBall = { x: 200, y: 250, vx: 0, vy: 0 };
const stuckTracker = api.createStuckTracker(stuckBall);
let detected = false;
for (let step = 0; step < 20; step += 1) detected ||= api.updateStuckTracker(stuckTracker, stuckBall, 0.1);
assert.equal(detected, true, "A stationary ball must be detected");
api.recoverStuckBall(stuckBall, stuckTracker, [{ x: 200, y: 250 }]);
assert.ok(stuckBall.vy >= 185, "Recovery must provide decisive downward velocity");
assert.ok(Math.abs(stuckBall.vx) <= 16, "Recovery must not introduce horizontal drift");
assert.ok(Math.hypot(stuckBall.x - 200, stuckBall.y - 250) > api.PHYSICS.ballRadius + api.PHYSICS.pegRadius);
assert.equal(stuckTracker.recoveryCount, 1);
assert.equal(api.updateStuckTracker(stuckTracker, stuckBall, 0.1), false, "Cooldown prevents repeated recovery");

console.log("PaJuR standalone gameplay tests: PASS");
