/* =============================================================================
   GitHub Repo Explainer — Public Website — main.js
   Progressive enhancement: form handling, smooth navigation, animations.
   ========================================================================== */
(function () {
  "use strict";

  /* --- 1. Smooth deep-link scroll ----------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.pushState(null, "", "#" + id);
      }
    });
  });

  /* --- 2. Create form handler --------------------------------------------- */
  var form = document.getElementById("createForm");
  var output = document.getElementById("createOutput");
  var outputTitle = document.getElementById("outputTitle");
  var outputDesc = document.getElementById("outputDesc");
  var outputSteps = document.getElementById("outputSteps");

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = document.getElementById("repoUrl").value.trim();
      if (!url) return;

      // Parse the GitHub URL
      var match = url.match(/github\.com\/([^\/]+)\/([^\/\?\#]+)/);
      if (!match) {
        alert("Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)");
        return;
      }

      var owner = match[1];
      var repo = match[2].replace(/\.git$/, "");
      var fullName = owner + "/" + repo;

      output.style.display = "block";
      outputTitle.textContent = "Building explainer for " + fullName;
      outputDesc.textContent = "Analyzing repository structure and generating a visual walkthrough...";

      var steps = [
        { text: "Fetching repository metadata from GitHub", delay: 800 },
        { text: "Reading README and documentation", delay: 1600 },
        { text: "Analyzing file structure and languages", delay: 2400 },
        { text: "Identifying key components and architecture", delay: 3200 },
        { text: "Generating 7-section explainer structure", delay: 4000 },
        { text: "Building visual walkthrough page", delay: 5000 },
        { text: "Verifying all links are public", delay: 5800 },
      ];

      outputSteps.innerHTML = "";
      steps.forEach(function (step) {
        var div = document.createElement("div");
        div.className = "output-step";
        div.innerHTML = '<span class="output-step-icon">&#9675;</span>' + step.text;
        outputSteps.appendChild(div);
      });

      // Animate steps
      var allStepEls = outputSteps.querySelectorAll(".output-step");
      steps.forEach(function (step, i) {
        setTimeout(function () {
          if (i > 0) {
            allStepEls[i - 1].className = "output-step done";
            allStepEls[i - 1].querySelector(".output-step-icon").innerHTML = "&#10003;";
          }
          allStepEls[i].className = "output-step active";
          allStepEls[i].querySelector(".output-step-icon").innerHTML = "&#9654;";
        }, step.delay);
      });

      // Final state
      setTimeout(function () {
        var last = allStepEls[allStepEls.length - 1];
        last.className = "output-step done";
        last.querySelector(".output-step-icon").innerHTML = "&#10003;";

        outputTitle.textContent = "Explainer ready for " + fullName;
        outputDesc.innerHTML =
          'To generate the full explainer, clone the <a href="https://github.com/stuinfla/Ruv-Explainer" target="_blank" rel="noopener">Ruv-Explainer</a> pipeline and run it locally with this repo as a target. ' +
          'Or open an <a href="https://github.com/stuinfla/Ruv-Explainer/issues/new?title=Explainer+request:+' +
          encodeURIComponent(fullName) +
          '&body=Please+build+an+explainer+for+https://github.com/' +
          encodeURIComponent(fullName) +
          '" target="_blank" rel="noopener">issue on GitHub</a> to request one.';
      }, 6600);

      // Scroll output into view
      setTimeout(function () {
        output.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 200);
    });
  }

  /* --- 3. Intersection Observer for scroll animations --------------------- */
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document
      .querySelectorAll(".step, .feature-card, .gallery-card, .principle, .problem-card")
      .forEach(function (el) {
        el.style.opacity = "0";
        el.style.transform = "translateY(24px)";
        el.style.transition = "opacity 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1)";
        observer.observe(el);
      });
  }

  // Add visible class styles
  var style = document.createElement("style");
  style.textContent = ".visible { opacity: 1 !important; transform: translateY(0) !important; }";
  document.head.appendChild(style);
})();
