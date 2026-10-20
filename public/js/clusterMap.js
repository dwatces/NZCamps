// Camps list map: one clustered marker per camp. Data comes from the
// <script type="application/json" id="camps-data"> block; popups are built
// from DOM nodes with textContent, never from HTML strings.
(function () {
  "use strict";
  var dataEl = document.getElementById("camps-data");
  var mapEl = document.getElementById("cluster-map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  var camps = JSON.parse(dataEl.textContent);
  var map = L.map(mapEl).setView([-41, 174], 4.5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);

  function line(text, tag) {
    var el = document.createElement(tag || "div");
    el.textContent = text;
    return el;
  }

  function popupFor(camp) {
    var box = document.createElement("div");
    var title = document.createElement("strong");
    var link = document.createElement("a");
    link.href = "/camps/" + encodeURIComponent(camp.id);
    link.textContent = camp.title;
    title.appendChild(link);
    box.appendChild(title);
    if (camp.sample) {
      var badge = line("Sample listing", "span");
      badge.className = "badge badge-sample";
      box.appendChild(badge);
    }
    box.appendChild(line(camp.location));
    box.appendChild(line("$" + camp.price + "/night"));
    return box;
  }

  var markers = L.markerClusterGroup();
  camps.forEach(function (camp) {
    if (!isFinite(camp.lat) || !isFinite(camp.lng)) return;
    markers.addLayer(
      L.marker([camp.lat, camp.lng]).bindPopup(function () {
        return popupFor(camp);
      }),
    );
  });
  map.addLayer(markers);
})();
