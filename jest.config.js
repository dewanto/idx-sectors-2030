/**
 * Jest — pure-logic unit tests only (Node env, no real DB, no network, no React).
 *
 * Scope is deliberately narrow: `tests/unit/**/*.test.ts` never touches the
 * Playwright `e2e-tests/` suite. Source coverage targets the intelligence
 * engine in `src/lib/**`.
 *
 * The project tsconfig uses `module: esnext` + `moduleResolution: bundler`
 * (Next.js conventions) which the CommonJS Jest runtime cannot execute, so the
 * transform below overrides only those two compiler options without touching
 * tsconfig.json. (Functionally the "ts-jest preset + inline module override"
 * setup, expressed via the equivalent explicit transform form.)
 */
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setupEnv.ts"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          target: "es2020",
          esModuleInterop: true,
          jsx: "react-jsx",
          resolveJsonModule: true,
          strict: true,
        },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
  resetMocks: true,
  collectCoverageFrom: ["src/lib/**/*.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],
};