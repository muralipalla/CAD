(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.EulerAngleAnimation = api;
  if (!root.document) return;
  const start = function () { api.mountAll(root.document); };
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const AXES = ["z", "y′", "x″"];
  const SYMBOLS = ["α", "β", "γ"];
  const STAGE_DURATION = 1800;

  function finiteAngles(angles) {
    return (Array.isArray(angles) || ArrayBuffer.isView(angles)) &&
      angles.length === 3 && Array.from(angles).every(Number.isFinite);
  }

  function frameState(math, angles, progress) {
    if (!math || typeof math.orientation !== "function" || typeof math.activeAxis !== "function") {
      throw new TypeError("RotationMath with orientation and activeAxis functions is required.");
    }
    if (!finiteAngles(angles)) throw new RangeError("Angles must contain three finite numbers.");
    if (!Number.isFinite(progress) || progress < 0 || progress > 3) {
      throw new RangeError("Progress must be a finite number from 0 to 3.");
    }
    const complete = progress === 3;
    const step = Math.min(2, Math.floor(progress));
    return {
      orientation: math.orientation("ZYX", Array.from(angles), "intrinsic", progress),
      activeAxis: math.activeAxis("ZYX", Array.from(angles), "intrinsic", progress),
      step: step,
      fraction: complete ? 1 : progress - step,
      complete: complete
    };
  }

  function formatDegrees(value) {
    const rounded = Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10;
    return String(rounded) + "°";
  }

  function mount(lab) {
    if (!lab || typeof lab.querySelector !== "function") return null;
    if (lab.__eulerAngleController) return lab.__eulerAngleController;

    const doc = lab.ownerDocument || root.document;
    const canvas = lab.querySelector("[data-euler-canvas]");
    const fallback = lab.querySelector("[data-euler-fallback]");
    const playButton = lab.querySelector('[data-euler-action="play"]');
    const restartButton = lab.querySelector('[data-euler-action="restart"]');
    const progressInput = lab.querySelector("[data-euler-progress]");
    const progressOutput = lab.querySelector("[data-euler-progress-output]");
    const stepReadout = lab.querySelector("[data-euler-step-readout]");
    const lockNote = lab.querySelector("[data-euler-lock]");
    const live = lab.querySelector("[data-euler-live]");
    const angleInputs = [0, 1, 2].map(function (index) {
      return lab.querySelector('[data-euler-angle="' + index + '"]');
    });
    const angleOutputs = [0, 1, 2].map(function (index) {
      return lab.querySelector('[data-euler-angle-output="' + index + '"]');
    });
    const required = [canvas, playButton, restartButton, progressInput, progressOutput, stepReadout]
      .concat(angleInputs, angleOutputs);
    if (required.some(function (element) { return !element; })) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "The Euler-angle controls could not be initialized.";
      }
      return null;
    }

    const math = root.RotationMath;
    const viewApi = root.RotationView;
    if (!math || !viewApi || typeof viewApi.create !== "function") {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "The Three.js Euler-angle viewer could not be loaded. The formulas remain available.";
      }
      return null;
    }

    const view = viewApi.create(canvas);
    if (!view.supported && fallback) fallback.hidden = false;

    const state = { angles: [60, 45, 30], progress: 0, playing: false };
    const removers = [];
    let frameId = null;
    let lastTime = 0;
    let disposed = false;

    function listen(target, name, handler, options) {
      target.addEventListener(name, handler, options);
      removers.push(function () { target.removeEventListener(name, handler, options); });
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function stopPlayback() {
      state.playing = false;
      lastTime = 0;
      if (frameId !== null && typeof root.cancelAnimationFrame === "function") {
        root.cancelAnimationFrame(frameId);
      }
      frameId = null;
    }

    function progressLabel(frame) {
      if (frame.complete) return "Complete · final orientation";
      if (state.progress === 0) return "Start · frames aligned";
      const percent = Math.round(frame.fraction * 100);
      return "Step " + (frame.step + 1) + " of 3 · " + percent + "%";
    }

    function stepLabel(frame) {
      if (frame.complete) {
        return "All three rotations are complete. The moving body frame shows the final orientation.";
      }
      const target = state.angles[frame.step];
      if (frame.fraction === 0) {
        return "Next: rotate " + formatDegrees(target) + " about the moving " + AXES[frame.step] + "-axis.";
      }
      return "Step " + (frame.step + 1) + " of 3: " + SYMBOLS[frame.step] + " = " +
        formatDegrees(target * frame.fraction) + " of " + formatDegrees(target) +
        " about the moving " + AXES[frame.step] + "-axis.";
    }

    function render() {
      if (disposed) return;
      state.progress = Math.max(0, Math.min(3, state.progress));
      const frame = frameState(math, state.angles, state.progress);
      view.setState({
        orientation: frame.orientation,
        activeAxis: frame.activeAxis,
        showActiveAxis: !frame.complete
      });

      angleInputs.forEach(function (input, index) {
        if (Number(input.value) !== state.angles[index]) input.value = String(state.angles[index]);
        angleOutputs[index].textContent = formatDegrees(state.angles[index]);
      });
      progressInput.value = String(state.progress);
      const label = progressLabel(frame);
      progressOutput.textContent = label;
      progressInput.setAttribute("aria-valuetext", label);
      stepReadout.textContent = stepLabel(frame);
      playButton.textContent = state.playing ? "Pause" : "Play";
      playButton.setAttribute("aria-pressed", state.playing ? "true" : "false");
      if (lockNote) lockNote.hidden = Math.abs(Math.abs(state.angles[1]) - 90) > 1e-9;
    }

    function tick(time) {
      if (!state.playing || disposed) return;
      if (!lastTime) lastTime = time;
      const elapsed = Math.max(0, Math.min(100, time - lastTime));
      lastTime = time;
      state.progress = Math.min(3, state.progress + elapsed / STAGE_DURATION);
      if (state.progress >= 3) {
        stopPlayback();
        state.progress = 3;
        render();
        announce("Euler-angle animation complete.");
        return;
      }
      render();
      frameId = root.requestAnimationFrame(tick);
    }

    angleInputs.forEach(function (input, index) {
      listen(input, "input", function () {
        stopPlayback();
        state.angles[index] = Number(input.value);
        render();
      });
      listen(input, "change", function () {
        announce(SYMBOLS[index] + " set to " + formatDegrees(state.angles[index]) + ".");
      });
    });

    listen(progressInput, "input", function () {
      stopPlayback();
      state.progress = Number(progressInput.value);
      render();
    });
    listen(progressInput, "change", function () {
      announce(progressOutput.textContent + ". " + stepReadout.textContent);
    });

    listen(playButton, "click", function () {
      if (state.playing) {
        stopPlayback();
        render();
        announce("Euler-angle animation paused.");
        return;
      }
      if (state.progress >= 3) state.progress = 0;
      state.playing = true;
      lastTime = 0;
      render();
      announce("Euler-angle animation playing.");
      frameId = root.requestAnimationFrame(tick);
    });

    listen(restartButton, "click", function () {
      stopPlayback();
      state.progress = 0;
      render();
      announce("Euler-angle sequence returned to the starting orientation.");
    });

    if (doc) {
      listen(doc, "visibilitychange", function () {
        if (doc.hidden && state.playing) {
          stopPlayback();
          render();
          announce("Euler-angle animation paused because the page is hidden.");
        }
      });
    }

    function dispose() {
      if (disposed) return;
      stopPlayback();
      disposed = true;
      removers.splice(0).forEach(function (remove) { remove(); });
      view.dispose();
      delete lab.__eulerAngleController;
    }

    if (root && typeof root.addEventListener === "function") {
      listen(root, "pagehide", function (event) {
        if (!event.persisted) dispose();
      });
    }

    const controller = { render: render, dispose: dispose, state: state, view: view };
    lab.__eulerAngleController = controller;
    render();
    return controller;
  }

  function mountAll(context) {
    if (!context || typeof context.querySelectorAll !== "function") return [];
    return Array.from(context.querySelectorAll("[data-euler-lab]")).map(mount).filter(Boolean);
  }

  return { frameState: frameState, mount: mount, mountAll: mountAll };
});
