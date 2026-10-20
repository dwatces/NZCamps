// Camp page map: one marker. Data comes from the
// <script type="application/json" id="camp-data"> block; the popup and the
// marker's label are built from DOM nodes with textContent.
//
// The popup starts closed (open, it covered the marker on phones). On touch
// screens one finger scrolls the page, not the map; pinch still zooms. The
// mouse wheel scrolls the page too. Animations are off with reduced motion.
(function () {
  "use strict";
  var dataEl = document.getElementById("camp-data");
  var mapEl = document.getElementById("map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  var camp = JSON.parse(dataEl.textContent);
  if (!isFinite(camp.lat) || !isFinite(camp.lng)) return;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  mapEl.textContent = ""; // the no-JavaScript message
  var map = L.map(mapEl, {
    dragging: !L.Browser.mobile,
    scrollWheelZoom: false,
    zoomAnimation: !reduceMotion,
    fadeAnimation: !reduceMotion,
    markerZoomAnimation: !reduceMotion,
  }).setView([camp.lat, camp.lng], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  var box = el("div", "map-popup");
  box.appendChild(el("p", "map-popup__title", camp.title));
  if (camp.sample) box.appendChild(el("span", "badge badge-sample", "Sample listing"));
  box.appendChild(el("p", "map-popup__meta", camp.location));

  var pin = L.divIcon({
    className: "camp-pin",
    html: el("span", "visually-hidden", camp.title),
    iconSize: [44, 44],
    iconAnchor: [22, 42],
    popupAnchor: [0, -38],
  });
  L.marker([camp.lat, camp.lng], { icon: pin }).addTo(map).bindPopup(box);
})();
