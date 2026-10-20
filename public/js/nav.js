// Site menu on small screens (Bootstrap collapse): Escape closes it and
// puts focus back on the Menu button, and choosing a link closes it, so it
// is not still open when the visitor comes back with the back button.
(function () {
  "use strict";
  var menu = document.getElementById("site-menu");
  var toggle = document.querySelector('[aria-controls="site-menu"]');
  if (!menu || !toggle || !window.bootstrap) return;

  function hide() {
    window.bootstrap.Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
  }
  function isOpen() {
    return menu.classList.contains("show") || menu.classList.contains("collapsing");
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !isOpen()) return;
    hide();
    toggle.focus();
  });
  menu.addEventListener("click", function (event) {
    if (event.target.closest("a") && isOpen()) hide();
  });
})();
