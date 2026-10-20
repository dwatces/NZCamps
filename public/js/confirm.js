// Asks before submitting any form marked data-confirm="Question?".
// (Replaces inline onclick handlers, which the content security policy blocks.)
(function () {
  "use strict";
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches("form[data-confirm]")) return;
    if (!window.confirm(form.getAttribute("data-confirm"))) event.preventDefault();
  });
})();
