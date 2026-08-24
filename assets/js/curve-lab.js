(function () {
  "use strict";

  const palette = ["#8ac7ff", "#ffb29e", "#a99ae0", "#6ee7bd", "#ffd166", "#f78fb3", "#78dce8"];

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function plotRect(width, height, options = {}) {
    const left = options.left ?? 46;
    const right = options.right ?? 24;
    const top = options.top ?? 24;
    const bottom = options.bottom ?? 42;
    return { left, top, right: width - right, bottom: height - bottom, width: width - left - right, height: height - top - bottom };
  }

  function worldToScreen(point, plot) {
    return {
      x: plot.left + point.x * plot.width,
      y: plot.bottom - point.y * plot.height
    };
  }

  function screenToWorld(point, plot) {
    return {
      x: clamp((point.x - plot.left) / plot.width, 0, 1),
      y: clamp((plot.bottom - point.y) / plot.height, 0, 1)
    };
  }

  function eventPosition(canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function createCanvas(canvas, draw) {
    const context = canvas.getContext("2d");
    let logicalWidth = Number(canvas.getAttribute("width")) || 900;
    let logicalHeight = Number(canvas.getAttribute("height")) || 600;

    function redraw() {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      logicalWidth = bounds.width;
      logicalHeight = bounds.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(logicalWidth * ratio));
      const pixelHeight = Math.max(1, Math.round(logicalHeight * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, logicalWidth, logicalHeight);
      draw(context, logicalWidth, logicalHeight);
    }

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(redraw);
      observer.observe(canvas);
    } else {
      window.addEventListener("resize", redraw);
    }
    window.requestAnimationFrame(redraw);
    return { redraw, get width() { return logicalWidth; }, get height() { return logicalHeight; } };
  }

  function drawGrid(context, plot, options = {}) {
    context.save();
    context.fillStyle = options.background ?? "#171541";
    context.fillRect(0, 0, plot.right + 24, plot.bottom + 42);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    for (let step = 0; step <= 10; step += 1) {
      const x = plot.left + plot.width * step / 10;
      const y = plot.top + plot.height * step / 10;
      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.bottom);
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.beginPath();
    context.moveTo(plot.left, plot.bottom);
    context.lineTo(plot.right, plot.bottom);
    context.moveTo(plot.left, plot.top);
    context.lineTo(plot.left, plot.bottom);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "700 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("0", plot.left, plot.bottom + 20);
    context.fillText("1", plot.right, plot.bottom + 20);
    context.textAlign = "right";
    context.fillText("1", plot.left - 9, plot.top + 4);
    context.restore();
  }

  function drawPolyline(context, points, plot, options = {}) {
    if (points.length < 2) return;
    context.save();
    context.strokeStyle = options.color ?? "#8ac7ff";
    context.lineWidth = options.width ?? 3;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash(options.dash ?? []);
    context.beginPath();
    points.forEach((point, index) => {
      const screen = worldToScreen(point, plot);
      if (index === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    if (options.closed) context.closePath();
    if (options.fill) {
      context.fillStyle = options.fill;
      context.fill();
    }
    context.stroke();
    context.restore();
  }

  function drawPoint(context, point, plot, options = {}) {
    const screen = worldToScreen(point, plot);
    context.save();
    context.beginPath();
    context.arc(screen.x, screen.y, options.radius ?? 7, 0, Math.PI * 2);
    context.fillStyle = options.fill ?? "#f05b3f";
    context.fill();
    context.strokeStyle = options.stroke ?? "white";
    context.lineWidth = options.lineWidth ?? 2;
    context.stroke();
    if (options.label !== undefined) {
      context.fillStyle = options.labelColor ?? "white";
      context.font = "800 11px system-ui, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "bottom";
      context.fillText(String(options.label), screen.x + 9, screen.y - 8);
    }
    context.restore();
  }

  function nearestPoint(points, screenPoint, plot, radius = 16) {
    let nearest = -1;
    let best = radius * radius;
    points.forEach((point, index) => {
      const screen = worldToScreen(point, plot);
      const squared = distanceSquared(screen, screenPoint);
      if (squared <= best) {
        best = squared;
        nearest = index;
      }
    });
    return nearest;
  }

  function convexHull(points) {
    if (points.length <= 2) return points.map((point) => ({ ...point }));
    const sorted = points.map((point) => ({ ...point })).sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function pointInConvexPolygon(point, polygon) {
    if (polygon.length < 3) return true;
    let sign = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      if (Math.abs(cross) < 1e-10) continue;
      const current = Math.sign(cross);
      if (sign && current !== sign) return false;
      sign = current;
    }
    return true;
  }

  function formatNumber(value, digits = 3) {
    return Number(value.toFixed(digits)).toString();
  }

  function formatPointRows(points, open = "[", close = "]") {
    return points.map((point) => `${open}${formatNumber(point.x)}, ${formatNumber(point.y)}${close}`).join(",\n    ");
  }

  function createCodePane(options) {
    const output = document.querySelector(options.output ?? "[data-code-output]");
    const filename = document.querySelector(options.filename ?? "[data-code-filename]");
    const buttons = [...document.querySelectorAll(options.buttons ?? "[data-language]")];
    const copyButton = document.querySelector(options.copy ?? "[data-copy-code]");
    let language = "python";

    function render() {
      const generator = options.generators[language];
      output.textContent = typeof generator === "function" ? generator() : String(generator ?? "");
      filename.textContent = language === "python" ? (options.pythonFilename ?? "curve.py") : (options.matlabFilename ?? "curve.m");
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        language = button.dataset.language;
        render();
      });
    });

    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(output.textContent);
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Select code to copy";
      }
      window.setTimeout(() => { copyButton.textContent = "Copy code"; }, 1600);
    });

    render();
    return { render, get language() { return language; } };
  }

  function bindCanvasKeyboard(canvas, options) {
    canvas.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Delete" || event.key === "Backspace") options.onDelete?.();
      else {
        const step = event.shiftKey ? 0.05 : 0.01;
        const delta = {
          x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          y: event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0
        };
        options.onMove?.(delta);
      }
    });
  }

  window.CurveLab = {
    bindCanvasKeyboard,
    clamp,
    convexHull,
    createCanvas,
    createCodePane,
    drawGrid,
    drawPoint,
    drawPolyline,
    eventPosition,
    formatNumber,
    formatPointRows,
    nearestPoint,
    palette,
    plotRect,
    pointInConvexPolygon,
    screenToWorld,
    worldToScreen
  };
}());
