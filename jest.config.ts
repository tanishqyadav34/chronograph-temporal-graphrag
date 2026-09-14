/**
 * jest.config.ts
 *
 * Two projects (each inherits the next/jest SWC transform + @/* mapping):
 *  - node:  lib/ unit tests (cypher safety, result normalization, pipeline utils)
 *  - jsdom: React component tests via React Testing Library
 *
 * Coverage is collected from the logic layer (lib/ — the GraphRAG pipeline)
 * plus tested components, with a global 70% threshold enforced on every run
 * (including CI) via `npm test`. Client-side React context providers and
 * static data modules are excluded from the denominator — they carry no
 * branch logic and are exercised through the UI.
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

// Modules excluded from coverage: React context providers (UI wiring, not
// logic) and static data blobs.
const LIB_COVERAGE_EXCLUSIONS = [
  "!lib/chat-context.tsx",
  "!lib/graph-data-context.tsx",
  "!lib/highlight-context.tsx",
  "!lib/theme-context.tsx",
  "!lib/mockConversations.ts",
  "!lib/mockGraph.ts",
];

export default async (): Promise<Config> => {
  // next/jest handles SWC transforms + module name mapping for @/* paths.
  // NOTE: createJestConfig(customConfig) returns an async thunk — call it to get the config.
  const base = await createJestConfig({})();

  return {
    projects: [
      {
        ...base,
        displayName: "node",
        testEnvironment: "node",
        testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
        testPathIgnorePatterns: ["/node_modules/", "/.next/", "__tests__/components/"],
        moduleNameMapper: { ...base.moduleNameMapper, "^@/(.*)$": "<rootDir>/$1" },
        setupFiles: ["<rootDir>/jest.env.ts"],
        collectCoverageFrom: ["lib/**/*.{ts,tsx}", ...LIB_COVERAGE_EXCLUSIONS],
      },
      {
        ...base,
        displayName: "jsdom",
        testEnvironment: "jsdom",
        testMatch: ["**/__tests__/components/**/*.test.tsx"],
        setupFiles: ["<rootDir>/jest.env.ts"],
        setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
        moduleNameMapper: { ...base.moduleNameMapper, "^@/(.*)$": "<rootDir>/$1" },
        collectCoverageFrom: ["components/chat/SourceCard.tsx"],
      },
    ],
    collectCoverage: true,
    coverageThreshold: {
      global: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  };
};
