class ExpressError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "ExpressError";
    this.statusCode = statusCode;
  }
}

module.exports = ExpressError;
