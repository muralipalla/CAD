const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(root, "cad-modules", "geometric-transformations", "index.html");
const workflowPath = path.join(root, ".github", "workflows", "pages.yml");
const courseIndexPath = path.join(root, "cad-modules", "index.html");

test("Pages keeps the shared Euler-angle runtime while excluding its draft page", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const sharedDirectory = "_site/cad-modules/intrinsic-extrinsic-rotations";

  assert.match(page, /rotations-math\.js\?v=\d+/);
  assert.match(page, /rotations-three\.js\?v=\d+/);
  assert.doesNotMatch(
    workflow,
    /rm\s+-r[f]?\s+--\s+_site\/cad-modules\/intrinsic-extrinsic-rotations(?:\s|$)/,
    "The whole shared-runtime directory must not be removed from the Pages artifact."
  );
  assert.match(workflow, new RegExp("rm -- " + sharedDirectory + "/index\\.html"));
  assert.doesNotMatch(workflow, new RegExp("rm -- " + sharedDirectory + "/rotations-(?:math|three)\\.js"));
});

test("course learning outcomes use a native collapsed disclosure", () => {
  const page = fs.readFileSync(courseIndexPath, "utf8");

  assert.match(page, /<details class="content-panel learning-outcomes-disclosure">/);
  assert.match(page, /<summary>[\s\S]*?id="learning-outcomes-title"/);
  assert.doesNotMatch(page, /<details class="content-panel learning-outcomes-disclosure"\s+open>/);
});
