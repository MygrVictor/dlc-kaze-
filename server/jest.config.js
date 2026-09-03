/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  // Chargé avant les modules testés : les routes figent leur dossier de
  // dépôt dès le `require`, il est trop tard pour le changer ensuite.
  setupFiles: ["<rootDir>/src/__tests__/setup-uploads.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/db/migrate*.js",
    "!src/db/seed.js",
  ],
  coverageReporters: ["text", "lcov"],
  testTimeout: 15000,
};
