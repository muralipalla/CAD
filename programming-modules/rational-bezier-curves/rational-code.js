(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RationalBezierCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function python(model) {
    return `# Rational Bezier circle from a polynomial parabola on a cone
# CAD - Murali Palla. Requires: numpy, matplotlib.
import numpy as np
import matplotlib.pyplot as plt

r = ${model.radius}
theta = np.deg2rad(${model.degrees})  # half-angle; arc sweep is 2*theta
c, s = np.cos(theta), np.sin(theta)
u = np.linspace(0.0, 1.0, 201)
B = np.column_stack(((1-u)**2, 2*u*(1-u), u**2))

# Coordinates are (x, y, w). P are lifted polynomial controls.
P = np.array([[r*c, -r*s, 1], [r, 0, c], [r*c, r*s, 1]])
weights = P[:, 2]
p = P / weights[:, None]  # projected controls (x, y, 1)
Q = np.array([r*(1+c)/2, 0, (1+c)/2])  # parabola vertex
H = B @ P  # polynomial parabola

# Notes' projection matrix: V Pi^T - (Pi^T V) I.
# The fourth coordinate is separate from the vertical w-coordinate.
Pi = np.array([0, 0, 1, -1])
V = np.array([0, 0, 0, 1])
Proj = np.outer(V, Pi) - (Pi @ V) * np.eye(4)
projected_h = np.column_stack((H, np.ones(len(u)))) @ Proj.T
R = projected_h[:, :3] / projected_h[:, 3:4]

# Independently evaluate the rational Bezier expression.
weighted_B = B * weights
R_rational = (weighted_B @ p) / weighted_B.sum(axis=1, keepdims=True)
assert np.allclose(R, R_rational)
assert np.allclose(H[:, 0] + r*H[:, 2], r*(1+c))
assert np.allclose(H[:, 0]**2 + H[:, 1]**2, r*r*H[:, 2]**2)
assert np.allclose(R[:, 0]**2 + R[:, 1]**2, r*r)
assert np.allclose(H[len(u)//2], Q)
print("Lifted controls P =", P, sep="\\n")
print("Projected controls p =", p, sep="\\n")
print("Weights =", weights)

fig = plt.figure(figsize=(13, 6), constrained_layout=True)
ax = fig.add_subplot(1, 2, 1, projection="3d")
phi = np.linspace(0, 2*np.pi, 100)
height = np.linspace(0, 1, 24)
phi_grid, w_grid = np.meshgrid(phi, height)
ax.plot_surface(r*w_grid*np.cos(phi_grid), r*w_grid*np.sin(phi_grid),
                w_grid, color="#7d98bc", alpha=0.15, linewidth=0)
ax.plot(r*np.cos(phi), r*np.sin(phi), np.ones_like(phi), color="gray")

# PL is x + r*w = r*(1+c), parallel to (-r, 0, 1).
yy, ww = np.meshgrid([-1.15*r*s, 1.15*r*s], [max(0.08, c-0.08), 1.13])
ax.plot_surface(r*(1+c-ww), yy, ww, color="#997ac6", alpha=0.16)
ax.plot([0, -r], [0, 0], [0, 1], "--", color="#754ab5")
ax.plot(*H.T, color="#a05d0b", linewidth=3, label="Parabola H(u)")
ax.plot(*R.T, color="#147d72", linewidth=3, label="Circular arc r(u)")
ax.plot(*P.T, "o--", color="#754ab5", label="Lifted controls")
ax.plot(*p.T, "o--", color="#147d72", label="Projected controls")
ax.plot([0, p[1, 0]], [0, 0], [0, 1], ":", color="#754ab5")
ax.scatter(*Q, color="#a05d0b"); ax.text(*Q, " Q")
for i in range(3):
    ax.text(*P[i], f" P{i}")
ax.text(*p[1], " p1")
ax.text(0, 0, 0, "O")
ax.set(xlabel="x", ylabel="y", zlabel="w", title="Cone section and central projection")
ax.set_xlim(-1.2*r, 1.1*p[1, 0]); ax.set_ylim(-1.2*r, 1.2*r); ax.set_zlim(0, 1.3)
ax.set_box_aspect((1.2*r + 1.1*p[1, 0], 2.4*r, 1.3))
ax.view_init(elev=28, azim=-65)
ax.legend(loc="upper left", fontsize=8)

ax2 = fig.add_subplot(1, 2, 2)
ax2.plot(r*np.cos(phi), r*np.sin(phi), color="lightgray")
ax2.plot(R[:, 0], R[:, 1], color="#147d72", linewidth=3, label="Rational arc")
ax2.plot(p[:, 0], p[:, 1], "o--", color="#754ab5", label="Projected controls")
for i in range(3):
    ax2.annotate(f"p{i}", p[i, :2], xytext=(6, 6), textcoords="offset points")
ax2.set(xlabel="x", ylabel="y", title="Projection on w = 1")
ax2.set_aspect("equal", adjustable="box"); ax2.grid(alpha=0.2); ax2.legend()
plt.show()
`;
  }
  function matlab(model) {
    return `% Rational Bezier circle from a polynomial parabola on a cone
% CAD - Murali Palla. Coordinates are (x, y, w).
clear; close all; clc;
r = ${model.radius};
theta = ${model.degrees} * pi/180; % half-angle; arc sweep is 2*theta
c = cos(theta); s = sin(theta);
u = linspace(0, 1, 201)';
B = [(1-u).^2, 2*u.*(1-u), u.^2];
P = [r*c, -r*s, 1; r, 0, c; r*c, r*s, 1];
weights = P(:, 3);
p = bsxfun(@rdivide, P, weights); % projected controls
Q = [r*(1+c)/2, 0, (1+c)/2]; % vertex, distinct from P1
H = B*P;

% Notes' matrix: V Pi^T - (Pi^T V) I.
Pi = [0; 0; 1; -1]; V = [0; 0; 0; 1];
Proj = V*Pi' - (Pi'*V)*eye(4);
projected_h = [H, ones(length(u), 1)]*Proj';
R = bsxfun(@rdivide, projected_h(:, 1:3), projected_h(:, 4));
weighted_B = bsxfun(@times, B, weights');
R_rational = bsxfun(@rdivide, weighted_B*p, sum(weighted_B, 2));
assert(max(abs(R(:)-R_rational(:))) < 1e-10);
assert(max(abs(H(:,1)+r*H(:,3)-r*(1+c))) < 1e-10);
assert(max(abs(H(:,1).^2+H(:,2).^2-r*r*H(:,3).^2)) < 1e-10);
assert(max(abs(R(:,1).^2+R(:,2).^2-r*r)) < 1e-10);
assert(norm(H(101,:)-Q) < 1e-10);
disp('Lifted controls P ='); disp(P);
disp('Projected controls p ='); disp(p);
disp('Weights ='); disp(weights');

figure('Color', 'w', 'Position', [80, 80, 1250, 580]);
subplot(1,2,1); hold on;
phi = linspace(0, 2*pi, 100);
[ph, wg] = meshgrid(phi, linspace(0, 1, 24));
surf(r*wg.*cos(ph), r*wg.*sin(ph), wg, ...
    'FaceColor', [0.49, 0.60, 0.74], 'FaceAlpha', 0.15, 'EdgeColor', 'none');
plot3(r*cos(phi), r*sin(phi), ones(size(phi)), 'Color', [0.6,0.6,0.6]);
[yy, ww] = meshgrid([-1.15*r*s, 1.15*r*s], [max(0.08,c-0.08), 1.13]);
surf(r*(1+c-ww), yy, ww, 'FaceColor', [0.6,0.48,0.78], ...
    'FaceAlpha', 0.16, 'EdgeColor', 'none');
plot3([0,-r], [0,0], [0,1], '--', 'Color', [0.46,0.29,0.71]);
h1 = plot3(H(:,1), H(:,2), H(:,3), 'Color', [0.63,0.36,0.04], 'LineWidth', 3);
h2 = plot3(R(:,1), R(:,2), R(:,3), 'Color', [0.08,0.49,0.45], 'LineWidth', 3);
h3 = plot3(P(:,1), P(:,2), P(:,3), 'o--', 'Color', [0.46,0.29,0.71]);
h4 = plot3(p(:,1), p(:,2), p(:,3), 'o--', 'Color', [0.08,0.49,0.45]);
plot3([0,p(2,1)], [0,0], [0,1], ':', 'Color', [0.46,0.29,0.71]);
plot3(Q(1), Q(2), Q(3), 'o', 'Color', [0.63,0.36,0.04]);
text(Q(1), Q(2), Q(3), ' Q'); text(0,0,0,'O');
for i = 1:3
    text(P(i,1), P(i,2), P(i,3), sprintf(' P%d',i-1));
end
text(p(2,1), p(2,2), p(2,3), ' p1');
xlabel('x'); ylabel('y'); zlabel('w');
title('Cone section and central projection');
axis equal; grid on; view(-65,28);
legend([h1,h2,h3,h4], {'Parabola H(u)','Circular arc r(u)', ...
    'Lifted controls','Projected controls'}, 'Location','northwest');

subplot(1,2,2); hold on;
plot(r*cos(phi), r*sin(phi), 'Color', [0.8,0.8,0.8]);
plot(R(:,1), R(:,2), 'Color', [0.08,0.49,0.45], 'LineWidth',3);
plot(p(:,1), p(:,2), 'o--', 'Color', [0.46,0.29,0.71]);
for i = 1:3
    text(p(i,1), p(i,2), sprintf(' p%d',i-1));
end
xlabel('x'); ylabel('y'); title('Projection on w = 1');
axis equal; grid on;
`;
  }
  return { python, matlab };
});

if (typeof document !== "undefined") {
  (function () {
    const api = window.RationalBezierCode;
    const output = document.querySelector("[data-code-output]");
    const status = document.querySelector("[data-code-status]");
    let model, language = "python";
    const filename = () => "rational_bezier." + (language === "python" ? "py" : "m");
    function render() {
      if (!model) return;
      output.textContent = api[language](model);
      document.querySelector("[data-code-filename]").textContent = filename();
      document.querySelectorAll("[data-language]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
      status.textContent = "";
    }
    api.update = next => { model = next; render(); };
    document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => { language = button.dataset.language; render(); }));
    document.querySelector("[data-copy-code]").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(output.textContent); status.textContent = "Program copied."; }
      catch (_) { const range = document.createRange(); range.selectNodeContents(output); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); status.textContent = "The program is selected. Use your browser’s Copy command, or download the file."; }
    });
    document.querySelector("[data-download-code]").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([output.textContent], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = filename(); document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = "Program downloaded.";
    });
  })();
}
