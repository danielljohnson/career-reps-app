// Test stub for the `server-only` package. That package throws on import in a
// non-React-Server environment, which would break unit tests that import
// server-only modules (e.g. lib/dashboard.ts). Vitest aliases the import here.
export {};

