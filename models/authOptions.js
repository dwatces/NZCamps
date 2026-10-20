// passport-local-mongoose options. Failed logins slow down with an
// interval back-off stored on the user document (so it works across
// serverless instances). There is no permanent lock: that would let anyone
// lock a known username out with a few wrong guesses. Every failure shows
// the same message, so it never reveals whether a username exists.
// Tests change interval and maxInterval here before requiring the model.
const GENERIC = "Wrong username or password, or too many attempts. Try again shortly.";

module.exports = {
  limitAttempts: true,
  interval: 100,
  maxInterval: 5 * 60 * 1000,
  errorMessages: {
    IncorrectPasswordError: GENERIC,
    IncorrectUsernameError: GENERIC,
    AttemptTooSoonError: GENERIC,
    TooManyAttemptsError: GENERIC,
  },
  GENERIC,
};
