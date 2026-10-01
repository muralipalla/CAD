(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CADWorkflowLab = api;
  if (root && root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  const FEATURES = Object.freeze({
    hole: Object.freeze({ label: "Hole", target: "cylindrical bore" }),
    slot: Object.freeze({ label: "Slot", target: "closed slot boundary" }),
    surface: Object.freeze({ label: "Planar pad", target: "top pad face" }),
    shaft: Object.freeze({ label: "Stepped shaft", target: "upper shaft step" })
  });
  const CONTROLS = Object.freeze([
    Object.freeze({ id: "straightness", label: "Straightness", symbol: "⏤", family: "Form", features: ["hole", "slot"] }),
    Object.freeze({ id: "flatness", label: "Flatness", symbol: "⏥", family: "Form", features: ["slot", "surface"] }),
    Object.freeze({ id: "circularity", label: "Circularity", symbol: "○", family: "Form", features: ["hole"] }),
    Object.freeze({ id: "cylindricity", label: "Cylindricity", symbol: "⌭", family: "Form", features: ["hole"] }),
    Object.freeze({ id: "profile-line", label: "Profile of a line", symbol: "⌒", family: "Profile", features: ["hole", "slot", "surface"] }),
    Object.freeze({ id: "profile-surface", label: "Profile of a surface", symbol: "⌓", family: "Profile", features: ["hole", "slot", "surface"] }),
    Object.freeze({ id: "parallelism", label: "Parallelism", symbol: "∥", family: "Orientation", features: ["surface"] }),
    Object.freeze({ id: "perpendicularity", label: "Perpendicularity", symbol: "⟂", family: "Orientation", features: ["hole", "slot"] }),
    Object.freeze({ id: "position", label: "Position", symbol: "⌖", family: "Location", features: ["hole", "slot"] }),
    Object.freeze({ id: "circular-runout", label: "Circular runout", symbol: "↗", family: "Runout", features: ["shaft"] }),
    Object.freeze({ id: "total-runout", label: "Total runout", symbol: "⌰", family: "Runout", features: ["shaft"] })
  ]);
  const GROUPS = ["Form", "Profile", "Orientation", "Location", "Runout"];

  function availableControls(feature, datumCount) {
    if (!FEATURES[feature]) throw new RangeError("Unknown feature.");
    if (![0, 1, 2, 3].includes(datumCount)) throw new RangeError("Choose no datum, A, A–B, or A–B–C.");
    return CONTROLS.filter(function (control) {
      return control.features.includes(feature) && (feature === "shaft" || datumCount > 0 || control.family === "Form" || control.family === "Profile");
    });
  }
  function zoneFor(feature, id) {
    if (id === "circular-runout") return { kind: "runout-section", name: "One radial section band", diameter: false };
    if (id === "total-runout") return { kind: "runout-full", name: "Whole-surface radial band", diameter: false };
    if (id === "circularity") return { kind: "annulus", name: "Concentric-circle band", diameter: false };
    if (id === "cylindricity") return { kind: "cylinder-shell", name: "Coaxial cylindrical shell", diameter: false };
    if (id === "profile-line") return { kind: feature === "hole" ? "annulus" : feature === "slot" ? "slot-contour" : "profile-line", name: "Line-profile band", diameter: false };
    if (id === "profile-surface") return { kind: feature === "hole" ? "cylinder-shell" : feature === "slot" ? "slot-walls" : "profile-surface", name: "Surface-profile envelope", diameter: false };
    if (feature === "hole") return { kind: "axis-cylinder", name: "Cylindrical axis zone", diameter: true };
    if (id === "straightness") return { kind: "line-band", name: "Straightness band", diameter: false };
    return { kind: "parallel-planes", name: "Two parallel planes", diameter: false };
  }
  function selection(feature, datumCount, controlId, tolerance) {
    const control = availableControls(feature, datumCount).find(function (item) { return item.id === controlId; });
    if (!control) throw new RangeError("This control is not applicable to the selected feature and datum setup.");
    const minimum = control.family === "Runout" ? 0.01 : 0.1;
    const maximum = control.family === "Runout" ? 0.10 : 1;
    if (!Number.isFinite(tolerance) || tolerance < minimum || tolerance > maximum) throw new RangeError(`Tolerance must be between ${numberText(minimum)} and ${numberText(maximum)} mm.`);
    const datumRefs = control.family === "Runout" ? ["D"] : control.family === "Form" ? [] : control.family === "Orientation" ? ["A"] : ["A", "B", "C"].slice(0, datumCount);
    return { feature, datumCount, control, tolerance, datumRefs, zone: zoneFor(feature, controlId) };
  }
  function positionFreedom(datumCount, feature) {
    if (![1, 2, 3].includes(datumCount)) throw new RangeError("Invalid datum setup.");
    if (feature === "slot") return datumCount === 1 ? { x: false, y: true, label: "A only · median plane may shift across width and rotate in plane" } :
      datumCount === 2 ? { x: false, y: true, label: "A–B · direction set; width location free" } :
        { x: false, y: false, label: "A–B–C · median plane located across slot width" };
    return datumCount === 1 ? { x: true, y: true, label: "A only · axis ⟂ bottom A · X and Y free" } :
      datumCount === 2 ? { x: false, y: true, label: "A–B · X fixed · Y free" } :
        { x: false, y: false, label: "A–B–C · X and Y located" };
  }
  const MOTION_AXES = Object.freeze(["tx", "ty", "tz", "rx", "ry", "rz"]);
  function allowedZoneMotion(state) {
    const mask = Object.fromEntries(MOTION_AXES.map(function (axis) { return [axis, false]; }));
    const id = state.control.id;
    const refs = state.datumRefs;
    if (!refs.length) {
      // Motions along an ideal zone's own plane or axis, and spins around its
      // symmetry axis, do not move that zone even if its finite drawing moves.
      const free = state.feature === "hole" ?
        ["circularity", "profile-line"].includes(id) ? ["tx", "ty"] : ["tx", "ty", "rx", "ry"] :
        state.feature === "slot" ?
          id === "flatness" ? ["ty", "rx", "rz"] :
            id === "straightness" ? ["ty", "rz"] : MOTION_AXES :
          state.feature === "surface" ? ["tz", "rx", "ry"] : [];
      free.forEach(function (axis) { mask[axis] = true; });
      return mask;
    }
    if (id === "parallelism") { mask.tz = true; return mask; }
    if (id === "perpendicularity" || id === "position" || state.control.family === "Profile") {
      if (state.feature === "hole") {
        mask.tx = !refs.includes("B");
        mask.ty = !refs.includes("C");
      } else if (state.feature === "slot") {
        // Slot position and perpendicularity control the median plane: sliding
        // it along X changes neither that plane nor the controlled slot ends.
        // Profile instead selects the complete, finite slot boundary.
        mask.tx = state.control.family === "Profile" && !refs.includes("B");
        mask.ty = !refs.includes("C");
        mask.rz = !refs.includes("B");
      }
      // A controls tilt. In-plane motion of the planar pad's ideal profile
      // zone does not change it; its CAD-basic height fixes the normal offset.
      return mask;
    }
    return mask;
  }
  function targetFor(state) {
    const id = state.control.id;
    if (state.feature === "shaft") return "upper cylindrical step";
    if (state.feature === "hole") return ["circularity", "profile-line"].includes(id) ? "bore section" : ["cylindricity", "profile-surface"].includes(id) ? "bore surface" : "derived bore axis";
    if (state.feature === "slot") return id === "profile-line" ? "complete slot section, including rounded ends" : id === "profile-surface" ? "complete slot boundary, including rounded ends" : id === "straightness" ? "median line" : "derived median plane";
    return id === "profile-line" ? "pad-face section" : "top pad face";
  }
  function explanation(state) {
    const id = state.control.id;
    if (id === "circular-runout") return "At the selected height, two circles coaxial with datum D bound the upper step's surface. Their radial separation is T. Each height is evaluated independently during rotation.";
    if (id === "total-runout") return "Two cylinders coaxial with datum D bound the entire upper step. Their radial separation is T; one common zone applies along the whole controlled surface during rotation.";
    if (id === "straightness") return state.feature === "hole" ? "The derived bore axis stays inside a cylindrical zone of diameter T." : "A selected median line of the slot stays between two parallel lines T apart.";
    if (id === "flatness") return state.feature === "slot" ? "The slot's derived median plane stays between two parallel planes separated by T." : "The selected planar pad face stays between two parallel planes separated by T; no datum is referenced.";
    if (id === "circularity") return "Each bore cross-section stays between two concentric circles with radial separation T.";
    if (id === "cylindricity") return "The whole bore surface stays between two coaxial cylinders with radial separation T.";
    if (id === "profile-line") return state.feature === "surface" ? "A section of the planar pad face stays between two lines T apart." : state.feature === "slot" ? "The complete closed slot section, including its rounded ends, stays inside two normal-offset curves T apart." : "The selected bore section stays inside a band bounded by two normal-offset curves, T apart.";
    if (id === "profile-surface") return state.feature === "surface" ? state.datumRefs.length ? "The planar pad face stays between two profile boundaries T apart, oriented and located by the referenced datums." : "The planar pad face stays between two profile boundaries T apart, with no datum reference." : state.feature === "slot" ? "The complete slot boundary, including its rounded ends, stays within a three-dimensional envelope of two normal-offset surfaces T apart." : "The bore surface stays within a three-dimensional envelope of two normal-offset surfaces T apart.";
    if (id === "parallelism") return "The top pad face stays between two planes T apart, parallel to bottom datum A. The zone is not located in height by parallelism alone.";
    if (id === "perpendicularity") return `The ${targetFor(state)} stays inside a zone perpendicular to bottom datum A.`;
    return state.feature === "hole" ? "The derived bore axis stays inside a cylindrical position zone of diameter T." : "The slot's derived median plane stays between two parallel planes separated by T.";
  }
  function refNote(state) {
    if (state.control.family === "Runout") return "The lower cylindrical journal establishes datum axis D; only the upper step is controlled. T is radial, with no diameter symbol or MMC bonus. The red gap is enlarged for visibility and its radial placement is schematic, not fixed to nominal size.";
    if (state.control.family === "Form") return "Form controls do not use datum references. The selected datum setup is not in this feature control frame.";
    if (!state.datumRefs.length) return state.feature === "slot" ? "No datum is referenced. This profile selects the complete closed slot boundary, including rounded ends; its finite zone can shift and rotate. By contrast, slot position controls only the derived median plane." : "No datum is referenced. The profile zone controls form but does not establish location or orientation; only motions that change the ideal zone are enabled.";
    if (state.control.id === "position") {
      if (state.feature === "slot") {
        if (state.datumCount === 1) return "A constrains tilt of the slot's derived median plane but leaves widthwise translation and in-plane rotation free; lengthwise sliding does not change that ideal plane or control the slot ends.";
        if (state.datumCount === 2) return "The short end datum B sets the in-plane direction. The median plane can still shift across the slot width until C is referenced.";
        return "C, the long side, fixes the median plane across the slot width. The boxed 2.30 mm is its basic distance from C. Position of that median plane does not by itself control the slot's end geometry or its lengthwise extent.";
      }
      if (state.datumCount === 1) return "A is the bottom face. It orients the cylindrical zone perpendicular to A but does not locate the hole in X or Y, so no X/Y basic location dimensions are shown. Use the X and Y sliders to translate the zone.";
      if (state.datumCount === 2) return "B is the short end face. The boxed 4.04 mm is the basic B-to-hole X distance; Y remains free and the hole axis stays perpendicular to A.";
      return "C is the long side face. Boxed basic dimensions locate the hole 4.04 mm from B in X and 2.04 mm from C in Y.";
    }
    if (state.control.id === "parallelism") return "Only bottom datum A is used for this orientation control. B and C are not included in this feature control frame even if the datum setup is selected.";
    if (state.control.id === "perpendicularity") return state.feature === "hole" ? "Only A is needed. Like position referenced to A alone, this cylindrical orientation zone can shift in X and Y; it does not locate the hole." : "Only bottom A is used. The slot's median-plane zone is perpendicular to A but is not located across the plate.";
    return state.feature === "slot" ? "The datum references orient and locate the complete closed slot-profile boundary, including rounded ends. This differs from slot position, which controls only the derived median plane." : "The datum references orient and, where applicable, locate the nominal profile zone; basic geometry defines its nominal shape.";
  }
  function numberText(value) { return Number(value).toFixed(2); }

  function createFullscreenController(lab, viewer) {
    const doc = lab.ownerDocument;
    const button = lab.querySelector("[data-gdt-fullscreen]");
    if (!button) return null;
    const label = button.querySelector("[data-gdt-fullscreen-label]");
    let pending = false;
    function isFull() { return doc.fullscreenElement === lab || lab.classList.contains("gdt-fallback-fullscreen"); }
    function sync() {
      const active = isFull();
      label.textContent = active ? "Exit full screen" : "Full screen";
      button.setAttribute("aria-label", active ? "Exit full screen" : "Enter full screen");
      button.setAttribute("aria-pressed", String(active));
      if (viewer) viewer.resize();
    }
    function setFallback(active) {
      lab.classList.toggle("gdt-fallback-fullscreen", active);
      doc.documentElement.classList.toggle("gdt-fallback-page", active);
      sync();
    }
    async function toggle() {
      if (pending) return;
      pending = true;
      button.disabled = true;
      if (viewer) viewer.preserveZoom();
      try {
        if (doc.fullscreenElement === lab) {
          if (typeof doc.exitFullscreen === "function") await doc.exitFullscreen();
        } else if (lab.classList.contains("gdt-fallback-fullscreen")) {
          setFallback(false);
        } else if (typeof lab.requestFullscreen === "function") {
          // Call during the click gesture. Awaiting anything first would lose
          // transient user activation in browsers that require it.
          try { await lab.requestFullscreen(); }
          catch (error) { if (doc.fullscreenElement !== lab) setFallback(true); }
        } else {
          setFallback(true);
        }
      } finally {
        pending = false;
        button.disabled = false;
        sync();
      }
    }
    button.addEventListener("click", toggle);
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("fullscreenerror", sync);
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && lab.classList.contains("gdt-fallback-fullscreen")) setFallback(false);
    });
    sync();
    return { isFull, toggle, sync };
  }

  function mountLab(lab) {
    if (lab.dataset.mbdMounted === "true") return;
    const doc = lab.ownerDocument;
    const featureInputs = [...lab.querySelectorAll('input[name="gdt-feature"]')];
    const datumInput = lab.querySelector("[data-gdt-datums]");
    const controlInput = lab.querySelector("[data-gdt-control]");
    const toleranceInput = lab.querySelector("[data-gdt-tolerance]");
    const stationInput = lab.querySelector("[data-gdt-station]");
    const motionInputs = [...lab.querySelectorAll("[data-gdt-motion]")];
    const motionReset = lab.querySelector("[data-gdt-reset-motion]");
    const zoomInput = lab.querySelector("[data-gdt-zoom]");
    const zoomOutput = lab.querySelector("[data-gdt-zoom-output]");
    const host = lab.querySelector("[data-gdt-viewer]");
    if (!datumInput || !controlInput || !toleranceInput || !host) return;
    const viewer = root.CADWorkflowThree && root.CADWorkflowThree.createViewer(host);
    if (!viewer) host.querySelector("[data-gdt-webgl-fallback]").hidden = false;
    if (viewer && zoomInput && zoomOutput) {
      viewer.onZoomChange(function (percent) {
        const value = Math.round(percent);
        zoomInput.value = String(value);
        zoomInput.setAttribute("aria-valuetext", `${value} percent zoom`);
        zoomOutput.textContent = `${value}%`;
      });
      zoomInput.addEventListener("input", function () { viewer.setZoom(Number(zoomInput.value)); });
    } else if (zoomInput) zoomInput.disabled = true;
    lab.dataset.mbdMounted = "true";
    function checked(inputs) { return inputs.find(function (input) { return input.checked; }).value; }
    function readMotion() {
      return Object.fromEntries(motionInputs.map(function (input) { return [input.dataset.gdtMotion, input.disabled ? 0 : Number(input.value)]; }));
    }
    function updateMotionOutputs() {
      motionInputs.forEach(function (input) {
        const axis = input.dataset.gdtMotion, value = Number(input.value);
        lab.querySelector(`[data-gdt-motion-output="${axis}"]`).textContent = axis[0] === "r" ? `${value}°` : `${value.toFixed(2)} mm`;
      });
      if (motionReset) motionReset.disabled = motionInputs.every(function (input) { return Number(input.value) === 0; });
    }
    function syncMotionControls(state) {
      const allowed = allowedZoneMotion(state);
      motionInputs.forEach(function (input) {
        const active = allowed[input.dataset.gdtMotion];
        input.disabled = !active;
        if (!active) input.value = "0";
        input.closest(".gdt-motion-row").classList.toggle("is-locked", !active);
      });
      updateMotionOutputs();
      const active = MOTION_AXES.filter(function (axis) { return allowed[axis]; });
      lab.querySelector("[data-gdt-motion-help]").textContent = !state.datumRefs.length ?
        `No datum in this frame · zone-changing motions: ${active.map(function (axis) { return axis[0] === "t" ? `move ${axis[1].toUpperCase()}` : `rotate ${axis[1].toUpperCase()}`; }).join(", ")}. Other motions leave the ideal zone unchanged.` :
        active.length ? `Frame ${state.datumRefs.join("–")} · free: ${active.map(function (axis) { return axis[0] === "t" ? `move ${axis[1].toUpperCase()}` : `rotate ${axis[1].toUpperCase()}`; }).join(", ")}. Other zone motions are locked.` :
          `Frame ${state.datumRefs.join("–")}: the illustrated zone is fixed by these references.`;
      return readMotion();
    }
    function populate(feature, datumCount) {
      const previous = controlInput.value || "position";
      const available = availableControls(feature, datumCount);
      controlInput.replaceChildren();
      GROUPS.forEach(function (family) {
        const matches = available.filter(function (item) { return item.family === family; });
        if (!matches.length) return;
        const group = doc.createElement("optgroup"); group.label = family;
        matches.forEach(function (item) {
          const option = doc.createElement("option"); option.value = item.id; option.textContent = `${item.symbol}  ${item.label}`; group.appendChild(option);
        });
        controlInput.appendChild(group);
      });
      controlInput.value = available.some(function (item) { return item.id === previous; }) ? previous :
        available.some(function (item) { return item.id === "position"; }) ? "position" :
          available.some(function (item) { return item.id === "profile-surface"; }) ? "profile-surface" : available[0].id;
      lab.querySelector("[data-gdt-availability]").textContent = `${available.length} illustrated controls for this feature.`;
    }
    function render(announce) {
      const feature = checked(featureInputs), datumCount = Number(datumInput.value);
      const state = selection(feature, datumCount, controlInput.value, toleranceInput.valueAsNumber);
      const shaftMode = feature === "shaft";
      lab.querySelector("[data-gdt-datum-choice]").hidden = shaftMode;
      lab.querySelector("[data-gdt-shaft-datum]").hidden = !shaftMode;
      lab.querySelector("[data-gdt-motion-panel]").hidden = shaftMode;
      lab.querySelector("[data-gdt-station-field]").hidden = state.control.id !== "circular-runout";
      state.station = stationInput ? stationInput.valueAsNumber / 100 : 0.5;
      if (stationInput) lab.querySelector("[data-gdt-station-output]").textContent = `${stationInput.value}% of upper step`;
      const frame = lab.querySelector("[data-gdt-frame]");
      frame.replaceChildren();
      [state.control.symbol, `${state.zone.diameter ? "⌀" : ""}${numberText(state.tolerance)}`, ...state.datumRefs].forEach(function (value) {
        const cell = doc.createElement("span"); cell.textContent = value; frame.appendChild(cell);
      });
      frame.setAttribute("aria-label", `${state.control.label}, ${state.zone.diameter ? "diameter " : ""}${numberText(state.tolerance)} millimetres${state.datumRefs.length ? ", datums " + state.datumRefs.join(" ") : ", no datum references"}`);
      lab.querySelector("[data-gdt-title]").textContent = state.control.label;
      lab.querySelector("[data-gdt-zone-type]").textContent = state.zone.name;
      lab.querySelector("[data-gdt-tolerance-output]").textContent = `${numberText(state.tolerance)} mm`;
      lab.querySelector("[data-gdt-zone-description]").textContent = explanation(state);
      lab.querySelector("[data-gdt-reference-note]").textContent = `${refNote(state)} The red zone is schematic: spacing and finite extent are exaggerated, not a conformance or inspection check.`;
      lab.querySelector("[data-gdt-datum-help]").textContent = state.datumRefs.length ?
        `Frame: ${state.datumRefs.join(" → ")}. A = bottom; B = short end; C = long side.` :
        "No datum references in this frame. A = bottom; B = short end; C = long side.";
      lab.querySelector("[data-gdt-basic-legend]").hidden = !(state.control.id === "position" &&
        (state.feature === "hole" && datumCount >= 2 || state.feature === "slot" && datumCount === 3));
      lab.querySelector("[data-gdt-freedom]").textContent = shaftMode ?
        state.control.id === "circular-runout" ? "Datum D · one section at the selected height" : "Datum D · entire upper step" :
        state.control.id === "position" ? positionFreedom(datumCount, feature).label :
        state.control.id === "perpendicularity" && feature === "hole" ? positionFreedom(1).label :
          state.datumRefs.length ? `${state.datumRefs.join("–")} · referenced face highlighted` : state.control.family === "Form" ? "Form zone · no datum reference" : "Datumless profile · location free";
      state.motion = syncMotionControls(state);
      if (viewer) viewer.update(state);
      if (announce) lab.querySelector("[data-gdt-live]").textContent = `${FEATURES[feature].label}: ${state.control.label}. ${state.zone.name}, ${numberText(state.tolerance)} millimetres. ${refNote(state)}`;
    }
    function setToleranceScale(runout) {
      toleranceInput.min = runout ? "0.01" : "0.10";
      toleranceInput.max = runout ? "0.10" : "1.00";
      toleranceInput.step = runout ? "0.01" : "0.05";
      toleranceInput.value = runout ? "0.04" : "0.40";
      lab.querySelector("[data-gdt-tolerance-min]").textContent = `${toleranceInput.min} mm`;
      lab.querySelector("[data-gdt-tolerance-max]").textContent = `${Number(toleranceInput.max).toFixed(2)} mm`;
    }
    let lastFeature = checked(featureInputs);
    if (lastFeature === "shaft") setToleranceScale(true);
    function changeContext() {
      const feature = checked(featureInputs);
      if ((feature === "shaft") !== (lastFeature === "shaft")) setToleranceScale(feature === "shaft");
      lastFeature = feature;
      populate(feature, Number(datumInput.value));
      render(true);
    }
    featureInputs.forEach(function (input) { input.addEventListener("change", changeContext); });
    datumInput.addEventListener("change", changeContext);
    controlInput.addEventListener("change", function () { render(true); });
    toleranceInput.addEventListener("input", function () { render(false); });
    toleranceInput.addEventListener("change", function () { render(true); });
    if (stationInput) stationInput.addEventListener("input", function () { render(false); });
    motionInputs.forEach(function (input) { input.addEventListener("input", function () { updateMotionOutputs(); if (viewer) viewer.setMotion(readMotion()); }); });
    if (motionReset) motionReset.addEventListener("click", function () {
      motionInputs.forEach(function (input) { input.value = "0"; });
      updateMotionOutputs();
      if (viewer) viewer.setMotion(readMotion());
    });
    const viewButtons = [
      ["[data-gdt-reset-view]", "resetView", "reset", "Default 3D perspective view"],
      ["[data-gdt-top-view]", "topView", "top", "Orthographic top view, looking down on the plate"],
      ["[data-gdt-front-view]", "frontView", "front", "Orthographic front view from long side C"],
      ["[data-gdt-side-view]", "sideView", "side", "Orthographic side view from short end B"],
      ["[data-gdt-bottom-view]", "bottomView", "bottom", "Oblique underside view of datum A"]
    ].map(function ([selector, method, name, announcement]) {
      const button = lab.querySelector(selector);
      if (!button) return null;
      if (!viewer) { button.disabled = true; return { button, name }; }
      button.addEventListener("click", function () {
        viewer[method]();
        lab.querySelector("[data-gdt-live]").textContent = announcement;
      });
      return { button, name };
    }).filter(Boolean);
    if (viewer) viewer.onViewChange(function (active) {
      viewButtons.forEach(function ({ button, name }) { button.setAttribute("aria-pressed", String(active === name)); });
    });

    createFullscreenController(lab, viewer);
    populate(checked(featureInputs), Number(datumInput.value));
    render(false);
  }
  function mountAll(documentObject) { [...documentObject.querySelectorAll("[data-mbd-lab]")].forEach(mountLab); }
  return { FEATURES, CONTROLS, availableControls, zoneFor, selection, positionFreedom, allowedZoneMotion, targetFor, explanation, refNote, createFullscreenController, mountAll };
});
