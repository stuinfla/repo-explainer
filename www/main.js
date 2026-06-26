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

  /* --- 2. Create form handler — real pipeline progress -------------------- */
  var form = document.getElementById("createForm");
  var output = document.getElementById("createOutput");
  var outputTitle = document.getElementById("outputTitle");
  var outputDesc = document.getElementById("outputDesc");
  var outputSteps = document.getElementById("outputSteps");

  var PIPELINE_STEPS = [
    "Setup environment",
    "Cloning repository",
    "Building knowledge base",
    "Scaffolding explainer site",
    "Authoring content",
    "Generating images",
    "Running quality gates",
    "Creating GitHub repo",
    "Deploying to Vercel"
  ];

  var ICON_PENDING = "○";   // ○
  var ICON_ACTIVE  = "▶";   // ▶
  var ICON_DONE    = "✓";   // ✓
  var ICON_FAILED  = "✗";   // ✗

  /* Create a single step DOM element */
  function createStepEl(label) {
    var div = document.createElement("div");
    div.className = "output-step";
    var icon = document.createElement("span");
    icon.className = "output-step-icon";
    icon.textContent = ICON_PENDING;
    var text = document.createElement("span");
    text.textContent = label;
    div.appendChild(icon);
    div.appendChild(text);
    return div;
  }

  /* Update step status: pending | active | done | error */
  function setStepStatus(el, status) {
    el.className = "output-step " + status;
    var icon = el.querySelector(".output-step-icon");
    if (status === "done")        icon.textContent = ICON_DONE;
    else if (status === "error")  icon.textContent = ICON_FAILED;
    else if (status === "active") icon.textContent = ICON_ACTIVE;
    else                          icon.textContent = ICON_PENDING;
  }

  /* Format elapsed seconds as m:ss */
  function fmtElapsed(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  /* Render all 9 pipeline step elements and return their DOM refs */
  function renderPipelineSteps() {
    outputSteps.innerHTML = "";
    var refs = [];
    for (var i = 0; i < PIPELINE_STEPS.length; i++) {
      var el = createStepEl("Step " + i + ": " + PIPELINE_STEPS[i]);
      outputSteps.appendChild(el);
      refs.push(el);
    }
    // Elapsed timer row
    var timerRow = document.createElement("div");
    timerRow.className = "output-elapsed";
    timerRow.textContent = "Elapsed: 0:00";
    outputSteps.appendChild(timerRow);
    return { stepEls: refs, timerEl: timerRow };
  }

  /* Update step elements from a status response */
  function applyStepStatuses(stepEls, steps) {
    if (!steps || !steps.length) return;
    for (var i = 0; i < stepEls.length; i++) {
      if (i < steps.length) {
        setStepStatus(stepEls[i], steps[i].status || "pending");
      }
    }
  }

  /* Show success result with clickable links (XSS-safe) */
  function showSuccessResult(data) {
    outputTitle.textContent = "Your explainer is live!";
    outputDesc.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "output-result-links";

    if (data.siteUrl) {
      var p1 = document.createElement("p");
      var a1 = document.createElement("a");
      a1.href = data.siteUrl;
      a1.target = "_blank";
      a1.rel = "noopener";
      a1.className = "output-link output-link-primary";
      a1.textContent = "Visit your explainer →";
      p1.appendChild(a1);
      wrap.appendChild(p1);
    }

    if (data.repoUrl) {
      var p2 = document.createElement("p");
      var a2 = document.createElement("a");
      a2.href = data.repoUrl;
      a2.target = "_blank";
      a2.rel = "noopener";
      a2.className = "output-link";
      a2.textContent = "GitHub repo →";
      p2.appendChild(a2);
      wrap.appendChild(p2);
    }

    if (data.issueUrl) {
      var p3 = document.createElement("p");
      var a3 = document.createElement("a");
      a3.href = data.issueUrl;
      a3.target = "_blank";
      a3.rel = "noopener";
      a3.className = "output-link";
      a3.textContent = "Tracking issue →";
      p3.appendChild(a3);
      wrap.appendChild(p3);
    }

    outputDesc.appendChild(wrap);
  }

  /* Show failure result with error message and Try Again button */
  function showFailureResult(message) {
    outputTitle.textContent = "Build failed";
    outputDesc.innerHTML = "";

    var errP = document.createElement("p");
    errP.className = "output-error-msg";
    errP.textContent = message || "An unexpected error occurred.";
    outputDesc.appendChild(errP);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary output-retry-btn";
    btn.textContent = "Try Again";
    btn.addEventListener("click", function () {
      resetForm();
    });
    outputDesc.appendChild(btn);
  }

  /* Reset form to initial state */
  function resetForm() {
    var submitBtn = form.querySelector('button[type="submit"]');
    var urlInput = document.getElementById("repoUrl");
    var emailInput = document.getElementById("submitterEmail");
    submitBtn.disabled = false;
    urlInput.disabled = false;
    urlInput.value = "";
    if (emailInput) {
      emailInput.disabled = false;
      emailInput.value = "";
    }
    output.style.display = "none";
    outputSteps.innerHTML = "";
    outputDesc.innerHTML = "";
    outputTitle.textContent = "";
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = document.getElementById("repoUrl").value.trim();
      if (!url) return;

      var match = url.match(/github\.com\/([^\/]+)\/([^\/\?\#]+)/);
      if (!match) {
        alert(
          "Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)"
        );
        return;
      }

      var owner = match[1];
      var repo = match[2].replace(/\.git$/, "");
      var fullName = owner + "/" + repo;

      var emailInput = document.getElementById("submitterEmail");
      var email = emailInput ? emailInput.value.trim() : "";

      // Disable the form while processing
      var submitBtn = form.querySelector('button[type="submit"]');
      var urlInput = document.getElementById("repoUrl");
      submitBtn.disabled = true;
      urlInput.disabled = true;
      if (emailInput) emailInput.disabled = true;

      // Show the output panel
      output.style.display = "block";
      outputTitle.textContent = "Building explainer for " + fullName;
      outputDesc.textContent = "Submitting build request…";
      outputSteps.innerHTML = "";

      // Scroll output into view
      setTimeout(function () {
        output.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);

      // POST to /api/build
      var body = { url: url };
      if (email) body.email = email;

      fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (result) {
          var data = result.data;

          if (data.error) {
            outputTitle.textContent = "Request failed";
            outputDesc.textContent = data.error;
            submitBtn.disabled = false;
            urlInput.disabled = false;
            if (emailInput) emailInput.disabled = false;
            return;
          }

          // Build accepted — start pipeline tracking
          var buildId   = data.buildId   || "";
          var gistId    = data.gistId    || "";
          var repoName  = data.repoName  || fullName;

          outputTitle.textContent = "Building explainer for " + repoName;
          outputDesc.textContent = "Pipeline is running…";

          var ui = renderPipelineSteps();
          var startTime = Date.now();
          var elapsedInterval = null;
          var pollTimer = null;
          var consecutiveErrors = 0;
          var currentDelay = 5000;
          var stopped = false;

          // Elapsed clock — update every second
          elapsedInterval = setInterval(function () {
            var secs = Math.floor((Date.now() - startTime) / 1000);
            ui.timerEl.textContent = "Elapsed: " + fmtElapsed(secs);
          }, 1000);

          function stopTracking() {
            stopped = true;
            if (elapsedInterval) clearInterval(elapsedInterval);
            if (pollTimer) clearTimeout(pollTimer);
          }

          function poll() {
            if (stopped) return;

            var statusUrl = "/api/status?id=" +
              encodeURIComponent(buildId) +
              "&gist=" + encodeURIComponent(gistId);

            fetch(statusUrl)
              .then(function (res) { return res.json(); })
              .then(function (statusData) {
                // Successful response — reset error tracking
                consecutiveErrors = 0;
                currentDelay = 5000;

                // Update step statuses
                var currentStep = typeof statusData.step === "number" ? statusData.step : -1;
                for (var i = 0; i < ui.stepEls.length; i++) {
                  if (i < currentStep) {
                    setStepStatus(ui.stepEls[i], "done");
                  } else if (i === currentStep) {
                    setStepStatus(ui.stepEls[i], statusData.status === "running" ? "active" : "done");
                  } else {
                    setStepStatus(ui.stepEls[i], "pending");
                  }
                }

                // Check terminal states
                if (statusData.status === "done") {
                  stopTracking();
                  for (var j = 0; j < ui.stepEls.length; j++) {
                    setStepStatus(ui.stepEls[j], "done");
                  }
                  var result = statusData.result || {};
                  showSuccessResult({
                    siteUrl:  result.explainerUrl || "",
                    repoUrl:  result.repoUrl      || "",
                    issueUrl: result.issueUrl      || data.issueUrl || ""
                  });
                  return;
                }

                if (statusData.status === "failed") {
                  stopTracking();
                  if (currentStep >= 0) {
                    setStepStatus(ui.stepEls[currentStep], "error");
                  }
                  showFailureResult(statusData.error);
                  return;
                }

                // Still running — schedule next poll
                pollTimer = setTimeout(poll, currentDelay);
              })
              .catch(function () {
                // Network error
                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                  outputDesc.textContent = "Lost connection — retrying…";
                }
                // Exponential backoff: 5s -> 10s -> 20s (capped)
                currentDelay = Math.min(currentDelay * 2, 20000);
                pollTimer = setTimeout(poll, currentDelay);
              });
          }

          // Start polling
          pollTimer = setTimeout(poll, currentDelay);
        })
        .catch(function () {
          outputTitle.textContent = "Request failed";
          outputDesc.textContent =
            "Could not reach the server. Please check your connection and try again.";
          submitBtn.disabled = false;
          urlInput.disabled = false;
          if (emailInput) emailInput.disabled = false;
        });
    });
  }

  /* --- 3. Transformation pipeline animation ------------------------------ */
  (function initTransformAnim() {
    var before = document.getElementById("taBefore");
    var after  = document.getElementById("taAfter");
    var pipeline = document.getElementById("taPipeline");
    if (!before || !after || !pipeline) return;

    var steps = pipeline.querySelectorAll(".ta-step");
    var played = false;

    function runAnimation() {
      if (played) return;
      played = true;

      pipeline.classList.add("active");
      before.classList.add("animating");

      steps.forEach(function (step, i) {
        setTimeout(function () {
          if (i > 0) {
            steps[i - 1].classList.remove("active");
            steps[i - 1].classList.add("done");
          }
          step.classList.add("active");
        }, 600 + i * 700);
      });

      var totalTime = 600 + steps.length * 700;
      setTimeout(function () {
        steps[steps.length - 1].classList.remove("active");
        steps[steps.length - 1].classList.add("done");
        after.classList.add("revealed");
      }, totalTime);
    }

    if ("IntersectionObserver" in window) {
      var animObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            runAnimation();
            animObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      animObs.observe(pipeline);
    } else {
      runAnimation();
    }
  })();

  /* --- 4. Intersection Observer for scroll animations --------------------- */
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
