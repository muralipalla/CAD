/* Rule #1 and independency: one controlled bow, two distinct acceptance ideas. */
(function (global) {
  "use strict";

  const SIZE_MIN = 19.80;
  const SIZE_MAX = 20.20;
  const LOCAL_DIAMETER = 20.00;
  const MMC_DIAMETER = SIZE_MAX;
  const RADIAL_CLEARANCE = Number(((MMC_DIAMETER - LOCAL_DIAMETER) / 2).toFixed(2));
  const VISUAL_EXAGGERATION = 14;
  const VISUAL_RADIUS = 1;
  const WORLD_PER_MM = VISUAL_RADIUS / (LOCAL_DIAMETER / 2) * VISUAL_EXAGGERATION;
  const LENGTH = 4.25;
  const ANGULAR_STEPS = 128;
  const AXIAL_STEPS = 96;
  let instanceCount = 0;

  function fixed(value) { return value.toFixed(2); }

  // Every transverse section is a Ø20.00 circle. Its center makes one cosine
  // cycle along the feature, with extrema equally far from the best straight axis.
  function centerlineOffset(amplitude, axialFraction) {
    return amplitude * Math.cos(2 * Math.PI * axialFraction);
  }

  function calculateRule1(amplitude = 0, principle = "envelope") {
    if (principle !== "envelope" && principle !== "independency") {
      throw new RangeError("Principle must be envelope or independency.");
    }
    const a = Number(amplitude);
    if (!Number.isFinite(a) || a < 0 || a > 0.30) {
      throw new RangeError("Centerline bow amplitude must be from 0.00 to 0.30 mm.");
    }
    const bow = Number(a.toFixed(2));
    const peakRadius = Number((LOCAL_DIAMETER / 2 + bow).toFixed(2));
    const rawGap = RADIAL_CLEARANCE - bow;
    const gap = Math.abs(rawGap) < 1e-9 ? 0 : Number(rawGap.toFixed(2));
    const outside = Number(Math.max(0, bow - RADIAL_CLEARANCE).toFixed(2));
    const envelopePasses = bow <= RADIAL_CLEARANCE + 1e-9;
    return {
      principle,
      amplitude: bow,
      sizeMin: SIZE_MIN,
      sizeMax: SIZE_MAX,
      localDiameter: LOCAL_DIAMETER,
      mmcDiameter: MMC_DIAMETER,
      radialClearance: RADIAL_CLEARANCE,
      peakRadius,
      requiredEnvelopeDiameter: Number((2 * peakRadius).toFixed(2)),
      envelopeGap: gap,
      outsideEnvelope: outside,
      envelopePasses,
      sizeOnlyPasses: LOCAL_DIAMETER >= SIZE_MIN && LOCAL_DIAMETER <= SIZE_MAX,
      wholeFeatureEnvelopeRequired: principle === "envelope",
      visualExaggeration: VISUAL_EXAGGERATION,
      visualRadius: VISUAL_RADIUS,
      visualEnvelopeRadius: VISUAL_RADIUS + RADIAL_CLEARANCE * WORLD_PER_MM,
      visualMinRadius: VISUAL_RADIUS - (LOCAL_DIAMETER - SIZE_MIN) / 2 * WORLD_PER_MM,
      visualMaxRadius: VISUAL_RADIUS + (SIZE_MAX - LOCAL_DIAMETER) / 2 * WORLD_PER_MM,
      visualBowAmplitude: bow * WORLD_PER_MM
    };
  }

  function makeActualGeometry(T, model) {
    const positions = [];
    const colors = [];
    const indices = [];
    const yellow = new T.Color(0xffdf42);
    const red = new T.Color(0xff4050);
    const outsideThreshold = model.visualEnvelopeRadius + 1e-6;

    for (let j = 0; j <= AXIAL_STEPS; j++) {
      const fraction = j / AXIAL_STEPS;
      const y = (fraction - 0.5) * LENGTH;
      const shift = centerlineOffset(model.visualBowAmplitude, fraction);
      for (let i = 0; i <= ANGULAR_STEPS; i++) {
        const angle = 2 * Math.PI * i / ANGULAR_STEPS;
        const x = shift + VISUAL_RADIUS * Math.cos(angle);
        const z = VISUAL_RADIUS * Math.sin(angle);
        const radialReach = Math.hypot(x, z);
        const color = model.principle === "envelope" && radialReach > outsideThreshold ? red : yellow;
        positions.push(x, y, z);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let j = 0; j < AXIAL_STEPS; j++) {
      for (let i = 0; i < ANGULAR_STEPS; i++) {
        const a = j * (ANGULAR_STEPS + 1) + i;
        const b = a + ANGULAR_STEPS + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeCapGeometry(T, model, end) {
    const radialSteps = 20;
    const positions = [];
    const colors = [];
    const indices = [];
    const yellow = new T.Color(0xffdf42);
    const red = new T.Color(0xff4050);
    const shift = model.visualBowAmplitude;
    const y = end * LENGTH / 2;
    for (let j = 0; j <= radialSteps; j++) {
      const radius = VISUAL_RADIUS * j / radialSteps;
      for (let i = 0; i <= ANGULAR_STEPS; i++) {
        const angle = 2 * Math.PI * i / ANGULAR_STEPS;
        const x = shift + radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const color = model.principle === "envelope" && Math.hypot(x, z) > model.visualEnvelopeRadius + 1e-6 ? red : yellow;
        positions.push(x, y, z);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let j = 0; j < radialSteps; j++) {
      for (let i = 0; i < ANGULAR_STEPS; i++) {
        const a = j * (ANGULAR_STEPS + 1) + i;
        const b = a + ANGULAR_STEPS + 1;
        if (end > 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeBowedReferenceGeometry(T, radius, amplitude) {
    const positions = [];
    const indices = [];
    for (let j = 0; j <= AXIAL_STEPS; j++) {
      const fraction = j / AXIAL_STEPS;
      const y = (fraction - 0.5) * LENGTH;
      const shift = centerlineOffset(amplitude, fraction);
      for (let i = 0; i <= ANGULAR_STEPS; i++) {
        const angle = 2 * Math.PI * i / ANGULAR_STEPS;
        positions.push(shift + radius * Math.cos(angle), y, radius * Math.sin(angle));
      }
    }
    for (let j = 0; j < AXIAL_STEPS; j++) {
      for (let i = 0; i < ANGULAR_STEPS; i++) {
        const a = j * (ANGULAR_STEPS + 1) + i;
        const b = a + ANGULAR_STEPS + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeRing(T, radius, y, color, opacity, depthTest = true) {
    const points = [];
    for (let i = 0; i <= ANGULAR_STEPS; i++) {
      const angle = 2 * Math.PI * i / ANGULAR_STEPS;
      points.push(new T.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle)));
    }
    const geometry = new T.BufferGeometry().setFromPoints(points);
    const material = new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest });
    const ring = new T.Line(geometry, material);
    if (!depthTest) ring.renderOrder = 6;
    return ring;
  }

  function makeLocalSizeGuide(T, model, radius, color) {
    const guide = new T.Group();
    const inner = radius < model.visualRadius;
    const surface = new T.Mesh(
      makeBowedReferenceGeometry(T, radius, model.visualBowAmplitude),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: inner ? 0.06 : 0.12, side: T.DoubleSide, depthTest: !inner, depthWrite: false })
    );
    if (inner) surface.renderOrder = 3;
    guide.add(surface);
    for (const fraction of [0, 0.5, 1]) {
      const ring = makeRing(T, radius, (fraction - 0.5) * LENGTH, color, fraction === 0.5 ? 0.5 : 0.9, true);
      ring.position.x = centerlineOffset(model.visualBowAmplitude, fraction);
      guide.add(ring);
    }
    // A top-section outline remains visible through the yellow specimen.
    const topRing = makeRing(T, radius, LENGTH / 2 + 0.025, color, 0.95, false);
    topRing.position.x = model.visualBowAmplitude;
    guide.add(topRing);
    return guide;
  }

  function makeLocalSizeBand(T, model) {
    const band = new T.Mesh(
      new T.RingGeometry(model.visualMinRadius, model.visualMaxRadius, ANGULAR_STEPS),
      new T.MeshBasicMaterial({ color: 0x67bccc, transparent: true, opacity: 0.30, side: T.DoubleSide, depthTest: false, depthWrite: false })
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(model.visualBowAmplitude, LENGTH / 2 + 0.012, 0);
    band.renderOrder = 5;
    return band;
  }

  function disposeObject(object) {
    object.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
  }

  function createViewer(stage, resetButton) {
    const T = global && global.THREE;
    if (!T) return null;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (_) {
      return null;
    }
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    if ("outputColorSpace" in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    else if ("outputEncoding" in renderer && T.sRGBEncoding) renderer.outputEncoding = T.sRGBEncoding;
    renderer.domElement.setAttribute("aria-hidden", "true");
    stage.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(41, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xffffff, 0x7896a9, 1.25));
    const mainLight = new T.DirectionalLight(0xffffff, 1.15);
    mainLight.position.set(-3, 6, 6);
    scene.add(mainLight);
    const rimLight = new T.DirectionalLight(0x8ddef3, 0.55);
    rimLight.position.set(5, 1, -4);
    scene.add(rimLight);

    let specimen = null;
    let azimuth = 0.72;
    let elevation = 0.30;
    let distance = 7.5;
    let viewMode = "envelope";
    let pointer = null;
    function render() {
      camera.position.set(
        distance * Math.sin(azimuth) * Math.cos(elevation),
        distance * Math.sin(elevation),
        distance * Math.cos(azimuth) * Math.cos(elevation)
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    function resize() {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    }
    function setModel(model) {
      if (model.principle !== viewMode) {
        viewMode = model.principle;
        elevation = viewMode === "independency" ? 0.48 : 0.30;
      }
      if (specimen) {
        scene.remove(specimen);
        disposeObject(specimen);
      }
      specimen = new T.Group();
      const actual = new T.Mesh(makeActualGeometry(T, model), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }));
      specimen.add(actual);
      for (const end of [-1, 1]) {
        specimen.add(new T.Mesh(makeCapGeometry(T, model, end), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide })));
      }

      if (model.principle === "envelope") {
        // A whole-feature, perfect-form MMC boundary is required in this mode.
        specimen.add(new T.Mesh(
          new T.CylinderGeometry(model.visualEnvelopeRadius, model.visualEnvelopeRadius, LENGTH, ANGULAR_STEPS, 1, true),
          new T.MeshLambertMaterial({ color: 0x64e2f0, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false })
        ));
        for (const height of [-LENGTH / 2, 0, LENGTH / 2]) {
          specimen.add(makeRing(T, model.visualEnvelopeRadius, height, 0x087b9a, 0.95));
        }
      } else {
        // Local-size limits move with the bowed section centers, unlike Rule #1's straight MMC boundary.
        specimen.add(makeLocalSizeGuide(T, model, model.visualMinRadius, 0x3e72a8));
        specimen.add(makeLocalSizeGuide(T, model, model.visualMaxRadius, 0x0b888d));
        specimen.add(makeLocalSizeBand(T, model));
      }
      scene.add(specimen);
      render();
    }
    stage.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
      stage.focus();
    });
    stage.addEventListener("pointermove", function (event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      azimuth -= (event.clientX - pointer.x) * 0.008;
      elevation = Math.max(-1.12, Math.min(1.12, elevation + (event.clientY - pointer.y) * 0.008));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      render();
    });
    function endPointer(event) { if (pointer && pointer.id === event.pointerId) pointer = null; }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);
    stage.addEventListener("wheel", function (event) {
      event.preventDefault();
      distance = Math.max(5.4, Math.min(16, distance * (event.deltaY > 0 ? 1.1 : 0.9)));
      render();
    }, { passive: false });
    stage.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") azimuth -= 0.14;
      else if (event.key === "ArrowRight") azimuth += 0.14;
      else if (event.key === "ArrowUp") elevation = Math.min(1.12, elevation + 0.14);
      else if (event.key === "ArrowDown") elevation = Math.max(-1.12, elevation - 0.14);
      else if (event.key === "+" || event.key === "=") distance = Math.max(5.4, distance * 0.9);
      else if (event.key === "-" || event.key === "_") distance = Math.min(16, distance * 1.1);
      else return;
      event.preventDefault();
      render();
    });
    resetButton.addEventListener("click", function () {
      azimuth = 0.72;
      elevation = viewMode === "independency" ? 0.48 : 0.30;
      distance = 7.5;
      render();
    });
    if (typeof global.ResizeObserver === "function") {
      new global.ResizeObserver(resize).observe(stage);
    } else {
      global.addEventListener("resize", resize);
    }
    resize();
    return { setModel, resize };
  }

  function mountRule1Lab(root) {
    if (!root || root.dataset.rule1Mounted === "true") return;
    root.dataset.rule1Mounted = "true";
    const id = `rule1-${++instanceCount}`;
    root.innerHTML = `<div class="rule1-lab__layout">
      <div class="rule1-lab__visual">
        <div class="rule1-lab__visual-heading"><div><span class="rule1-lab__eyebrow">FORM AND SIZE · 3D STUDY</span><strong>One shaft, two interpretation rules</strong></div></div>
        <div class="rule1-lab__stage" data-rule1-stage tabindex="0" role="group" aria-label="Interactive 3D cylinder. Drag to rotate, scroll to zoom, or focus and use arrow keys to rotate and plus or minus to zoom."><div class="rule1-lab__fallback" data-rule1-fallback hidden>3D graphics are unavailable in this browser. The numerical result and explanation remain interactive.</div></div>
        <div class="rule1-lab__visual-footer"><div class="rule1-lab__legend" aria-hidden="true"><span><i class="rule1-lab__key rule1-lab__key--shaft"></i>Actual shaft</span><span data-rule1-envelope-legend><i class="rule1-lab__key rule1-lab__key--envelope"></i>Perfect MMC envelope</span><span data-rule1-envelope-legend><i class="rule1-lab__key rule1-lab__key--excess"></i>Outside envelope</span><span data-rule1-iso-legend hidden><i class="rule1-lab__key rule1-lab__key--minimum"></i>Minimum local Ø19.80</span><span data-rule1-iso-legend hidden><i class="rule1-lab__key rule1-lab__key--maximum"></i>Maximum local Ø20.20</span></div><button type="button" class="rule1-lab__reset" data-rule1-reset>Reset view</button></div>
        <p class="rule1-lab__view-note" data-rule1-boundary-note></p>
      </div>
      <div class="rule1-lab__controls">
        <div class="rule1-lab__principle-panel">
          <p class="rule1-lab__eyebrow">SELECT THE INTERPRETATION</p>
          <fieldset class="rule1-lab__choices"><legend>Size and form principle</legend>
            <label class="rule1-lab__choice"><input type="radio" name="${id}-principle" value="envelope" checked data-rule1-principle><span><strong>Envelope · ASME Rule #1</strong><small>ISO Ⓔ when explicitly specified</small></span></label>
            <label class="rule1-lab__choice"><input type="radio" name="${id}-principle" value="independency" data-rule1-principle><span><strong>Independency · ISO 8015 default</strong><small>Size and form requirements apply independently</small></span></label>
          </fieldset>
          <p class="rule1-lab__size-note">Shaft limits <strong>Ø19.80–20.20 mm</strong>. Every illustrated circular section stays <strong>Ø20.00 mm</strong>. <span data-rule1-size-envelope>At Ø20.20 mm MMC, an external shaft has <strong>zero room for form deviation</strong> under the envelope rule; this Ø20.00 mm specimen has <strong>0.10 mm radial clearance</strong>.</span><span data-rule1-size-iso hidden>The inner and outer size guides surround the same shaft and bend with its centerline. They compare local diameters, not whole-feature straightness.</span></p>
          <p class="rule1-lab__scope" data-rule1-scope></p>
        </div>
        <div class="rule1-lab__deviation-panel">
          <div class="rule1-lab__slider-head"><label for="${id}-bow">Centerline bow amplitude, A</label><output for="${id}-bow" data-rule1-amplitude>0.00 mm</output></div>
          <input id="${id}-bow" type="range" min="0" max="0.30" step="0.01" value="0" data-rule1-amplitude-input aria-describedby="${id}-bow-hint">
          <div class="rule1-lab__range-ends"><span>0.00 · ideal</span><span data-rule1-envelope-mark>0.10 · envelope contact</span><span>0.30 mm</span></div>
          <p class="rule1-lab__slider-hint" id="${id}-bow-hint">The center of each Ø20.00 section follows x(z) = A cos(2πz/L). Drag the slider to bow the shaft.</p>
          <div class="rule1-lab__metrics" data-rule1-envelope-metrics><div><span>Peak reach from best straight axis</span><strong data-rule1-peak>10.00 mm</strong></div><div><span>MMC envelope radius</span><strong>10.10 mm</strong></div><div><span>Envelope clearance / excess</span><strong data-rule1-gap>0.10 mm clearance</strong></div></div>
          <div class="rule1-lab__metrics" data-rule1-iso-metrics hidden><div><span>Illustrated local section diameter</span><strong>Ø20.00 mm</strong></div><div><span>Permitted local size range</span><strong>Ø19.80–20.20 mm</strong></div><div><span>Automatic whole-feature envelope</span><strong>Not imposed</strong></div></div>
          <div class="rule1-lab__result" data-rule1-result role="status" aria-live="polite" aria-atomic="true"><strong data-rule1-status></strong><p data-rule1-explanation></p></div>
          <p class="rule1-lab__exaggeration" data-rule1-exaggeration>Visual exaggeration: bow and envelope clearance are both drawn <strong>14×</strong> relative to the shaft radius. Their first contact still represents <strong>A = 0.10 mm</strong>.</p>
        </div>
      </div>
    </div>`;

    const amplitudeInput = root.querySelector("[data-rule1-amplitude-input]");
    const principles = [...root.querySelectorAll("[data-rule1-principle]")];
    const stage = root.querySelector("[data-rule1-stage]");
    const viewer = createViewer(stage, root.querySelector("[data-rule1-reset]"));
    if (!viewer) root.querySelector("[data-rule1-fallback]").hidden = false;
    function update() {
      const principle = principles.find((input) => input.checked).value;
      const model = calculateRule1(amplitudeInput.value, principle);
      root.dataset.principle = principle;
      root.dataset.envelope = principle === "envelope" ? (model.envelopePasses ? "inside" : "outside") : "not-applicable";
      root.querySelectorAll("[data-rule1-envelope-legend]").forEach((element) => { element.hidden = principle !== "envelope"; });
      root.querySelectorAll("[data-rule1-iso-legend]").forEach((element) => { element.hidden = principle !== "independency"; });
      root.querySelector("[data-rule1-envelope-metrics]").hidden = principle !== "envelope";
      root.querySelector("[data-rule1-iso-metrics]").hidden = principle !== "independency";
      root.querySelector("[data-rule1-size-envelope]").hidden = principle !== "envelope";
      root.querySelector("[data-rule1-size-iso]").hidden = principle !== "independency";
      root.querySelector("[data-rule1-envelope-mark]").hidden = principle !== "envelope";
      root.querySelector("[data-rule1-amplitude]").value = `${fixed(model.amplitude)} mm`;
      root.querySelector("[data-rule1-peak]").textContent = `${fixed(model.peakRadius)} mm`;
      root.querySelector("[data-rule1-gap]").textContent = model.envelopePasses
        ? `${fixed(Math.max(0, model.envelopeGap))} mm ${model.envelopeGap === 0 ? "contact" : "clearance"}`
        : `${fixed(model.outsideEnvelope)} mm outside`;
      root.querySelector("[data-rule1-boundary-note]").textContent = principle === "envelope"
        ? "The cyan surface is the perfect-form boundary at the shaft’s maximum material size. Red marks material beyond it."
        : "The blue Ø19.80 inner and teal Ø20.20 outer guides follow every bowed section. The top annular band shows the permitted local-size interval; these are not straight global envelopes.";
      root.querySelector("[data-rule1-exaggeration]").innerHTML = principle === "envelope"
        ? "Visual exaggeration: bow and envelope clearance are both drawn <strong>14×</strong> relative to the shaft radius. Their first contact still represents <strong>A = 0.10 mm</strong>."
        : "Visual exaggeration: the centerline bow and the small difference between local-size diameters are drawn <strong>14×</strong> relative to the shaft radius. All shown sections remain <strong>Ø20.00 mm</strong>.";
      if (principle === "envelope") {
        root.querySelector("[data-rule1-status]").textContent = model.envelopePasses
          ? (model.envelopeGap === 0 ? "Envelope contact · meets this check" : "Within the Rule #1 envelope")
          : "Rule #1 envelope exceeded";
        root.querySelector("[data-rule1-explanation]").textContent = model.envelopePasses
          ? `The Ø20.00 circular sections meet the size limits, and the bowed surface stays within the Ø20.20 perfect-form cylinder. ${fixed(Math.max(0, model.envelopeGap))} mm radial gap remains at the furthest point.`
          : `The Ø20.00 circular sections meet the size limits, but the surface reaches ${fixed(model.outsideEnvelope)} mm beyond the Ø20.20 perfect-form cylinder. This illustrated shaft fails the envelope check.`;
        root.querySelector("[data-rule1-scope]").textContent = "Bow, taper, ovality, and lobing may occur as size departs from MMC, provided the complete external surface stays inside the perfect-form MMC boundary and all other requirements are met. This animation varies bow only.";
      } else {
        root.querySelector("[data-rule1-status]").textContent = "Local-size example within limits · inspect other requirements";
        root.querySelector("[data-rule1-explanation]").textContent = "Every shown circular section remains Ø20.00 mm, between the illustrated minimum and maximum sizes, even as the centerline bows. ISO independency does not infer a whole-feature perfect-form boundary from those size limits alone.";
        root.querySelector("[data-rule1-scope]").textContent = "Under independency, bow, taper, ovality, or lobing can exist unless a separate form, orientation, location, or envelope specification restricts them. Passing this simplified size check does not establish full part conformance.";
      }
      stage.setAttribute("aria-label", principle === "envelope"
        ? `Interactive 3D bowed shaft. Bow amplitude ${fixed(model.amplitude)} millimetres; ${model.envelopePasses ? "inside or touching" : "outside"} the perfect-form MMC envelope. Drag or use arrow keys to rotate; scroll or use plus and minus to zoom.`
        : `Interactive 3D bowed shaft with co-moving local-size guides, inner minimum diameter 19.80 millimetres and outer maximum diameter 20.20 millimetres. Bow amplitude ${fixed(model.amplitude)} millimetres. Drag or use arrow keys to rotate; scroll or use plus and minus to zoom.`);
      if (viewer) viewer.setModel(model);
    }
    amplitudeInput.addEventListener("input", update);
    principles.forEach((input) => input.addEventListener("change", update));
    update();
  }

  function mountAll() {
    document.querySelectorAll(".rule1-lab[data-rule1-lab]").forEach(mountRule1Lab);
  }
  if (typeof module === "object" && module.exports) {
    module.exports = { calculateRule1, centerlineOffset, mountRule1Lab };
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll, { once: true });
    else mountAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
