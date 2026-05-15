import { useEffect, useRef } from 'react';
type TimelineBuilder = (root: HTMLElement, onComplete: () => void) => any;

/**
 * Manages the two-effect GSAP pattern shared by all step illustrations:
 * build timeline on mount, restart it when `active` flips true.
 */
export function useIllustrationTimeline(
  builder: TimelineBuilder,
  active: boolean,
  onComplete?: () => void,
): React.RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef   = useRef<any | null>(null);
  const cbRef   = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tl = builder(root, () => cbRef.current?.());
    tlRef.current = tl;
    return () => { tl.kill(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) tlRef.current?.restart();
  }, [active]);

  return rootRef;
}
