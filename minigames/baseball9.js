(function exposeBaseball9(global) {
  "use strict";

  const CELL_COUNT = 9;
  const GREEN_COUNT = 5;
  const BOARD_WIDTH = 720;
  const BOARD_HEIGHT = 1000;
  const FLIGHT_DURATION_MS = 720;
  const BREAK_DURATION_MS = 850;
  const RESULT_DELAY_MS = 1000;

  function createGeometry() {
    const grid = Object.freeze({ left: 108, top: 72, width: 504, height: 390 });
    return Object.freeze({
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      grid,
      cellWidth: grid.width / 3,
      cellHeight: grid.height / 3,
      ballStart: Object.freeze({ x: BOARD_WIDTH / 2, y: 884 }),
      ballRadius: 34
    });
  }

  function createGrid(random = Math.random) {
    const available = Array.from({ length: CELL_COUNT }, (_, id) => id);
    const greenIds = new Set();
    while (greenIds.size < GREEN_COUNT) {
      const selected = Math.min(available.length - 1, Math.floor(random() * available.length));
      greenIds.add(available.splice(selected, 1)[0]);
    }
    return Object.freeze(Array.from({ length: CELL_COUNT }, (_, id) => Object.freeze({ id, isGreen: greenIds.has(id) })));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function calculateThrow({ start, end, durationMs = 500 } = {}, geometry = createGeometry()) {
    const dx = (end?.x ?? start?.x ?? 0) - (start?.x ?? 0);
    const upwardDistance = Math.max(0, (start?.y ?? 0) - (end?.y ?? start?.y ?? 0));
    const safeDuration = Math.max(120, Number(durationMs) || 500);
    const upwardSpeed = upwardDistance / safeDuration;
    const distancePower = clamp((upwardDistance - 105) / 385, 0, 1);
    const speedAssist = clamp((upwardSpeed - 0.25) / 1.25, -0.08, 0.08);
    const verticalPower = clamp(distancePower + speedAssist, 0, 1);
    return Object.freeze({
      x: geometry.ballStart.x + dx * 1.58,
      y: geometry.grid.top + geometry.grid.height * (1 - verticalPower),
      dx,
      upwardDistance,
      verticalPower
    });
  }

  function cellIndexAtPoint(point, geometry = createGeometry()) {
    const { grid, cellWidth, cellHeight } = geometry;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const epsilon = 1e-7;
    if (x < grid.left - epsilon || x > grid.left + grid.width + epsilon || y < grid.top - epsilon || y > grid.top + grid.height + epsilon) return null;
    const localX = Math.min(grid.width - epsilon, Math.max(0, x - grid.left));
    const localY = Math.min(grid.height - epsilon, Math.max(0, y - grid.top));
    const column = Math.floor(localX / cellWidth);
    const row = Math.floor(localY / cellHeight);
    return row * 3 + column;
  }

  function resultForPoint(grid, point, geometry = createGeometry()) {
    const cellIndex = cellIndexAtPoint(point, geometry);
    return Object.freeze({ success: cellIndex !== null && Boolean(grid[cellIndex]?.isGreen), cellIndex });
  }

  function start({ container, onComplete, random = Math.random, scheduler = global } = {}) {
    if (!container || typeof onComplete !== "function") throw new TypeError("Baseball9.start requires container and onComplete");
    const geometry = createGeometry();
    const grid = createGrid(random);
    const round = {
      grid,
      phase: "READY",
      hitPoint: null,
      hitCell: null,
      success: null,
      throwCount: 0
    };
    let destroyed = false;
    let completed = false;
    let frameId = null;
    let resultTimer = null;
    let pointerId = null;
    let pointerStart = null;
    let pointerCurrent = null;
    let pointerStartedAt = 0;
    let flightStartedAt = null;
    let impactStartedAt = null;

    container.innerHTML = `<section class="baseball9-game" aria-label="棒球九宮格">
      <div class="baseball9-board-wrap">
        <canvas class="baseball9-canvas" aria-label="三乘三紅綠燈九宮格與投球區"></canvas>
      </div>
      <p class="baseball9-instruction">從棒球向上滑動投球</p>
    </section>`;

    const canvas = container.querySelector(".baseball9-canvas");
    const surface = container.querySelector(".baseball9-game");
    const context = canvas.getContext("2d");
    const dpr = Math.max(1, Math.min(3, global.devicePixelRatio || 1));
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    function active() { return !destroyed && !completed; }
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
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
      else {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
      }
    }
    function drawBaseball(x, y, radius, alpha = 1) {
      context.save();
      context.globalAlpha = alpha;
      const ball = context.createRadialGradient(x - radius * 0.32, y - radius * 0.38, radius * 0.1, x, y, radius);
      ball.addColorStop(0, "#ffffff");
      ball.addColorStop(0.68, "#f3eee1");
      ball.addColorStop(1, "#c8baa9");
      context.fillStyle = ball;
      context.shadowColor = "#0008";
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      const seamColor = "#bc3542";
      const seamWidth = Math.max(1.5, radius * 0.065);
      const seamTop = y - radius * 0.82;
      const seamBottom = y + radius * 0.82;
      const seamOffset = radius * 0.17;
      const seamBend = radius * 0.78;
      context.strokeStyle = seamColor;
      context.lineWidth = seamWidth;
      context.beginPath();
      context.moveTo(x - seamOffset, seamTop);
      context.quadraticCurveTo(x - seamBend, y, x - seamOffset, seamBottom);
      context.stroke();
      context.beginPath();
      context.moveTo(x + seamOffset, seamTop);
      context.quadraticCurveTo(x + seamBend, y, x + seamOffset, seamBottom);
      context.stroke();
      context.lineWidth = Math.max(1.2, radius * 0.045);
      for (const side of [-1, 1]) {
        for (let stitch = 1; stitch <= 6; stitch += 1) {
          const t = stitch / 7;
          const inverse = 1 - t;
          const startX = x + side * seamOffset;
          const controlX = x + side * seamBend;
          const pointX = inverse * inverse * startX + 2 * inverse * t * controlX + t * t * startX;
          const pointY = inverse * inverse * seamTop + 2 * inverse * t * y + t * t * seamBottom;
          const tangentX = 2 * inverse * (controlX - startX) + 2 * t * (startX - controlX);
          const tangentY = 2 * inverse * (y - seamTop) + 2 * t * (seamBottom - y);
          const tangentLength = Math.hypot(tangentX, tangentY) || 1;
          const normalX = -tangentY / tangentLength;
          const normalY = tangentX / tangentLength;
          const halfStitch = radius * 0.13;
          context.beginPath();
          context.moveTo(pointX - normalX * halfStitch, pointY - normalY * halfStitch);
          context.lineTo(pointX + normalX * halfStitch, pointY + normalY * halfStitch);
          context.stroke();
        }
      }
      context.restore();
    }
    function drawFragment(points, color, progress, shiftX, shiftY, rotation) {
      const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const angle = rotation * progress;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const transformed = points.map(point => {
        const localX = point.x - centerX;
        const localY = point.y - centerY;
        return {
          x: centerX + localX * cosine - localY * sine + shiftX * progress,
          y: centerY + localX * sine + localY * cosine + shiftY * progress
        };
      });
      context.fillStyle = color;
      context.strokeStyle = "#e9c77f";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(transformed[0].x, transformed[0].y);
      transformed.slice(1).forEach(point => context.lineTo(point.x, point.y));
      context.lineTo(transformed[0].x, transformed[0].y);
      context.fill();
      context.stroke();
    }
    function drawGrid(now) {
      const { grid: board, cellWidth, cellHeight } = geometry;
      context.fillStyle = "#241325";
      context.shadowColor = "#000b";
      context.shadowBlur = 24;
      drawRoundedRect(context, board.left - 24, board.top - 24, board.width + 48, board.height + 48, 24);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "#e8b65d";
      context.lineWidth = 8;
      context.stroke();
      for (let index = 0; index < CELL_COUNT; index += 1) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = board.left + column * cellWidth;
        const y = board.top + row * cellHeight;
        const breaking = round.hitCell === index && impactStartedAt !== null;
        const breakProgress = breaking ? clamp((now - impactStartedAt) / BREAK_DURATION_MS, 0, 1) : 0;
        context.save();
        const panelColor = grid[index].isGreen ? "#174d39" : "#5a202c";
        context.fillStyle = panelColor;
        context.strokeStyle = "#f4cf83";
        context.lineWidth = 5;
        if (!breaking || breakProgress < 0.1) {
          context.fillRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);
          context.strokeRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);
          const lightX = x + cellWidth / 2;
          const lightY = y + cellHeight / 2;
          context.fillStyle = grid[index].isGreen ? "#3cff9e" : "#ff5267";
          context.shadowColor = context.fillStyle;
          context.shadowBlur = 22;
          context.beginPath();
          context.arc(lightX, lightY, 28, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
        }
        if (breaking) {
          const impactX = clamp(round.hitPoint.x, x + 30, x + cellWidth - 30);
          const impactY = clamp(round.hitPoint.y, y + 26, y + cellHeight - 26);
          const left = x + 8;
          const right = x + cellWidth - 8;
          const top = y + 8;
          const bottom = y + cellHeight - 8;
          context.fillStyle = "#100b15";
          context.fillRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);
          context.strokeStyle = "#f4cf83";
          context.lineWidth = 5;
          context.strokeRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);
          const fragments = [
            { points: [{ x: left, y: top }, { x: impactX - 8, y: top }, { x: impactX - 14, y: impactY - 8 }, { x: left, y: impactY - 18 }], dx: -12, dy: 30, turn: -0.13 },
            { points: [{ x: impactX - 8, y: top }, { x: right, y: top }, { x: right, y: impactY - 20 }, { x: impactX + 10, y: impactY - 9 }], dx: 10, dy: 25, turn: 0.11 },
            { points: [{ x: left, y: impactY - 18 }, { x: impactX - 14, y: impactY - 8 }, { x: impactX - 18, y: impactY + 18 }, { x: left, y: bottom }], dx: -17, dy: 42, turn: -0.18 },
            { points: [{ x: impactX + 10, y: impactY - 9 }, { x: right, y: impactY - 20 }, { x: right, y: bottom }, { x: impactX + 16, y: impactY + 17 }], dx: 15, dy: 38, turn: 0.16 },
            { points: [{ x: left, y: bottom }, { x: impactX - 18, y: impactY + 18 }, { x: impactX - 5, y: bottom }], dx: -8, dy: 53, turn: -0.09 },
            { points: [{ x: impactX + 16, y: impactY + 17 }, { x: right, y: bottom }, { x: impactX - 5, y: bottom }], dx: 8, dy: 58, turn: 0.1 }
          ];
          fragments.forEach(fragment => drawFragment(fragment.points, panelColor, breakProgress, fragment.dx, fragment.dy, fragment.turn));
          context.fillStyle = "#08060b";
          context.shadowColor = "#000";
          context.shadowBlur = 15;
          context.beginPath();
          context.arc(impactX, impactY, 12 + breakProgress * 27, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
          context.strokeStyle = "#fff0c4";
          context.lineWidth = Math.max(1, 4 * (1 - breakProgress));
          for (let crack = 0; crack < 6; crack += 1) {
            const angle = -2.55 + crack * 0.86;
            const length = 18 + crack % 2 * 10;
            context.beginPath();
            context.moveTo(impactX + Math.cos(angle) * 10, impactY + Math.sin(angle) * 10);
            context.lineTo(impactX + Math.cos(angle) * length, impactY + Math.sin(angle) * length + breakProgress * 5);
            context.stroke();
          }
          if (breakProgress < 0.22) {
            context.strokeStyle = `rgba(255,241,190,${1 - breakProgress / 0.22})`;
            context.lineWidth = 7;
            context.beginPath();
            context.arc(impactX, impactY, 34 + breakProgress * 55, 0, Math.PI * 2);
            context.stroke();
          }
        }
        context.restore();
      }
    }
    function flightPosition(now) {
      if (round.phase !== "FLYING" || flightStartedAt === null) return null;
      const progress = clamp((now - flightStartedAt) / FLIGHT_DURATION_MS, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 2.25);
      const arc = Math.sin(Math.PI * progress) * 112;
      return {
        x: geometry.ballStart.x + (round.hitPoint.x - geometry.ballStart.x) * eased,
        y: geometry.ballStart.y + (round.hitPoint.y - geometry.ballStart.y) * eased - arc,
        radius: geometry.ballRadius * (1 - progress * 0.58),
        progress
      };
    }
    function impactBallPosition(now) {
      if (round.phase !== "IMPACT" || impactStartedAt === null || round.hitCell === null) return null;
      const progress = clamp((now - impactStartedAt) / BREAK_DURATION_MS, 0, 1);
      return {
        x: round.hitPoint.x,
        y: round.hitPoint.y + progress * 32,
        radius: geometry.ballRadius * 0.42 * (1 - progress * 0.48),
        alpha: Math.max(0, 1 - progress * 1.15)
      };
    }
    function render(timestamp = 0) {
      if (destroyed) return false;
      context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      const sky = context.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
      sky.addColorStop(0, "#1a1028");
      sky.addColorStop(0.58, "#42233a");
      sky.addColorStop(1, "#241219");
      context.fillStyle = sky;
      context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      context.fillStyle = "#f0bd5a";
      context.globalAlpha = 0.2;
      for (let lamp = 0; lamp < 8; lamp += 1) {
        context.beginPath();
        context.arc(48 + lamp * 90, 35, 11, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      const impactBall = impactBallPosition(timestamp);
      drawGrid(timestamp);
      if (impactBall) drawBaseball(impactBall.x, impactBall.y, impactBall.radius, impactBall.alpha);
      context.fillStyle = "#6d3729";
      context.fillRect(0, 780, BOARD_WIDTH, 220);
      context.fillStyle = "#9b5435";
      context.fillRect(0, 780, BOARD_WIDTH, 28);
      context.strokeStyle = "#c37a4b";
      context.lineWidth = 4;
      for (let line = 0; line < 5; line += 1) {
        context.beginPath();
        context.moveTo(0, 825 + line * 40);
        context.lineTo(BOARD_WIDTH, 825 + line * 40);
        context.stroke();
      }
      const flying = flightPosition(timestamp);
      if (flying) drawBaseball(flying.x, flying.y, flying.radius);
      else if (round.phase === "READY" || round.phase === "AIMING") {
        const dragX = round.phase === "AIMING" ? (pointerCurrent.x - pointerStart.x) * 0.13 : 0;
        const dragY = round.phase === "AIMING" ? Math.max(-14, (pointerCurrent.y - pointerStart.y) * 0.08) : 0;
        drawBaseball(geometry.ballStart.x + dragX, geometry.ballStart.y + dragY, geometry.ballRadius * 1.42);
      }
      return true;
    }
    function finish() {
      if (!active() || round.phase !== "IMPACT") return false;
      completed = true;
      round.phase = "COMPLETE";
      clearResultTimer();
      onComplete({ success: round.success });
      return true;
    }
    function impact(timestamp) {
      if (!active() || round.phase !== "FLYING") return false;
      const result = resultForPoint(grid, round.hitPoint, geometry);
      round.hitCell = result.cellIndex;
      round.success = result.success;
      round.phase = "IMPACT";
      impactStartedAt = timestamp;
      resultTimer = scheduler.setTimeout(finish, RESULT_DELAY_MS);
      return true;
    }
    function animate(timestamp) {
      frameId = null;
      if (!active()) return;
      if (flightStartedAt === null) flightStartedAt = timestamp;
      if (round.phase === "FLYING" && timestamp - flightStartedAt >= FLIGHT_DURATION_MS) impact(timestamp);
      render(timestamp);
      if (round.phase === "FLYING" || round.phase === "IMPACT") frameId = scheduler.requestAnimationFrame(animate);
    }
    function pointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * BOARD_WIDTH / rect.width,
        y: (event.clientY - rect.top) * BOARD_HEIGHT / rect.height
      };
    }
    function nearBall(point) {
      return Math.hypot(point.x - geometry.ballStart.x, point.y - geometry.ballStart.y) <= geometry.ballRadius * 2.1;
    }
    function onPointerDown(event) {
      if (!active() || round.phase !== "READY" || round.throwCount > 0) return;
      const point = pointFromEvent(event);
      if (!nearBall(point)) return;
      event.preventDefault();
      pointerId = event.pointerId;
      pointerStart = point;
      pointerCurrent = point;
      pointerStartedAt = Number(event.timeStamp) || 0;
      round.phase = "AIMING";
      surface.setPointerCapture(pointerId);
      render();
    }
    function onPointerMove(event) {
      if (!active() || round.phase !== "AIMING" || event.pointerId !== pointerId) return;
      event.preventDefault();
      pointerCurrent = pointFromEvent(event);
      render();
    }
    function releasePointer(event, launch) {
      if (!active() || round.phase !== "AIMING" || event.pointerId !== pointerId) return false;
      event.preventDefault();
      pointerCurrent = pointFromEvent(event);
      if (surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
      else surface.releasePointerCapture?.(pointerId);
      pointerId = null;
      if (!launch || pointerStart.y - pointerCurrent.y < 24) {
        round.phase = "READY";
        pointerStart = null;
        pointerCurrent = null;
        render();
        return false;
      }
      const durationMs = Math.max(120, (Number(event.timeStamp) || pointerStartedAt + 500) - pointerStartedAt);
      round.hitPoint = calculateThrow({ start: pointerStart, end: pointerCurrent, durationMs }, geometry);
      round.throwCount += 1;
      round.phase = "FLYING";
      flightStartedAt = null;
      pointerStart = null;
      pointerCurrent = null;
      frameId = scheduler.requestAnimationFrame(animate);
      return true;
    }
    function onPointerUp(event) { return releasePointer(event, true); }
    function onPointerCancel(event) { return releasePointer(event, false); }
    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      cancelFrame();
      clearResultTimer();
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerCancel);
      if (pointerId !== null) surface.releasePointerCapture?.(pointerId);
      pointerId = null;
      return true;
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerCancel);
    render();
    return Object.freeze({
      round, geometry, render, destroy,
      throwAt(input) {
        if (!active() || round.phase !== "READY" || round.throwCount > 0) return false;
        round.hitPoint = Object.freeze({ x: input.x, y: input.y });
        round.throwCount = 1;
        round.phase = "FLYING";
        flightStartedAt = null;
        frameId = scheduler.requestAnimationFrame(animate);
        return true;
      },
      resolveImpact(timestamp = FLIGHT_DURATION_MS) { return impact(timestamp); },
      get destroyed() { return destroyed; }
    });
  }

  global.Baseball9 = Object.freeze({
    start, createGrid, createGeometry, calculateThrow, cellIndexAtPoint, resultForPoint,
    CELL_COUNT, GREEN_COUNT, BOARD_WIDTH, BOARD_HEIGHT, FLIGHT_DURATION_MS, BREAK_DURATION_MS, RESULT_DELAY_MS
  });
})(globalThis);
