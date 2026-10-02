/**
 * The two conversion rates billing and estimates share. They live apart from
 * usage.ts so the model picker can quote prices without importing the biller
 * (which imports the picker).
 */

/** What one credit buys, in measured billable usage. */
export const CREDIT_USD = 0.0025

/**
 * Host compute, per second. A studio machine that can encode 4K and drive a
 * browser is the expensive part of a render; the rate is deliberately coarse
 * because the point is that long renders cost more than short ones.
 */
export const COMPUTE_USD_PER_SEC = 0.002
