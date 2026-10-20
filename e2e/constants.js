// Shared by playwright.config.js, the e2e server and the specs.
module.exports = {
  // NZ Camps' local port range is 7201 to 7209: 7203 for the end-to-end
  // server with a database, 7206 for the one in demo mode.
  PORTS: { db: 7203, demo: 7206 },
  // The member camp e2e/server.js adds (two photos, two reviews).
  MEMBER: {
    username: "kea_fan",
    password: "e2e-member-password",
    campTitle: "Riverside Flat",
  },
  // A camp with no photos and no reviews.
  NO_PHOTO_TITLE: "Kahikatea Paddock",
  // A camp whose text tries to run script on every page that shows it. The
  // word "onerror" finds it with the search box.
  HOSTILE: {
    title: "<img src=x onerror=window.__x=1>",
    location: "Gisborne <svg onload=window.__z=1>",
    description: "</script><script>window.__y=1</script>",
    review: "</script><b>not bold</b><img src=x onerror=window.__w=1>",
    search: "onerror",
  },
};
