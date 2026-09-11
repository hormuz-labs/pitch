/** Report only squeezes that warrant a change. A harmless 2% squeeze used to
 * appear as an unnamed "1 overrun", sending the agent through blind edits.
 */
export function actionableOverruns(overruns) {
  return overruns.map(o => ({ ...o, speed: Number(o.speed) || (o.ran && o.dur ? o.ran / o.dur : 0) }))
    .filter(o => o.speed >= 1.1);
}
