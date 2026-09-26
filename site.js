(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  function setNav(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNav(!nav.classList.contains("is-open"));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setNav(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setNav(false);
    });
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion && "IntersectionObserver" in window) {
    var revealables = document.querySelectorAll(".reveal");
    if (revealables.length) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      revealables.forEach(function (el) {
        observer.observe(el);
      });
    }
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* Guided scrolling: Fortschritt, aktive Nav, Journey, Pfad, Ablauf */
  var progress = document.querySelector(".scroll-progress");
  var progressBar = document.querySelector(".scroll-progress-bar");
  var journeyLinks = Array.prototype.slice.call(
    document.querySelectorAll(".journey [data-journey]")
  );
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".nav [data-nav]")
  );
  var pathItems = Array.prototype.slice.call(
    document.querySelectorAll(".path [data-path]")
  );
  var stepItems = Array.prototype.slice.call(
    document.querySelectorAll("#ablauf-steps [data-step]")
  );

  var sectionOrder = [
    "top",
    "leistungen",
    "planung",
    "ablauf",
    "ueber-mich",
    "kontakt"
  ];

  function sectionEl(id) {
    if (id === "top") return document.getElementById("einstieg") || document.getElementById("top");
    return document.getElementById(id);
  }

  function currentSectionId() {
    var marker = window.scrollY + window.innerHeight * 0.32;
    var current = "top";
    sectionOrder.forEach(function (id) {
      var el = sectionEl(id);
      if (!el) return;
      if (el.offsetTop <= marker) current = id;
    });
    return current;
  }

  function setActiveGroup(nodes, attr, current) {
    nodes.forEach(function (node) {
      var id = node.getAttribute(attr);
      var active = id === current;
      node.classList.toggle("is-active", active);
      if (attr === "data-journey") {
        if (active) node.setAttribute("aria-current", "true");
        else node.removeAttribute("aria-current");
      }
    });
  }

  function updatePath(current) {
    var idx = sectionOrder.indexOf(current);
    pathItems.forEach(function (item) {
      var id = item.getAttribute("data-path");
      var itemIdx = sectionOrder.indexOf(id);
      item.classList.toggle("is-current", id === current);
      item.classList.toggle("is-done", itemIdx > -1 && itemIdx < idx);
    });
  }

  function updateSteps() {
    if (!stepItems.length) return;
    var ablauf = document.getElementById("ablauf");
    if (!ablauf) return;
    var rect = ablauf.getBoundingClientRect();
    var viewMid = window.innerHeight * 0.45;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    var best = stepItems[0];
    var bestDist = Infinity;
    stepItems.forEach(function (step) {
      var r = step.getBoundingClientRect();
      var dist = Math.abs(r.top + r.height / 2 - viewMid);
      if (dist < bestDist) {
        bestDist = dist;
        best = step;
      }
    });
    stepItems.forEach(function (step) {
      step.classList.toggle("is-active", step === best);
    });
  }

  function updateProgress() {
    if (!progress || !progressBar) return;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var value = max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0;
    progressBar.style.width = value + "%";
    progress.setAttribute("aria-valuenow", String(value));
  }

  function onScroll() {
    var current = currentSectionId();
    setActiveGroup(journeyLinks, "data-journey", current);
    setActiveGroup(navLinks, "data-nav", current);
    updatePath(current);
    updateSteps();
    updateProgress();
  }

  if (progress || journeyLinks.length || navLinks.length || pathItems.length) {
    var ticking = false;
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        onScroll();
      });
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    onScroll();
  }

  var form = document.getElementById("anfrage");
  if (!form) return;

  var status = document.getElementById("form-status");
  var dsgvo = document.getElementById("dsgvo");
  var name = document.getElementById("name");
  var email = document.getElementById("email");
  var nachricht = document.getElementById("nachricht");

  function setDsgvoValidity() {
    dsgvo.setCustomValidity(
      dsgvo.checked
        ? ""
        : "Bitte stimmen Sie der Verarbeitung zur Beantwortung Ihrer Anfrage zu."
    );
  }

  function setControlValidity(control, missingMessage) {
    control.setCustomValidity("");
    if (control.validity.valueMissing) {
      control.setCustomValidity(missingMessage);
    } else if (control.validity.typeMismatch) {
      control.setCustomValidity("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
    }
  }

  function setAllValidity() {
    setControlValidity(name, "Bitte geben Sie Ihren Namen ein.");
    setControlValidity(email, "Bitte geben Sie Ihre E-Mail-Adresse ein.");
    setControlValidity(nachricht, "Bitte schreiben Sie eine kurze Nachricht.");
    setDsgvoValidity();
  }

  [name, email, nachricht, dsgvo].forEach(function (control) {
    control.addEventListener("input", setAllValidity);
    control.addEventListener("change", setAllValidity);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setAllValidity();
    if (!form.checkValidity()) {
      form.reportValidity();
      status.textContent = "Bitte prüfen Sie die markierten Felder.";
      return;
    }

    var nameValue = form.name.value.trim();
    var tel = form.tel.value.trim();
    var mail = form.email.value.trim();
    var anliegen = form.anliegen.value.trim();
    var nachrichtValue = form.nachricht.value.trim();
    var body = [
      "Name: " + nameValue,
      "Telefon: " + (tel || "—"),
      "E-Mail: " + mail,
      "Anliegen: " + (anliegen || "—"),
      "",
      nachrichtValue
    ].join("\n");

    status.textContent =
      "Ihr E-Mail-Programm öffnet sich mit der Anfrage an Info@zuern-gartenanlagen.de.";
    window.location.href =
      "mailto:info@zuern-gartenanlagen.de?subject=" +
      encodeURIComponent("Anfrage Garten — " + nameValue) +
      "&body=" +
      encodeURIComponent(body);
  });
})();
