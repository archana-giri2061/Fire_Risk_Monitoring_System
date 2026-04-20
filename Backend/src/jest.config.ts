// jest.config.ts
// Jest configuration for the TypeScript/React test suite.
// Configures ts-jest to transpile TypeScript, sets up the jsdom browser
// environment for React component tests, and maps CSS imports to a mock
// so style sheets do not cause import errors during test runs.

import type { Config } from "jest";

const config: Config = {
  // ts-jest preset provides the TypeScript transformer and sensible defaults
  // so TypeScript files are compiled before Jest executes them
  preset: "ts-jest",

  // jsdom simulates a browser DOM environment so React components can render,
  // query the DOM, and fire events without a real browser being present
  testEnvironment: "jsdom",

  // Run jest.setup.ts after the test framework is installed in the environment.
  // Used to import @testing-library/jest-dom which adds custom DOM matchers
  // like toBeInTheDocument() and toHaveTextContent() to all test files.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Only pick up test files inside __tests__/ directories so utility files
  // and type definitions in src/ are never mistaken for test suites
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.tsx",
  ],

  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          // Enable JSX transformation for .tsx files — without this ts-jest
          // would reject JSX syntax in component test files
          jsx: "react-jsx",
          // Allow default imports from CommonJS modules (e.g. import React from "react")
          esModuleInterop: true,
        },
      },
    ],
  },

  moduleNameMapper: {
    // Redirect all CSS/LESS/SCSS imports to a stub module that exports an empty
    // object. Component files often import stylesheets directly and this prevents
    // those imports from throwing a SyntaxError in the Node test environment.
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },

  // Collect coverage from all TypeScript source files under src/,
  // excluding .d.ts declaration files which contain no executable code
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
  ],
};

export default config;