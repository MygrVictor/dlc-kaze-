/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/db/migrate*.js",
    "!src/db/seed.js",
  ],
  coverageReporters: ["text", "lcov"],
  testTimeout: 15000,
};
