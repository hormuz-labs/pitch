/* Channel icons as inline SVG. Recognizable, not trademark-perfect. */
window.ShotIcons = {
  _svg(body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">${body}</svg>`;
  },
  sms(fg = "#fff") {
    return ShotIcons._svg(`<path d="M10 12h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 8v-8h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="${fg}"/>`);
  },
  whatsapp(fg = "#fff") {
    return ShotIcons._svg(`<path d="M24 8c8.8 0 16 7.2 16 16 0 8.8-7.2 16-16 16-2.6 0-5-.6-7.2-1.7L8 40l1.8-8.6A15.8 15.8 0 0 1 8 24C8 15.2 15.2 8 24 8zm-6 11.5c.6 3.2 3.5 8 8.6 10.2 1.2.5 2 .1 2.4-.5l.7-1.2-2.8-1.4-.8 1.1c-3.4-1.4-5.5-5-6-6.2l1.1-.8-1.4-2.8-1.2.7c-.5.4-.9 1.2-.6 1.9z" fill="${fg}"/>`);
  },
  telegram(fg = "#fff") {
    return ShotIcons._svg(`<path d="M8 23.2 38.4 11.4c1.4-.5 2.7.4 2.2 2.3L35 36.2c-.4 1.5-1.5 1.8-2.6 1.1l-7.2-5.3-3.5 3.4c-.4.4-.8.7-1.5.7l.5-7.3 13.4-12.1c.6-.5-.1-.8-.9-.3L16.4 27.6 9.3 25.4c-1.5-.5-1.5-1.5 0-2.2z" fill="${fg}"/>`);
  },
  viber(fg = "#fff") {
    return ShotIcons._svg(`<path d="M16 8h12c8 0 14 6 14 14v4c0 8-6 14-14 14h-2l-8 6v-6h-2C10 40 6 34 6 26v-4c0-8 4-14 10-14z" fill="${fg}"/><circle cx="24" cy="22" r="6" fill="#7360F2"/>`);
  },
  email(fg = "#fff") {
    return ShotIcons._svg(`<rect x="8" y="12" width="32" height="24" rx="4" fill="${fg}"/><path d="M10 14 24 26 38 14" stroke="#7C3AED" stroke-width="3" fill="none"/>`);
  },
  voice(fg = "#fff") {
    return ShotIcons._svg(`<rect x="8" y="18" width="5" height="12" rx="2.5" fill="${fg}"/><rect x="16" y="10" width="5" height="28" rx="2.5" fill="${fg}"/><rect x="24" y="14" width="5" height="20" rx="2.5" fill="${fg}"/><rect x="32" y="8" width="5" height="32" rx="2.5" fill="${fg}"/>`);
  },
  flash(fg = "#fff") {
    return ShotIcons._svg(`<path d="M26 6 12 26h12l-4 16 18-24H26l4-12z" fill="${fg}"/>`);
  },
  mark() {
    return `<svg class="logo-mark" viewBox="0 0 28 56" fill="none" aria-hidden="true">
      <path d="M22 6 4 28l18 22" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  },
};

window.ShotIcons.chip = function chip(kind) {
  const map = {
    sms: { bg: "#25D366", svg: ShotIcons.sms() },
    whatsapp: { bg: "#25D366", svg: ShotIcons.whatsapp() },
    telegram: { bg: "#2AABEE", svg: ShotIcons.telegram() },
    viber: { bg: "#7360F2", svg: ShotIcons.viber() },
    email: { bg: "#7C3AED", svg: ShotIcons.email() },
    voice: { bg: "linear-gradient(180deg,#FF6B6B,#E11D48)", svg: ShotIcons.voice() },
    flash: { bg: "linear-gradient(180deg,#FF6B6B,#E11D48)", svg: ShotIcons.flash() },
  };
  return map[kind] || null;
};
