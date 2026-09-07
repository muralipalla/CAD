const canvas = document.querySelector("[data-sketch-canvas]");
const context = canvas?.getContext("2d");
const controls = [...document.querySelectorAll("[data-constraint]")];
const resetButton = document.querySelector("[data-reset]");
const dofNode = document.querySelector("[data-dof]");
const statusPanel = document.querySelector("[data-status-panel]");
const statusTitle = document.querySelector("[data-status-title]");
const statusCopy = document.querySelector("[data-status-copy]");

const dofWeights = {
  orientation: 3,
  origin: 2,
  width: 1,
  height: 1,
};

// Match one rem on screen even when the fixed-coordinate drawing is resized.
function labelSize() {
  const displayedWidth = canvas.getBoundingClientRect().width || canvas.width;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) * canvas.width / displayedWidth;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function arrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dimension(ctx, x1, y1, x2, y2, label, vertical = false) {
  ctx.save();
  ctx.strokeStyle = "#ffb29e";
  ctx.fillStyle = "#ffcfbf";
  ctx.lineWidth = 2;
  const fontSize = labelSize();
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (vertical) {
    ctx.save();
    ctx.translate(x1 - fontSize * .9, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(label, (x1 + x2) / 2, y1 - fontSize * .9);
  }
  ctx.restore();
}

function drawSketch() {
  if (!context || !canvas) return;
  const active = Object.fromEntries(controls.map((control) => [control.dataset.constraint, control.checked]));
  const complete = controls.every((control) => control.checked);
  const width = canvas.width;
  const height = canvas.height;
  const x = 190;
  const y = 145;
  const plateWidth = 380;
  const plateHeight = 230;

  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(0.5, 0.5);

  context.strokeStyle = "rgba(255, 255, 255, 0.25)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(70, height - 80);
  context.lineTo(width - 60, height - 80);
  context.moveTo(110, 55);
  context.lineTo(110, height - 40);
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.7)";
  const fontSize = labelSize();
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  context.fillText("X", width - 53, height - 74);
  context.fillText("Y", 102, 46);

  context.strokeStyle = complete ? "#6ee7bd" : "#74b9ff";
  context.fillStyle = complete ? "rgba(110,231,189,0.09)" : "rgba(116,185,255,0.08)";
  context.lineWidth = 5;
  roundedRect(context, x, y, plateWidth, plateHeight, 7);
  context.fill();
  context.stroke();

  context.strokeStyle = complete ? "#6ee7bd" : "#74b9ff";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + plateWidth / 2, y + plateHeight / 2, 42, 0, Math.PI * 2);
  context.stroke();

  const points = [[x, y], [x + plateWidth, y], [x + plateWidth, y + plateHeight], [x, y + plateHeight]];
  for (const [pointX, pointY] of points) {
    context.fillStyle = complete ? "#6ee7bd" : "#ff725c";
    context.beginPath();
    context.arc(pointX, pointY, 7, 0, Math.PI * 2);
    context.fill();
  }

  if (active.origin) {
    context.fillStyle = "#ffb29e";
    context.font = `800 ${fontSize}px system-ui, sans-serif`;
    context.save();
    context.textAlign = "center";
    context.fillText("origin fixed", x + plateWidth / 2, y + plateHeight + fontSize * 2);
    context.restore();
    context.beginPath();
    context.arc(x, y + plateHeight, 12, 0, Math.PI * 2);
    context.strokeStyle = "#ffb29e";
    context.lineWidth = 2;
    context.stroke();
  } else {
    arrow(context, x - 65, y + plateHeight + 28, x - 5, y + plateHeight + 4, "rgba(255,255,255,0.65)");
  }

  if (active.width) {
    dimension(context, x, y - 45, x + plateWidth, y - 45, "80 mm");
  } else {
    arrow(context, x + 80, y - 28, x + 170, y - 28, "rgba(255,255,255,0.62)");
  }

  if (active.height) {
    dimension(context, x - 48, y, x - 48, y + plateHeight, "50 mm", true);
  } else {
    arrow(context, x - 28, y + 65, x - 28, y + 145, "rgba(255,255,255,0.62)");
  }

  if (active.orientation) {
    context.fillStyle = "#ffcfbf";
    context.font = `800 ${fontSize}px system-ui, sans-serif`;
    context.fillText("H", x + plateWidth / 2 - fontSize * .35, y + plateHeight + fontSize);
    context.fillText("V", x + plateWidth + 22, y + plateHeight / 2 + 5);
  } else {
    context.save();
    context.translate(x + plateWidth + 58, y + 20);
    context.rotate(-0.25);
    context.strokeStyle = "rgba(255,255,255,0.62)";
    context.setLineDash([6, 6]);
    context.beginPath();
    context.arc(0, 0, 35, 0, Math.PI * 1.25);
    context.stroke();
    context.restore();
  }

  context.restore();
}

function update() {
  const removed = controls.reduce((sum, control) => sum + (control.checked ? dofWeights[control.dataset.constraint] : 0), 0);
  const remaining = Math.max(0, 7 - removed);
  const complete = remaining === 0;
  dofNode.textContent = remaining;
  statusPanel.classList.toggle("complete", complete);
  statusTitle.textContent = complete ? "Fully constrained" : "Under-constrained";
  statusCopy.textContent = complete
    ? "The grouped design decisions now define the profile."
    : `${remaining} grouped degree${remaining === 1 ? "" : "s"} of freedom remain${remaining === 1 ? "s" : ""}.`;
  drawSketch();
}

for (const control of controls) {
  control.addEventListener("change", update);
}

resetButton?.addEventListener("click", () => {
  for (const control of controls) control.checked = false;
  update();
  controls[0]?.focus();
});

update();
if (canvas) {
  const observer = new ResizeObserver(drawSketch);
  observer.observe(canvas);
  window.addEventListener("pagehide", (event) => { if (!event.persisted) observer.disconnect(); });
}
