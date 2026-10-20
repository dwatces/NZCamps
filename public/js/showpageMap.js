/* global camp */
// Replace Mapbox with Leaflet
console.log("Raw camp data:", camp);
const coordinates = camp.geometry.coordinates;

fetch("/api/camps/677b2b8e6396d300158a7ac6")
  .then((res) => res.json())
  .then((data) => console.log("API response:", data));

// Initialize the map using Leaflet
const map = L.map("map").setView([camp.geometry.coordinates[1], camp.geometry.coordinates[0]], 10); // Set initial view to camp coordinates

// Add OpenStreetMap tile layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Handle coordinates and add marker
if (Array.isArray(coordinates) && coordinates.length === 2) {
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  console.log("Longitude:", longitude, "Latitude:", latitude);

  const popupContent = `
    <h4>${camp.title}</h4>
    <p>${camp.description}</p>
  `;

  L.marker([latitude, longitude]) // [lat, lng]
    .bindPopup(popupContent) // Add popup with camp details
    .addTo(map);
} else {
  console.error("Invalid coordinates:", coordinates);
}
