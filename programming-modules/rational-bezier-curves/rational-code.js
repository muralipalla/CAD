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
theta_degrees = ${model.degrees}
theta = np.deg2rad(theta_degrees)  # half-angle; arc sweep is 2*theta
c, s = np.cos(theta), np.sin(theta)
if theta_degrees == 90: c = 0.0
if theta_degrees == 180: s = 0.0
a = 0.0 if theta_degrees == 180 else np.cos(theta/2)
b = np.sin(theta/2)
u = np.linspace(0.0, 1.0, 201)
if 0 < theta_degrees < 180:
    polar = np.linspace(-theta, theta, 201)
    angle_u = (1 + (a/b)*np.tan(polar/2))/2
    u = np.unique(np.clip(np.r_[u, angle_u], 0, 1))
B = np.column_stack(((1-u)**2, 2*u*(1-u), u**2))

# Coordinates are (x, y, w). P are lifted polynomial controls.
P = np.array([[r*c, -r*s, 1], [r, 0, c], [r*c, r*s, 1]])
weights = P[:, 2]
p = np.full_like(P, np.nan)
finite_controls = weights != 0
p[finite_controls] = P[finite_controls] / weights[finite_controls, None]
Q = np.array([r*a*a, 0, a*a])  # vertex (the apex at theta=180)
t = 2*u - 1
H = np.column_stack((r*(a*a-b*b*t*t), 2*r*a*b*t, a*a+b*b*t*t))
assert np.allclose(H, B @ P)  # stable form of the polynomial Bezier curve

# Notes' projection matrix: V Pi^T - (Pi^T V) I.
# The fourth coordinate is separate from the vertical w-coordinate.
Pi = np.array([0, 0, 1, -1])
V = np.array([0, 0, 0, 1])
Proj = np.outer(V, Pi) - (Pi @ V) * np.eye(4)
projected_h = np.column_stack((H, np.ones(len(u)))) @ Proj.T
valid = projected_h[:, 3] != 0
R = np.full_like(H, np.nan)
R[valid] = projected_h[valid, :3] / projected_h[valid, 3:4]

# Homogeneous controls also work when p1 is at infinity (theta=90).
H_from_controls = B @ P
R_rational = H_from_controls[valid] / H_from_controls[valid, 2:3]
assert np.allclose(R[valid], R_rational)
assert np.allclose(H[:, 0] + r*H[:, 2], r*(1+c))
assert np.allclose(H[:, 0]**2 + H[:, 1]**2, r*r*H[:, 2]**2)
assert np.allclose(R[valid, 0]**2 + R[valid, 1]**2, r*r)
assert np.allclose(H[np.argmin(abs(u-0.5))], Q)
print("Lifted controls P =", P, sep="\\n")
print("Projected controls p =", p, sep="\\n")
print("Weights =", weights)
if theta_degrees == 90: print("p1 is at infinity; the semicircle is finite.")
if theta_degrees == 180: print("Singular 360-degree limit: projection is undefined at u=0.5.")

fig = plt.figure(figsize=(13, 6), constrained_layout=True)
ax = fig.add_subplot(1, 2, 1, projection="3d")
phi = np.linspace(0, 2*np.pi, 100)
height = np.linspace(0, 1, 24)
phi_grid, w_grid = np.meshgrid(phi, height)
ax.plot_surface(r*w_grid*np.cos(phi_grid), r*w_grid*np.sin(phi_grid),
                w_grid, color="#7d98bc", alpha=0.15, linewidth=0)
ax.plot(r*np.cos(phi), r*np.sin(phi), np.ones_like(phi), color="gray")

# PL is x + r*w = r*(1+c), parallel to (-r, 0, 1).
yl = r*max(1.15*s, 0.14)
yy, ww = np.meshgrid([-yl, yl], [c-0.08, 1.13])
ax.plot_surface(r*(1+c-ww), yy, ww, color="#997ac6", alpha=0.16)
ax.plot([0, -r], [0, 0], [0, 1], "--", color="#754ab5")
ax.plot(*H.T, color="#a05d0b", linewidth=3, label="Parabola H(u)")
ax.plot(*R.T, color="#147d72", linewidth=3, label="Circular arc r(u)")
ax.plot(*P.T, "o--", color="#754ab5", label="Lifted controls")
ax.plot(*p.T, "o--", color="#147d72", label="Projected controls")
if finite_controls[1]:
    start = P[1] if c < 0 else np.zeros(3)
    ax.plot([start[0], p[1,0]], [0,0], [start[2],1], ":", color="#754ab5")
else:
    for endpoint in p[[0,2]]:
        ax.plot([0, 4*r], [endpoint[1]]*2, [1,1], "--", color="#147d72")
ax.scatter(*Q, color="#a05d0b"); ax.text(*Q, " Q")
for i in range(3):
    ax.text(*P[i], f" P{i}")
if finite_controls[1] and abs(p[1,0]) < 1.3*r: ax.text(*p[1], " p1")
ax.text(0, 0, 0, "O")
ax.set(xlabel="x", ylabel="y", zlabel="w", title="Cone section and central projection")
ax.set_xlim(-1.4*r, 1.4*r); ax.set_ylim(-1.4*r, 1.4*r); ax.set_zlim(-1.2, 1.4)
ax.set_box_aspect((2.8*r, 2.8*r, 2.6))
ax.view_init(elev=28, azim=-65)
ax.legend(loc="upper left", fontsize=8)

ax2 = fig.add_subplot(1, 2, 2)
ax2.plot(r*np.cos(phi), r*np.sin(phi), color="lightgray")
ax2.plot(R[:, 0], R[:, 1], color="#147d72", linewidth=3, label="Rational arc")
ax2.plot(p[:, 0], p[:, 1], "o--", color="#754ab5", label="Projected controls")
for i in range(3):
    if finite_controls[i] and abs(p[i,0]) < 1.3*r:
        ax2.annotate(f"p{i}", p[i, :2], xytext=(6, 6), textcoords="offset points")
if not finite_controls[1]:
    for endpoint in p[[0,2]]:
        ax2.plot([0,4*r], [endpoint[1]]*2, "--", color="#754ab5")
ax2.set(xlabel="x", ylabel="y", title="Projection on w = 1")
ax2.set_xlim(-1.4*r, 1.4*r); ax2.set_ylim(-1.4*r, 1.4*r)
ax2.set_aspect("equal", adjustable="box"); ax2.grid(alpha=0.2); ax2.legend()
plt.show()
`;
  }
  function matlab(model) {
    return `% Rational Bezier circle from a polynomial parabola on a cone
% CAD - Murali Palla. Coordinates are (x, y, w).
clear; close all; clc;
r = ${model.radius};
theta_degrees = ${model.degrees};
theta = theta_degrees * pi/180; % half-angle; arc sweep is 2*theta
c = cos(theta); s = sin(theta);
if theta_degrees == 90, c = 0; end
if theta_degrees == 180, s = 0; end
a = cos(theta/2); b = sin(theta/2);
if theta_degrees == 180, a = 0; end
u = linspace(0, 1, 201)';
if theta_degrees > 0 && theta_degrees < 180
    polar = linspace(-theta, theta, 201)';
    angle_u = (1+(a/b)*tan(polar/2))/2;
    u = unique(max(0,min(1,[u; angle_u])));
end
B = [(1-u).^2, 2*u.*(1-u), u.^2];
P = [r*c, -r*s, 1; r, 0, c; r*c, r*s, 1];
weights = P(:, 3);
p = nan(size(P)); finite_controls = weights ~= 0;
p(finite_controls,:) = bsxfun(@rdivide, P(finite_controls,:), weights(finite_controls));
Q = [r*a*a, 0, a*a]; % vertex (the apex at theta=180)
t = 2*u-1;
H = [r*(a*a-b*b*t.^2), 2*r*a*b*t, a*a+b*b*t.^2];
H_from_controls = B*P;
assert(max(abs(H(:)-H_from_controls(:))) < 1e-10);

% Notes' matrix: V Pi^T - (Pi^T V) I.
Pi = [0; 0; 1; -1]; V = [0; 0; 0; 1];
Proj = V*Pi' - (Pi'*V)*eye(4);
projected_h = [H, ones(length(u), 1)]*Proj';
valid = projected_h(:,4) ~= 0;
R = nan(size(H));
R(valid,:) = bsxfun(@rdivide, projected_h(valid,1:3), projected_h(valid,4));
% Homogeneous evaluation avoids zero times infinity at theta=90.
R_rational = bsxfun(@rdivide, H_from_controls(valid,:), H_from_controls(valid,3));
difference = R(valid,:) - R_rational;
assert(max(abs(difference(:))) < 1e-9);
assert(max(abs(H(:,1)+r*H(:,3)-r*(1+c))) < 1e-10);
assert(max(abs(H(:,1).^2+H(:,2).^2-r*r*H(:,3).^2)) < 1e-10);
assert(max(abs(R(valid,1).^2+R(valid,2).^2-r*r)) < 1e-10);
[~,mid] = min(abs(u-0.5)); assert(norm(H(mid,:)-Q) < 1e-10);
disp('Lifted controls P ='); disp(P);
disp('Projected controls p ='); disp(p);
disp('Weights ='); disp(weights');
if theta_degrees == 90, disp('p1 is at infinity; the semicircle is finite.'); end
if theta_degrees == 180, disp('Singular 360-degree limit: undefined at u=0.5.'); end

figure('Color', 'w', 'Position', [80, 80, 1250, 580]);
subplot(1,2,1); hold on;
phi = linspace(0, 2*pi, 100);
[ph, wg] = meshgrid(phi, linspace(0, 1, 24));
surf(r*wg.*cos(ph), r*wg.*sin(ph), wg, ...
    'FaceColor', [0.49, 0.60, 0.74], 'FaceAlpha', 0.15, 'EdgeColor', 'none');
plot3(r*cos(phi), r*sin(phi), ones(size(phi)), 'Color', [0.6,0.6,0.6]);
yl = r*max(1.15*s, 0.14);
[yy, ww] = meshgrid([-yl,yl], [c-0.08, 1.13]);
surf(r*(1+c-ww), yy, ww, 'FaceColor', [0.6,0.48,0.78], ...
    'FaceAlpha', 0.16, 'EdgeColor', 'none');
plot3([0,-r], [0,0], [0,1], '--', 'Color', [0.46,0.29,0.71]);
h1 = plot3(H(:,1), H(:,2), H(:,3), 'Color', [0.63,0.36,0.04], 'LineWidth', 3);
h2 = plot3(R(:,1), R(:,2), R(:,3), 'Color', [0.08,0.49,0.45], 'LineWidth', 3);
h3 = plot3(P(:,1), P(:,2), P(:,3), 'o--', 'Color', [0.46,0.29,0.71]);
h4 = plot3(p(:,1), p(:,2), p(:,3), 'o--', 'Color', [0.08,0.49,0.45]);
if finite_controls(2)
    start = [0,0,0]; if c < 0, start = P(2,:); end
    plot3([start(1),p(2,1)], [0,0], [start(3),1], ':', 'Color', [0.46,0.29,0.71]);
else
    for j = [1,3]
        plot3([0,4*r], [p(j,2),p(j,2)], [1,1], '--', 'Color', [0.08,0.49,0.45]);
    end
end
plot3(Q(1), Q(2), Q(3), 'o', 'Color', [0.63,0.36,0.04]);
text(Q(1), Q(2), Q(3), ' Q'); text(0,0,0,'O');
for i = 1:3
    text(P(i,1), P(i,2), P(i,3), sprintf(' P%d',i-1));
end
if finite_controls(2) && abs(p(2,1)) < 1.3*r, text(p(2,1),p(2,2),p(2,3),' p1'); end
xlabel('x'); ylabel('y'); zlabel('w');
title('Cone section and central projection');
axis equal; grid on; view(-65,28);
xlim([-1.4*r,1.4*r]); ylim([-1.4*r,1.4*r]); zlim([-1.2,1.4]);
legend([h1,h2,h3,h4], {'Parabola H(u)','Circular arc r(u)', ...
    'Lifted controls','Projected controls'}, 'Location','northwest');

subplot(1,2,2); hold on;
plot(r*cos(phi), r*sin(phi), 'Color', [0.8,0.8,0.8]);
plot(R(:,1), R(:,2), 'Color', [0.08,0.49,0.45], 'LineWidth',3);
plot(p(:,1), p(:,2), 'o--', 'Color', [0.46,0.29,0.71]);
for i = 1:3
    if finite_controls(i) && abs(p(i,1)) < 1.3*r
        text(p(i,1), p(i,2), sprintf(' p%d',i-1));
    end
end
if ~finite_controls(2)
    for j = [1,3], plot([0,4*r], [p(j,2),p(j,2)], '--', 'Color',[0.46,0.29,0.71]); end
end
xlabel('x'); ylabel('y'); title('Projection on w = 1');
axis equal; grid on;
xlim([-1.4*r,1.4*r]); ylim([-1.4*r,1.4*r]);
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
