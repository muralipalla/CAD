(function () {
  "use strict";
  if (!document.documentElement.classList.contains("rational-embed") || window.parent === window) return;
  const origin = window.location.origin;
  try { if (origin === "null" || window.parent.location.origin !== origin) return; }
  catch (_) { return; }
  const shell = document.querySelector(".activity-shell");
  if (!shell) return;
  let pending = 0, lastHeight = 0;
  function reportHeight() {
    pending = 0;
    const height = Math.ceil(shell.getBoundingClientRect().height) + 2;
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ type: "cad:rational-bezier:resize", height }, origin);
  }
  function scheduleHeight() {
    if (!pending) pending = window.requestAnimationFrame(reportHeight);
  }
  const observer = new ResizeObserver(scheduleHeight);
  observer.observe(shell);
  window.addEventListener("load", scheduleHeight);
  window.addEventListener("pageshow", scheduleHeight);
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== origin || event.data?.type !== "cad:rational-bezier:measure") return;
    lastHeight = 0;
    scheduleHeight();
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    observer.disconnect();
    if (pending) window.cancelAnimationFrame(pending);
  });
  if (document.fonts) document.fonts.ready.then(scheduleHeight);
  scheduleHeight();
})();
