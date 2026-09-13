/**
 * jest.config.ts
 *
 * Two projects (each inherits the next/jest SWC transform + @/* mapping):
 *  - node:  lib/ unit tests (cypher safety, result normalization, pipeline utils)
 *  - jsdom: React component tests via React Testing Library
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

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
      },
      {
        ...base,
        displayName: "jsdom",
        testEnvironment: "jsdom",
        testMatch: ["**/__tests__/components/**/*.test.tsx"],
        setupFiles: ["<rootDir>/jest.env.ts"],
        setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
        moduleNameMapper: { ...base.moduleNameMapper, "^@/(.*)$": "<rootDir>/$1" },
      },
    ],
  };
};
