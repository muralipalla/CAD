# CAD

A responsive, static learning website for computer-aided design fundamentals, geometry programming, and self-assessment.

## Sections

- **Theory and Interactive Modules** — six course-note modules on geometric transformations, curves, Bezier curves, B-splines, surfaces, and solid modeling, followed by standalone Rational Bezier Curves, Möbius Surface, and Intrinsic and Extrinsic Rotations visualizations.
- **Programming Modules** — synchronized Python/MATLAB code and JavaScript graphics for interpolation, Bezier curves, Hermite curves, B-spline basis functions, B-splines/NURBS, and B-spline surfaces.
- **Self Assessment Quizzes** — a 16-question Geometry and Curves quiz with complete data, worked solutions, and printable question/solution sheets.

The site includes:

- six teaching modules organized from the course LaTeX source;
- standalone Rational Bezier Curves, Möbius Surface, and Intrinsic and Extrinsic Rotations visualizations;
- six interactive curve and surface laboratories with Python/MATLAB code views;
- the Sketch Constraints and Parametric Circular Patterns activities; and
- a comprehensive geometry and curves self-assessment quiz.

## Run locally

No build step or package installation is required. Serve the repository root with any local HTTP server, or open `index.html` for a basic preview.

For example, with Python installed:

```text
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

All internal URLs are relative, so the site works from a GitHub Pages project subpath. The included workflow publishes the repository root whenever the `main` branch is updated.

After creating the repository on GitHub:

1. Push the project to the `main` branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.

## Structure

```text
assets/                       Shared styles and small site-wide script
cad-modules/                  CAD lesson hub and activities
programming-modules/          Programming lesson hub and activities
self-assessment-quizzes/      Quiz hub and assessments
.github/workflows/pages.yml   GitHub Pages deployment
```

The B-spline surface lab at `programming-modules/b-spline-surfaces/` starts with a
flat 4 × 4 square grid, stored in `P00, P10, P20, P30, P01, ..., P33` order. Select
a point in either view or the point selector, drag its x–y position, and adjust z
with the height slider below the left grid. With the default grid and order,
Clamped mode uses `[0,0,0,0,1,1,1,1]`; Open (unclamped) uses
`[-3,-2,-1,0,1,2,3,4]`. Both have active domain `[0,1] × [0,1]`.
Changing order or boundary mode preserves the control net; changing grid size
starts a new flat grid and reduces the order if needed.
`surface-three.js` owns the independent Three.js view;
`surface-math.js` evaluates tensor-product B-spline surfaces and manages editable 4×4, 5×5 and 6×6 grids, with orders 2 through the control count per direction.
Run the numerical and editing tests with `node --test tests/*.test.js`.

The Rational Bézier Curves module at `cad-modules/rational-bezier-curves/`
shows a quadratic parabola cut from a cone and its central projection onto `w=1`.
Adjust radius, half-angle, and curve parameter; inspect the 3D construction and
linked 2D arc, controls, and weights `(1, cos(theta), 1)`. The step-by-step derivation
uses the notes' general perspective-projection matrix. `rational-three.js` owns
the independent Three.js view; `rational-math.js` evaluates the construction;
`rational-code.js` generates matching Python/MATLAB programs. The demo uses
`0.5 <= r <= 3`, `0 <= theta <= 180` degrees, and `0 <= u <= 1`.
The circle framing stays fixed as the angle changes; projected controls may leave
the view. Both plots use dark backgrounds, with point labels off by default.
Three.js handles wheel/trackpad/touch zoom inside the 3D canvas. At 90 degrees,
the middle projected control is at infinity; above 90 its weight is negative.
At 180 degrees, the section degenerates to a generator and its midpoint cannot
be projected. The reference circle remains visible without claiming that this
degenerate single quadratic represents a full circle.

The Möbius Surface module at `cad-modules/mobius-surface/` constructs a strip
with adjustable strip width, loop radius, and 0–3 half-twists. The completed
strip is shown directly, with the construction algorithm and a worked normal
calculation below. A separate view follows a continuous local normal through
one and two laps: even twist counts give an orientable band with two boundary
curves, while odd counts give a non-orientable strip with one boundary curve.
`mobius-math.js` provides the construction and derivatives;
`mobius-three.js` renders the views. Run its mathematical checks with
`node --test tests/mobius-surface.test.js`.

The Intrinsic and Extrinsic Rotations module at
`cad-modules/intrinsic-extrinsic-rotations/` compares active, right-handed
rotations about moving body axes and fixed world axes. Choose one of six axis
orders and three signed degree angles, animate or step through the sequence,
and reverse the extrinsic axis–angle pairs to compare equivalent endpoints.
Two synchronized Three.js cameras show an asymmetric aircraft and both frames.
Current orientation matrices and angular differences remain available without
WebGL. `rotations-math.js` provides the matrix and sequence calculations;
`rotations-three.js` owns the 3D views. Run the mathematical checks with
`node --test tests/intrinsic-extrinsic-rotations.test.js`.

## Accessibility and compatibility

The site uses semantic landmarks, keyboard-visible focus states, skip links, labelled controls, live regions for activity feedback, responsive layouts, and reduced-motion support. Teaching-module equations are rendered by a pinned MathJax script from jsDelivr; the curve laboratories use Canvas 2D JavaScript, and the home-page surface and B-spline surface lab use a locally bundled Three.js runtime.

## License

Original educational text, notes, derivations, illustrations, quiz questions and worked explanations are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), unless otherwise noted. Original website and example source code remains under the MIT License. See [LICENSE](LICENSE) for the scope and software terms; third-party materials retain their own licenses.

## References, licensing and attributions

The [References, Licensing and Attributions page](https://muralipalla.github.io/CAD/cad-modules/references/index.html) brings together the bibliography, source acknowledgments, AI preparation tools, software credits and feedback contact. The home-page footer provides a short licensing notice and links to that page.
