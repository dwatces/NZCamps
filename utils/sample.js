// Sample (invented) listings. The live database holds camps copied from
// seeds/demoData.js by an older seeder that stripped their label, so a camp
// also counts as a sample when the seed account added it. That labels the
// existing live rows without any database write.
const SEED_USERNAME = "ranger";

// Seed account names cannot be registered, because isSample() keys on them.
const RESERVED_USERNAMES = ["ranger", "demo-ranger"];

function isSample(camp) {
  if (!camp) return false;
  if (camp.isDemo === true) return true;
  return Boolean(camp.author && camp.author.username === SEED_USERNAME);
}

module.exports = { SEED_USERNAME, RESERVED_USERNAMES, isSample };
