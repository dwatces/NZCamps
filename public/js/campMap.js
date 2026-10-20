// Camp page map: one marker. Data comes from the
// <script type="application/json" id="camp-data"> block; the popup is built
// from DOM nodes with textContent, never from an HTML string.
(function () {
  "use strict";
  var dataEl = document.getElementById("camp-data");
  var mapEl = document.getElementById("map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  var camp = JSON.parse(dataEl.textContent);
  if (!isFinite(camp.lat) || !isFinite(camp.lng)) return;

  var map = L.map(mapEl).setView([camp.lat, camp.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);

  var box = document.createElement("div");
  var title = document.createElement("strong");
  title.textContent = camp.title;
  var place = document.createElement("div");
  place.textContent = camp.location;
  box.appendChild(title);
  if (camp.sample) {
    var badge = document.createElement("span");
    badge.className = "badge badge-sample";
    badge.textContent = "Sample listing";
    box.appendChild(badge);
  }
  box.appendChild(place);

  L.marker([camp.lat, camp.lng]).addTo(map).bindPopup(box).openPopup();
})();
