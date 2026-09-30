const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowDir = path.join(__dirname, "../cad-modules/cad-workflow");
const { calculateRule1, centerlineOffset } = require(path.join(workflowDir, "mbd-rule1.js"));

test("fixed Ø20.00 sections have a 0.10 mm radial gap to the Ø20.20 MMC envelope", () => {
  const ideal = calculateRule1(0);
  assert.equal(ideal.localDiameter, 20.00);
  assert.deepEqual([ideal.sizeMin, ideal.sizeMax, ideal.mmcDiameter], [19.80, 20.20, 20.20]);
  assert.equal(ideal.radialClearance, 0.10);
  assert.equal(ideal.peakRadius, 10.00);
  assert.equal(ideal.envelopeGap, 0.10);
  assert.equal(ideal.envelopePasses, true);
  assert.equal(ideal.sizeOnlyPasses, true);
});

test("cosine bow reaches the Rule #1 envelope at A = 0.10 mm", () => {
  const below = calculateRule1(0.09);
  const touch = calculateRule1(0.10);
  const outside = calculateRule1(0.11);
  assert.equal(below.envelopePasses, true);
  assert.equal(below.envelopeGap, 0.01);
  assert.equal(touch.envelopePasses, true);
  assert.equal(touch.envelopeGap, 0);
  assert.equal(touch.requiredEnvelopeDiameter, 20.20);
  assert.equal(outside.envelopePasses, false);
  assert.equal(outside.outsideEnvelope, 0.01);
  assert.equal(outside.requiredEnvelopeDiameter, 20.22);
  assert.equal(calculateRule1(0.30).outsideEnvelope, 0.20);
});

test("independency keeps the size result separate from the comparison envelope", () => {
  const independent = calculateRule1(0.30, "independency");
  assert.equal(independent.sizeOnlyPasses, true);
  assert.equal(independent.envelopePasses, false);
  assert.equal(independent.wholeFeatureEnvelopeRequired, false);
  assert.equal(calculateRule1(0.30, "envelope").wholeFeatureEnvelopeRequired, true);
  assert.equal(independent.localDiameter, 20.00);
  assert.ok(independent.visualMinRadius < independent.visualRadius);
  assert.ok(independent.visualMaxRadius > independent.visualRadius);
  assert.equal(Number(independent.visualMinRadius.toFixed(2)), 0.86);
  assert.equal(Number(independent.visualMaxRadius.toFixed(2)), 1.14);
});

test("exaggerated 3D geometry preserves the physical contact threshold", () => {
  const m = calculateRule1(0.10);
  assert.equal(m.visualExaggeration, 14);
  assert.ok(Math.abs(m.visualRadius + m.visualBowAmplitude - m.visualEnvelopeRadius) < 1e-12);
  assert.ok(calculateRule1(0.09).visualRadius + calculateRule1(0.09).visualBowAmplitude < m.visualEnvelopeRadius);
  assert.ok(calculateRule1(0.11).visualRadius + calculateRule1(0.11).visualBowAmplitude > m.visualEnvelopeRadius);
  assert.equal(centerlineOffset(0.24, 0), 0.24);
  assert.equal(centerlineOffset(0.24, 0.5), -0.24);
  assert.ok(Math.abs(centerlineOffset(0.24, 0.25)) < 1e-12);
  assert.equal(centerlineOffset(0.24, 1), 0.24);
});

test("amplitude and principle inputs are validated", () => {
  for (const value of [-0.01, 0.31, Infinity, NaN, "bad"]) {
    assert.throws(() => calculateRule1(value), RangeError);
  }
  assert.throws(() => calculateRule1(0.1, "MMC"), RangeError);
});

test("self-contained lesson includes principle controls, one bow slider, and accessible 3D fallback", () => {
  const js = fs.readFileSync(path.join(workflowDir, "mbd-rule1.js"), "utf8");
  const css = fs.readFileSync(path.join(workflowDir, "mbd-rule1.css"), "utf8");
  assert.match(js, /\.rule1-lab\[data-rule1-lab\]/);
  assert.match(js, /value="envelope" checked data-rule1-principle/);
  assert.match(js, /value="independency" data-rule1-principle/);
  assert.equal((js.match(/type="range"/g) || []).length, 1);
  assert.match(js, /min="0" max="0\.30" step="0\.01" value="0"/);
  assert.match(js, /aria-live="polite"/);
  assert.match(js, /data-rule1-fallback hidden/);
  assert.match(js, /data-rule1-reset/);
  assert.match(js, /makeLocalSizeGuide\(T, model, model\.visualMinRadius, 0x3e72a8\)/);
  assert.match(js, /makeLocalSizeGuide\(T, model, model\.visualMaxRadius, 0x0b888d\)/);
  assert.match(js, /centerlineOffset\(amplitude, fraction\)/);
  assert.match(js, /makeLocalSizeBand\(T, model\)/);
  assert.doesNotMatch(js, /REFERENCE_OFFSET|makeReferenceLabel|CanvasTexture/);
  assert.match(js, /model\.principle === "envelope" && radialReach > outsideThreshold/);
  assert.match(js, /model\.principle === "envelope" && Math\.hypot\(x, z\) > model\.visualEnvelopeRadius/);
  assert.match(js, /data-rule1-iso-legend hidden/);
  assert.match(js, /data-rule1-iso-metrics hidden/);
  assert.match(js, /data-rule1-envelope-metrics/);
  assert.match(js, /They compare local diameters, not whole-feature straightness/);
  assert.match(js, /: "not-applicable"/);
  assert.doesNotMatch(js, /data-rule1-fullscreen|requestFullscreen/);
  assert.match(js, /zero room for form deviation/);
  assert.match(js, /Passing this simplified size check does not establish full part conformance/);
  assert.match(css, /\.rule1-lab__layout/);
  assert.match(css, /\.rule1-lab__layout \{ display: grid; grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.rule1-lab__controls \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /:fullscreen/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /\.rule1-lab \[hidden\] \{ display: none !important; \}/);
  assert.match(css, /\.rule1-lab\[data-principle="envelope"\]\[data-envelope="outside"\] \.rule1-lab__metrics/);
  assert.doesNotMatch(css, /\.rule1-lab\[data-envelope="outside"\] \.rule1-lab__metrics/);
});
