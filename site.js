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
