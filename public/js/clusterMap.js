// Camps list map: one clustered marker per camp. Data comes from the
// <script type="application/json" id="camps-data"> block; popups and marker
// labels are built from DOM nodes with textContent, never from HTML strings.
//
// From 992 px the list and the map sit side by side. Below that the list
// comes first, and a List | Map toggle shows one or the other; the map is
// only created (and its tiles only fetched) when it is first shown.
(function () {
  "use strict";
  var dataEl = document.getElementById("camps-data");
  var mapEl = document.getElementById("cluster-map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  var camps = JSON.parse(dataEl.textContent).filter(function (camp) {
    return isFinite(camp.lat) && isFinite(camp.lng);
  });
  var wide = window.matchMedia("(min-width: 992px)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // New Zealand, for an empty list: from Stewart Island to Cape Reinga.
  var NZ = [
    [-47.5, 166],
    [-34, 179],
  ];

  // "Free", "$18 a night", "$18.50 a night" (as on the cards).
  function priceText(price) {
    var n = Number(price);
    if (price === null || price === "" || !isFinite(n)) return "";
    if (n === 0) return "Free";
    var digits = n % 1 === 0 ? 0 : 2;
    var money = new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return money.format(n) + " a night";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function popupFor(camp) {
    var box = el("div", "map-popup");
    var title = el("p", "map-popup__title");
    var link = el("a", "", camp.title);
    link.href = "/camps/" + encodeURIComponent(camp.id);
    title.appendChild(link);
    box.appendChild(title);
    if (camp.sample) box.appendChild(el("span", "badge badge-sample", "Sample listing"));
    box.appendChild(el("p", "map-popup__meta", camp.location));
    box.appendChild(el("p", "map-popup__meta", priceText(camp.price)));
    return box;
  }

  // Markers are 44 px targets with the camp's name as their label.
  function pinFor(camp) {
    var label = el("span", "visually-hidden", camp.title);
    return L.divIcon({
      className: "camp-pin",
      html: label,
      iconSize: [44, 44],
      iconAnchor: [22, 42],
      popupAnchor: [0, -38],
    });
  }

  function clusterIcon(cluster) {
    var count = cluster.getChildCount();
    var box = el("span", "camp-cluster__count");
    box.appendChild(el("span", "", String(count)));
    box.appendChild(el("span", "visually-hidden", " camps here. Select to zoom in."));
    return L.divIcon({ className: "camp-cluster", html: box, iconSize: [44, 44] });
  }

  var map = null;
  function fit() {
    if (!camps.length) map.fitBounds(NZ);
    else if (camps.length === 1) map.setView([camps[0].lat, camps[0].lng], 10);
    else map.fitBounds(markers.getBounds(), { padding: [32, 32], maxZoom: 10 });
  }
  var markers = null;
  function showMap() {
    if (map) {
      map.invalidateSize();
      fit();
      return;
    }
    mapEl.textContent = ""; // the no-JavaScript message
    map = L.map(mapEl, {
      zoomAnimation: !reduceMotion,
      fadeAnimation: !reduceMotion,
      markerZoomAnimation: !reduceMotion,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);
    markers = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      animate: !reduceMotion,
      maxClusterRadius: 50,
    });
    camps.forEach(function (camp) {
      markers.addLayer(
        L.marker([camp.lat, camp.lng], { icon: pinFor(camp) }).bindPopup(function () {
          return popupFor(camp);
        }),
      );
    });
    map.addLayer(markers);
    fit();
  }

  // The List | Map toggle (below 992 px only).
  var toggle = document.querySelector(".view-toggle");
  var listPanel = document.getElementById("camp-list-panel");
  var mapPanel = document.getElementById("camp-map-panel");
  var buttons = toggle ? toggle.querySelectorAll("[data-view]") : [];
  var view = "list";

  // The map panel starts with the hidden attribute (the list comes first);
  // from 992 px the CSS shows both panels regardless.
  function apply() {
    var both = wide.matches || !toggle;
    if (listPanel) listPanel.hidden = !both && view !== "list";
    if (mapPanel) mapPanel.hidden = !both && view !== "map";
    Array.prototype.forEach.call(buttons, function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-view") === view));
    });
    if (both || view === "map") showMap();
  }

  if (toggle) {
    toggle.classList.remove("is-pending");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        view = button.getAttribute("data-view");
        apply();
      });
    });
  }
  if (wide.addEventListener) wide.addEventListener("change", apply);
  apply();
})();
