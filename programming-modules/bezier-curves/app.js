(function () {
  "use strict";

  const Lab = window.CurveLab;
  const canvas = document.querySelector("[data-curve-canvas]");
  const basisCanvas = document.querySelector("[data-basis-canvas]");
  const status = document.querySelector("[data-status]");
  const showPolygon = document.querySelector("[data-show-polygon]");
  const showHull = document.querySelector("[data-show-hull]");
  const degreeLabel = document.querySelector("[data-degree-label]");
  const basisLegend = document.querySelector("[data-basis-legend]");
  const defaults = [
    { x: 0.08, y: 0.2 },
    { x: 0.2, y: 0.82 },
    { x: 0.48, y: 0.72 },
    { x: 0.66, y: 0.12 },
    { x: 0.92, y: 0.64 }
  ];
  let points = defaults.map((point) => ({ ...point }));
  let selected = 0;
  let dragging = -1;
  let currentPlot;

  function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let index = 1; index <= Math.min(k, n - k); index += 1) result = result * (n - index + 1) / index;
    return result;
  }

  function bernstein(index, degree, parameter) {
    return binomial(degree, index) * parameter ** index * (1 - parameter) ** (degree - index);
  }

  function deCasteljau(data, parameter) {
    const work = data.map((point) => ({ ...point }));
    for (let level = 1; level < work.length; level += 1) {
      for (let index = 0; index < work.length - level; index += 1) {
        work[index] = {
          x: (1 - parameter) * work[index].x + parameter * work[index + 1].x,
          y: (1 - parameter) * work[index].y + parameter * work[index + 1].y
        };
      }
    }
    return work[0];
  }

  function sampleCurve() {
    if (points.length < 2) return [];
    return Array.from({ length: 301 }, (_, index) => deCasteljau(points, index / 300));
  }

  function drawCurve(context, width, height) {
    currentPlot = Lab.plotRect(width, height);
    Lab.drawGrid(context, currentPlot);
    const hull = Lab.convexHull(points);
    if (showHull.checked && hull.length >= 2) {
      Lab.drawPolyline(context, hull, currentPlot, { color: "rgba(255,178,158,0.85)", width: 2, dash: [7, 6], closed: hull.length > 2, fill: hull.length > 2 ? "rgba(255,178,158,0.08)" : undefined });
    }
    if (showPolygon.checked) Lab.drawPolyline(context, points, currentPlot, { color: "rgba(255,255,255,0.55)", width: 1.8, dash: [5, 5] });
    Lab.drawPolyline(context, sampleCurve(), currentPlot, { color: "#8ac7ff", width: 4 });
    points.forEach((point, index) => Lab.drawPoint(context, point, currentPlot, { label: `P${index}`, fill: index === selected ? "#ffd166" : "#ff725c", radius: index === selected ? 9 : 7 }));
  }

  function drawBasis(context, width, height) {
    const plot = Lab.plotRect(width, height, { left: 46, right: 20, top: 18, bottom: 38 });
    Lab.drawGrid(context, plot);
    if (points.length < 2) return;
    const degree = points.length - 1;
    for (let basisIndex = 0; basisIndex <= degree; basisIndex += 1) {
      const samples = Array.from({ length: 151 }, (_, index) => {
        const parameter = index / 150;
        return { x: parameter, y: bernstein(basisIndex, degree, parameter) };
      });
      Lab.drawPolyline(context, samples, plot, { color: Lab.palette[basisIndex % Lab.palette.length], width: 2.5 });
    }
  }

  const curveView = Lab.createCanvas(canvas, drawCurve);
  const basisView = Lab.createCanvas(basisCanvas, drawBasis);

  function pointMatrixPython() {
    if (!points.length) return "np.empty((0, 2), dtype=float)";
    return `np.array([\n    ${Lab.formatPointRows(points)}\n], dtype=float)`;
  }

  function pointMatrixMatlab() {
    if (!points.length) return "zeros(0, 2)";
    return `[\n    ${points.map((point) => `${Lab.formatNumber(point.x)} ${Lab.formatNumber(point.y)}`).join(";\n    ")}\n]`;
  }

  function pythonCode() {
    return `import math
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import ConvexHull, QhullError

control = ${pointMatrixPython()}
if len(control) < 2:
    raise ValueError("Add at least two control points")
degree = len(control) - 1

def de_casteljau(t):
    work = control.copy()
    for level in range(1, len(control)):
        work[:-level] = (1 - t) * work[:-level] + t * work[1:len(control)-level+1]
    return work[0]

def bernstein(i, n, t):
    return math.comb(n, i) * t**i * (1 - t)**(n - i)

t = np.linspace(0.0, 1.0, 301)
curve = np.vstack([de_casteljau(value) for value in t])
basis = np.array([[bernstein(i, degree, value) for value in t]
                  for i in range(degree + 1)])

figure, axes = plt.subplots(1, 2, figsize=(11, 4))
axes[0].plot(curve[:,0], curve[:,1], linewidth=2)
axes[0].plot(control[:,0], control[:,1], "o--", label="control polygon")
if len(control) >= 3:
    try:
        vertices = ConvexHull(control).vertices
    except QhullError:
        order = np.lexsort((control[:,1], control[:,0]))
        vertices = order[[0, -1]]
    cycle = np.r_[vertices, vertices[0]]
    axes[0].plot(control[cycle,0], control[cycle,1], ":", label="convex hull")
axes[0].axis("equal"); axes[0].grid(True); axes[0].legend()
for i in range(degree + 1):
    axes[1].plot(t, basis[i], label=f"B_{i}^{degree}")
axes[1].set_xlim(0, 1); axes[1].set_ylim(0, 1.05)
axes[1].grid(True); axes[1].legend()
plt.show()`;
  }

  function matlabCode() {
    return `control = ${pointMatrixMatlab()};
if size(control, 1) < 2
    error('Add at least two control points');
end
degree = size(control, 1) - 1;
t = linspace(0, 1, 301);
curve = zeros(numel(t), 2);
basis = zeros(degree + 1, numel(t));

for k = 1:numel(t)
    curve(k,:) = deCasteljau(control, t(k));
    for i = 0:degree
        basis(i+1,k) = nchoosek(degree,i) * t(k)^i * (1-t(k))^(degree-i);
    end
end

tiledlayout(1,2);
nexttile; plot(curve(:,1), curve(:,2), 'LineWidth', 2); hold on;
plot(control(:,1), control(:,2), 'o--');
if size(control,1) >= 3
    try
        hull = convhull(control(:,1), control(:,2));
    catch
        [~, order] = sortrows(control, [1 2]);
        hull = order([1 end 1]);
    end
    plot(control(hull,1), control(hull,2), ':');
end
axis equal; grid on; legend('Bézier curve','control polygon','convex hull');
nexttile; plot(t, basis, 'LineWidth', 1.5);
xlim([0 1]); ylim([0 1.05]); grid on;

function point = deCasteljau(control, t)
    work = control;
    count = size(control,1);
    for level = 1:count-1
        work(1:count-level,:) = (1-t)*work(1:count-level,:) ...
            + t*work(2:count-level+1,:);
    end
    point = work(1,:);
end`;
  }

  const codePane = Lab.createCodePane({ generators: { python: pythonCode, matlab: matlabCode }, pythonFilename: "bezier.py", matlabFilename: "bezier.m" });

  function renderLegend() {
    basisLegend.replaceChildren();
    const degree = Math.max(0, points.length - 1);
    points.forEach((_, index) => {
      const item = document.createElement("span");
      item.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.setProperty("--swatch", Lab.palette[index % Lab.palette.length]);
      const label = document.createElement("span");
      label.textContent = `B${index},${degree}`;
      item.append(swatch, label);
      basisLegend.append(item);
    });
  }

  function updateStatus(message) {
    if (message) {
      status.textContent = message;
      return;
    }
    if (points.length < 2) {
      status.textContent = `Add ${2 - points.length} more control point${points.length === 1 ? "" : "s"} to construct a Bézier curve.`;
      return;
    }
    const selectedCopy = selected >= 0 ? ` Selected P${selected}: (${Lab.formatNumber(points[selected].x)}, ${Lab.formatNumber(points[selected].y)}).` : "";
    status.textContent = `${points.length} control points define a degree ${points.length - 1} Bézier curve.${selectedCopy}`;
  }

  function render(message) {
    curveView.redraw();
    basisView.redraw();
    codePane.render();
    degreeLabel.textContent = points.length >= 2 ? `Degree ${points.length - 1}` : "Add two points";
    renderLegend();
    updateStatus(message);
  }

  canvas.addEventListener("pointerdown", (event) => {
    const screen = Lab.eventPosition(canvas, event);
    const hit = Lab.nearestPoint(points, screen, currentPlot);
    if (hit >= 0) {
      dragging = hit;
      selected = hit;
    } else if (points.length < 12 && screen.x >= currentPlot.left && screen.x <= currentPlot.right && screen.y >= currentPlot.top && screen.y <= currentPlot.bottom) {
      points.push(Lab.screenToWorld(screen, currentPlot));
      dragging = points.length - 1;
      selected = dragging;
    } else {
      updateStatus(points.length >= 12 ? "The lab is limited to twelve control points so the basis graph remains readable." : undefined);
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

  showPolygon.addEventListener("change", () => render());
  showHull.addEventListener("change", () => render());
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
