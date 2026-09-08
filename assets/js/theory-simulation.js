(function () {
  "use strict";
  const frame = document.querySelector("[data-rational-simulation]");
  if (!frame) return;
  function requestHeight() {
    frame.contentWindow?.postMessage({ type: "cad:rational-bezier:measure" }, window.location.origin);
  }
  frame.addEventListener("load", requestHeight);
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "cad:rational-bezier:resize" || !Number.isFinite(data.height)) return;
    if (data.height < 100 || data.height > 20000) return;
    frame.style.height = Math.ceil(data.height) + "px";
  });
  requestHeight();
})();
