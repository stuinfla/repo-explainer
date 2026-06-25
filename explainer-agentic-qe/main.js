/* =============================================================================
   Agentic QE Explainer — main.js
   Progressive enhancement only. The page is fully usable with JS disabled.
   ========================================================================== */
(function () {
  "use strict";

  /* --- 1. Deep-link a section open ---------------------------------------- */
  function openFromHash() {
    var id = (location.hash || "").replace(/^#/, "");
    if (!id) return;
    var el = document.getElementById(id);
    while (el && el.tagName !== "DETAILS") el = el.parentElement;
    if (el && !el.open) el.open = true;
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function () {
      var id = a.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      while (sec && sec.tagName !== "DETAILS") sec = sec.parentElement;
      if (sec && !sec.open) sec.open = true;
    });
  });
})();
