const COOKIE_NAME = "dlc_token";

function parseJwtExpiresIn(value) {
  const source = String(value || "7d").trim();
  const match = source.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
    default:
      return amount * 24 * 60 * 60 * 1000;
  }
}

function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function extractCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const pairs = String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = pair.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    return decodeURIComponent(pair.slice(separatorIndex + 1));
  }

  return null;
}

function extractAuthToken(req) {
  return (
    extractBearerToken(req.headers.authorization) ||
    extractCookieValue(req.headers.cookie, COOKIE_NAME)
  );
}

function buildAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: parseJwtExpiresIn(process.env.JWT_EXPIRES_IN || "7d"),
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, buildAuthCookieOptions());
}

function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}

module.exports = {
  COOKIE_NAME,
  extractAuthToken,
  setAuthCookie,
  clearAuthCookie,
};
