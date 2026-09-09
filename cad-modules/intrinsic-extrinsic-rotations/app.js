(function () {
  'use strict';
  const M = window.RotationMath;
  if (!M) return;
  const $ = selector => document.querySelector(selector);
  const state = { axes: 'XYZ', angles: [60, 45, 30], mode: 'same', progress: 3, playing: false };
  const views = {};
  let frameId = 0;
  let previousTime = 0;
  const format = (value, places = 1) => Math.abs(value) < Math.pow(10, -places) / 2 ? (0).toFixed(places) : value.toFixed(places).replace('-', '−');
  const angleText = value => `${format(value, Number.isInteger(value) ? 0 : 1)}°`;
  const vectorText = vector => `(${vector.map(value => format(value, 3)).join(', ')})`;
  const axisName = (axis, frame) => frame === 'intrinsic' ? axis.toLowerCase() + '′' : axis;

  for (const frame of ['intrinsic', 'extrinsic']) {
    if (window.RotationView) {
      views[frame] = window.RotationView.create($(`[data-${frame}-canvas]`), {
        onCameraChange(camera) {
          const other = views[frame === 'intrinsic' ? 'extrinsic' : 'intrinsic'];
          if (other) other.setCamera(camera);
        }
      });
    }
    if (!views[frame] || !views[frame].supported) $(`[data-${frame}-fallback]`).hidden = false;
    const sequence = $(`[data-${frame}-sequence]`);
    for (let i = 0; i < 3; i += 1) {
      const li = document.createElement('li');
      const index = document.createElement('span');
      index.className = 'step-index';
      index.textContent = `STEP ${i + 1}`;
      const value = document.createElement('span');
      value.className = 'step-value';
      li.append(index, value);
      sequence.append(li);
    }
    const table = $(`[data-${frame}-matrix]`);
    for (let row = 0; row < 3; row += 1) {
      const tr = document.createElement('tr');
      for (let column = 0; column < 3; column += 1) tr.append(document.createElement('td'));
      table.append(tr);
    }
  }

  function sequences() {
    const intrinsic = { axes: state.axes, angles: state.angles };
    return { intrinsic, extrinsic: state.mode === 'reverse' ? M.reverseSequence(state.axes, state.angles) : intrinsic };
  }

  function updateFrame(frame, sequence) {
    const orientation = M.orientation(sequence.axes, sequence.angles, frame, state.progress);
    const activeAxis = M.activeAxis(sequence.axes, sequence.angles, frame, state.progress);
    if (views[frame]) views[frame].setState({ orientation, activeAxis, showActiveAxis: state.progress < 3 });
    const step = Math.min(2, Math.floor(state.progress));
    const fraction = state.progress === 3 ? 1 : state.progress - step;
    $(`[data-${frame}-sequence]`).querySelectorAll('li').forEach((li, i) => {
      li.querySelector('.step-value').textContent = `${axisName(sequence.axes[i], frame)} ${angleText(sequence.angles[i])}`;
      li.dataset.state = state.progress >= i + 1 ? 'done' : step === i ? 'active' : 'pending';
      if (step === i && state.progress < 3) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    const axis = axisName(sequence.axes[step], frame);
    const frameWord = frame === 'intrinsic' ? 'moving' : 'fixed';
    $(`[data-${frame}-caption]`).textContent = state.progress === 3
      ? 'All three rotations complete. Compare the final body frames.'
      : fraction < 0.00001
        ? `Next: turn ${angleText(sequence.angles[step])} about ${frameWord} ${axis}.`
        : `Step ${step + 1}: ${angleText(sequence.angles[step] * fraction)} of ${angleText(sequence.angles[step])} about ${frameWord} ${axis}.`;
    $(`[data-${frame}-axis]`).textContent = state.progress === 3 ? '— (sequence complete)' : vectorText(activeAxis);
    $(`[data-${frame}-matrix]`).querySelectorAll('td').forEach((td, i) => { td.textContent = format(orientation[i], 4); });
    const pairs = Array.from(sequence.axes, (a, i) => ({ axis: a.toLowerCase(), angle: sequence.angles[i] }));
    if (frame === 'extrinsic') pairs.reverse();
    $(`[data-${frame}-product]`).innerHTML = `Q = ${pairs.map(pair => `R<sub>${pair.axis}</sub>(${angleText(pair.angle)})`).join(' ')} `;
    return orientation;
  }

  function render() {
    const seq = sequences();
    const intrinsic = updateFrame('intrinsic', seq.intrinsic);
    const extrinsic = updateFrame('extrinsic', seq.extrinsic);
    const difference = M.differenceDegrees(intrinsic, extrinsic);
    const finalDifference = M.differenceDegrees(M.orientation(seq.intrinsic.axes, seq.intrinsic.angles, 'intrinsic'), M.orientation(seq.extrinsic.axes, seq.extrinsic.angles, 'extrinsic'));
    const match = difference < 1e-7;
    $('[data-result]').dataset.match = String(match);
    $('[data-difference]').textContent = angleText(difference < 1e-7 ? 0 : difference);
    $('[data-final-difference]').textContent = `Final difference: ${angleText(finalDifference < 1e-7 ? 0 : finalDifference)}`;
    let title, message;
    if (state.progress === 0) {
      title = 'Both start aligned';
      message = 'The body axes initially coincide with the world axes. Advance a step or play the rotations.';
    } else if (state.progress < 3) {
      title = match ? 'The current orientations agree' : 'The intermediate orientations differ';
      message = state.mode === 'reverse'
        ? 'The reversed sequences can follow different paths. Their final orientations will agree when all three steps are complete.'
        : 'Watch the gold axes: one is attached to the moving body, while the other is fixed in the world.';
    } else if (match) {
      title = state.mode === 'reverse' ? 'Same final orientation' : 'Same orientation for these angles';
      message = state.mode === 'reverse'
        ? 'Reversing the axis–angle pairs and switching from moving to fixed axes gives the same complete orientation.'
        : 'These particular rotations coincide. Try the two quarter-turns or 60°, 45°, 30° examples to see the usual difference.';
    } else {
      title = 'Different final orientations';
      message = 'The same axis order generally gives different results. Select Reverse order to compare equivalent sequences.';
    }
    $('[data-result-title]').textContent = title;
    $('[data-result-message]').textContent = message;
    $('#progress').value = state.progress;
    $('#progress-output').textContent = state.progress === 0 ? 'Start · aligned frames' : state.progress === 3 ? 'Final orientation' : `Step ${Math.floor(state.progress) + 1} · ${Math.round((state.progress % 1) * 100)}%`;
    $('#progress').setAttribute('aria-valuetext', $('#progress-output').textContent);
    $('[data-action="start"]').disabled = state.progress === 0;
    $('[data-action="previous"]').disabled = state.progress === 0;
    $('[data-action="next"]').disabled = state.progress === 3;
    $('[data-action="finish"]').disabled = state.progress === 3;
    $('[data-action="play"]').textContent = state.playing ? 'Pause' : state.progress === 3 ? 'Play rotations' : 'Play';
    document.body.dataset.progress = String(state.progress);
    document.body.dataset.mode = state.mode;
  }

  function pause() {
    state.playing = false;
    previousTime = 0;
    cancelAnimationFrame(frameId);
    $('[data-result]').setAttribute('aria-live', 'polite');
  }

  function animate(time) {
    if (!state.playing) return;
    if (previousTime) state.progress = Math.min(3, state.progress + Math.min(time - previousTime, 100) / 2200);
    previousTime = time;
    if (state.progress === 3) pause();
    render();
    if (state.playing) frameId = requestAnimationFrame(animate);
  }

  function setProgress(value) {
    pause();
    state.progress = Math.max(0, Math.min(3, value));
    render();
  }

  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'play') {
      if (state.playing) { pause(); render(); return; }
      if (state.progress === 3) state.progress = 0;
      state.playing = true;
      $('[data-result]').setAttribute('aria-live', 'off');
      render();
      frameId = requestAnimationFrame(animate);
    } else if (action === 'start') setProgress(0);
    else if (action === 'finish') setProgress(3);
    else if (action === 'previous') setProgress(Math.ceil(state.progress - 1e-8) - 1);
    else if (action === 'next') setProgress(Math.floor(state.progress + 1e-8) + 1);
  }));

  $('#progress').addEventListener('input', event => {
    pause();
    $('[data-result]').setAttribute('aria-live', 'off');
    state.progress = Number(event.target.value);
    render();
  });
  $('#progress').addEventListener('change', () => { $('[data-result]').setAttribute('aria-live', 'polite'); render(); });

  document.querySelectorAll('[name="comparison-mode"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    state.mode = input.value;
    setProgress(3);
  }));
  $('#axis-order').addEventListener('change', event => {
    pause();
    state.axes = event.target.value;
    document.querySelectorAll('[data-angle-axis]').forEach(span => { span.textContent = state.axes[Number(span.dataset.angleAxis)]; });
    render();
  });
  for (let i = 0; i < 3; i += 1) {
    const number = $(`#angle-${i}`);
    const slider = $(`#slider-${i}`);
    function update(value) {
      pause();
      state.angles[i] = Math.round(Math.max(-180, Math.min(180, value)));
      number.value = state.angles[i];
      slider.value = state.angles[i];
      render();
    }
    number.addEventListener('input', () => { if (number.value !== '' && Number.isFinite(number.valueAsNumber)) update(number.valueAsNumber); });
    number.addEventListener('change', () => { update(Number.isFinite(number.valueAsNumber) ? number.valueAsNumber : state.angles[i]); });
    slider.addEventListener('input', () => update(Number(slider.value)));
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    state.angles = button.dataset.preset === 'quarter' ? [90, 90, 0] : button.dataset.preset === 'zero' ? [0, 0, 0] : [60, 45, 30];
    state.axes = 'XYZ';
    state.mode = 'same';
    $('#axis-order').value = state.axes;
    $('[name="comparison-mode"][value="same"]').checked = true;
    state.angles.forEach((angle, i) => { $(`#angle-${i}`).value = angle; $(`#slider-${i}`).value = angle; $(`[data-angle-axis="${i}"]`).textContent = state.axes[i]; });
    setProgress(3);
  }));
  document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
    const view = views.intrinsic || views.extrinsic;
    if (!view) return;
    if (button.dataset.camera === 'reset') view.reset();
    else view.zoom(button.dataset.camera === 'in' ? 0.85 : 1.18);
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { pause(); render(); } });
  window.addEventListener('pagehide', event => {
    pause();
    if (event.persisted) render();
    else Object.values(views).forEach(view => view.dispose());
  });
  render();
})();
