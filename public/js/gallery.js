// Camp photo gallery (a Bootstrap carousel that never moves on its own):
// keeps the "Photo 2 of 3" line in step with the slide shown.
(function () {
  "use strict";
  var gallery = document.getElementById("campCarousel");
  var counter = document.getElementById("gallery-count");
  if (!gallery || !counter) return;
  var total = gallery.querySelectorAll(".carousel-item").length;
  gallery.addEventListener("slid.bs.carousel", function (event) {
    counter.textContent = "Photo " + (event.to + 1) + " of " + total;
  });
})();
