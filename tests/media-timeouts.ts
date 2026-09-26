/**
 * Time limit for tests that encode or decode real media with ffmpeg. They
 * take 10–25 s on an idle 8-core machine and several times that on a busy
 * one or a smaller CI runner, so a limit near their idle time fails for load,
 * not for bugs. The heaviest files also run in a serial lane (vitest.config.ts,
 * project `media`) so they do not starve one another.
 */
export const MEDIA_TEST_TIMEOUT_MS = 90_000
