/* A deliberately separate material-condition lesson for features of size at position. */
(function (global) {
  "use strict";

  const FEATURES = Object.freeze({
    hole: { label: "Hole", type: "internal", sizeName: "diameter", symbol: "⌀", min: 10.00, max: 10.40, initial: 10.25 },
    slot: { label: "Slot", type: "internal", sizeName: "width", symbol: "", min: 10.00, max: 10.40, initial: 10.25 },
    shaft: { label: "Shaft", type: "external", sizeName: "diameter", symbol: "⌀", min: 10.00, max: 10.40, initial: 10.25 }
  });
  const STATED_POSITION = 0.40;
  const ILLUSTRATIVE_OFFSET = 0.15;
  const SVG_SCALE = 50; // One millimetre is 50 SVG viewBox units in every circle and shift.
  const SVG_CENTER = { x: 340, y: 290 };
  let instanceCount = 0;

  function rounded(value, places) {
    return Number(value.toFixed(places));
  }

  function format(value, places = 2) {
    return value.toFixed(places);
  }

  function calculateMmc(actualSize, feature = "hole", condition = "MMC") {
    const spec = FEATURES[feature];
    if (!spec) throw new RangeError("Feature must be a hole, slot, or shaft.");
    if (condition !== "MMC" && condition !== "LMC") throw new RangeError("Condition must be MMC or LMC.");
    const size = Number(actualSize);
    if (!Number.isFinite(size) || size < spec.min - 1e-9 || size > spec.max + 1e-9) {
      throw new RangeError(`Actual ${feature} ${spec.sizeName} must be between ${format(spec.min)} and ${format(spec.max)} mm.`);
    }
    const internal = spec.type === "internal";
    const mmcSize = internal ? spec.min : spec.max;
    const lmcSize = internal ? spec.max : spec.min;
    const materialSize = condition === "MMC" ? mmcSize : lmcSize;
    const actual = rounded(size, 2);
    const bonus = rounded(Math.abs(actual - materialSize), 2);
    const total = rounded(STATED_POSITION + bonus, 2);
    const boundaryRole = (condition === "MMC") === internal ? "inner" : "outer";
    const virtualCondition = rounded(materialSize + (boundaryRole === "outer" ? STATED_POSITION : -STATED_POSITION), 2);
    const maxCenterShift = rounded(total / 2, 3);
    const positionError = rounded(2 * ILLUSTRATIVE_OFFSET, 2);
    return {
      feature,
      featureLabel: spec.label,
      featureType: spec.type,
      sizeName: spec.sizeName,
      sizeSymbol: spec.symbol,
      sizeMin: spec.min,
      sizeMax: spec.max,
      condition,
      actualSize: actual,
      mmcSize,
      lmcSize,
      materialSize,
      statedPosition: STATED_POSITION,
      bonusTolerance: bonus,
      totalTolerance: total,
      virtualCondition,
      boundaryRole,
      maxCenterShift,
      illustrativeCenterOffset: ILLUSTRATIVE_OFFSET,
      illustrativePositionError: positionError,
      illustrativePasses: positionError <= total + 1e-9
    };
  }

  function buildSvg(model) {
    const { x, y } = SVG_CENTER;
    const actualX = x + model.illustrativeCenterOffset * SVG_SCALE;
    const boundaryText = `${model.boundaryRole} virtual-condition boundary`;
    const shiftText = model.feature === "slot" ? "median plane" : "axis";
    const description = `Exact-scale plan view of an ideal ${model.feature}. Actual ${model.sizeName} ${format(model.actualSize)} millimetres; red fixed ${boundaryText} ${format(model.virtualCondition)} millimetres. Teal position zone allows the ${shiftText} to shift ${format(model.maxCenterShift, 3)} millimetres either side of true position. The specimen is ${format(model.illustrativeCenterOffset)} millimetres right of true position.${model.feature === "slot" ? " Slot ends are not shown or controlled." : ""}`;
    const opening = model.featureType === "internal";
    const boundaryHalf = model.virtualCondition * SVG_SCALE / 2;
    const actualHalf = model.actualSize * SVG_SCALE / 2;
    const zoneHalf = model.totalTolerance * SVG_SCALE / 2;
    let drawing;

    if (model.feature === "slot") {
      // Extend every wall/plane beyond the viewBox: no illustrated slot end is controlled.
      const yTop = -20;
      const yBottom = 600;
      drawing = `<rect class="mmc-lab__material" x="0" y="0" width="680" height="580" rx="20"/>
        <rect class="mmc-lab__slot-opening" x="${actualX - actualHalf}" y="${yTop}" width="${actualHalf * 2}" height="${yBottom - yTop}"/>
        <rect class="mmc-lab__zone-fill" x="${x - zoneHalf}" y="${yTop}" width="${zoneHalf * 2}" height="${yBottom - yTop}"/>
        <line class="mmc-lab__actual-wall" x1="${actualX - actualHalf}" y1="${yTop}" x2="${actualX - actualHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__actual-wall" x1="${actualX + actualHalf}" y1="${yTop}" x2="${actualX + actualHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__gauge-edge" x1="${x - boundaryHalf}" y1="${yTop}" x2="${x - boundaryHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__gauge-edge" x1="${x + boundaryHalf}" y1="${yTop}" x2="${x + boundaryHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__zone-edge" x1="${x - zoneHalf}" y1="${yTop}" x2="${x - zoneHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__zone-edge" x1="${x + zoneHalf}" y1="${yTop}" x2="${x + zoneHalf}" y2="${yBottom}"/>
        <line class="mmc-lab__true-median" x1="${x}" y1="${yTop}" x2="${x}" y2="${yBottom}"/>
        <line class="mmc-lab__actual-median" x1="${actualX}" y1="${yTop}" x2="${actualX}" y2="${yBottom}"/>`;
    } else {
      drawing = `<rect class="${opening ? "mmc-lab__material" : "mmc-lab__clearance"}" x="0" y="0" width="680" height="580" rx="20"/>
        <circle class="${opening ? "mmc-lab__hole" : "mmc-lab__shaft"}" cx="${actualX}" cy="${y}" r="${actualHalf}"/>
        <circle class="mmc-lab__gauge-edge" cx="${x}" cy="${y}" r="${boundaryHalf}"/>
        <circle class="mmc-lab__zone" cx="${x}" cy="${y}" r="${zoneHalf}"/>
        <line class="mmc-lab__offset" x1="${x}" y1="${y}" x2="${actualX}" y2="${y}"/>
        <path class="mmc-lab__true-center" d="M ${x - 20} ${y} h 40 M ${x} ${y - 20} v 40"/>
        <circle class="mmc-lab__actual-center" cx="${actualX}" cy="${y}" r="4.5"/>`;
    }

    return `<svg class="mmc-lab__svg" viewBox="0 0 680 580" role="img" aria-label="${description}">${drawing}</svg>`;
  }

  function mountMmcLab(root) {
    if (!root || root.dataset.mmcMounted === "true") return;
    root.dataset.mmcMounted = "true";
    const inputId = `mmc-actual-size-${++instanceCount}`;
    const featureId = `${inputId}-feature`;
    const conditionId = `${inputId}-condition`;
    root.innerHTML = `<div class="mmc-lab__layout">
      <div class="mmc-lab__visual">
        <div class="mmc-lab__visual-heading"><strong data-mmc-visual-heading>Plan view · hole in yellow plate</strong><span>All boundaries and offsets share one scale</span></div>
        <div data-mmc-diagram></div>
        <div class="mmc-lab__legend" aria-hidden="true">
          <span><i class="mmc-lab__swatch mmc-lab__swatch--actual"></i><span data-mmc-legend-actual>Actual hole</span></span>
          <span><i class="mmc-lab__swatch mmc-lab__swatch--gauge"></i>Fixed virtual boundary</span>
          <span><i class="mmc-lab__swatch mmc-lab__swatch--zone"></i><span data-mmc-legend-zone>Allowed center zone</span></span>
        </div>
        <p class="mmc-lab__caption" data-mmc-caption></p>
      </div>
      <div class="mmc-lab__controls">
        <p class="mmc-lab__eyebrow">Material condition · position tolerance</p>
        <div class="mmc-lab__selectors">
          <div><label for="${featureId}">Feature</label><select id="${featureId}" data-mmc-feature><option value="hole">Hole · internal</option><option value="slot">Slot · internal</option><option value="shaft">Shaft · external</option></select></div>
          <div><label for="${conditionId}">Modifier</label><select id="${conditionId}" data-mmc-condition><option value="MMC">MMC Ⓜ</option><option value="LMC">LMC Ⓛ</option></select></div>
        </div>
        <div class="mmc-lab__frame" data-mmc-frame aria-label="Position, diameter 0.40 millimetres at maximum material condition, relative to datums A, B, and C"><span>⌖</span><span data-mmc-frame-value>⌀0.40 Ⓜ</span><span>A</span><span>B</span><span>C</span></div>
        <p class="mmc-lab__limits"><span data-mmc-limits>Hole diameter limits <strong>⌀10.00–10.40 mm</strong></span><br><span data-mmc-definition>MMC is the smallest permissible hole: <strong>⌀10.00 mm</strong>.</span></p>
        <div class="mmc-lab__input-heading"><label for="${inputId}" data-mmc-actual-label>Actual specimen diameter</label><output for="${inputId}" data-mmc-actual-output>⌀10.25 mm</output></div>
        <input id="${inputId}" data-mmc-actual type="range" min="10" max="10.4" step="0.01" value="10.25" aria-describedby="${inputId}-hint">
        <div class="mmc-lab__range-ends"><span data-mmc-range-min>MMC · ⌀10.00</span><span data-mmc-range-max>LMC · ⌀10.40</span></div>
        <p class="mmc-lab__input-hint" id="${inputId}-hint" data-mmc-input-hint>Increase the hole diameter away from MMC to gain bonus tolerance. The red virtual boundary stays fixed.</p>
        <div class="mmc-lab__metrics" aria-live="polite" aria-atomic="true">
          <div><span>Bonus tolerance</span><strong data-mmc-bonus>⌀0.25 mm</strong><small data-mmc-bonus-formula>Actual size − MMC size</small></div>
          <div><span>Total position zone</span><strong data-mmc-total>⌀0.65 mm</strong><small data-mmc-total-formula>⌀0.40 + bonus</small></div>
          <div><span>Virtual condition</span><strong data-mmc-vc>⌀9.60 mm</strong><small data-mmc-vc-formula>Fixed inner boundary · MMC size − ⌀0.40</small></div>
        </div>
        <p class="mmc-lab__caution" data-mmc-caution>Basic dimensions establish true position but are omitted from this plan view. An ideal straight feature is assumed; the opposite variable resultant boundary is not plotted.</p>
      </div>
    </div>`;

    const input = root.querySelector("[data-mmc-actual]");
    const featureInput = root.querySelector("[data-mmc-feature]");
    const conditionInput = root.querySelector("[data-mmc-condition]");
    const diagram = root.querySelector("[data-mmc-diagram]");
    const output = root.querySelector("[data-mmc-actual-output]");
    const bonus = root.querySelector("[data-mmc-bonus]");
    const total = root.querySelector("[data-mmc-total]");
    const vc = root.querySelector("[data-mmc-vc]");
    const caption = root.querySelector("[data-mmc-caption]");

    function render() {
      const model = calculateMmc(input.value, featureInput.value, conditionInput.value);
      root.dataset.feature = model.feature;
      const sizeText = (value) => `${model.sizeSymbol}${format(value)}`;
      const conditionName = model.condition === "MMC" ? "maximum" : "least";
      const modifier = model.condition === "MMC" ? "Ⓜ" : "Ⓛ";
      const sizeLimitKind = model.featureType === "internal" ? "smallest" : "largest";
      const lmcLimitKind = model.featureType === "internal" ? "largest" : "smallest";
      const awayDirection = model.materialSize === model.sizeMin ? "Increase" : "Decrease";
      const formulaDirection = model.boundaryRole === "outer" ? "+" : "−";
      diagram.innerHTML = buildSvg(model);
      root.querySelector("[data-mmc-visual-heading]").textContent = `Plan view · ${model.feature === "shaft" ? "yellow shaft" : model.feature === "slot" ? "slot in yellow plate" : "hole in yellow plate"}`;
      root.querySelector("[data-mmc-legend-actual]").textContent = model.feature === "slot" ? "Actual slot walls" : `Actual ${model.feature}`;
      root.querySelector("[data-mmc-legend-zone]").textContent = model.feature === "slot" ? "Allowed median-plane zone" : "Allowed axis zone";
      const frame = root.querySelector("[data-mmc-frame]");
      frame.setAttribute("aria-label", `Position, ${model.feature === "slot" ? "width" : "diameter"} ${format(model.statedPosition)} millimetres at ${conditionName} material condition, relative to datums A, B, and C`);
      root.querySelector("[data-mmc-frame-value]").textContent = `${model.feature === "slot" ? "" : "⌀"}${format(model.statedPosition)} ${modifier}`;
      root.querySelector("[data-mmc-limits]").innerHTML = `${model.featureLabel} ${model.sizeName} limits <strong>${sizeText(model.sizeMin)}–${sizeText(model.sizeMax)} mm</strong>`;
      root.querySelector("[data-mmc-definition]").innerHTML = `MMC = ${sizeLimitKind} ${model.sizeName} ${sizeText(model.mmcSize)} mm; LMC = ${lmcLimitKind} ${model.sizeName} ${sizeText(model.lmcSize)} mm.`;
      root.querySelector("[data-mmc-actual-label]").textContent = `Actual specimen ${model.sizeName}`;
      output.value = `${sizeText(model.actualSize)} mm`;
      root.querySelector("[data-mmc-range-min]").textContent = `${model.featureType === "internal" ? "MMC" : "LMC"} · ${sizeText(model.sizeMin)}`;
      root.querySelector("[data-mmc-range-max]").textContent = `${model.featureType === "internal" ? "LMC" : "MMC"} · ${sizeText(model.sizeMax)}`;
      root.querySelector("[data-mmc-input-hint]").textContent = `${awayDirection} the ${model.sizeName} away from ${model.condition} to gain bonus tolerance. The red virtual boundary stays fixed.`;
      bonus.textContent = `${model.feature === "slot" ? "" : "⌀"}${format(model.bonusTolerance)} mm`;
      total.textContent = `${model.feature === "slot" ? "" : "⌀"}${format(model.totalTolerance)} mm`;
      vc.textContent = `${sizeText(model.virtualCondition)} mm`;
      root.querySelector("[data-mmc-bonus-formula]").textContent = model.materialSize === model.sizeMin ? `Actual ${model.sizeName} − ${model.condition} ${model.sizeName}` : `${model.condition} ${model.sizeName} − actual ${model.sizeName}`;
      root.querySelector("[data-mmc-total-formula]").textContent = `${model.feature === "slot" ? "" : "⌀"}${format(model.statedPosition)} + bonus`;
      root.querySelector("[data-mmc-vc-formula]").textContent = `Fixed ${model.boundaryRole} boundary · ${model.condition} ${model.sizeName} ${formulaDirection} ${format(model.statedPosition)}`;
      caption.textContent = model.feature === "slot"
        ? `The dark specimen median plane is ${format(model.illustrativeCenterOffset)} mm from true position, within the ±${format(model.maxCenterShift, 3)} mm allowed band between two parallel planes.`
        : `The dark specimen axis is ${format(model.illustrativeCenterOffset)} mm from true position. Its ⌀${format(model.illustrativePositionError)} mm diametrical position error fits within the ⌀${format(model.totalTolerance)} mm cylindrical zone; maximum radial axis shift is ${format(model.maxCenterShift, 3)} mm.`;
      root.querySelector("[data-mmc-caution]").textContent = `Basic dimensions establish true position but are omitted here. ${model.feature === "slot" ? "Only opposed slot walls are shown; the ends are not controlled by this example. " : ""}An ideal straight feature is assumed; the opposite variable resultant boundary is not plotted.`;
    }

    featureInput.addEventListener("change", () => {
      const spec = FEATURES[featureInput.value];
      input.min = spec.min;
      input.max = spec.max;
      input.step = "0.01";
      input.value = spec.initial;
      render();
    });
    conditionInput.addEventListener("change", render);
    input.addEventListener("input", render);
    render();
  }

  function mountAll() {
    document.querySelectorAll(".mmc-lab[data-mmc-lab]").forEach(mountMmcLab);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { calculateMmc, buildSvg };
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll, { once: true });
    else mountAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
