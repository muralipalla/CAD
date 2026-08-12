const canvas = document.querySelector("[data-pattern-canvas]");
const context = canvas?.getContext("2d");
const inputs = Object.fromEntries([...document.querySelectorAll("[data-input]")].map((input) => [input.dataset.input, input]));
const codeNode = document.querySelector("[data-code]");
const stepNode = document.querySelector("[data-step]");
const captionNode = document.querySelector("[data-caption]");
const copyButton = document.querySelector("[data-copy]");

function readNumber(input, fallback) {
  if (!input || input.value.trim() === "") return fallback;
  const number = Number(input?.value);
  return Number.isFinite(number) ? number : fallback;
}

function values() {
  const count = Math.round(Math.min(16, Math.max(3, readNumber(inputs.count, 6))));
  const radius = Math.min(90, Math.max(20, readNumber(inputs.radius, 60)));
  const diameter = Math.min(24, Math.max(4, readNumber(inputs.diameter, 12)));
  const rotation = ((readNumber(inputs.rotation, 0) % 360) + 360) % 360;
  return { count, radius, diameter, rotation };
}

function codeFor({ count, radius, diameter, rotation }) {
  return `from math import cos, sin, radians\n\ncount = ${count}\nradius = ${radius}\nhole_diameter = ${diameter}\nstart_angle = ${rotation}\nstep = 360 / count\n\npoints = []\nfor index in range(count):\n    angle = radians(start_angle + index * step)\n    x = radius * cos(angle)\n    y = radius * sin(angle)\n    points.append((x, y))\n\n# Use each point as a hole centre\nprint(points)`;
}

function drawPattern(settings) {
  if (!context || !canvas) return;
  const { count, radius, diameter, rotation } = settings;
  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2 - 5;
  const scale = 2.7;
  const patternRadius = radius * scale;
  const holeRadius = Math.max(6, diameter * scale / 2);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(0.5, 0.5);

  context.strokeStyle = "rgba(255,255,255,0.22)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(70, centreY);
  context.lineTo(canvas.width - 70, centreY);
  context.moveTo(centreX, 55);
  context.lineTo(centreX, canvas.height - 55);
  context.stroke();

  context.strokeStyle = "rgba(255,178,158,0.58)";
  context.lineWidth = 2;
  context.setLineDash([9, 8]);
  context.beginPath();
  context.arc(centreX, centreY, patternRadius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#ffb29e";
  context.beginPath();
  context.arc(centreX, centreY, 5, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < count; index += 1) {
    const angleDegrees = rotation + index * (360 / count);
    const angle = angleDegrees * Math.PI / 180;
    const x = centreX + patternRadius * Math.cos(angle);
    const y = centreY - patternRadius * Math.sin(angle);
    context.fillStyle = index === 0 ? "#f05b3f" : "#8ac7ff";
    context.strokeStyle = "rgba(255,255,255,0.92)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(x, y, holeRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "white";
    context.font = "800 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index), x, y);
  }

  const firstAngle = rotation * Math.PI / 180;
  const firstX = centreX + patternRadius * Math.cos(firstAngle);
  const firstY = centreY - patternRadius * Math.sin(firstAngle);
  context.strokeStyle = "#ffb29e";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(centreX, centreY);
  context.lineTo(firstX, firstY);
  context.stroke();
  context.fillStyle = "#ffcfbf";
  context.font = "800 15px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(`r = ${radius} mm`, (centreX + firstX) / 2, (centreY + firstY) / 2 - 12);
  context.restore();
}

function update({ normalize = false } = {}) {
  const settings = values();
  if (normalize) {
    inputs.count.value = settings.count;
    inputs.radius.value = settings.radius;
    inputs.diameter.value = settings.diameter;
    inputs.rotation.value = settings.rotation;
  }
  const step = 360 / settings.count;
  stepNode.textContent = `${Number(step.toFixed(1))}°`;
  captionNode.textContent = `${settings.count} holes · radius ${settings.radius} mm · diameter ${settings.diameter} mm`;
  codeNode.textContent = codeFor(settings);
  drawPattern(settings);
}

for (const input of Object.values(inputs)) {
  input.addEventListener("input", () => update());
  input.addEventListener("change", () => update({ normalize: true }));
}

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(codeNode.textContent);
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Select code to copy";
  }
  window.setTimeout(() => {
    copyButton.textContent = "Copy code";
  }, 1800);
});

update();
