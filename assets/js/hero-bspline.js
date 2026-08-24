(function () {
  "use strict";

  const canvas = document.querySelector("[data-bspline-surface]");
  const fallback = document.querySelector("[data-surface-fallback]");
  const surfaceLabel = document.querySelector("[data-surface-label]");

  if (!canvas) {
    return;
  }

  if (!window.THREE) {
    canvas.hidden = true;
    return;
  }

  const THREE = window.THREE;
  const controlCount = 6;
  const degree = 3;
  const samples = 41;

  function openUniformKnots(count, curveDegree) {
    const knots = [];
    const last = count + curveDegree;

    for (let i = 0; i <= last; i += 1) {
      if (i <= curveDegree) {
        knots.push(0);
      } else if (i >= count) {
        knots.push(1);
      } else {
        knots.push((i - curveDegree) / (count - curveDegree));
      }
    }

    return knots;
  }

  function basis(index, curveDegree, parameter, knots, count) {
    if (curveDegree === 0) {
      const inSpan = knots[index] <= parameter && parameter < knots[index + 1];
      const atLastControl = parameter === 1 && index === count - 1;
      return inSpan || atLastControl ? 1 : 0;
    }

    let value = 0;
    const leftDenominator = knots[index + curveDegree] - knots[index];
    const rightDenominator = knots[index + curveDegree + 1] - knots[index + 1];

    if (leftDenominator > 0) {
      value += ((parameter - knots[index]) / leftDenominator)
        * basis(index, curveDegree - 1, parameter, knots, count);
    }

    if (rightDenominator > 0) {
      value += ((knots[index + curveDegree + 1] - parameter) / rightDenominator)
        * basis(index + 1, curveDegree - 1, parameter, knots, count);
    }

    return value;
  }

  function controlHeight(x, z) {
    const hill = 1.05 * Math.exp(-0.52 * ((x + 0.85) ** 2 + (z - 0.65) ** 2));
    const valley = 0.8 * Math.exp(-0.62 * ((x - 1.05) ** 2 + (z + 0.65) ** 2));
    return hill - valley + (0.12 * x * z);
  }

  const knots = openUniformKnots(controlCount, degree);
  const controls = [];

  for (let row = 0; row < controlCount; row += 1) {
    const z = -2.35 + (4.7 * row) / (controlCount - 1);
    const controlRow = [];

    for (let column = 0; column < controlCount; column += 1) {
      const x = -2.35 + (4.7 * column) / (controlCount - 1);
      controlRow.push(new THREE.Vector3(x, controlHeight(x, z), z));
    }

    controls.push(controlRow);
  }

  function evaluateSurface(u, v) {
    const point = new THREE.Vector3();

    for (let row = 0; row < controlCount; row += 1) {
      const vBasis = basis(row, degree, v, knots, controlCount);

      for (let column = 0; column < controlCount; column += 1) {
        const coefficient = basis(column, degree, u, knots, controlCount) * vBasis;
        point.addScaledVector(controls[row][column], coefficient);
      }
    }

    return point;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(5.7, 4.2, 6.9);
  camera.lookAt(0, 0, 0);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas
    });
  } catch (error) {
    canvas.hidden = true;
    return;
  }

  if (fallback) {
    fallback.hidden = true;
  }
  if (surfaceLabel) {
    surfaceLabel.hidden = false;
  }
  canvas.tabIndex = 0;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const surfaceGroup = new THREE.Group();
  scene.add(surfaceGroup);

  const positions = [];
  const colors = [];
  const indices = [];
  const sampledPoints = [];
  const lowColor = new THREE.Color(0x356991);
  const middleColor = new THREE.Color(0x6a58a8);
  const highColor = new THREE.Color(0xf05b3f);

  for (let row = 0; row < samples; row += 1) {
    const v = row / (samples - 1);

    for (let column = 0; column < samples; column += 1) {
      const u = column / (samples - 1);
      const point = evaluateSurface(u, v);
      sampledPoints.push(point);
      positions.push(point.x, point.y, point.z);

      const heightMix = THREE.MathUtils.clamp((point.y + 0.85) / 1.8, 0, 1);
      const color = heightMix < 0.5
        ? lowColor.clone().lerp(middleColor, heightMix * 2)
        : middleColor.clone().lerp(highColor, (heightMix - 0.5) * 2);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < samples - 1; row += 1) {
    for (let column = 0; column < samples - 1; column += 1) {
      const current = (row * samples) + column;
      const nextRow = current + samples;
      indices.push(current, nextRow, current + 1);
      indices.push(current + 1, nextRow, nextRow + 1);
    }
  }

  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  surfaceGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  surfaceGeometry.setIndex(indices);
  surfaceGeometry.computeVertexNormals();

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.12,
    roughness: 0.38,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  surfaceGroup.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial));

  const isoPositions = [];
  const isoStep = 5;

  function addIsoSegment(firstIndex, secondIndex) {
    const first = sampledPoints[firstIndex];
    const second = sampledPoints[secondIndex];
    isoPositions.push(first.x, first.y + 0.008, first.z, second.x, second.y + 0.008, second.z);
  }

  for (let row = 0; row < samples; row += isoStep) {
    for (let column = 0; column < samples - 1; column += 1) {
      addIsoSegment((row * samples) + column, (row * samples) + column + 1);
    }
  }

  for (let column = 0; column < samples; column += isoStep) {
    for (let row = 0; row < samples - 1; row += 1) {
      addIsoSegment((row * samples) + column, ((row + 1) * samples) + column);
    }
  }

  const isoGeometry = new THREE.BufferGeometry();
  isoGeometry.setAttribute("position", new THREE.Float32BufferAttribute(isoPositions, 3));
  surfaceGroup.add(new THREE.LineSegments(
    isoGeometry,
    new THREE.LineBasicMaterial({ color: 0xfff8ef, opacity: 0.32, transparent: true })
  ));

  const cagePositions = [];

  function addCageSegment(first, second) {
    cagePositions.push(first.x, first.y, first.z, second.x, second.y, second.z);
  }

  for (let row = 0; row < controlCount; row += 1) {
    for (let column = 0; column < controlCount - 1; column += 1) {
      addCageSegment(controls[row][column], controls[row][column + 1]);
      addCageSegment(controls[column][row], controls[column + 1][row]);
    }
  }

  const cageGeometry = new THREE.BufferGeometry();
  cageGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cagePositions, 3));
  surfaceGroup.add(new THREE.LineSegments(
    cageGeometry,
    new THREE.LineBasicMaterial({ color: 0xffb29e, opacity: 0.24, transparent: true })
  ));

  const controlPositions = controls.flatMap((row) => row.flatMap((point) => [point.x, point.y, point.z]));
  const controlGeometry = new THREE.BufferGeometry();
  controlGeometry.setAttribute("position", new THREE.Float32BufferAttribute(controlPositions, 3));
  surfaceGroup.add(new THREE.Points(
    controlGeometry,
    new THREE.PointsMaterial({ color: 0xffffff, opacity: 0.7, size: 0.055, transparent: true })
  ));

  scene.add(new THREE.HemisphereLight(0xfff8ef, 0x17134f, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(4, 7, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xff8f78, 2.2);
  rimLight.position.set(-5, 2, -4);
  scene.add(rimLight);

  let yaw = -0.56;
  let pitch = -0.22;
  let dragging = false;
  let pointerId = null;
  let previousX = 0;
  let previousY = 0;

  function render() {
    renderer.render(scene, camera);
  }

  function setRotation() {
    surfaceGroup.rotation.x = pitch;
    surfaceGroup.rotation.y = yaw;
    render();
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }

    yaw += (event.clientX - previousX) * 0.009;
    pitch = THREE.MathUtils.clamp(pitch + ((event.clientY - previousY) * 0.007), -0.9, 0.5);
    previousX = event.clientX;
    previousY = event.clientY;
    setRotation();
  });

  function stopDragging(event) {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }

    dragging = false;
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);

  canvas.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"];
    if (!keys.includes(event.key)) {
      return;
    }

    event.preventDefault();

    if (event.key === "ArrowLeft") yaw -= 0.12;
    if (event.key === "ArrowRight") yaw += 0.12;
    if (event.key === "ArrowUp") pitch = Math.max(-0.9, pitch - 0.1);
    if (event.key === "ArrowDown") pitch = Math.min(0.5, pitch + 0.1);
    if (event.key === "Home") {
      yaw = -0.56;
      pitch = -0.22;
    }

    setRotation();
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  setRotation();
}());
