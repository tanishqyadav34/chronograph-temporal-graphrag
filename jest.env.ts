/**
 * Global test-environment defaults (runs before any test module loads).
 *
 * next/jest loads the host project's .env during config resolution, which
 * makes these suites pass on machines with real credentials but fail in
 * clean environments (CI, fresh clones) where GROK_API_KEY is unset —
 * groqChat throws before the mocked global fetch is ever reached.
 *
 * Seed a dummy key so tests always exercise the mock-fetch path and can
 * never hit the real Groq API.
 */
process.env.GROK_API_KEY ||= "test-api-key";
