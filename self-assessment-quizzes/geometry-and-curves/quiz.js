"use strict";
(() => {
  const solutions = [...document.querySelectorAll("details.solution")];
  const toolbar = document.querySelector("[data-quiz-actions]");
  const toggle = document.querySelector("[data-toggle-solutions]");
  const status = document.querySelector("[data-quiz-status]");
  if (!toolbar || !solutions.length) return;
  toolbar.hidden = false;
  function sync() {
    const count = solutions.filter(item => item.open).length;
    toggle.textContent = count === solutions.length ? "Hide all solutions" : "Show all solutions";
    toggle.setAttribute("aria-pressed", String(count === solutions.length));
  }
  solutions.forEach(item => item.addEventListener("toggle", sync));
  toggle.addEventListener("click", () => {
    const open = !solutions.every(item => item.open);
    solutions.forEach(item => { item.open = open; });
    sync();
  });
  let previous = null;
  const buttons = [...toolbar.querySelectorAll("button")];
  function restore() {
    if (previous) solutions.forEach((item, index) => { item.open = previous[index]; });
    previous = null;
    document.body.classList.remove("print-solutions");
    buttons.forEach(button => { button.disabled = false; });
    sync();
  }
  window.addEventListener("afterprint", restore);
  toolbar.querySelectorAll("[data-print]").forEach(button => {
    button.addEventListener("click", async () => {
      previous = solutions.map(item => item.open);
      buttons.forEach(item => { item.disabled = true; });
      const include = button.dataset.print === "solutions";
      document.body.classList.toggle("print-solutions", include);
      if (include) solutions.forEach(item => { item.open = true; });
      status.textContent = "Preparing equations for printing…";
      try {
        if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        status.textContent = "";
        window.print();
      } catch (error) {
        restore();
        status.textContent = "Printing could not start. Please try your browser’s Print command.";
      }
    });
  });
})();
