(function () {
  "use strict";

  const Lab = window.CurveLab;
  const canvas = document.querySelector("[data-curve-canvas]");
  const status = document.querySelector("[data-status]");
  const showTangents = document.querySelector("[data-show-tangents]");
  const defaultEndpoints = [{ x: 0.13, y: 0.24 }, { x: 0.84, y: 0.7 }];
  const defaultTangents = [{ x: 0.36, y: 0.5 }, { x: 0.1, y: -0.45 }];
  let endpoints = defaultEndpoints.map((point) => ({ ...point }));
  let tangents = defaultTangents.map((point) => ({ ...point }));
  let selected = { type: "endpoint", index: 0 };
  let dragging = null;
  let currentPlot;

  function tangentTip(index) {
    return { x: endpoints[index].x + tangents[index].x, y: endpoints[index].y + tangents[index].y };
  }

  function keepTangentHandleVisible(index) {
    const tip = tangentTip(index);
    const visible = { x: Lab.clamp(tip.x, 0.01, 0.99), y: Lab.clamp(tip.y, 0.01, 0.99) };
    tangents[index] = { x: visible.x - endpoints[index].x, y: visible.y - endpoints[index].y };
  }

  function initializeTangents() {
    if (endpoints.length !== 2) {
      tangents = [];
      return;
    }
    const dx = endpoints[1].x - endpoints[0].x;
    const dy = endpoints[1].y - endpoints[0].y;
    tangents = [
      { x: 0.45 * dx - 0.22 * dy, y: 0.45 * dy + 0.22 * dx },
      { x: 0.45 * dx + 0.22 * dy, y: 0.45 * dy - 0.22 * dx }
    ];
    keepTangentHandleVisible(0);
    keepTangentHandleVisible(1);
  }

  function hermitePoint(parameter) {
    const parameter2 = parameter * parameter;
    const parameter3 = parameter2 * parameter;
    const h00 = 2 * parameter3 - 3 * parameter2 + 1;
    const h10 = parameter3 - 2 * parameter2 + parameter;
    const h01 = -2 * parameter3 + 3 * parameter2;
    const h11 = parameter3 - parameter2;
    return {
      x: h00 * endpoints[0].x + h10 * tangents[0].x + h01 * endpoints[1].x + h11 * tangents[1].x,
      y: h00 * endpoints[0].y + h10 * tangents[0].y + h01 * endpoints[1].y + h11 * tangents[1].y
    };
  }

  function sampleCurve() {
    if (endpoints.length !== 2 || tangents.length !== 2) return [];
    return Array.from({ length: 301 }, (_, index) => hermitePoint(index / 300));
  }

  function drawArrow(context, startPoint, endPoint, plot, color, label) {
    const start = Lab.worldToScreen(startPoint, plot);
    const end = Lab.worldToScreen(endPoint, plot);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.3;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - 11 * Math.cos(angle - Math.PI / 7), end.y - 11 * Math.sin(angle - Math.PI / 7));
    context.lineTo(end.x - 11 * Math.cos(angle + Math.PI / 7), end.y - 11 * Math.sin(angle + Math.PI / 7));
    context.closePath();
    context.fill();
    context.font = "800 11px system-ui, sans-serif";
    context.fillText(label, (start.x + end.x) / 2 + 6, (start.y + end.y) / 2 - 6);
    context.restore();
  }

  function drawHandle(context, point, plot, options = {}) {
    const screen = Lab.worldToScreen(point, plot);
    const radius = options.selected ? 9 : 7;
    context.save();
    context.translate(screen.x, screen.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = options.selected ? "#ffd166" : "#a99ae0";
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.strokeRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
    context.save();
    context.fillStyle = "white";
    context.font = "800 11px system-ui, sans-serif";
    context.fillText(options.label, screen.x + 11, screen.y - 10);
    context.restore();
  }

  function draw(context, width, height) {
    currentPlot = Lab.plotRect(width, height);
    Lab.drawGrid(context, currentPlot);
    Lab.drawPolyline(context, sampleCurve(), currentPlot, { color: "#8ac7ff", width: 4 });
    if (endpoints.length === 2 && showTangents.checked) {
      for (let index = 0; index < 2; index += 1) drawArrow(context, endpoints[index], tangentTip(index), currentPlot, "#a99ae0", `T${index}`);
    }
    endpoints.forEach((point, index) => Lab.drawPoint(context, point, currentPlot, {
      label: `P${index}`,
      fill: selected?.type === "endpoint" && selected.index === index ? "#ffd166" : "#ff725c",
      radius: selected?.type === "endpoint" && selected.index === index ? 9 : 7
    }));
    if (endpoints.length === 2) {
      for (let index = 0; index < 2; index += 1) drawHandle(context, tangentTip(index), currentPlot, { label: `H${index}`, selected: selected?.type === "tangent" && selected.index === index });
    }
  }

  const view = Lab.createCanvas(canvas, draw);

  function pythonArray(data) {
    if (!data.length) return "np.empty((0, 2), dtype=float)";
    return `np.array([\n    ${Lab.formatPointRows(data)}\n], dtype=float)`;
  }

  function matlabArray(data) {
    if (!data.length) return "zeros(0, 2)";
    return `[\n    ${data.map((point) => `${Lab.formatNumber(point.x)} ${Lab.formatNumber(point.y)}`).join(";\n    ")}\n]`;
  }

  function pythonCode() {
    return `import numpy as np
import matplotlib.pyplot as plt

endpoints = ${pythonArray(endpoints)}
tangents = ${pythonArray(tangents)}
if endpoints.shape != (2, 2) or tangents.shape != (2, 2):
    raise ValueError("Hermite interpolation needs two endpoints and two tangents")
P0, P1 = endpoints
T0, T1 = tangents

def hermite(t):
    h00 = 2*t**3 - 3*t**2 + 1
    h10 = t**3 - 2*t**2 + t
    h01 = -2*t**3 + 3*t**2
    h11 = t**3 - t**2
    return h00*P0 + h10*T0 + h01*P1 + h11*T1

parameters = np.linspace(0.0, 1.0, 301)
curve = np.vstack([hermite(t) for t in parameters])

plt.plot(curve[:,0], curve[:,1], linewidth=2, label="Hermite curve")
plt.plot(endpoints[:,0], endpoints[:,1], "o", label="endpoints")
plt.quiver(endpoints[:,0], endpoints[:,1], tangents[:,0], tangents[:,1],
           angles="xy", scale_units="xy", scale=1, color="tab:purple")
plt.axis("equal")
plt.grid(True)
plt.legend()
plt.show()`;
  }

  function matlabCode() {
    return `endpoints = ${matlabArray(endpoints)};
tangents = ${matlabArray(tangents)};
if ~isequal(size(endpoints), [2 2]) || ~isequal(size(tangents), [2 2])
    error('Hermite interpolation needs two endpoints and two tangents');
end
P0 = endpoints(1,:); P1 = endpoints(2,:);
T0 = tangents(1,:); T1 = tangents(2,:);

t = linspace(0, 1, 301)';
h00 = 2*t.^3 - 3*t.^2 + 1;
h10 = t.^3 - 2*t.^2 + t;
h01 = -2*t.^3 + 3*t.^2;
h11 = t.^3 - t.^2;
curve = h00*P0 + h10*T0 + h01*P1 + h11*T1;

plot(curve(:,1), curve(:,2), 'LineWidth', 2); hold on;
plot(endpoints(:,1), endpoints(:,2), 'o');
quiver(endpoints(:,1), endpoints(:,2), tangents(:,1), tangents(:,2), 0);
axis equal; grid on;
legend('Hermite curve', 'endpoints', 'tangents');`;
  }

  const codePane = Lab.createCodePane({ generators: { python: pythonCode, matlab: matlabCode }, pythonFilename: "hermite.py", matlabFilename: "hermite.m" });

  function updateStatus() {
    if (endpoints.length < 2) {
      status.textContent = `Click the plot to place ${endpoints.length === 0 ? "P0" : "P1"}.`;
      return;
    }
    const t0 = Math.hypot(tangents[0].x, tangents[0].y);
    const t1 = Math.hypot(tangents[1].x, tangents[1].y);
    const selectedCopy = selected ? ` Selected ${selected.type === "endpoint" ? "P" : "H"}${selected.index}.` : "";
    status.textContent = `Tangent magnitudes: |T0| = ${Lab.formatNumber(t0)}, |T1| = ${Lab.formatNumber(t1)}.${selectedCopy}`;
  }

  function render() {
    view.redraw();
    codePane.render();
    updateStatus();
  }

  function hitHandle(screen) {
    const endpointHit = Lab.nearestPoint(endpoints, screen, currentPlot);
    const tips = endpoints.length === 2 ? [tangentTip(0), tangentTip(1)] : [];
    const tangentHit = Lab.nearestPoint(tips, screen, currentPlot);
    if (endpointHit < 0) return tangentHit < 0 ? null : { type: "tangent", index: tangentHit };
    if (tangentHit < 0) return { type: "endpoint", index: endpointHit };
    const endpointScreen = Lab.worldToScreen(endpoints[endpointHit], currentPlot);
    const tangentScreen = Lab.worldToScreen(tips[tangentHit], currentPlot);
    const endpointDistance = (endpointScreen.x - screen.x) ** 2 + (endpointScreen.y - screen.y) ** 2;
    const tangentDistance = (tangentScreen.x - screen.x) ** 2 + (tangentScreen.y - screen.y) ** 2;
    return endpointDistance < tangentDistance ? { type: "endpoint", index: endpointHit } : { type: "tangent", index: tangentHit };
  }

  canvas.addEventListener("pointerdown", (event) => {
    const screen = Lab.eventPosition(canvas, event);
    dragging = hitHandle(screen);
    if (!dragging && endpoints.length < 2 && screen.x >= currentPlot.left && screen.x <= currentPlot.right && screen.y >= currentPlot.top && screen.y <= currentPlot.bottom) {
      endpoints.push(Lab.screenToWorld(screen, currentPlot));
      if (endpoints.length === 2) initializeTangents();
      dragging = { type: "endpoint", index: endpoints.length - 1 };
    }
    if (!dragging) return;
    selected = { ...dragging };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    render();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const world = Lab.screenToWorld(Lab.eventPosition(canvas, event), currentPlot);
    if (dragging.type === "endpoint") {
      endpoints[dragging.index] = world;
      keepTangentHandleVisible(dragging.index);
    }
    else tangents[dragging.index] = { x: world.x - endpoints[dragging.index].x, y: world.y - endpoints[dragging.index].y };
    render();
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = null;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    render();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  Lab.bindCanvasKeyboard(canvas, {
    onMove(delta) {
      if (!selected) return;
      if (selected.type === "endpoint") {
        const point = endpoints[selected.index];
        if (!point) return;
        endpoints[selected.index] = { x: Lab.clamp(point.x + delta.x, 0, 1), y: Lab.clamp(point.y + delta.y, 0, 1) };
        if (tangents[selected.index]) keepTangentHandleVisible(selected.index);
      } else if (endpoints.length === 2) {
        const tip = tangentTip(selected.index);
        const moved = { x: Lab.clamp(tip.x + delta.x, 0, 1), y: Lab.clamp(tip.y + delta.y, 0, 1) };
        tangents[selected.index] = { x: moved.x - endpoints[selected.index].x, y: moved.y - endpoints[selected.index].y };
      }
      render();
    }
  });

  showTangents.addEventListener("change", () => render());
  document.querySelector("[data-clear]").addEventListener("click", () => {
    endpoints = [];
    tangents = [];
    selected = null;
    render();
    canvas.focus();
  });
  document.querySelector("[data-reset]").addEventListener("click", () => {
    endpoints = defaultEndpoints.map((point) => ({ ...point }));
    tangents = defaultTangents.map((point) => ({ ...point }));
    selected = { type: "endpoint", index: 0 };
    render();
    canvas.focus();
  });

  render();
}());
