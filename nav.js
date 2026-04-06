/* nav.js — sliding pill + SPA navigation (canvas never pauses) */
(function () {
  const nav  = document.querySelector('.site-nav');
  const pill = nav && nav.querySelector('.nav-pill');
  if (!nav || !pill) return;

  const items = Array.from(nav.querySelectorAll('.nav-brand, .nav-link'));
  let   active = nav.querySelector('.active') || items[0];

  /* ── Pill ───────────────────────────────────────────────────────── */
  function place(el, animate) {
    const nr = nav.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (!animate) { pill.style.transition = 'none'; pill.getBoundingClientRect(); }
    pill.style.left   = (er.left  - nr.left) + 'px';
    pill.style.top    = (er.top   - nr.top)  + 'px';
    pill.style.width  = er.width  + 'px';
    pill.style.height = er.height + 'px';
    if (!animate) { pill.getBoundingClientRect(); pill.style.transition = ''; }
  }

  place(active, false);
  document.fonts.ready.then(() => place(active, false));
  items.forEach(i => i.addEventListener('mouseenter', () => place(i, true)));
  nav.addEventListener('mouseleave', () => place(active, true));

  /* ── Hide nav on scroll down, show on scroll up ─────────────────── */
  let lastY = 0;
  function scrollY() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
  }
  function onScroll() {
    const y = scrollY();
    if (y > lastY && y > 60) nav.classList.add('nav--hidden');
    else                      nav.classList.remove('nav--hidden');
    lastY = y;
  }
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });

  /* ── SPA router ─────────────────────────────────────────────────── */
  const cache = new Map();

  function fetchPage(url) {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    return fetch(url).then(r => r.text()).then(html => { cache.set(url, html); return html; });
  }

  /* Prefetch sibling pages for instant navigation */
  items.forEach(i => {
    const u = new URL(i.href, location.href).href;
    if (u !== location.href) fetchPage(u).catch(() => {});
  });

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function navigateTo(url, pushState = true) {
    let html;
    try { html = await fetchPage(url); }
    catch { window.location.href = url; return; }

    const doc      = new DOMParser().parseFromString(html, 'text/html');
    const stageEl  = document.querySelector('.stage');

    /* Fade out only the content children — the glass element stays, so
       the canvas behind it never gets snapshotted or paused */
    const exitKids = Array.from(stageEl.children);
    exitKids.forEach(c => {
      c.style.transition = 'opacity 0.14s ease-out';
      c.style.opacity    = '0';
    });
    await delay(150);

    /* ── Swap ── */
    document.title = doc.title;

    const oldSt = document.querySelector('head > style');
    const newSt = doc.querySelector('head > style');
    if (oldSt && newSt) oldSt.replaceWith(newSt.cloneNode(true));
    else if (newSt)     document.head.appendChild(newSt.cloneNode(true));
    else if (oldSt)     oldSt.remove();

    const newStage = doc.querySelector('.stage');
    if (stageEl && newStage) stageEl.innerHTML = newStage.innerHTML;

    /* Update nav active state + pill */
    const newPath = new URL(url, location.href).pathname;
    const matched = items.find(i => new URL(i.href, location.href).pathname === newPath);
    items.forEach(i => i.classList.remove('active'));
    if (matched) { matched.classList.add('active'); active = matched; }
    place(active, false);

    if (pushState) history.pushState({ url }, '', url);

    /* Reset scroll-hide state for new page */
    lastY = 0;
    nav.classList.remove('nav--hidden');

    /* Fade in new content children */
    const enterKids = Array.from(stageEl.children);
    enterKids.forEach(c => {
      c.style.opacity    = '0';
      c.style.transform  = 'translateY(8px)';
      c.style.transition = 'none';
    });
    stageEl.getBoundingClientRect(); /* flush */
    enterKids.forEach(c => {
      c.style.transition = 'opacity 0.32s cubic-bezier(0.16,1,0.3,1), transform 0.32s cubic-bezier(0.16,1,0.3,1)';
      c.style.opacity    = '1';
      c.style.transform  = 'translateY(0)';
    });

    await delay(340);
    enterKids.forEach(c => { c.style.transition = c.style.opacity = c.style.transform = ''; });
  }

  /* Intercept nav-link clicks */
  nav.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) { e.preventDefault(); return; }
    e.preventDefault();
    navigateTo(url.href);
  });

  /* Handle browser back / forward */
  window.addEventListener('popstate', () => navigateTo(location.href, false));
})();
