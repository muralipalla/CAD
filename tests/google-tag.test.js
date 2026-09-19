const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const measurementId = "G-V7VVFX9X21";

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(target);
    return entry.isFile() && entry.name.endsWith(".html") ? [target] : [];
  });
}

test("every website page loads the Google tag exactly once", () => {
  const pages = [
    path.join(root, "index.html"),
    path.join(root, "404.html"),
    ...htmlFiles(path.join(root, "cad-modules")),
    ...htmlFiles(path.join(root, "programming-modules")),
    ...htmlFiles(path.join(root, "self-assessment-quizzes"))
  ];

  assert.equal(pages.length, 42);
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const label = path.relative(root, page);
    assert.match(html, /<head>\s*<!-- Google tag \(gtag\.js\) -->/, `${label}: tag is not first in head`);
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js\?id=G-V7VVFX9X21/g) || []).length, 1, `${label}: loader count`);
    assert.equal((html.match(/gtag\('config', 'G-V7VVFX9X21'\)/g) || []).length, 1, `${label}: config count`);
    assert.equal((html.match(new RegExp(measurementId, "g")) || []).length, 2, `${label}: measurement ID count`);
  }
});
