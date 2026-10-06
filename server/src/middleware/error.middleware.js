/**
 * Error handler global Express.
 */
const errorHandler = (err, req, res, _next) => {
  console.error("💥 Erreur :", err.message || err);
  if (err.type === "entity.too.large" && req) {
    console.error(
      `   ↳ ${req.method} ${req.originalUrl} (${req.headers?.["content-length"] || "?"} octets)`,
    );
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Erreur interne du serveur.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
