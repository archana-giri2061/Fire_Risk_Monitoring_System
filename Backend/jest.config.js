// jest.config.js
// Jest configuration for the backend TypeScript test suite.
// Uses ts-jest to transpile TypeScript test files and runs them in a
// Node environment rather than jsdom since there is no DOM involved
// in backend route and service tests.

module.exports = {
  // ts-jest preset provides the TypeScript transformer so Jest can execute
  // .ts files directly without a separate compilation step
  preset: "ts-jest",

  // Node environment is correct for backend tests — no browser DOM needed.
  // Route handlers, service functions, and database queries all run in Node.
  testEnvironment: "node",

  // Only pick up files inside __tests__/ directories ending in .test.ts
  // so utility files and type declarations are never treated as test suites
  testMatch: ["**/__tests__/**/*.test.ts"],

  // Apply ts-jest to all .ts and .tsx files so TypeScript syntax is
  // transpiled before Jest attempts to execute the test files
  transform: { "^.+\\.tsx?$": "ts-jest" },

  // Automatically collect coverage data from all executed test files
  // without needing to pass --coverage on the command line
  collectCoverage: true,

  // Write the coverage report to the coverage/ directory in the project root
  coverageDirectory: "coverage",

  // Exclude third-party packages and compiled output from coverage reporting —
  // only source files written for this project should appear in the report
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],

  // Print each individual test name and result to the terminal as tests run
  // rather than only showing a summary at the end
  verbose: true,
};