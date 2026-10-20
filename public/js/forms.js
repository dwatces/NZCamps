// Behaviour for every form with class "validForm" (progressive enhancement:
// without JavaScript the server checks everything and shows the same messages).
// - Before sending, the browser's own checks run. Each field that fails shows a
//   text message under it (its data-error, or the browser's message for a
//   custom problem such as too many photos), is marked aria-invalid, and a
//   summary above the form lists every problem, links to each field and takes
//   focus.
// - A field's message clears as soon as it is fixed.
// - While a valid form is sending, its submit button is disabled and reads
//   "Saving…", so a slow upload cannot be sent twice.
// - An error summary rendered by the server takes focus when the page opens.
// - A textarea with data-counter shows the characters left, and tells screen
//   reader users at most once a second, after they pause.
(function () {
  "use strict";

  function fieldName(control) {
    return control.getAttribute("data-field") || control.id || control.name;
  }

  // The element that carries aria-invalid: the field, or a radio group's fieldset.
  function targetOf(control) {
    return control.type === "radio" ? control.closest("fieldset") || control : control;
  }

  function messageFor(control, form) {
    if (control.validity.customError) return control.validationMessage;
    var own = control.getAttribute("data-error");
    if (!own && control.type === "radio") {
      var first = form.querySelector(
        'input[type="radio"][name="' + CSS.escape(control.name) + '"][data-error]',
      );
      own = first && first.getAttribute("data-error");
    }
    return own || control.validationMessage;
  }

  function setDescribedBy(el, id, on) {
    var ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    var has = ids.indexOf(id) !== -1;
    if (on && !has) ids.push(id);
    if (!on && has) ids.splice(ids.indexOf(id), 1);
    if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
    else el.removeAttribute("aria-describedby");
  }

  function showError(control, message) {
    var name = fieldName(control);
    var target = targetOf(control);
    var box = document.getElementById(name + "-error");
    if (box) {
      box.textContent = message;
      box.hidden = false;
      setDescribedBy(target, box.id, true);
    }
    target.setAttribute("aria-invalid", "true");
    if (control.type !== "radio") control.classList.add("is-invalid");
  }

  function clearError(control) {
    var name = fieldName(control);
    var target = targetOf(control);
    var box = document.getElementById(name + "-error");
    if (box) {
      box.hidden = true;
      box.textContent = "";
      setDescribedBy(target, box.id, false);
    }
    target.removeAttribute("aria-invalid");
    control.classList.remove("is-invalid");
  }

  function summaryFor(form) {
    var summary = document.getElementById("form-errors");
    if (summary && summary.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return summary;
    }
    summary = document.createElement("div");
    summary.className = "alert alert-danger error-summary";
    summary.id = "form-errors";
    summary.setAttribute("role", "alert");
    summary.setAttribute("tabindex", "-1");
    summary.setAttribute("aria-labelledby", "form-errors-title");
    form.parentNode.insertBefore(summary, form);
    return summary;
  }

  function showSummary(form, problems) {
    var summary = summaryFor(form);
    summary.textContent = "";
    var title = document.createElement("h2");
    title.className = "h5";
    title.id = "form-errors-title";
    title.textContent = "There's a problem";
    var list = document.createElement("ul");
    list.className = "mb-0";
    problems.forEach(function (p) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + p.control.id;
      link.textContent = p.message;
      link.addEventListener("click", function (event) {
        event.preventDefault();
        p.control.focus();
      });
      item.appendChild(link);
      list.appendChild(item);
    });
    summary.appendChild(title);
    summary.appendChild(list);
    summary.hidden = false;
    summary.focus();
  }

  function check(form) {
    var problems = [];
    var seenGroups = {};
    Array.prototype.forEach.call(form.elements, function (control) {
      if (!control.willValidate) return;
      if (control.checkValidity()) {
        if (control.type !== "radio") clearError(control);
        return;
      }
      if (control.type === "radio") {
        if (seenGroups[control.name]) return;
        seenGroups[control.name] = true;
      }
      var message = messageFor(control, form);
      showError(control, message);
      problems.push({ control: control, message: message });
    });
    return problems;
  }

  function markSaving(form) {
    var button = form.querySelector('button:not([type="button"]), input[type="submit"]');
    if (!button) return;
    button.setAttribute("data-label", button.textContent);
    button.textContent = "Saving…";
    button.disabled = true;
    form.setAttribute("data-saving", "");
  }

  function restore(form) {
    var button = form.querySelector("button[data-label]");
    if (button) {
      button.textContent = button.getAttribute("data-label");
      button.removeAttribute("data-label");
      button.disabled = false;
    }
    form.removeAttribute("data-saving");
  }

  var forms = document.querySelectorAll("form.validForm");
  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener("submit", function (event) {
      if (form.hasAttribute("data-saving")) {
        event.preventDefault();
        return;
      }
      var problems = check(form);
      if (problems.length) {
        event.preventDefault();
        showSummary(form, problems);
        return;
      }
      // Another handler (a confirm dialog) may still cancel this submit.
      setTimeout(function () {
        if (!event.defaultPrevented) markSaving(form);
      }, 0);
    });

    // A fixed field loses its message straight away.
    function recheck(event) {
      var control = event.target;
      if (!control.willValidate || !control.checkValidity()) return;
      if (targetOf(control).getAttribute("aria-invalid") === "true") clearError(control);
    }
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);
  });

  // Back/forward cache: a page restored after submitting gets its buttons back.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) Array.prototype.forEach.call(forms, restore);
  });

  var serverSummary = document.getElementById("form-errors");
  if (serverSummary) serverSummary.focus();

  // Characters-left counters.
  Array.prototype.forEach.call(
    document.querySelectorAll("textarea[data-counter]"),
    function (area) {
      var visible = document.getElementById(area.getAttribute("data-counter"));
      var live = document.getElementById(area.getAttribute("data-counter") + "-live");
      var max = Number(area.getAttribute("maxlength"));
      if (!visible || !max) return;
      var format = new Intl.NumberFormat("en-NZ");
      var timer = null;
      function left() {
        return Math.max(0, max - area.value.length);
      }
      function update() {
        visible.textContent = format.format(left()) + " left";
        if (!live) return;
        clearTimeout(timer);
        timer = setTimeout(function () {
          var n = left();
          live.textContent = format.format(n) + (n === 1 ? " character left" : " characters left");
        }, 1000);
      }
      visible.textContent = format.format(left()) + " left";
      area.addEventListener("input", update);
    },
  );
})();
