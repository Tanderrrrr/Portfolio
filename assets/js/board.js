/*
 * Tablero hexagonal del héroe + entrada escalonada de las capturas.
 * Pasá el mouse (o tocá) para ver el rango de movimiento; clic/toque coloca o saca una figura.
 */
(() => {
  const canvas = document.getElementById('board');
  const hint = document.getElementById('hint');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SQRT3 = Math.sqrt(3);
  const RANGE = 2;        // casillas de "rango de movimiento" que se iluminan
  const MAX_TOKENS = 14;

  const PALETTE = {
    ember: { left: '#b8390f', right: '#862809', top: '#ff7a3d' },
    teal:  { left: '#1fa882', right: '#137a5d', top: '#6ff2cf' },
  };

  /* ---- Capturas: aparecen una vez al entrar en pantalla ---- */
  const shots = document.querySelector('.shots');
  if (shots) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { shots.classList.add('in'); io.disconnect(); }
      }, { threshold: 0.15 });
      io.observe(shots);
    } else {
      shots.classList.add('in');
    }
  }

  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, size = 34, ox = 0, oy = 0;
  let hover = null;                 // {q, r} bajo el puntero
  const tokens = new Map();         // "q,r" -> {q, r, tone, lift}
  let rafId = 0, visible = true;

  const key = (q, r) => `${q},${r}`;
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const toPixel = (q, r) => ({ x: ox + size * SQRT3 * (q + r / 2), y: oy + size * 1.5 * r });

  function fromPixel(x, y) {
    const px = x - ox, py = y - oy;
    const fq = (SQRT3 / 3 * px - py / 3) / size;
    const fr = (2 / 3 * py) / size;
    let rq = Math.round(fq), rr = Math.round(fr), rs = Math.round(-fq - fr);
    const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs + fq + fr);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  function seedTokens() {
    tokens.clear();
    const wide = W > 760;
    const start = wide
      ? [[3, -2, 'ember'], [5, -1, 'ember'], [4, 1, 'teal'], [6, 2, 'ember'], [2, 2, 'ember']]
      : [[1, -1, 'ember'], [2, 1, 'teal'], [-1, 2, 'ember']];
    for (const [q, r, tone] of start) tokens.set(key(q, r), { q, r, tone, lift: 0 });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = W < 640 ? 24 : 34;
    ox = W * (W > 760 ? 0.62 : 0.5);
    oy = H * 0.42;
    if (!tokens.size) seedTokens();
    schedule();
  }

  function hexPath(cx, cy, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawToken(t) {
    const { x, y } = toPixel(t.q, t.r);
    const c = PALETTE[t.tone];
    const a = size * 0.5, b = a * 0.5, hh = size * 1.55;
    const by = y - t.lift;
    // sombra en el suelo
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, a * 1.1, b * 1.3, 0, 0, Math.PI * 2); ctx.fill();
    // cara izquierda, derecha y tapa del monolito
    ctx.fillStyle = c.left;
    ctx.beginPath(); ctx.moveTo(x - a, by); ctx.lineTo(x, by + b); ctx.lineTo(x, by + b - hh); ctx.lineTo(x - a, by - hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.right;
    ctx.beginPath(); ctx.moveTo(x, by + b); ctx.lineTo(x + a, by); ctx.lineTo(x + a, by - hh); ctx.lineTo(x, by + b - hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.top;
    ctx.beginPath(); ctx.moveTo(x - a, by - hh); ctx.lineTo(x, by + b - hh); ctx.lineTo(x + a, by - hh); ctx.lineTo(x, by - b - hh); ctx.closePath(); ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const rMin = Math.floor((-size - oy) / (1.5 * size));
    const rMax = Math.ceil((H + size - oy) / (1.5 * size));
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((-size - ox) / (SQRT3 * size) - r / 2);
      const qMax = Math.ceil((W + size - ox) / (SQRT3 * size) - r / 2);
      for (let q = qMin; q <= qMax; q++) {
        const { x, y } = toPixel(q, r);
        const d = hover ? hexDist({ q, r }, hover) : 99;
        hexPath(x, y, size - 1.5);
        if (d <= RANGE) {
          ctx.fillStyle = `rgba(59, 232, 184, ${0.26 - d * 0.07})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(59, 232, 184, ${0.9 - d * 0.25})`;
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = 'rgba(255, 176, 120, 0.15)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }
    // figuras de atrás hacia adelante
    [...tokens.values()].sort((a, b) => a.r - b.r).forEach(drawToken);
  }

  function step() {
    rafId = 0;
    let moving = false;
    for (const t of tokens.values()) {
      const target = hover && hexDist(t, hover) <= RANGE ? 7 : 0;
      if (reduceMotion) { t.lift = target; continue; }
      const next = t.lift + (target - t.lift) * 0.22;
      t.lift = Math.abs(next - target) < 0.05 ? target : next;
      if (t.lift !== target) moving = true;
    }
    draw();
    if (moving && visible) rafId = requestAnimationFrame(step);
  }
  function schedule() { if (!rafId) rafId = requestAnimationFrame(step); }

  function setHover(e) {
    const rect = canvas.getBoundingClientRect();
    const h = fromPixel(e.clientX - rect.left, e.clientY - rect.top);
    if (!hover || hover.q !== h.q || hover.r !== h.r) { hover = h; schedule(); }
  }

  canvas.addEventListener('pointermove', setHover);
  canvas.addEventListener('pointerleave', () => { hover = null; schedule(); });
  canvas.addEventListener('pointerdown', (e) => {
    setHover(e);
    const k = key(hover.q, hover.r);
    if (tokens.has(k)) tokens.delete(k);
    else {
      if (tokens.size >= MAX_TOKENS) tokens.delete(tokens.keys().next().value);
      tokens.set(k, { q: hover.q, r: hover.r, tone: tokens.size % 4 === 2 ? 'teal' : 'ember', lift: 0 });
    }
    if (hint) hint.classList.add('gone');
    schedule();
  });

  new ResizeObserver(resize).observe(canvas);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) schedule(); }).observe(canvas);
  }
  resize();
})();
