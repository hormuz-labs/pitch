import type { JSX } from 'solid-js';

// Stroke icons drawn on a 24px grid.
const paths: Record<string, () => JSX.Element> = {
  home: () => <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  grid: () => <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  palette: () => <><path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.7-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  puzzle: () => <path d="M10 3h4v3a2 2 0 1 0 4 0V3h2v6h-3a2 2 0 1 0 0 4h3v8h-6v-3a2 2 0 1 0-4 0v3H4v-8h3a2 2 0 1 0 0-4H4V3z" />,
  plus: () => <path d="M12 5v14M5 12h14" />,
  arrowUp: () => <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  stop: () => <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />,
  file: () => <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  edit: () => <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  read: () => <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  search: () => <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  globe: () => <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></>,
  download: () => <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14" />,
  trash: () => <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />,
  list: () => <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  check: () => <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: () => <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: () => <path d="m6 9 6 6 6-6" />,
  chevronLeft: () => <path d="m15 6-6 6 6 6" />,
  chevronRight: () => <path d="m9 6 6 6-6 6" />,
  refresh: () => <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  code: () => <path d="m8 7-5 5 5 5m8-10 5 5-5 5" />,
  monitor: () => <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  tablet: () => <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M11 18h2" /></>,
  phone: () => <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
  external: () => <path d="M14 4h6v6m0-6-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />,
  share: () => <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />,
  sparkle: () => <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />,
  paperclip: () => <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1L13 4.4a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />,
  history: () => <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  more: () => <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>,
  image: () => <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5.5-5.5L5 20" /></>,
  slides: () => <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  film: () => <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  wave: () => <path d="M3 12h2m3-5v10m4-13v16m4-11v6m4-3h1" />,
  doc: () => <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h3" /></>,
  layers: () => <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" />,
  bolt: () => <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  cube: () => <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5" />,
  play: () => <path d="M7 5v14l11-7z" fill="currentColor" />,
  folder: () => <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  todo: () => <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>,
};

export function Icon(props: { name: keyof typeof paths | string; size?: number; class?: string }) {
  const s = () => props.size ?? 16;
  return (
    <svg
      class={props.class}
      width={s()}
      height={s()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {(paths[props.name] ?? paths.file!)()}
    </svg>
  );
}
