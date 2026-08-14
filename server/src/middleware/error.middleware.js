/**
 * Error handler global Express.
 */
const errorHandler = (err, _req, res, _next) => {
  console.error("💥 Erreur :", err.message || err);

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Erreur interne du serveur.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
