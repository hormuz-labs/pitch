# Pitch Brand UI Guidelines

These rules apply to the product shell, Studio, account surfaces, and new-project door.

## Typography

- Use `DM Sans` for Latin product UI: navigation, buttons, inputs, menus, settings, labels, and body copy.
- Use the shared `--font-sans` token instead of declaring a font family in a component.
- Use `Instrument Serif` only for deliberate editorial display moments on marketing pages.
- Use the mono face only for technical content, timestamps, keyboard hints, code, or the pixel wordmark treatment.
- Do not use Geist or Inter as the default product UI font. DM Sans is the canonical Latin interface face.

## Themes

- Every product component must support both `[data-theme="light"]` and `[data-theme="dark"]` through tokens from `apps/web/src/styles/tokens.css`.
- Use `--bg-page`, `--bg-surface`, `--bg-raised`, and `--bg-sunken` for surfaces.
- Use `--text-primary`, `--text-secondary`, `--text-muted`, and `--text-faint` for text and icons.
- Use `--border-subtle`, `--border-default`, and `--border-strong` for boundaries.
- Use `--shadow-*` tokens for elevation.
- Never hardcode a dark popover, dropdown, sidebar, or card on a themeable product surface.

## Shape And Spacing

- Compact icon controls are circular or use `--radius-md`.
- Credit balances and status counters use pill geometry (`--radius-pill`).
- Menus use `--radius-lg`; larger cards and composers may use `--radius-xl`.
- Keep navigation controls compact and align icons to a consistent 16-20px optical size.

## Sidebar

- The desktop sidebar is one layout slot, not a rail plus overlay drawer.
- It animates between 48px collapsed and 272px expanded and pushes the page inset.
- Do not blur or dim desktop content during expansion.
- The compact rail shows actions as icons; the expanded state reveals labels and project history.
- Mobile may use a modal drawer and scrim because it cannot reserve sidebar width.

## Motion

- Use `--ease-out` for entering and expanding UI.
- Keep shell transitions around 240-250ms and small hover/fade transitions around 120-150ms.
- Animate layout dimensions and content opacity together; avoid detached panels that visually duplicate the sidebar.
- Respect `prefers-reduced-motion` for non-essential animation.
