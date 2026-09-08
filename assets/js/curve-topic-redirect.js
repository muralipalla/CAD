(function () {
  "use strict";
  const movedTopics = new Set(["bezier-curves","properties","derivative-of-a-bezier-curve","curve-subdivision","degree-elevation","rational-bezier-curves","homogeneous-coordinates-and-rational-curves","rational-representation-of-circle-and-ellipse"]);
  function redirectMovedTopic() {
    if (!movedTopics.has(window.location.hash.slice(1))) return;
    const destination = new URL("../bezier-curves/index.html", window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    window.location.replace(destination.href);
  }
  redirectMovedTopic();
  window.addEventListener("hashchange", redirectMovedTopic);
})();
