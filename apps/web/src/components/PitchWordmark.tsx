/**
 * Static pixel wordmark SVG — uses currentColor so the parent controls fill.
 * For the animated version see PitchLogoAnimation.
 */
export const PitchWordmark = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    className={className}
    style={style}
    width="72"
    height="22"
    viewBox="20 20 580 140"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Pitch"
    role="img"
  >
    {[
      // P
      [30,38],[30,61],[30,84],[30,107],[30,130],[63,38],[63,84],[96,38],[96,61],[96,84],
      // I
      [146,38],[146,130],[179,38],[179,61],[179,84],[179,107],[179,130],[212,38],[212,130],
      // T
      [262,38],[295,38],[295,61],[295,84],[295,107],[295,130],[328,38],
      // C
      [378,38],[378,61],[378,84],[378,107],[378,130],[411,38],[411,130],[444,38],[444,130],
      // H
      [494,38],[494,61],[494,84],[494,107],[494,130],[527,84],[560,38],[560,61],[560,84],[560,107],[560,130],
    ].map(([x, y], i) => (
      <rect key={i} fill="currentColor" x={x} y={y} width="28" height="18" rx="3" />
    ))}
  </svg>
);
