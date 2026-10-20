// Shared by the scripts in seeds/: they refuse a database that is not on
// this machine unless CONFIRM_REMOTE=yes, and never print a full address.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// The host part of a mongodb:// or mongodb+srv:// URL (possibly a comma list).
function hostsOf(url) {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(String(url || ""));
  return m ? m[1].split(",") : [];
}

const hostName = (hostPort) =>
  hostPort.startsWith("[") ? hostPort.slice(0, hostPort.indexOf("]") + 1) : hostPort.split(":")[0];

// True only when every host in a mongodb:// URL is this machine.
function isLoopbackDbUrl(url) {
  if (!/^mongodb:\/\//.test(String(url || ""))) return false;
  const hosts = hostsOf(url);
  return hosts.length > 0 && hosts.every((h) => LOOPBACK.has(hostName(h).toLowerCase()));
}

// "cluster0.abcde.mongodb.net" becomes "***.mongodb.net"; loopback hosts are shown as they are.
function maskedHost(url) {
  const name = hostName(hostsOf(url)[0] || "").toLowerCase();
  if (!name) return "(unknown host)";
  if (LOOPBACK.has(name)) return name;
  const labels = name.split(".");
  return labels.length > 2 ? `***.${labels.slice(-2).join(".")}` : "***";
}

// Throws (and so stops the script) unless the database may be written to.
function checkDbUrl(env = process.env) {
  if (!env.DB_URL) throw new Error("DB_URL is required");
  if (!isLoopbackDbUrl(env.DB_URL) && env.CONFIRM_REMOTE !== "yes") {
    throw new Error(
      "DB_URL is not a database on this machine. Set CONFIRM_REMOTE=yes to use it anyway.",
    );
  }
  return env.DB_URL;
}

module.exports = { isLoopbackDbUrl, maskedHost, checkDbUrl };
