/**
 * pace.mjs — how fast a narrator may read, by the kind of film.
 *
 * `narration` is the launch-film voice: unhurried, 1.9–2.4 words/s, the
 * picture carries the energy. `ad` is the short-form social ad voice: five
 * reference ads read at 2.75, 2.77, 3.07, 3.25 and 3.68 words/s with their
 * breaths edited out — brisk, continuous, still a person talking. shots.js
 * declares it with `audio.pace: "ad"`; `pitch motion tts --pace ad` records to it.
 */
export const PACE = {
  narration: { name: "narration", slow: 1.6, aim: [1.9, 2.4], target: 2.15, brisk: 2.45, rushed: 2.7 },
  ad: { name: "ad", slow: 2.2, aim: [2.7, 3.5], target: 3.0, brisk: 3.8, rushed: 4.1 },
};

export function paceOf(name) {
  return PACE[name] || PACE.narration;
}
