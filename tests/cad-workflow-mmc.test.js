const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { calculateMmc, buildSvg } = require("../cad-modules/cad-workflow/mbd-mmc.js");
const workflowDir = path.resolve(__dirname, "../cad-modules/cad-workflow");

test("hole bonus and total position tolerance increase as actual size departs from MMC", () => {
  const atMmc = calculateMmc(10.00);
  const specimen = calculateMmc(10.25);
  const atLmc = calculateMmc(10.40);

  assert.deepEqual([atMmc.bonusTolerance, atMmc.totalTolerance, atMmc.maxCenterShift], [0, 0.4, 0.2]);
  assert.deepEqual([specimen.bonusTolerance, specimen.totalTolerance, specimen.maxCenterShift], [0.25, 0.65, 0.325]);
  assert.deepEqual([atLmc.bonusTolerance, atLmc.totalTolerance, atLmc.maxCenterShift], [0.4, 0.8, 0.4]);
  assert.equal(atMmc.virtualCondition, 9.6);
  assert.equal(specimen.virtualCondition, 9.6);
  assert.equal(atLmc.virtualCondition, 9.6);
  assert.equal(specimen.illustrativePositionError, 0.3);
  assert.equal(specimen.illustrativePasses, true);
});

test("MMC and LMC reverse bonus direction and fixed VC side for internal and external features", () => {
  const cases = [
    ["hole", "MMC", 0.25, 0.65, 9.6, "inner"],
    ["hole", "LMC", 0.15, 0.55, 10.8, "outer"],
    ["slot", "MMC", 0.25, 0.65, 9.6, "inner"],
    ["slot", "LMC", 0.15, 0.55, 10.8, "outer"],
    ["shaft", "MMC", 0.15, 0.55, 10.8, "outer"],
    ["shaft", "LMC", 0.25, 0.65, 9.6, "inner"]
  ];
  for (const [feature, condition, bonus, total, vc, role] of cases) {
    const model = calculateMmc(10.25, feature, condition);
    assert.deepEqual([model.bonusTolerance, model.totalTolerance, model.virtualCondition, model.boundaryRole],
      [bonus, total, vc, role], `${feature} at ${condition}`);
    assert.equal(model.virtualCondition, calculateMmc(10.00, feature, condition).virtualCondition);
    assert.equal(model.virtualCondition, calculateMmc(10.40, feature, condition).virtualCondition);
    assert.equal(model.totalTolerance, model.statedPosition + model.bonusTolerance);
  }
  assert.equal(calculateMmc(10.25, "slot", "MMC").sizeSymbol, "");
  assert.equal(calculateMmc(10.25, "shaft", "MMC").sizeSymbol, "⌀");
});

test("actual specimen size is restricted to the stated size limits", () => {
  for (const size of [9.99, 10.41, Infinity, NaN, "not a size"]) {
    assert.throws(() => calculateMmc(size), RangeError);
  }
  assert.throws(() => calculateMmc(10.25, "block", "MMC"), RangeError);
  assert.throws(() => calculateMmc(10.25, "hole", "RFS"), RangeError);
});

test("MMC drawing shares a scale for the hole, gauge, and allowable center shift", () => {
  const atMmc = buildSvg(calculateMmc(10.00));
  const specimen = buildSvg(calculateMmc(10.25));
  const atLmc = buildSvg(calculateMmc(10.40));

  // 50 viewBox units/mm: fixed Ø9.60 gauge => r240, specimen Ø10.25 => r256.25.
  assert.match(atMmc, /class="mmc-lab__hole" cx="347\.5" cy="290" r="250"/);
  assert.match(specimen, /class="mmc-lab__hole" cx="347\.5" cy="290" r="256\.25"/);
  assert.match(atLmc, /class="mmc-lab__hole" cx="347\.5" cy="290" r="260"/);
  for (const svg of [atMmc, specimen, atLmc]) {
    assert.match(svg, /class="mmc-lab__gauge-edge" cx="340" cy="290" r="240"/);
    assert.match(svg, /class="mmc-lab__true-center"/);
    assert.match(svg, /class="mmc-lab__actual-center" cx="347\.5"/);
    assert.match(svg, /role="img" aria-label="Exact-scale plan view/);
  }
  assert.match(atMmc, /class="mmc-lab__zone" cx="340" cy="290" r="10"/);
  assert.match(specimen, /class="mmc-lab__zone" cx="340" cy="290" r="16\.25"/);
  assert.match(atLmc, /class="mmc-lab__zone" cx="340" cy="290" r="20"/);
});

test("LMC drawing moves the fixed VC to the outer side for holes and to the inner side for shafts", () => {
  const hole = buildSvg(calculateMmc(10.25, "hole", "LMC"));
  const shaft = buildSvg(calculateMmc(10.25, "shaft", "LMC"));
  assert.match(hole, /class="mmc-lab__hole" cx="347\.5" cy="290" r="256\.25"/);
  assert.match(hole, /class="mmc-lab__gauge-edge" cx="340" cy="290" r="270"/);
  assert.match(hole, /outer virtual-condition boundary 10\.80 millimetres/);
  assert.match(shaft, /class="mmc-lab__shaft" cx="347\.5" cy="290" r="256\.25"/);
  assert.match(shaft, /class="mmc-lab__gauge-edge" cx="340" cy="290" r="240"/);
  assert.match(shaft, /inner virtual-condition boundary 9\.60 millimetres/);
});

test("slot view uses uncapped parallel walls and planes rather than a circular zone", () => {
  const mmc = buildSvg(calculateMmc(10.25, "slot", "MMC"));
  const lmc = buildSvg(calculateMmc(10.25, "slot", "LMC"));
  assert.match(mmc, /class="mmc-lab__slot-opening" x="91\.25" y="-20" width="512\.5" height="620"/);
  assert.equal((mmc.match(/class="mmc-lab__actual-wall"/g) || []).length, 2);
  assert.equal((mmc.match(/class="mmc-lab__gauge-edge"/g) || []).length, 2);
  assert.match(mmc, /class="mmc-lab__actual-wall" x1="91\.25" y1="-20" x2="91\.25" y2="600"/);
  assert.match(mmc, /class="mmc-lab__gauge-edge" x1="100"/);
  assert.match(lmc, /class="mmc-lab__gauge-edge" x1="70"/);
  assert.match(mmc, /class="mmc-lab__zone-fill" x="323\.75" y="-20" width="32\.5"/);
  assert.doesNotMatch(mmc, /<circle/);
  assert.match(mmc, /Slot ends are not shown or controlled/);
});

test("the self-contained lesson provides one accessible specimen-size slider", () => {
  const js = fs.readFileSync(path.join(workflowDir, "mbd-mmc.js"), "utf8");
  const css = fs.readFileSync(path.join(workflowDir, "mbd-mmc.css"), "utf8");
  assert.equal((js.match(/type="range"/g) || []).length, 1);
  assert.match(js, /min="10" max="10\.4" step="0\.01" value="10\.25"/);
  assert.match(js, /aria-describedby=/);
  assert.match(js, /aria-live="polite"/);
  assert.match(js, /input\.addEventListener\("input", render\)/);
  assert.match(js, /featureInput\.addEventListener\("change"/);
  assert.match(js, /conditionInput\.addEventListener\("change", render\)/);
  assert.match(js, /data-mmc-feature/);
  assert.match(js, /data-mmc-condition/);
  assert.match(js, /\.mmc-lab\[data-mmc-lab\]/);
  assert.match(css, /\.mmc-lab__layout/);
  assert.match(css, /\.mmc-lab__selectors/);
  assert.match(css, /@media \(max-width: 800px\)/);
});
