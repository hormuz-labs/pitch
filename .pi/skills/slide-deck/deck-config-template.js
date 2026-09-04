// The deck: theme tokens and slides. This is the file you author and edit;
// pdf_build reads it through build/pdf-builder.js, which you never touch.
// Image paths are relative to build/: getBase64Image('images/<keyword-slug>/pinterest_01.jpg').
module.exports = {
    jobId: '',
    topicSlug: '',              // e.g. 'dark-matter-energy'
    title: '',                  // never leave a placeholder anywhere in this file
    subtitle: '',
    presenter: '',
    date: '',                   // e.g. 'March 2026'
    template: '',               // template id when pdf_scaffold was given one, else ''
    theme: {
        primary:     null,      // e.g. '#3B82F6' — borders, bullets, stat numbers, chart colours
        secondary:   null,      // e.g. '#93C5FD' — body copy, descriptions, footers
        bg:          null,      // e.g. '#0B0F19' — slide background
        accent:      null,      // e.g. '#FFFFFF' — headings
        fontDisplay: null,      // e.g. "'Outfit', sans-serif"
        fontBody:    null,      // e.g. "'Inter', sans-serif"
    },
    slides: [
        // { layout: 'COVER', title, subtitle, image: getBase64Image('images/<slug>/pinterest_01.jpg') },
        // { layout: 'SPLIT-R', title, bullets: [...], image: getBase64Image('images/<slug>/pinterest_02.jpg') },
    ],
};
