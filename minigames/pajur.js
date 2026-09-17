(function exposePaJuR(global) {
  "use strict";

  const SLOT_COUNT = 12;
  const GREEN_COUNT = 5;
  const BOARD_WIDTH = 720;
  const BOARD_HEIGHT = 1000;
  const MAX_PULL = 110;
  const RESULT_DELAY_MS = 650;
  const EXIT_SPEED_RETENTION = 0.35;
  const RAIL_EXIT_GAP = 50;
  const PHYSICS = Object.freeze({
    gravity: 820,
    pegBounce: 0.72,
    wallBounce: 0.76,
    tangentRetention: 0.985,
    ballRadius: 11,
    pegRadius: 9,
    minLaunchSpeed: 1180,
    maxLaunchSpeed: 1820,
    maxFrameStep: 1 / 4,
    substep: 1 / 180,
    rescueAfterSeconds: 1.35,
    regionDwellSeconds: 2.4,
    recoveryCooldownSeconds: 1.2,
    hardRescueAfterSeconds: 20
  });
  const LAUNCH_PATH = Object.freeze({
    straightStart: Object.freeze({ x: 658, y: 966 }),
    straightEnd: Object.freeze({ x: 658, y: 220 }),
    arcCenter: Object.freeze({ x: 528, y: 220 }),
    arcRadius: 130,
    arcStartAngle: 0,
    arcEndAngle: -75 * Math.PI / 180,
    railHalfWidth: 32,
    ballStartDistance: 151,
    straightLength: 746,
    arcLength: 130 * 75 * Math.PI / 180,
    length: 746 + 130 * 75 * Math.PI / 180
  });

  function launchPathSample(distance, path = LAUNCH_PATH) {
    const clamped = Math.max(0, Math.min(path.length, Number(distance) || 0));
    if (clamped <= path.straightLength) {
      return {
        x: path.straightStart.x,
        y: path.straightStart.y - clamped,
        tangent: { x: 0, y: -1 },
        normal: { x: 1, y: 0 },
        distance: clamped
      };
    }
    const arcDistance = clamped - path.straightLength;
    const angle = path.arcStartAngle - arcDistance / path.arcRadius;
    const tangent = { x: Math.sin(angle), y: -Math.cos(angle) };
    return {
      x: path.arcCenter.x + Math.cos(angle) * path.arcRadius,
      y: path.arcCenter.y + Math.sin(angle) * path.arcRadius,
      tangent,
      normal: { x: -tangent.y, y: tangent.x },
      distance: clamped
    };
  }

  function launchRailSample(distance, side, path = LAUNCH_PATH) {
    const center = launchPathSample(distance, path);
    const offset = side === "outer" ? path.railHalfWidth : -path.railHalfWidth;
    return {
      x: center.x + center.normal.x * offset,
      y: center.y + center.normal.y * offset,
      center,
      offset
    };
  }

  function clampPullDistance(distance, maximum = MAX_PULL) {
    return Math.max(0, Math.min(maximum, Number(distance) || 0));
  }

  function pullToPower(distance, maximum = MAX_PULL) {
    if (maximum <= 0) return 0;
    return clampPullDistance(distance, maximum) / maximum;
  }

  function launchVelocity(distance, maximum = MAX_PULL, random = Math.random) {
    const power = pullToPower(distance, maximum);
    const speed = PHYSICS.minLaunchSpeed + (PHYSICS.maxLaunchSpeed - PHYSICS.minLaunchSpeed) * power;
    return { power, speed, vx: 0, vy: -speed, entryJitter: (random() - 0.5) * 34 };
  }

  function createSlotLayout(random = Math.random) {
    const available = Array.from({ length: SLOT_COUNT }, (_, id) => id);
    const greenIds = [];
    while (greenIds.length < GREEN_COUNT) {
      const selected = Math.min(available.length - 1, Math.floor(random() * available.length));
      greenIds.push(available.splice(selected, 1)[0]);
    }
    const greens = new Set(greenIds);
    return Array.from({ length: SLOT_COUNT }, (_, id) => Object.freeze({ id, isGreen: greens.has(id) }));
  }

  function createGeometry() {
    const playLeft = 34;
    const playRight = 606;
    const slotTop = 842;
    const slotBottom = 966;
    const slotWidth = (playRight - playLeft) / SLOT_COUNT;
    const pegs = [];
    for (let row = 0; row < 8; row += 1) {
      const count = row % 2 === 0 ? 7 : 8;
      const inset = row % 2 === 0 ? 56 : 30;
      const usable = playRight - playLeft - inset * 2;
      for (let column = 0; column < count; column += 1) {
        pegs.push(Object.freeze({
          x: playLeft + inset + (count === 1 ? 0 : usable * column / (count - 1)),
          y: 225 + row * 78
        }));
      }
    }
    return Object.freeze({
      width: BOARD_WIDTH, height: BOARD_HEIGHT, playLeft, playRight, slotTop, slotBottom, slotWidth,
      laneLeft: 626, laneRight: 690, laneTop: 78, ballStartX: 658, ballStartY: 815,
      pegs: Object.freeze(pegs)
    });
  }

  function slotIndexForX(x, geometry = createGeometry()) {
    const clamped = Math.max(geometry.playLeft, Math.min(geometry.playRight - Number.EPSILON, x));
    return Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor((clamped - geometry.playLeft) / geometry.slotWidth)));
  }

  function resultForSlot(layout, slotIndex) {
    return { success: Boolean(layout[slotIndex]?.isGreen) };
  }

  function createStuckTracker(ball = { x: 0, y: 0 }) {
    return { anchorX: ball.x, anchorY: ball.y, stillSeconds: 0, cooldownSeconds: 0, recoveryCount: 0, nextHardRescueAt: PHYSICS.hardRescueAfterSeconds };
  }

  function updateStuckTracker(tracker, ball, dt) {
    tracker.cooldownSeconds = Math.max(0, tracker.cooldownSeconds - dt);
    const dx = ball.x - tracker.anchorX;
    const dy = ball.y - tracker.anchorY;
    const displacement = Math.hypot(dx, dy);
    const downwardProgress = ball.y - tracker.anchorY;
    if (displacement >= 18 || downwardProgress >= 12) {
      tracker.anchorX = ball.x;
      tracker.anchorY = ball.y;
      tracker.stillSeconds = 0;
      return false;
    }
    tracker.stillSeconds += dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (tracker.cooldownSeconds > 0) return false;
    return (tracker.stillSeconds >= PHYSICS.rescueAfterSeconds && speed < 55 && Math.abs(downwardProgress) < 8)
      || tracker.stillSeconds >= PHYSICS.regionDwellSeconds;
  }

  function recoverStuckBall(ball, tracker, pegs = [], minimumDistance = PHYSICS.ballRadius + PHYSICS.pegRadius) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const peg of pegs) {
      const distance = Math.hypot(ball.x - peg.x, ball.y - peg.y);
      if (distance < nearestDistance) { nearest = peg; nearestDistance = distance; }
    }
    if (nearest && nearestDistance < minimumDistance + 2) {
      let nx = ball.x - nearest.x;
      let ny = ball.y - nearest.y;
      const length = Math.hypot(nx, ny);
      if (length < 0.001) { nx = 0; ny = 1; }
      else { nx /= length; ny /= length; }
      ball.x = nearest.x + nx * (minimumDistance + 1);
      ball.y = nearest.y + ny * (minimumDistance + 1);
    }
    ball.y += 2;
    ball.vx = Math.max(-16, Math.min(16, ball.vx * 0.15));
    ball.vy = Math.max(185, ball.vy);
    tracker.anchorX = ball.x;
    tracker.anchorY = ball.y;
    tracker.stillSeconds = 0;
    tracker.cooldownSeconds = PHYSICS.recoveryCooldownSeconds;
    tracker.recoveryCount += 1;
    return ball;
  }

  function start({ container, onComplete, random = Math.random, scheduler = global } = {}) {
    if (!container || typeof onComplete !== "function") throw new TypeError("PaJuR.start requires container and onComplete");
    const geometry = createGeometry();
    const slots = createSlotLayout(random);
    const round = {
      slots, phase: "READY", pullDistance: 0, launchPower: 0, landedSlot: null,
      launchDistance: LAUNCH_PATH.ballStartDistance, guidedSpeed: 0, guidedLaunch: false, exitSpeed: 0, exitCount: 0
    };
    let destroyed = false;
    let resolved = false;
    let frameId = null;
    let resultTimer = null;
    let pointerId = null;
    let pullOriginY = 0;
    let lastTimestamp = null;
    let elapsed = 0;
    let laneMode = true;
    const launchStart = launchPathSample(LAUNCH_PATH.ballStartDistance);
    let ball = { x: launchStart.x, y: launchStart.y, vx: 0, vy: 0 };
    const stuckTracker = createStuckTracker(ball);

    container.innerHTML = `<section class="pajur-game" aria-label="彈珠台">
      <div class="pajur-board-wrap">
        <canvas class="pajur-canvas" aria-label="彈珠活動區、右側發射軌道與十二個紅綠燈槽"></canvas>
      </div>
      <p class="pajur-instruction">按住畫面向下拉，放開發射</p>
    </section>`;

    const canvas = container.querySelector(".pajur-canvas");
    const surface = container.querySelector(".pajur-game");
    const context = canvas.getContext("2d");
    const dpr = Math.max(1, Math.min(3, global.devicePixelRatio || 1));
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    function active() { return !destroyed && !resolved; }
    function requestFrame(callback) { return scheduler.requestAnimationFrame(callback); }
    function cancelFrame() {
      if (frameId !== null) scheduler.cancelAnimationFrame(frameId);
      frameId = null;
    }
    function clearResultTimer() {
      if (resultTimer !== null) scheduler.clearTimeout(resultTimer);
      resultTimer = null;
    }
    function drawRoundedRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
      ctx.stroke();
    }
    function traceLaunchRail(ctx, side) {
      ctx.beginPath();
      const endDistance = side === "inner" ? LAUNCH_PATH.length - RAIL_EXIT_GAP : LAUNCH_PATH.length;
      for (let distance = 0; distance <= endDistance; distance += 8) {
        const point = launchRailSample(distance, side);
        if (distance === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      const end = launchRailSample(endDistance, side);
      ctx.lineTo(end.x, end.y);
    }
    function drawLaunchRail(ctx, side) {
      traceLaunchRail(ctx, side);
      ctx.strokeStyle = "#2a160f";
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "#000a";
      ctx.shadowBlur = 7;
      ctx.stroke();
      traceLaunchRail(ctx, side);
      ctx.strokeStyle = "#b87931";
      ctx.lineWidth = 7;
      ctx.shadowBlur = 0;
      ctx.stroke();
      traceLaunchRail(ctx, side);
      ctx.strokeStyle = "#f8d582";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    function render() {
      if (destroyed) return false;
      const ctx = context;
      ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      const background = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
      background.addColorStop(0, "#391f4d");
      background.addColorStop(0.58, "#24152f");
      background.addColorStop(1, "#130d1a");
      ctx.fillStyle = background;
      ctx.strokeStyle = "#f4bd55";
      ctx.lineWidth = 8;
      drawRoundedRect(ctx, 10, 10, 700, 980, 24);

      const laneGlow = ctx.createLinearGradient(geometry.laneLeft, 0, geometry.laneRight, 0);
      laneGlow.addColorStop(0, "#10091600");
      laneGlow.addColorStop(0.5, "#7b542622");
      laneGlow.addColorStop(1, "#10091600");
      ctx.fillStyle = laneGlow;
      ctx.fillRect(geometry.laneLeft + 6, 92, geometry.laneRight - geometry.laneLeft - 12, geometry.slotBottom - 92);

      if (round.phase === "PULLING" && round.launchPower > 0) {
        const indicatorBottom = 790;
        const indicatorTop = 150;
        const indicatorHeight = (indicatorBottom - indicatorTop) * round.launchPower;
        const powerGradient = ctx.createLinearGradient(0, indicatorBottom, 0, indicatorTop);
        powerGradient.addColorStop(0, "#58e7a2");
        powerGradient.addColorStop(0.58, "#ffd35f");
        powerGradient.addColorStop(1, "#ff6471");
        ctx.fillStyle = powerGradient;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(geometry.laneLeft + 21, indicatorBottom - indicatorHeight, geometry.laneRight - geometry.laneLeft - 42, indicatorHeight);
        ctx.globalAlpha = 1;
      }

      drawLaunchRail(ctx, "outer");
      drawLaunchRail(ctx, "inner");

      for (const peg of geometry.pegs) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, PHYSICS.pegRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe8a9";
        ctx.shadowColor = "#ffc95c";
        ctx.shadowBlur = 7;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#7d5523";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.strokeStyle = "#b98242";
      ctx.lineWidth = 4;
      for (let index = 0; index <= SLOT_COUNT; index += 1) {
        const x = geometry.playLeft + geometry.slotWidth * index;
        ctx.beginPath();
        ctx.moveTo(x, geometry.slotTop);
        ctx.lineTo(x, geometry.slotBottom);
        ctx.stroke();
      }
      slots.forEach((slot, index) => {
        const centerX = geometry.playLeft + geometry.slotWidth * (index + 0.5);
        ctx.beginPath();
        ctx.arc(centerX, 934, 16, 0, Math.PI * 2);
        ctx.fillStyle = slot.isGreen ? "#36f59a" : "#ff4f61";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, PHYSICS.ballRadius, 0, Math.PI * 2);
      const marble = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 2, ball.x, ball.y, PHYSICS.ballRadius);
      marble.addColorStop(0, "#ffffff");
      marble.addColorStop(0.35, "#d8ecff");
      marble.addColorStop(1, "#6f86a0");
      ctx.fillStyle = marble;
      ctx.shadowColor = "#dff4ff";
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (round.landedSlot !== null) {
        const x = geometry.playLeft + geometry.slotWidth * round.landedSlot;
        ctx.strokeStyle = slots[round.landedSlot].isGreen ? "#59ffae" : "#ff6877";
        ctx.lineWidth = 7;
        ctx.strokeRect(x + 3, geometry.slotTop + 3, geometry.slotWidth - 6, geometry.slotBottom - geometry.slotTop - 6);
      }
      return true;
    }

    function updatePull(distance) {
      round.pullDistance = clampPullDistance(distance, MAX_PULL);
      round.launchPower = pullToPower(round.pullDistance, MAX_PULL);
      render();
    }

    function settleSlot(index) {
      if (!active() || round.phase !== "RUNNING" || !slots[index]) return false;
      resolved = true;
      round.phase = "RESOLVED";
      round.landedSlot = index;
      ball.x = geometry.playLeft + geometry.slotWidth * (index + 0.5);
      ball.y = 908;
      ball.vx = 0;
      ball.vy = 0;
      cancelFrame();
      render();
      resultTimer = scheduler.setTimeout(() => {
        resultTimer = null;
        if (!destroyed) onComplete(resultForSlot(slots, index));
      }, RESULT_DELAY_MS);
      return true;
    }

    function collidePeg(peg) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const minimum = PHYSICS.ballRadius + PHYSICS.pegRadius;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimum * minimum) return;
      const distance = Math.sqrt(distanceSquared);
      const nx = distance < 0.001 ? 0 : dx / distance;
      const ny = distance < 0.001 ? 1 : dy / distance;
      ball.x = peg.x + nx * (minimum + 0.5);
      ball.y = peg.y + ny * (minimum + 0.5);
      const normalSpeed = ball.vx * nx + ball.vy * ny;
      if (normalSpeed < 0) {
        const tangentX = ball.vx - normalSpeed * nx;
        const tangentY = ball.vy - normalSpeed * ny;
        ball.vx = tangentX * PHYSICS.tangentRetention - normalSpeed * nx * PHYSICS.pegBounce;
        ball.vy = tangentY * PHYSICS.tangentRetention - normalSpeed * ny * PHYSICS.pegBounce;
      }
    }

    function physicsStep(dt) {
      elapsed += dt;
      if (laneMode) {
        round.launchDistance = Math.min(LAUNCH_PATH.length, round.launchDistance + round.guidedSpeed * dt);
        const guided = launchPathSample(round.launchDistance);
        ball.x = guided.x;
        ball.y = guided.y;
        ball.vx = guided.tangent.x * round.guidedSpeed;
        ball.vy = guided.tangent.y * round.guidedSpeed;
        if (round.launchDistance >= LAUNCH_PATH.length) {
          laneMode = false;
          round.guidedLaunch = false;
          round.exitCount += 1;
          round.exitSpeed = round.guidedSpeed * EXIT_SPEED_RETENTION;
          ball.vx = guided.tangent.x * round.exitSpeed + ball.entryJitter;
          ball.vy = guided.tangent.y * round.exitSpeed;
          stuckTracker.anchorX = ball.x;
          stuckTracker.anchorY = ball.y;
          stuckTracker.stillSeconds = 0;
          stuckTracker.cooldownSeconds = PHYSICS.recoveryCooldownSeconds;
        }
        return;
      }

      ball.vy += PHYSICS.gravity * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x - PHYSICS.ballRadius < geometry.playLeft) {
        ball.x = geometry.playLeft + PHYSICS.ballRadius;
        ball.vx = Math.abs(ball.vx) * PHYSICS.wallBounce;
      }
      if (ball.x + PHYSICS.ballRadius > geometry.playRight) {
        ball.x = geometry.playRight - PHYSICS.ballRadius;
        ball.vx = -Math.abs(ball.vx) * PHYSICS.wallBounce;
      }
      if (ball.y - PHYSICS.ballRadius < 68) {
        ball.y = 68 + PHYSICS.ballRadius;
        ball.vy = Math.abs(ball.vy) * PHYSICS.wallBounce;
      }
      if (ball.y < geometry.slotTop - 8) geometry.pegs.forEach(collidePeg);

      if (ball.y + PHYSICS.ballRadius >= geometry.slotTop) {
        for (let divider = 1; divider < SLOT_COUNT; divider += 1) {
          const dividerX = geometry.playLeft + geometry.slotWidth * divider;
          if (Math.abs(ball.x - dividerX) < PHYSICS.ballRadius + 2 && ball.y < geometry.slotBottom - 18) {
            ball.x = dividerX + Math.sign(ball.x - dividerX || ball.vx || 1) * (PHYSICS.ballRadius + 2);
            ball.vx *= -0.42;
          }
        }
      }
      if (ball.y >= 910) settleSlot(slotIndexForX(ball.x, geometry));

      if (updateStuckTracker(stuckTracker, ball, dt)) recoverStuckBall(ball, stuckTracker, geometry.pegs);
      if (elapsed > stuckTracker.nextHardRescueAt && ball.y < geometry.slotTop) {
        ball.x = Math.max(geometry.playLeft + PHYSICS.ballRadius, Math.min(geometry.playRight - PHYSICS.ballRadius, ball.x));
        ball.y = geometry.slotTop - 28;
        ball.vx = Math.max(-12, Math.min(12, ball.vx));
        ball.vy = 230;
        stuckTracker.anchorX = ball.x;
        stuckTracker.anchorY = ball.y;
        stuckTracker.stillSeconds = 0;
        stuckTracker.cooldownSeconds = PHYSICS.recoveryCooldownSeconds;
        stuckTracker.nextHardRescueAt = elapsed + 8;
      }
    }

    function frame(timestamp) {
      if (!active() || round.phase !== "RUNNING") return;
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const frameSeconds = Math.min(PHYSICS.maxFrameStep, Math.max(0, (timestamp - lastTimestamp) / 1000));
      lastTimestamp = timestamp;
      let remaining = frameSeconds;
      while (remaining > 0 && active()) {
        const dt = Math.min(PHYSICS.substep, remaining);
        physicsStep(dt);
        remaining -= dt;
      }
      render();
      if (active()) frameId = requestFrame(frame);
    }

    function launch() {
      if (round.phase !== "PULLING" || destroyed) return false;
      const velocity = launchVelocity(round.pullDistance, MAX_PULL, random);
      round.launchPower = velocity.power;
      round.launchDistance = LAUNCH_PATH.ballStartDistance;
      round.guidedSpeed = velocity.speed;
      round.guidedLaunch = true;
      round.exitSpeed = 0;
      round.exitCount = 0;
      round.phase = "RUNNING";
      laneMode = true;
      const guided = launchPathSample(round.launchDistance);
      ball.x = guided.x;
      ball.y = guided.y;
      ball.vx = guided.tangent.x * round.guidedSpeed;
      ball.vy = guided.tangent.y * round.guidedSpeed;
      ball.entryJitter = velocity.entryJitter;
      updatePull(0);
      lastTimestamp = null;
      frameId = requestFrame(frame);
      return true;
    }

    function pointerDown(event) {
      if (round.phase !== "READY" || destroyed) return;
      pointerId = event.pointerId;
      pullOriginY = event.clientY;
      round.phase = "PULLING";
      surface.setPointerCapture?.(pointerId);
      updatePull(0);
      event.preventDefault();
    }
    function pointerMove(event) {
      if (round.phase !== "PULLING" || event.pointerId !== pointerId) return;
      updatePull(event.clientY - pullOriginY);
      event.preventDefault();
    }
    function pointerUp(event) {
      if (round.phase !== "PULLING" || event.pointerId !== pointerId) return;
      surface.releasePointerCapture?.(pointerId);
      pointerId = null;
      event.preventDefault();
      launch();
    }
    function pointerCancel(event) {
      if (round.phase !== "PULLING" || event.pointerId !== pointerId) return;
      surface.releasePointerCapture?.(pointerId);
      pointerId = null;
      round.phase = "READY";
      updatePull(0);
      event.preventDefault();
    }
    surface.addEventListener("pointerdown", pointerDown);
    surface.addEventListener("pointermove", pointerMove);
    surface.addEventListener("pointerup", pointerUp);
    surface.addEventListener("pointercancel", pointerCancel);

    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      cancelFrame();
      clearResultTimer();
      surface.removeEventListener("pointerdown", pointerDown);
      surface.removeEventListener("pointermove", pointerMove);
      surface.removeEventListener("pointerup", pointerUp);
      surface.removeEventListener("pointercancel", pointerCancel);
      pointerId = null;
      return true;
    }

    render();
    return Object.freeze({
      round, geometry, launch, settleSlot, destroy, render, step: physicsStep,
      get ball() { return { ...ball }; }, get destroyed() { return destroyed; }
    });
  }

  global.PaJuR = Object.freeze({
    start, createSlotLayout, createGeometry, clampPullDistance, pullToPower, launchVelocity, slotIndexForX, resultForSlot,
    launchPathSample, launchRailSample,
    createStuckTracker, updateStuckTracker, recoverStuckBall,
    SLOT_COUNT, GREEN_COUNT, MAX_PULL, RESULT_DELAY_MS, PHYSICS, LAUNCH_PATH, EXIT_SPEED_RETENTION, RAIL_EXIT_GAP
  });
})(globalThis);
