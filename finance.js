(function () {
  'use strict';

  const API = 'https://finance.rsntl.com';

  // ── Initialise on load and SPA swap ───────────────────────────────────────

  function init() {
    const form = document.querySelector('#ticker-form');
    if (!form) return;

    // Auto-load from ?ticker= param
    const params = new URLSearchParams(location.search);
    const initial = params.get('ticker');
    if (initial) {
      const input = document.querySelector('#ticker-input');
      if (input) input.value = initial.toUpperCase();
      loadTicker(initial.toUpperCase());
    }

    // Remove previous listener to avoid duplicates after SPA swap
    form.removeEventListener('submit', handleSubmit);
    form.addEventListener('submit', handleSubmit);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const val = document.querySelector('#ticker-input').value.trim().toUpperCase();
    if (val) loadTicker(val);
  }

  // ── Fetch & render ────────────────────────────────────────────────────────

  async function loadTicker(ticker) {
    const content = document.querySelector('#finance-content');
    if (!content) return;
    content.innerHTML = skeletonHTML();
    try {
      const res = await fetch(`${API}/quote/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      history.pushState({}, '', `?ticker=${ticker}`);
      content.innerHTML = '';
      render(content, data);
    } catch (err) {
      content.innerHTML = errorHTML(err.message);
    }
  }

  // ── Master render ─────────────────────────────────────────────────────────

  function render(container, data) {
    const sections = [
      renderProfile(data),
      renderStatStrip(data),
      renderFundamentals(data),
      renderDescription(data),
      renderCapm(data),
      renderGraham(data),
      renderMonteCarlo(data),
      renderOptions(data),
    ].filter(Boolean);

    sections.forEach((el, i) => {
      el.style.animationDelay = `${i * 0.07}s`;
      container.appendChild(el);
    });
  }

  // ── Profile header ────────────────────────────────────────────────────────

  function renderProfile(data) {
    const { profile, price, asOf } = data;
    const sec = section('');
    sec.querySelector('.finance-section-title').remove();

    const div = el('div', 'profile-header');
    div.innerHTML = `
      <div class="profile-name">${esc(profile.name)} <span style="color:var(--sub);font-size:0.6em;letter-spacing:0.08em">${esc(profile.ticker)}</span></div>
      <div class="profile-meta">
        <span>${esc(profile.exchange)}</span>
        <span>${esc(profile.sector)}</span>
        <span>${esc(profile.industry)}</span>
      </div>
      <div class="profile-asof">As of ${new Date(asOf).toLocaleString()}</div>
    `;
    sec.appendChild(div);
    return sec;
  }

  // ── Stat strip ────────────────────────────────────────────────────────────

  function renderStatStrip(data) {
    const { fundamentals } = data;
    const sec = section('Key Stats');

    const strip = el('div', 'stat-strip');
    const stats = [
      { label: 'Market Cap',     value: fmtB(fundamentals.marketCapB) },
      { label: 'Trailing P/E',   value: fmtPE(fundamentals.trailingPe) },
      { label: 'Forward P/E',    value: fmtPE(fundamentals.forwardPe) },
      { label: 'Quick Ratio',    value: fmt(fundamentals.quickRatio, 2) },
      { label: 'Current Ratio',  value: fmt(fundamentals.currentRatio, 2) },
      { label: 'Sales Q/Q',      value: fmtPct(fundamentals.salesQoQPct), pct: fundamentals.salesQoQPct },
      { label: 'Sales Y/Y TTM',  value: fmtPct(fundamentals.salesYoYTtmPct), pct: fundamentals.salesYoYTtmPct },
      { label: 'EPS Q/Q',        value: fmtPct(fundamentals.epsQoQPct), pct: fundamentals.epsQoQPct },
      { label: 'EPS Y/Y TTM',    value: fmtPct(fundamentals.epsYoYTtmPct), pct: fundamentals.epsYoYTtmPct },
      { label: 'EPS TTM',        value: fmt(fundamentals.epsTtm, 2, '$') },
      { label: 'EPS Forward',    value: fmt(fundamentals.epsForward, 2, '$') },
      { label: 'Beta',           value: fmt(fundamentals.beta, 2) },
    ];

    for (const s of stats) {
      const card = el('div', 'stat-card');
      const lbl  = el('div', 'stat-label');
      const val  = el('div', 'stat-value');
      lbl.textContent = s.label;
      val.textContent = s.value;
      if (s.pct != null) {
        if (s.pct > 0) val.classList.add('pos');
        else if (s.pct < 0) val.classList.add('neg');
      }
      card.appendChild(lbl);
      card.appendChild(val);
      strip.appendChild(card);
    }

    sec.appendChild(strip);
    return sec;
  }

  // ── Description ───────────────────────────────────────────────────────────

  function renderDescription(data) {
    const desc = data.profile.description;
    if (!desc) return null;
    const sec = section('About');
    const p = el('p', 'description-text');
    p.textContent = desc;
    sec.appendChild(p);
    return sec;
  }

  // ── Fundamentals table ────────────────────────────────────────────────────

  function renderFundamentals(data) {
    const { price, fundamentals } = data;
    const sec = section('Price & Fundamentals');

    const grid = el('div', 'fund-grid');

    const rows = [
      { k: 'Last Price',       v: fmt(price.last, 2, '$'),              c: null },
      { k: '52w High',         v: fmt(price.week52High, 2, '$'),         c: null },
      { k: '52w Low',          v: fmt(price.week52Low, 2, '$'),          c: null },
      { k: 'ATH Close',        v: price.athClose ? fmt(price.athClose, 2, '$') : '—', c: null },
      { k: 'ATH Date',         v: price.athDate ?? '—',                  c: null },
      { k: 'Dist from ATH',    v: fmtPct(price.distAthPct),             c: price.distAthPct },
      { k: 'Realized Vol',     v: price.distAthPct != null ? fmtPct(data.options.realizedVol != null ? data.options.realizedVol * 100 : null) : fmt(data.options.realizedVol != null ? data.options.realizedVol * 100 : null, 1, '', '%'), c: null },
      { k: 'Beta',             v: fmt(fundamentals.beta, 2),             c: null },
    ];

    for (const r of rows) {
      const row = el('div', 'fund-row');
      const k = el('span', 'fund-key');
      const v = el('span', 'fund-val');
      k.textContent = r.k;
      v.textContent = r.v;
      if (r.c != null) {
        if (r.c > 0) v.classList.add('pos');
        else if (r.c < 0) v.classList.add('neg');
      }
      row.appendChild(k);
      row.appendChild(v);
      grid.appendChild(row);
    }

    sec.appendChild(grid);
    return sec;
  }

  // ── CAPM / SML chart ──────────────────────────────────────────────────────

  function renderCapm(data) {
    const { capm } = data;
    const sec = section('CAPM — Security Market Line');

    const W = 600, H = 300;
    const PAD = { top: 24, right: 24, bottom: 48, left: 56 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const xMin = 0, xMax = 2;
    const yMin = 0, yMax = 0.22;

    function sx(v) { return PAD.left + ((v - xMin) / (xMax - xMin)) * chartW; }
    function sy(v) { return PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * chartH; }

    const { rf, rm, beta, required, ggReturn } = capm;

    // SML points
    const smlX1 = sx(0), smlY1 = sy(rf);
    const smlX2 = sx(2), smlY2 = sy(rf + 2 * (rm - rf));

    // Grid lines
    let gridLines = '';
    for (let b = 0; b <= 2; b += 0.5) {
      const x = sx(b);
      gridLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + chartH}" stroke="var(--chart-grid)" stroke-width="1"/>`;
    }
    for (let r = 0; r <= 0.20; r += 0.05) {
      const y = sy(r);
      gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + chartW}" y2="${y}" stroke="var(--chart-grid)" stroke-width="1"/>`;
    }

    // Axis labels
    let xLabels = '', yLabels = '';
    for (let b = 0; b <= 2; b += 0.5) {
      xLabels += `<text x="${sx(b)}" y="${PAD.top + chartH + 18}" text-anchor="middle" fill="var(--chart-muted)" font-size="11" font-family="Outfit,sans-serif">${b.toFixed(1)}</text>`;
    }
    for (let r = 0; r <= 0.20; r += 0.05) {
      yLabels += `<text x="${PAD.left - 8}" y="${sy(r) + 4}" text-anchor="end" fill="var(--chart-muted)" font-size="11" font-family="Outfit,sans-serif">${(r * 100).toFixed(0)}%</text>`;
    }

    // Required return point
    let reqPoint = '', ggPoint = '', legend = '';
    if (beta != null && required != null) {
      const px = sx(beta), py = sy(required);
      reqPoint = `<circle cx="${px}" cy="${py}" r="6" fill="var(--accent)" opacity="0.9"/>
        <text x="${px + 10}" y="${py + 4}" fill="var(--chart-axis)" font-size="11" font-family="Outfit,sans-serif">Req ${(required * 100).toFixed(1)}%</text>`;
    }
    if (beta != null && ggReturn != null) {
      const px = sx(beta), py = sy(Math.min(ggReturn, yMax));
      const col = (required != null && ggReturn > required) ? 'var(--chart-green)' : 'var(--chart-red)';
      ggPoint = `<circle cx="${px}" cy="${py}" r="6" fill="${col}" opacity="0.9"/>
        <text x="${px + 10}" y="${py - 6}" fill="var(--chart-axis)" font-size="11" font-family="Outfit,sans-serif">GG ${(ggReturn * 100).toFixed(1)}%</text>`;
    }

    legend = `
      <line x1="${PAD.left}" y1="${H - 12}" x2="${PAD.left + 28}" y2="${H - 12}" stroke="var(--chart-axis)" stroke-width="2"/>
      <text x="${PAD.left + 34}" y="${H - 8}" fill="var(--chart-muted)" font-size="10" font-family="Outfit,sans-serif">SML</text>
      <circle cx="${PAD.left + 90}" cy="${H - 12}" r="5" fill="var(--accent)" opacity="0.9"/>
      <text x="${PAD.left + 100}" y="${H - 8}" fill="var(--chart-muted)" font-size="10" font-family="Outfit,sans-serif">Required Return</text>
      <circle cx="${PAD.left + 210}" cy="${H - 12}" r="5" fill="var(--chart-green)" opacity="0.9"/>
      <text x="${PAD.left + 220}" y="${H - 8}" fill="var(--chart-muted)" font-size="10" font-family="Outfit,sans-serif">GG Return</text>
    `;

    const wrap = el('div', 'chart-wrap');
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      <line x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${PAD.left + chartW}" y2="${PAD.top + chartH}" stroke="var(--chart-axis)" stroke-width="1.5"/>
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}" stroke="var(--chart-axis)" stroke-width="1.5"/>
      ${xLabels}${yLabels}
      <text x="${PAD.left + chartW / 2}" y="${H - 2}" text-anchor="middle" fill="var(--chart-muted)" font-size="11" font-family="Outfit,sans-serif">Beta</text>
      <line x1="${smlX1}" y1="${smlY1}" x2="${smlX2}" y2="${smlY2}" stroke="var(--chart-axis)" stroke-width="2" stroke-dasharray="5,3"/>
      ${reqPoint}${ggPoint}${legend}
    </svg>`;

    sec.appendChild(wrap);
    return sec;
  }

  // ── Graham valuation ──────────────────────────────────────────────────────

  function renderGraham(data) {
    const { graham, price } = data;
    const sec = section('Graham Intrinsic Value');

    const card = el('div', 'verdict-card');

    let badgeClass = 'unknown', badgeText = 'N/A';
    if (graham.undervalued === true)  { badgeClass = 'undervalued'; badgeText = 'UNDERVALUED'; }
    if (graham.undervalued === false) { badgeClass = 'overvalued';  badgeText = 'OVERVALUED'; }

    const badge = el('div', `verdict-badge ${badgeClass}`);
    badge.textContent = badgeText;

    const stats = el('div', 'verdict-stats');
    const rows = [
      { label: 'Growth % (g)',   value: graham.gPct != null ? graham.gPct.toFixed(1) + '%' : '—' },
      { label: 'Gross Value',    value: graham.gross != null ? '$' + graham.gross.toFixed(2) : '—' },
      { label: 'After MoS (20%)', value: graham.mosAmt != null ? '$' + graham.mosAmt.toFixed(2) : '—' },
      { label: 'Current Price',  value: '$' + (price.last || 0).toFixed(2) },
    ];
    for (const r of rows) {
      const s = el('div', 'verdict-stat');
      const lbl = el('div', 'verdict-stat-label'); lbl.textContent = r.label;
      const val = el('div', 'verdict-stat-value'); val.textContent = r.value;
      s.appendChild(lbl); s.appendChild(val);
      stats.appendChild(s);
    }

    card.appendChild(badge);
    card.appendChild(stats);
    sec.appendChild(card);
    return sec;
  }

  // ── Monte Carlo histogram ─────────────────────────────────────────────────

  function renderMonteCarlo(data) {
    const { monteCarlo, price } = data;
    const sec = section('Monte Carlo Simulation (1Y, 10 000 paths)');

    const finals = monteCarlo.finals;
    if (!finals || finals.length === 0) return null;

    const W = 600, H = 240;
    const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const minV = finals[0], maxV = finals[finals.length - 1];
    const BINS = 50;
    const binW = (maxV - minV) / BINS;
    const counts = new Array(BINS).fill(0);
    for (const v of finals) {
      const i = Math.min(Math.floor((v - minV) / binW), BINS - 1);
      counts[i]++;
    }
    const maxCount = Math.max(...counts);

    function sx(v) { return PAD.left + ((v - minV) / (maxV - minV)) * chartW; }
    function sy(c) { return PAD.top + (1 - c / maxCount) * chartH; }

    let bars = '';
    for (let i = 0; i < BINS; i++) {
      const x = sx(minV + i * binW);
      const nextX = sx(minV + (i + 1) * binW);
      const bw = Math.max(nextX - x - 1, 1);
      const col = (minV + i * binW) >= price.last ? 'var(--chart-green)' : 'var(--chart-red)';
      bars += `<rect x="${x}" y="${sy(counts[i])}" width="${bw}" height="${chartH - (sy(counts[i]) - PAD.top)}" fill="${col}" opacity="0.55"/>`;
    }

    // Vertical lines
    function vline(v, color, label, labelPos) {
      const x = sx(v);
      const labelY = labelPos === 'top' ? PAD.top + 14 : PAD.top + chartH - 8;
      return `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + chartH}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3"/>
        <text x="${x + 4}" y="${labelY}" fill="${color}" font-size="10" font-family="Outfit,sans-serif">${label}</text>`;
    }

    const lines = [
      vline(price.last,          'var(--chart-axis)', `Now $${price.last.toFixed(0)}`,      'top'),
      vline(monteCarlo.p10,      'var(--chart-muted)', `P10 $${monteCarlo.p10.toFixed(0)}`,  'top'),
      vline(monteCarlo.median,   'var(--accent)',      `Med $${monteCarlo.median.toFixed(0)}`, 'top'),
      vline(monteCarlo.p90,      'var(--chart-muted)', `P90 $${monteCarlo.p90.toFixed(0)}`,  'top'),
    ].join('');

    // x-axis ticks
    let xLabels = '';
    const tickStep = Math.pow(10, Math.floor(Math.log10((maxV - minV) / 5)));
    const tickStart = Math.ceil(minV / tickStep) * tickStep;
    for (let v = tickStart; v <= maxV; v += tickStep) {
      xLabels += `<text x="${sx(v)}" y="${PAD.top + chartH + 16}" text-anchor="middle" fill="var(--chart-muted)" font-size="10" font-family="Outfit,sans-serif">$${v.toFixed(0)}</text>`;
    }

    const wrap = el('div', 'chart-wrap');
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${PAD.left + chartW}" y2="${PAD.top + chartH}" stroke="var(--chart-axis)" stroke-width="1.5"/>
      ${bars}${lines}${xLabels}
    </svg>`;

    const label = el('div', 'mc-label');
    label.textContent = `P(above current price): ${(monteCarlo.pAbove * 100).toFixed(1)}%  ·  Median: $${monteCarlo.median.toFixed(2)}  ·  P10: $${monteCarlo.p10.toFixed(2)}  ·  P90: $${monteCarlo.p90.toFixed(2)}`;

    sec.appendChild(wrap);
    sec.appendChild(label);
    return sec;
  }

  // ── Options section ───────────────────────────────────────────────────────

  function renderOptions(data) {
    const { options } = data;
    const sec = section('Options Analysis');

    // Summary pills
    const summary = el('div', 'options-summary');
    const pills = [
      { label: 'Expiry',      value: options.expiry ?? '—' },
      { label: 'DTE',         value: options.dte != null ? options.dte + 'd' : '—' },
      { label: 'ATM IV',      value: options.atmIv != null ? (options.atmIv * 100).toFixed(1) + '%' : '—' },
      { label: 'Realized Vol',value: options.realizedVol != null ? (options.realizedVol * 100).toFixed(1) + '%' : '—' },
      { label: 'IV Premium',  value: options.ivPremiumPct != null ? options.ivPremiumPct.toFixed(1) + '%' : '—' },
    ];
    for (const p of pills) {
      const pill = el('div', 'options-pill');
      pill.innerHTML = `${esc(p.label)}: <strong>${esc(p.value)}</strong>`;
      summary.appendChild(pill);
    }

    // Strategy cards
    const grid = el('div', 'options-grid');
    for (const strat of (options.strategies || [])) {
      grid.appendChild(buildStrategyCard(strat));
    }

    sec.appendChild(summary);
    sec.appendChild(grid);
    return sec;
  }

  function buildStrategyCard(strat) {
    const card = el('div', 'strategy-card');

    const name = el('div', 'strategy-name'); name.textContent = strat.name;
    const desc = el('div', 'strategy-desc'); desc.textContent = strat.description;
    card.appendChild(name);
    card.appendChild(desc);

    const stats = el('div', 'strategy-stats');
    function row(label, value) {
      const r = el('div', 'greek-row');
      const l = el('span', 'greek-label'); l.textContent = label;
      const v = el('span', 'greek-value'); v.textContent = value;
      r.appendChild(l); r.appendChild(v);
      return r;
    }
    stats.appendChild(row('Max Profit', strat.maxProfit != null ? '$' + strat.maxProfit.toFixed(2) : 'Unlimited'));
    stats.appendChild(row('Max Loss',   strat.maxLoss   != null ? '$' + strat.maxLoss.toFixed(2)   : 'Unlimited'));
    stats.appendChild(row('Breakeven',  strat.breakeven != null ? '$' + strat.breakeven.toFixed(2) : 'N/A'));
    card.appendChild(stats);

    // Legs
    for (let i = 0; i < strat.legs.length; i++) {
      const leg = strat.legs[i];
      const div = el('div', 'leg-divider');
      div.textContent = `Leg ${i + 1}: ${leg.action.toUpperCase()} ${leg.type.toUpperCase()}`;
      card.appendChild(div);

      const greekStats = el('div', 'strategy-stats');
      greekStats.appendChild(row('Strike', leg.strike != null ? '$' + leg.strike.toFixed(2) : 'N/A'));
      greekStats.appendChild(row('Price',  leg.price  != null ? '$' + leg.price.toFixed(2)  : 'N/A'));
      if (leg.greeks) {
        const g = leg.greeks;
        greekStats.appendChild(row('Delta', g.delta != null ? g.delta.toFixed(4) : 'N/A'));
        greekStats.appendChild(row('Gamma', g.gamma != null ? g.gamma.toFixed(4) : 'N/A'));
        greekStats.appendChild(row('Theta', g.theta != null ? g.theta.toFixed(4) : 'N/A'));
        greekStats.appendChild(row('Vega',  g.vega  != null ? g.vega.toFixed(4)  : 'N/A'));
        greekStats.appendChild(row('Rho',   g.rho   != null ? g.rho.toFixed(4)   : 'N/A'));
      }
      card.appendChild(greekStats);
    }

    return card;
  }

  // ── Skeleton & error ──────────────────────────────────────────────────────

  function skeletonHTML() {
    return `
      <div class="skeleton-strip">
        ${Array.from({ length: 8 }, () => '<div class="skeleton skeleton-card"></div>').join('')}
      </div>
      <div class="skeleton skeleton-block"></div>
      <div class="skeleton skeleton-block-sm"></div>
      <div class="skeleton skeleton-block"></div>
    `;
  }

  function errorHTML(msg) {
    return `<div class="finance-error"><strong>Error</strong>${esc(msg)}</div>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function section(title) {
    const sec = el('div', 'finance-section');
    if (title) {
      const t = el('div', 'finance-section-title');
      t.textContent = title;
      sec.appendChild(t);
    }
    return sec;
  }

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(v, decimals = 2, prefix = '', suffix = '') {
    if (v == null || isNaN(v)) return '—';
    return prefix + Number(v).toFixed(decimals) + suffix;
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    const sign = v >= 0 ? '+' : '';
    return sign + Number(v).toFixed(1) + '%';
  }

  function fmtB(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'T';
    return '$' + Number(v).toFixed(1) + 'B';
  }

  function fmtPE(v) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(1) + '×';
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('page:loaded', init);
})();
