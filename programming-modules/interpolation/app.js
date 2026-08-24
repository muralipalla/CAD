(function () {
  "use strict";

  const Lab = window.CurveLab;
  const canvas = document.querySelector("[data-curve-canvas]");
  const status = document.querySelector("[data-status]");
  const showHull = document.querySelector("[data-show-hull]");
  const markOvershoot = document.querySelector("[data-mark-overshoot]");
  const defaults = [
    { x: 0.08, y: 0.24 },
    { x: 0.24, y: 0.82 },
    { x: 0.43, y: 0.18 },
    { x: 0.61, y: 0.86 },
    { x: 0.79, y: 0.2 },
    { x: 0.93, y: 0.7 }
  ];
  let points = defaults.map((point) => ({ ...point }));
  let selected = 0;
  let dragging = -1;
  let currentPlot;
  let outsideCount = 0;
  let sampledCount = 0;

  function chordNodes(data) {
    if (data.length < 2) return data.map(() => 0);
    const nodes = [0];
    let hasCoincidentNeighbors = false;
    for (let index = 1; index < data.length; index += 1) {
      const dx = data[index].x - data[index - 1].x;
      const dy = data[index].y - data[index - 1].y;
      const length = Math.hypot(dx, dy);
      hasCoincidentNeighbors ||= length < 1e-10;
      nodes.push(nodes.at(-1) + length);
    }
    const total = nodes.at(-1);
    return total > 1e-10 && !hasCoincidentNeighbors
      ? nodes.map((node) => node / total)
      : nodes.map((_, index) => index / (nodes.length - 1));
  }

  function barycentricWeights(nodes) {
    return nodes.map((node, index) => {
      let product = 1;
      for (let other = 0; other < nodes.length; other += 1) {
        if (other !== index) product *= node - nodes[other];
      }
      return 1 / product;
    });
  }

  function interpolator(data) {
    const nodes = chordNodes(data);
    const weights = barycentricWeights(nodes);
    return (parameter) => {
      const hit = nodes.findIndex((node) => Math.abs(parameter - node) < 1e-9);
      if (hit >= 0) return { ...data[hit] };
      let denominator = 0;
      let x = 0;
      let y = 0;
      for (let index = 0; index < data.length; index += 1) {
        const term = weights[index] / (parameter - nodes[index]);
        denominator += term;
        x += term * data[index].x;
        y += term * data[index].y;
      }
      return { x: x / denominator, y: y / denominator };
    };
  }

  function sampleCurve() {
    if (points.length < 2) return [];
    const evaluate = interpolator(points);
    return Array.from({ length: 401 }, (_, index) => evaluate(index / 400));
  }

  function pointInsideHull(point, hull) {
    const tolerance = 1e-6;
    if (!hull.length) return false;
    if (hull.length === 1) return Math.hypot(point.x - hull[0].x, point.y - hull[0].y) <= tolerance;
    if (hull.length === 2) {
      const a = hull[0];
      const b = hull[1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared <= tolerance * tolerance) return Math.hypot(point.x - a.x, point.y - a.y) <= tolerance;
      const cross = dx * (point.y - a.y) - dy * (point.x - a.x);
      const onLine = cross * cross <= tolerance * tolerance * lengthSquared;
      const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
      return onLine && projection >= -tolerance && projection <= 1 + tolerance;
    }
    return Lab.pointInConvexPolygon(point, hull);
  }

  function drawCurveSegments(context, curve, hull, plot) {
    outsideCount = 0;
    sampledCount = curve.length;
    context.save();
    context.beginPath();
    context.rect(plot.left, plot.top, plot.width, plot.height);
    context.clip();
    context.lineWidth = 3.2;
    context.lineCap = "round";
    for (let index = 1; index < curve.length; index += 1) {
      const outside = !pointInsideHull(curve[index - 1], hull) || !pointInsideHull(curve[index], hull);
      if (outside) outsideCount += 1;
      const start = Lab.worldToScreen(curve[index - 1], plot);
      const end = Lab.worldToScreen(curve[index], plot);
      context.strokeStyle = outside && markOvershoot.checked ? "#f05b3f" : "#8ac7ff";
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    context.restore();
  }

  function draw(context, width, height) {
    currentPlot = Lab.plotRect(width, height);
    Lab.drawGrid(context, currentPlot);
    const hull = Lab.convexHull(points);
    if (showHull.checked && hull.length >= 2) {
      Lab.drawPolyline(context, hull, currentPlot, { color: "rgba(255,178,158,0.85)", width: 2, dash: [7, 6], closed: hull.length > 2, fill: hull.length > 2 ? "rgba(255,178,158,0.08)" : undefined });
    }
    drawCurveSegments(context, sampleCurve(), hull, currentPlot);
    points.forEach((point, index) => Lab.drawPoint(context, point, currentPlot, { label: `P${index}`, fill: index === selected ? "#ffd166" : "#ff725c", radius: index === selected ? 9 : 7 }));
  }

  const view = Lab.createCanvas(canvas, draw);

  function pointMatrixPython() {
    if (!points.length) return "np.empty((0, 2), dtype=float)";
    return `np.array([\n    ${Lab.formatPointRows(points)}\n], dtype=float)`;
  }

  function pointMatrixMatlab() {
    if (!points.length) return "zeros(0, 2)";
    return `[\n    ${points.map((point) => `${Lab.formatNumber(point.x)} ${Lab.formatNumber(point.y)}`).join(";\n    ")}\n]`;
  }

  function pythonCode() {
    return `import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import ConvexHull, QhullError

points = ${pointMatrixPython()}
if len(points) < 2:
    raise ValueError("Add at least two distinct points")

# Chord-length parameter values
lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
if np.any(lengths < 1e-10):
    nodes = np.linspace(0, 1, len(points))
else:
    nodes = np.r_[0.0, np.cumsum(lengths)]
    nodes = nodes / nodes[-1]

# Barycentric weights for the global Lagrange polynomial
weights = np.ones(len(points))
for i in range(len(points)):
    weights[i] = 1.0 / np.prod(nodes[i] - np.delete(nodes, i))

def interpolate(u):
    hit = np.flatnonzero(np.isclose(u, nodes, atol=1e-12))
    if hit.size:
        return points[hit[0]]
    terms = weights / (u - nodes)
    return (terms @ points) / terms.sum()

parameters = np.linspace(0.0, 1.0, 401)
curve = np.vstack([interpolate(u) for u in parameters])

plt.plot(curve[:, 0], curve[:, 1], linewidth=2, label="interpolant")
plt.plot(points[:, 0], points[:, 1], "o", label="data points")
if len(points) >= 3:
    try:
        vertices = ConvexHull(points).vertices
    except QhullError:
        order = np.lexsort((points[:,1], points[:,0]))
        vertices = order[[0, -1]]
    cycle = np.r_[vertices, vertices[0]]
    plt.plot(points[cycle, 0], points[cycle, 1], "--", label="convex hull")
plt.axis("equal")
plt.grid(True)
plt.legend()
plt.show()`;
  }

  function matlabCode() {
    return `points = ${pointMatrixMatlab()};
if size(points, 1) < 2
    error('Add at least two distinct points');
end

% Chord-length parameter values
lengths = sqrt(sum(diff(points, 1, 1).^2, 2));
if any(lengths < 1e-10)
    nodes = linspace(0, 1, size(points, 1))';
else
    nodes = [0; cumsum(lengths)];
    nodes = nodes / nodes(end);
end

% Barycentric weights for the global Lagrange polynomial
n = size(points, 1);
weights = ones(n, 1);
for i = 1:n
    others = nodes([1:i-1, i+1:n]);
    weights(i) = 1 / prod(nodes(i) - others);
end

parameters = linspace(0, 1, 401);
curve = zeros(numel(parameters), 2);
for k = 1:numel(parameters)
    curve(k, :) = interpolatePoint(parameters(k), nodes, weights, points);
end

plot(curve(:,1), curve(:,2), 'LineWidth', 2); hold on;
plot(points(:,1), points(:,2), 'o');
if n >= 3
    try
        hull = convhull(points(:,1), points(:,2));
    catch
        [~, order] = sortrows(points, [1 2]);
        hull = order([1 end 1]);
    end
    plot(points(hull,1), points(hull,2), '--');
end
axis equal; grid on;
legend('interpolant', 'data points', 'convex hull');

function point = interpolatePoint(u, nodes, weights, points)
    hit = find(abs(u - nodes) < 1e-12, 1);
    if ~isempty(hit)
        point = points(hit, :);
        return;
    end
    terms = weights ./ (u - nodes);
    point = (terms' * points) / sum(terms);
end`;
  }

  const codePane = Lab.createCodePane({ generators: { python: pythonCode, matlab: matlabCode }, pythonFilename: "interpolation.py", matlabFilename: "interpolation.m" });

  function updateStatus(message) {
    if (message) {
      status.textContent = message;
      return;
    }
    if (points.length < 2) {
      status.textContent = `Add ${2 - points.length} more point${points.length === 1 ? "" : "s"} to construct the interpolant.`;
      return;
    }
    const percent = sampledCount > 1 ? Math.round(100 * outsideCount / (sampledCount - 1)) : 0;
    const selectedCopy = selected >= 0 ? ` Selected P${selected}: (${Lab.formatNumber(points[selected].x)}, ${Lab.formatNumber(points[selected].y)}).` : "";
    status.textContent = `${points.length} data points. About ${percent}% of sampled curve segments lie outside the convex hull.${selectedCopy}`;
  }

  function render(message) {
    view.redraw();
    codePane.render();
    updateStatus(message);
  }

  canvas.addEventListener("pointerdown", (event) => {
    const screen = Lab.eventPosition(canvas, event);
    const hit = Lab.nearestPoint(points, screen, currentPlot);
    if (hit >= 0) {
      dragging = hit;
      selected = hit;
    } else if (points.length < 10 && screen.x >= currentPlot.left && screen.x <= currentPlot.right && screen.y >= currentPlot.top && screen.y <= currentPlot.bottom) {
      points.push(Lab.screenToWorld(screen, currentPlot));
      dragging = points.length - 1;
      selected = dragging;
    } else {
      updateStatus(points.length >= 10 ? "The lab is limited to ten points to keep the global polynomial numerically readable." : undefined);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    render();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (dragging < 0) return;
    points[dragging] = Lab.screenToWorld(Lab.eventPosition(canvas, event), currentPlot);
    render();
  });

  function endDrag(event) {
    if (dragging < 0) return;
    dragging = -1;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    render();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  Lab.bindCanvasKeyboard(canvas, {
    onMove(delta) {
      if (selected < 0 || !points[selected]) return;
      points[selected] = { x: Lab.clamp(points[selected].x + delta.x, 0, 1), y: Lab.clamp(points[selected].y + delta.y, 0, 1) };
      render();
    },
    onDelete() {
      if (dragging >= 0 || selected < 0) return;
      points.splice(selected, 1);
      selected = Math.min(selected, points.length - 1);
      render();
    }
  });

  showHull.addEventListener("change", () => render());
  markOvershoot.addEventListener("change", () => render());
  document.querySelector("[data-undo]").addEventListener("click", () => {
    if (points.length) points.pop();
    selected = Math.min(selected, points.length - 1);
    render();
  });
  document.querySelector("[data-clear]").addEventListener("click", () => {
    points = [];
    selected = -1;
    render();
    canvas.focus();
  });
  document.querySelector("[data-reset]").addEventListener("click", () => {
    points = defaults.map((point) => ({ ...point }));
    selected = 0;
    render();
    canvas.focus();
  });

  render();
}());
