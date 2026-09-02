(function () {
  "use strict";

  const Lab = window.CurveLab;
  const Basis = window.BSplineBasisMath;
  if (!Lab || !Basis) return;

  const modeControl = document.querySelector("[data-boundary-mode]");
  const orderControl = document.querySelector("[data-order]");
  const customPeriodicControl = document.querySelector("[data-custom-periodic-control]");
  const customPeriodicInput = document.querySelector("[data-custom-periodic]");
  const knotInput = document.querySelector("[data-knot-vector]");
  const applyButton = document.querySelector("[data-apply-knots]");
  const resetButton = document.querySelector("[data-reset-knots]");
  const knotHelp = document.querySelector("[data-knot-help]");
  const basisCanvas = document.querySelector("[data-basis-canvas]");
  const sumCanvas = document.querySelector("[data-sum-canvas]");
  const legend = document.querySelector("[data-basis-legend]");
  const status = document.querySelector("[data-status]");
  const sumSummary = document.querySelector("[data-sum-summary]");
  const orderFact = document.querySelector("[data-order-fact]");
  const degreeFact = document.querySelector("[data-degree-fact]");
  const knotFact = document.querySelector("[data-knot-fact]");
  const basisFact = document.querySelector("[data-basis-fact]");
  const domainFact = document.querySelector("[data-domain-fact]");
  const relationshipFact = document.querySelector("[data-relationship-fact]");

  let mode = "clamped";
  let customPeriodic = false;
  let order = 4;

  function resolvedMode() {
    return mode === "custom" && customPeriodic ? "custom-periodic" : mode;
  }

  function isPeriodicMode(value) {
    return value === "periodic" || value === "custom-periodic";
  }

  let knots = Basis.defaultKnotVector(resolvedMode(), order, 6);
  let sampled = Basis.sampleBasisSegments(knots, order, resolvedMode(), 56);

  function formatNumber(value, digits = 4) {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) < 1e-12) return "0";
    return Number(value.toFixed(digits)).toString();
  }

  function formatKnotVector(values) {
    return values.map((value) => formatNumber(value, 12)).join(", ");
  }

  function modeLabel(value) {
    if (value === "unclamped") return "Not clamped";
    if (value === "custom") return "Custom knot vector";
    if (value === "custom-periodic") return "Custom knot vector · periodic";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function lineDash(index) {
    const cycle = Math.floor(index / Lab.palette.length) % 3;
    if (cycle === 1) return [8, 4];
    if (cycle === 2) return [2, 4];
    return [];
  }

  function plotFrame(context, width, height, yMaximum, yLabel) {
    const plot = Lab.plotRect(width, height, { left: 62, right: 22, top: 30, bottom: 56 });
    const configuration = sampled.configuration;
    const plotDomain = configuration.plotDomain ?? configuration.domain ?? [0, 1];
    const activeDomain = configuration.domain;
    const span = Math.max(Number.EPSILON, plotDomain[1] - plotDomain[0]);
    const xFor = (parameter) => plot.left + (parameter - plotDomain[0]) / span * plot.width;
    const yFor = (value) => plot.bottom - value / yMaximum * plot.height;

    context.save();
    context.fillStyle = "#171541";
    context.fillRect(0, 0, width, height);
    context.font = "700 11px system-ui, sans-serif";
    context.lineWidth = 1;

    if (configuration.valid && activeDomain) {
      const tolerance = configuration.tolerance ?? 0;
      const hasShoulders = activeDomain[0] > plotDomain[0] + tolerance || activeDomain[1] < plotDomain[1] - tolerance;
      if (hasShoulders) {
        const activeLeft = xFor(activeDomain[0]);
        const activeRight = xFor(activeDomain[1]);
        context.fillStyle = "rgba(110, 211, 174, 0.09)";
        context.fillRect(activeLeft, plot.top, activeRight - activeLeft, plot.height);
        context.strokeStyle = "rgba(110, 211, 174, 0.45)";
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(activeLeft, plot.top);
        context.lineTo(activeLeft, plot.bottom);
        context.moveTo(activeRight, plot.top);
        context.lineTo(activeRight, plot.bottom);
        context.stroke();
        context.setLineDash([]);
        if (activeRight - activeLeft > 108) {
          context.fillStyle = "rgba(197, 244, 224, 0.8)";
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillText("active unity domain", (activeLeft + activeRight) / 2, plot.top + 7);
        }
      }
    }

    for (let step = 0; step <= 4; step += 1) {
      const value = yMaximum * step / 4;
      const y = yFor(value);
      context.strokeStyle = "rgba(255,255,255,0.09)";
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(formatNumber(value, 2), plot.left - 9, y);
    }

    if (configuration.valid && configuration.domain) {
      const activeKnots = configuration.knots
        .filter((value) => value >= plotDomain[0] - configuration.tolerance && value <= plotDomain[1] + configuration.tolerance)
        .filter((value, index, all) => index === 0 || Math.abs(value - all[index - 1]) > configuration.tolerance);
      const stride = Math.max(1, Math.ceil(activeKnots.length / 14));
      activeKnots.forEach((value, index) => {
        if (index % stride !== 0 && index !== activeKnots.length - 1) return;
        const x = xFor(value);
        context.strokeStyle = "rgba(138,199,255,0.12)";
        context.beginPath();
        context.moveTo(x, plot.top);
        context.lineTo(x, plot.bottom);
        context.stroke();
      });
    }

    context.strokeStyle = "rgba(255,255,255,0.42)";
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(plot.left, plot.top);
    context.lineTo(plot.left, plot.bottom);
    context.lineTo(plot.right, plot.bottom);
    context.stroke();

    const xTicks = [plotDomain[0], (plotDomain[0] + plotDomain[1]) / 2, plotDomain[1]];
    context.fillStyle = "rgba(255,255,255,0.7)";
    context.textBaseline = "top";
    xTicks.forEach((value, index) => {
      context.textAlign = index === 0 ? "left" : index === xTicks.length - 1 ? "right" : "center";
      context.fillText(formatNumber(value, 4), xFor(value), plot.bottom + 10);
    });
    context.fillStyle = "rgba(255,255,255,0.84)";
    context.textAlign = "center";
    context.fillText("parameter u", plot.left + plot.width / 2, height - 18);
    context.save();
    context.translate(15, plot.top + plot.height / 2);
    context.rotate(-Math.PI / 2);
    context.textBaseline = "top";
    context.fillText(yLabel, 0, 0);
    context.restore();
    context.restore();

    return { plot, xFor, yFor, plotDomain, activeDomain };
  }

  function emptyPlotMessage(context, width, height, message) {
    context.save();
    context.fillStyle = "rgba(255,255,255,0.72)";
    context.font = "700 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(message, width / 2, height / 2);
    context.restore();
  }

  function drawBasisPlot(context, width, height) {
    const frame = plotFrame(context, width, height, 1.08, "basis value");
    const configuration = sampled.configuration;
    if (!configuration.valid || !sampled.segments.length) {
      emptyPlotMessage(context, width, height, "Apply a valid knot vector to plot the basis functions");
      return;
    }

    for (let basisIndex = 0; basisIndex < configuration.basisCount; basisIndex += 1) {
      context.save();
      context.strokeStyle = Lab.palette[basisIndex % Lab.palette.length];
      context.lineWidth = 2.5;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.setLineDash(lineDash(basisIndex));
      sampled.segments.forEach((segment) => {
        if (!segment.values.some((row) => Math.abs(row[basisIndex]) > 1e-12)) return;
        context.beginPath();
        segment.parameters.forEach((parameter, sampleIndex) => {
          const x = frame.xFor(parameter);
          const y = frame.yFor(segment.values[sampleIndex][basisIndex]);
          if (sampleIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      });
      context.restore();
    }
  }

  function drawSumPlot(context, width, height) {
    const frame = plotFrame(context, width, height, 1.08, "sum of bases");
    const configuration = sampled.configuration;
    if (!configuration.valid || !sampled.segments.length) {
      emptyPlotMessage(context, width, height, "The sum appears after a valid configuration is applied");
      return;
    }

    context.save();
    context.strokeStyle = "rgba(255,255,255,0.35)";
    context.lineWidth = 1.25;
    context.setLineDash([3, 5]);
    context.beginPath();
    const unityDomain = configuration.domain ?? frame.plotDomain;
    context.moveTo(frame.xFor(unityDomain[0]), frame.yFor(1));
    context.lineTo(frame.xFor(unityDomain[1]), frame.yFor(1));
    context.stroke();

    context.strokeStyle = "#ffd166";
    context.lineWidth = 3.5;
    context.setLineDash([]);
    sampled.segments.forEach((segment) => {
      context.beginPath();
      segment.parameters.forEach((parameter, sampleIndex) => {
        const x = frame.xFor(parameter);
        const y = frame.yFor(segment.sums[sampleIndex]);
        if (sampleIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
    context.restore();
  }

  const basisView = Lab.createCanvas(basisCanvas, drawBasisPlot);
  const sumView = Lab.createCanvas(sumCanvas, drawSumPlot);

  function pythonCode() {
    const vector = knots.map((value) => formatNumber(value, 12)).join(", ");
    const calculationMode = resolvedMode();
    return `import numpy as np
import matplotlib.pyplot as plt

# Notation follows the HTML notes: order m, degree n=m-1,
# knot vector U={u_0,...,u_(k-1)}, and basis N_(m,i)(u).
U = np.array([${vector}], dtype=float)
m = ${order}
mode = "${calculationMode}"
n = m - 1
periodic = mode in ("periodic", "custom-periodic")
custom_finite = mode == "custom"
c = len(U) - (2 * m - 1 if periodic else m)
effective_count = c + n if periodic else c
active_start, active_end = U[m - 1], U[len(U) - m]
plot_start, plot_end = (U[0], U[-1]) if custom_finite else (active_start, active_end)

def full_basis(u):
    """Every possible N_(m,i), built directly by Cox-de Boor."""
    if u >= U[-1]:
        u = np.nextafter(U[-1], U[0])
    u = min(U[-1], max(U[0], u))
    level = np.array([
        1.0 if U[i] <= u < U[i + 1] else 0.0
        for i in range(len(U) - 1)
    ])
    for current_order in range(2, m + 1):
        next_level = np.zeros(len(U) - current_order)
        for i in range(len(next_level)):
            left_denominator = U[i + current_order - 1] - U[i]
            right_denominator = U[i + current_order] - U[i + 1]
            left_term = 0.0 if left_denominator == 0.0 else (
                (u - U[i]) / left_denominator * level[i]
            )
            right_term = 0.0 if right_denominator == 0.0 else (
                (U[i + current_order] - u) / right_denominator * level[i + 1]
            )
            next_level[i] = left_term + right_term
        level = next_level
    return level

def find_span(u):
    if u >= U[effective_count]:
        return effective_count - 1
    if u <= U[n]:
        return n
    low, high = n, effective_count
    span = (low + high) // 2
    while u < U[span] or u >= U[span + 1]:
        if u < U[span]:
            high = span
        else:
            low = span
        span = (low + high) // 2
    return span

def local_basis(span, u):
    values = np.zeros(m)
    left = np.zeros(m)
    right = np.zeros(m)
    values[0] = 1.0
    for column in range(1, m):
        left[column] = u - U[span + 1 - column]
        right[column] = U[span + column] - u
        saved = 0.0
        for row in range(column):
            denominator = right[row + 1] + left[column - row]
            term = 0.0 if denominator == 0.0 else values[row] / denominator
            values[row] = saved + right[row + 1] * term
            saved = left[column - row] * term
        values[column] = saved
    return values

def all_basis(u):
    if custom_finite:
        return full_basis(u)
    # Close the displayed periodic interval at the seam.
    if periodic and u >= active_end:
        u = active_start
    u = min(active_end, max(active_start, u))
    span = find_span(u)
    local = local_basis(span, u)
    values = np.zeros(c)
    for local_index, value in enumerate(local):
        effective_index = span - n + local_index
        basis_index = effective_index % c if periodic else effective_index
        values[basis_index] += value
    return values

span_range = range(len(U) - 1) if custom_finite else range(n, effective_count)
spans = [j for j in span_range if U[j + 1] > U[j]]
fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=True,
                         gridspec_kw={"height_ratios": [2, 1]})
maximum_error = 0.0
for span_number, span in enumerate(spans):
    parameters = np.linspace(U[span], U[span + 1], 81)
    if span_number < len(spans) - 1 or periodic or custom_finite:
        parameters[-1] = np.nextafter(U[span + 1], U[span])
    values = np.array([all_basis(u) for u in parameters])
    for i in range(c):
        axes[0].plot(parameters, values[:, i],
                     label=f"N_{{{m},{i}}}" if span_number == 0 else None)
    total = values.sum(axis=1)
    active = (parameters >= active_start) & (parameters <= active_end)
    if np.any(active):
        maximum_error = max(maximum_error, np.max(np.abs(total[active] - 1.0)))
    axes[1].plot(parameters, total, color="#c83d24", linewidth=2.5)

axes[0].set_ylabel("basis value")
axes[0].set_ylim(0, 1.08)
axes[0].legend(ncol=min(c, 4), fontsize=8)
axes[1].plot([active_start, active_end], [1, 1],
             color="0.55", linestyle="--", linewidth=1)
axes[1].set(xlabel="parameter u", ylabel="sum", ylim=(0, 1.08))
for axis in axes:
    axis.axvspan(active_start, active_end, color="#dff4eb", alpha=0.2)
    axis.set_xlim(plot_start, plot_end)
    axis.grid(alpha=0.22)
display_mode = (mode.replace("custom-periodic", "custom knot vector · periodic")
                    .replace("unclamped", "not clamped"))
fig.suptitle(f"{display_mode.title()} B-spline basis, order m={m}")
fig.tight_layout()
print(f"active-domain max |sum(N_(m,i)) - 1| = {maximum_error:.3e}")
plt.show()`;
  }

  function matlabCode() {
    const vector = knots.map((value) => formatNumber(value, 12)).join(" ");
    const calculationMode = resolvedMode();
    return `% Notation follows the HTML notes: order m, degree n=m-1,
% knot vector U={u_0,...,u_(k-1)}, and basis N_(m,i)(u).
U = [${vector}];
m = ${order};
mode = '${calculationMode}';
n = m - 1;
periodic = strcmp(mode, 'periodic') || strcmp(mode, 'custom-periodic');
customFinite = strcmp(mode, 'custom');
if periodic, c = numel(U) - 2*m + 1; else, c = numel(U) - m; end
if periodic, effectiveCount = c + n; else, effectiveCount = c; end
activeStart = U(m);
activeEnd = U(numel(U)-m+1);
if customFinite, plotStart = U(1); plotEnd = U(end);
else, plotStart = activeStart; plotEnd = activeEnd; end

spans = [];
if customFinite, spanRange = 0:numel(U)-2; else, spanRange = n:effectiveCount-1; end
for span = spanRange
    if U(span+2) > U(span+1), spans(end+1) = span; end %#ok<SAGROW>
end

figure;
tiledlayout(2,1, 'TileSpacing','compact');
nexttile; hold on;
maximumError = 0;
parameterSets = cell(numel(spans),1);
sumSets = cell(numel(spans),1);
for s = 1:numel(spans)
    span = spans(s);
    parameters = linspace(U(span+1), U(span+2), 81);
    if s < numel(spans) || periodic || customFinite
        epsilon = max(eps(max(1,abs(U(span+2))))*16, ...
                      (U(span+2)-U(span+1))*1e-9);
        parameters(end) = U(span+2) - epsilon;
    end
    values = zeros(numel(parameters),c);
    for q = 1:numel(parameters)
        values(q,:) = allBasis(parameters(q),m,U,c,effectiveCount,periodic,customFinite,activeStart,activeEnd);
    end
    for i = 1:c
        if s == 1, label = sprintf('N_{%d,%d}',m,i-1); else, label = ''; end
        plot(parameters,values(:,i),'LineWidth',1.7,'DisplayName',label);
    end
    totals = sum(values,2);
    active = parameters >= activeStart & parameters <= activeEnd;
    if any(active), maximumError = max(maximumError,max(abs(totals(active)-1))); end
    parameterSets{s} = parameters;
    sumSets{s} = totals;
end
ylabel('basis value'); ylim([0 1.08]); xlim([plotStart plotEnd]); grid on; legend show;
title(sprintf('%s B-spline basis, order m=%d', ...
    strrep(strrep(mode,'custom-periodic','custom knot vector - periodic'),'unclamped','not clamped'),m));

nexttile; hold on;
for s = 1:numel(parameterSets)
    plot(parameterSets{s},sumSets{s},'Color',[0.78 0.24 0.14],'LineWidth',2.5);
end
plot([activeStart activeEnd],[1 1],'--','Color',[0.55 0.55 0.55]);
xlabel('parameter u'); ylabel('sum'); ylim([0 1.08]); xlim([plotStart plotEnd]); grid on;
fprintf('active-domain max |sum(N_(m,i)) - 1| = %.3e\n',maximumError);

function values = allBasis(u,m,U,c,effectiveCount,periodic,customFinite,activeStart,activeEnd)
    if customFinite, values = fullBasis(u,m,U); return; end
    n = m-1;
    if periodic && u >= activeEnd, u = activeStart; end
    u = min(activeEnd,max(activeStart,u));
    span = findSpan(u,n,U,effectiveCount);
    local = localBasis(span,u,n,U);
    values = zeros(1,c);
    for localIndex = 0:n
        effectiveIndex = span-n+localIndex;
        if periodic, basisIndex = mod(effectiveIndex,c); else, basisIndex = effectiveIndex; end
        values(basisIndex+1) = values(basisIndex+1) + local(localIndex+1);
    end
end

function values = fullBasis(u,m,U)
    % Every possible N_(m,i), built directly by Cox-de Boor.
    if u >= U(end)
        epsilon = max(eps(max(1,abs(U(end))))*16,(U(end)-U(1))*1e-12);
        u = U(end)-epsilon;
    end
    u = min(U(end),max(U(1),u));
    values = zeros(1,numel(U)-1);
    for i = 1:numel(values)
        if U(i) <= u && u < U(i+1), values(i) = 1; end
    end
    for currentOrder = 2:m
        nextLevel = zeros(1,numel(U)-currentOrder);
        for i = 1:numel(nextLevel)
            leftDenominator = U(i+currentOrder-1)-U(i);
            rightDenominator = U(i+currentOrder)-U(i+1);
            if leftDenominator == 0, leftTerm = 0;
            else, leftTerm = (u-U(i))/leftDenominator*values(i); end
            if rightDenominator == 0, rightTerm = 0;
            else, rightTerm = (U(i+currentOrder)-u)/rightDenominator*values(i+1); end
            nextLevel(i) = leftTerm+rightTerm;
        end
        values = nextLevel;
    end
end

function span = findSpan(u,n,U,effectiveCount)
    last = effectiveCount-1;
    if u >= U(effectiveCount+1), span = last; return; end
    if u <= U(n+1), span = n; return; end
    low = n; high = effectiveCount; span = floor((low+high)/2);
    while u < U(span+1) || u >= U(span+2)
        if u < U(span+1), high = span; else, low = span; end
        span = floor((low+high)/2);
    end
end

function values = localBasis(span,u,n,U)
    values = zeros(1,n+1); values(1) = 1;
    left = zeros(1,n+1); right = zeros(1,n+1);
    for column = 1:n
        left(column+1) = u-U(span+2-column);
        right(column+1) = U(span+column+1)-u;
        saved = 0;
        for row = 0:column-1
            denominator = right(row+2)+left(column-row+1);
            if denominator == 0, term = 0; else, term = values(row+1)/denominator; end
            values(row+1) = saved+right(row+2)*term;
            saved = left(column-row+1)*term;
        end
        values(column+1) = saved;
    end
end`;
  }

  const codePane = Lab.createCodePane({
    generators: { python: pythonCode, matlab: matlabCode },
    pythonFilename: "bspline_basis.py",
    matlabFilename: "bspline_basis.m",
  });

  function renderLegend() {
    const configuration = sampled.configuration;
    const items = [];
    for (let index = 0; index < configuration.basisCount; index += 1) {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      const label = document.createElement("span");
      const subscript = document.createElement("sub");
      swatch.className = "basis-key-swatch";
      swatch.style.setProperty("--basis-color", Lab.palette[index % Lab.palette.length]);
      swatch.dataset.dash = String(Math.floor(index / Lab.palette.length) % 3);
      swatch.setAttribute("aria-hidden", "true");
      subscript.textContent = `${configuration.order},${index}`;
      label.append("N", subscript, "(u)");
      item.append(swatch, label);
      items.push(item);
    }

    const sumItem = document.createElement("li");
    const sumSwatch = document.createElement("span");
    sumSwatch.className = "basis-key-swatch sum-swatch";
    sumSwatch.setAttribute("aria-hidden", "true");
    const sumLabel = document.createElement("span");
    sumLabel.textContent = "Σ Nₘ,ᵢ(u)";
    sumItem.append(sumSwatch, sumLabel);
    items.push(sumItem);
    legend.replaceChildren(...items);
  }

  function sampledSumStatistics(domain) {
    const tolerance = sampled.configuration.tolerance ?? 0;
    const sums = [];
    sampled.segments.forEach((segment) => {
      segment.parameters.forEach((parameter, index) => {
        if (!domain || (parameter >= domain[0] - tolerance && parameter <= domain[1] + tolerance)) {
          sums.push(segment.sums[index]);
        }
      });
    });
    if (!sums.length) return { minimum: 0, maximum: 0, deviation: Infinity };
    return {
      minimum: Math.min(...sums),
      maximum: Math.max(...sums),
      deviation: Math.max(...sums.map((value) => Math.abs(value - 1))),
    };
  }

  function updateKnotHelp(configuration) {
    const calculationMode = resolvedMode();
    if (calculationMode === "clamped") {
      knotHelp.textContent = `Clamped: the first and last knots must each repeat m = ${order} times. For k knots, c = k − m.`;
    } else if (calculationMode === "periodic") {
      knotHelp.textContent = `Periodic: enter the full effective vector, including m − 1 guard knots at each end. Guard spacings must wrap; c = k − 2m + 1.`;
    } else if (calculationMode === "custom-periodic") {
      knotHelp.textContent = `Custom periodic: enter the full custom vector with m − 1 cyclic guard knots at each end. Every independent wrapped basis is plotted; c = k − 2m + 1.`;
    } else if (calculationMode === "custom") {
      knotHelp.textContent = `Custom finite: all c = k − m possible bases are plotted across the full support [u0, u${configuration.knotCount - 1}]. Unity is tested only on the active domain.`;
    } else if (order === 1) {
      knotHelp.textContent = "At order m = 1, Clamped and Not clamped endpoint multiplicities are identical. For k knots, c = k − m.";
    } else {
      knotHelp.textContent = `Not clamped: endpoint multiplicities must be less than m = ${order}. For k knots, c = k − m.`;
    }
    const domainVerb = calculationMode === "custom" ? "highlighted" : "plotted";
    knotHelp.textContent += ` The ${domainVerb} active domain is [u${order - 1}, u${configuration.knotCount - order}].`;
  }

  function render() {
    const calculationMode = resolvedMode();
    customPeriodicControl.hidden = mode !== "custom";
    customPeriodicInput.checked = customPeriodic;
    sampled = Basis.sampleBasisSegments(knots, order, calculationMode, 56);
    const configuration = sampled.configuration;
    const domain = configuration.domain;
    const plotDomain = configuration.plotDomain ?? domain;
    const statistics = sampledSumStatistics(domain);
    const relationship = isPeriodicMode(calculationMode) ? "c = k − 2m + 1" : "c = k − m";

    knotInput.value = formatKnotVector(knots);
    knotInput.setAttribute("aria-invalid", "false");
    status.classList.remove("error");
    orderFact.textContent = String(configuration.order);
    degreeFact.textContent = String(configuration.degree);
    knotFact.textContent = String(configuration.knotCount);
    basisFact.textContent = String(configuration.basisCount);
    domainFact.textContent = domain ? `[${formatNumber(domain[0])}, ${formatNumber(domain[1])}]` : "—";
    relationshipFact.textContent = relationship;
    updateKnotHelp(configuration);
    renderLegend();

    const deviationText = statistics.deviation < 5e-13 ? "below 5 × 10⁻¹³" : formatNumber(statistics.deviation, 10);
    if (calculationMode === "custom") {
      const supportText = plotDomain ? `[${formatNumber(plotDomain[0])}, ${formatNumber(plotDomain[1])}]` : "—";
      status.textContent = `${modeLabel(calculationMode)}, order m = ${order}: all ${configuration.basisCount} possible basis functions across the full knot support ${supportText}. The highlighted active domain is ${domainFact.textContent}.`;
      sumSummary.textContent = `Within the active domain ${domainFact.textContent}, the computed sum ranges from ${formatNumber(statistics.minimum, 10)} to ${formatNumber(statistics.maximum, 10)}; maximum sampled |ΣN − 1| is ${deviationText}. The outer support shoulders are shown but are not partition-of-unity intervals.`;
    } else {
      const periodicText = isPeriodicMode(calculationMode) ? " Wrapped copies are combined by basis index across one period." : "";
      status.textContent = `${modeLabel(calculationMode)}, order m = ${order}: ${configuration.basisCount} possible basis functions over ${domainFact.textContent}.${periodicText}`;
      sumSummary.textContent = `On the active domain, the computed sum ranges from ${formatNumber(statistics.minimum, 10)} to ${formatNumber(statistics.maximum, 10)}. Maximum sampled |ΣN − 1| is ${deviationText}.`;
    }
    basisCanvas.setAttribute("aria-label", `${modeLabel(calculationMode)} B-spline basis functions of order ${order}, showing every possible basis from N ${order} comma 0 through N ${order} comma ${configuration.basisCount - 1}.`);
    const unityScope = calculationMode === "custom" ? `within the active domain ${domainFact.textContent}` : "over the plotted active domain";
    sumCanvas.setAttribute("aria-label", `Computed sum of all ${configuration.basisCount} B-spline basis functions. The sampled sum stays at one ${unityScope}, with maximum deviation ${deviationText}.`);
    basisView.redraw();
    sumView.redraw();
    codePane.render();
  }

  function showError(message) {
    knotInput.setAttribute("aria-invalid", "true");
    status.classList.add("error");
    status.textContent = message;
    knotInput.focus();
  }

  function resetForCondition() {
    const previousCount = sampled.configuration.valid ? sampled.configuration.basisCount : 6;
    mode = modeControl.value;
    if (mode !== "custom") {
      customPeriodic = false;
      customPeriodicInput.checked = false;
    } else {
      customPeriodic = customPeriodicInput.checked;
    }
    order = Number(orderControl.value);
    knots = Basis.defaultKnotVector(resolvedMode(), order, Math.max(order, previousCount));
    render();
  }

  modeControl.addEventListener("change", resetForCondition);
  orderControl.addEventListener("change", resetForCondition);
  customPeriodicInput.addEventListener("change", () => {
    customPeriodic = customPeriodicInput.checked;
    resetForCondition();
  });
  resetButton.addEventListener("click", resetForCondition);
  applyButton.addEventListener("click", () => {
    const parsed = Basis.parseKnotVector(knotInput.value);
    if (parsed.error) {
      showError(parsed.error);
      return;
    }
    const validation = Basis.validateConfiguration(parsed.values, order, resolvedMode());
    if (!validation.valid) {
      showError(validation.errors[0]);
      return;
    }
    knots = parsed.values;
    render();
  });
  knotInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyButton.click();
  });

  modeControl.value = mode;
  orderControl.value = String(order);
  render();
}());
