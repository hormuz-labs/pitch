import { useCallback, useState } from 'react';

/**
 * Manages the active-card chain for the HIW step sequence.
 * `start()` kicks off from step 0; each step's onComplete advances to the next,
 * wrapping back to -1 (idle) after the last step completes.
 */
export function useStepSequence(count: number) {
  const [active, setActive] = useState(-1);

  const start = useCallback(() => setActive(0), []);

  const stepProps = useCallback((i: number) => ({
    active: active === i,
    onComplete: () => setActive(i + 1 < count ? i + 1 : -1),
  }), [active, count]);

  return { start, stepProps };
}
