/* particles.js — click-to-split blob effect (shared across all pages) */
(function () {
  const colors = ['#7F00FF','#5500FF','#AA00FF','#6600F2','#CC00FF','#EE00CC'];

  document.addEventListener('click', e => {
    if (e.target.closest('.site-nav')) return;

    const cx = e.clientX, cy = e.clientY;

    for (let k = 0; k < 7; k++) {
      const angle = (k / 7) * Math.PI * 2 + Math.random() * 0.6;
      const dist  = 90 + Math.random() * 100;
      const size  = 25 + Math.random() * 35;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const el    = document.createElement('div');
      el.style.cssText = `
        position:fixed;left:${cx}px;top:${cy}px;
        width:${size}px;height:${size}px;
        border-radius:50%;background:${color};
        filter:blur(${(size * 0.4).toFixed(1)}px);
        pointer-events:none;z-index:200;
        transform:translate(-50%,-50%);opacity:0.92;
        transition:transform 1s cubic-bezier(0.15,0,0.35,1),opacity 1s ease-out;
      `;
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = `translate(calc(-50% + ${(Math.cos(angle) * dist).toFixed(1)}px),`
                           + `calc(-50% + ${(Math.sin(angle) * dist).toFixed(1)}px)) scale(0.2)`;
        el.style.opacity = '0';
      });
      setTimeout(() => el.remove(), 1100);
    }
  });
})();
