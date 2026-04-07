# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static marketing site for Resonant Labs, deployed to GitHub Pages. No build step — push to `main` triggers automatic deployment via `.github/workflows/deploy.yml`.

To preview locally, serve the repo root with any static file server, e.g.:
```
npx serve .
# or
python -m http.server 8080
```

## Architecture

### Pages
- `index.html` — full-viewport landing page (`overflow: hidden`, no scroll)
- `expertise.html` — scrollable expertise/services page

Each page loads `shared.css`, then `bg.js` (module), `nav.js`, and `particles.js` as deferred scripts.

### Shared assets
- **`shared.css`** — all design tokens (CSS custom properties), layout primitives (`.stage`, `#bg`, `#vignette`), nav styles, grain animation, CSS blob fallback, and cross-document view-transition keyframes. Page-specific styles live in an inline `<style>` block within each HTML file.
- **`bg.js`** — animated gradient background. Attempts WebGPU first (WGSL shader with 6 animated blobs); falls back to CSS animated `.blob` divs. Loaded as `type="module"` so it can use top-level `await`.
- **`nav.js`** — floating pill nav. Handles the sliding highlight pill, scroll-hide behaviour, SPA-style navigation (swaps `.stage` innerHTML without reloading the page so the canvas animation never pauses), prefetches sibling pages on load, and handles browser history.
- **`particles.js`** — click-to-burst particle effect using fixed-position divs.

### Design system
Fonts: `Fraunces` (serif, weight 300/400) and `Outfit` (sans, weight 300/400) from Google Fonts.

Dark/light mode is handled entirely through CSS `prefers-color-scheme` media queries on the CSS custom properties defined in `shared.css`. No JS colour-scheme switching.

### SPA navigation constraint
`nav.js` swaps only the `.stage` element's `innerHTML` and the page's inline `<style>` block between navigations. Any scripts in the incoming page are **not** re-executed. All interactive behaviour must be in the shared scripts (`nav.js`, `particles.js`, `bg.js`) which load once.
