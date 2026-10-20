/* global camps */
// Initialize the map
const map = L.map("cluster-map").setView([-41, 174], 4.5); // Set to New Zealand's latitude and longitude

// Set OpenStreetMap tiles
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Initialize MarkerCluster Group
const markers = L.markerClusterGroup();

// Ensure camps data is being accessed correctly
console.log("Camps data:", camps.features); // Make sure it's an array

// Loop through camps and create markers with popup info
camps.features.forEach((camp) => {
  const marker = L.marker([
    camp.geometry.coordinates[1],
    camp.geometry.coordinates[0],
  ]) // [lat, lng]
  .bindPopup(`
      <strong><a href="/camps/${camp._id}">${camp.title}</a></strong><br>
      <p>${camp.description}</p><br>
      Price: $${camp.price}
    `);
  markers.addLayer(marker);
});

// Add markers to the map with clustering
map.addLayer(markers);
