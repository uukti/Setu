(function () {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const ctx = mm.getContext('2d');
  const W = mm.width, H = mm.height;
  let map = null;

  window.renderMinimap = function () {
    const blocks = [...document.querySelectorAll('#canvas .block')];
    if (!blocks.length) { mm.classList.add('hidden'); return; }
    mm.classList.remove('hidden');
    const v = window.getView();
    const canvasEl = document.getElementById('canvas');
    let x0 = -v.x / v.zoom, y0 = -v.y / v.zoom, x1 = (canvasEl.clientWidth - v.x) / v.zoom, y1 = (canvasEl.clientHeight - v.y) / v.zoom;
    const rects = new Map();
    blocks.forEach((b) => {
      const r = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
      rects.set(b.dataset.id, r);
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    });
    const pad = 40; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    map = { x0, y0, s, ox, oy };
    const X = (x) => ox + (x - x0) * s, Y = (y) => oy + (y - y0) * s;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(55,148,255,.6)'; ctx.lineWidth = 1;
    (window.edges || []).forEach((e) => {
      const a = rects.get(e.from), b = rects.get(e.to);
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(X(a.x + a.w), Y(a.y + a.h / 2));
      ctx.lineTo(X(b.x), Y(b.y + b.h / 2));
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(55,148,255,.75)';
    rects.forEach((r) => ctx.fillRect(X(r.x), Y(r.y), Math.max(2, r.w * s), Math.max(2, r.h * s)));
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.strokeRect(X(-v.x / v.zoom), Y(-v.y / v.zoom), (canvasEl.clientWidth / v.zoom) * s, (canvasEl.clientHeight / v.zoom) * s);
  };

  function jump(e) {
    if (!map) return;
    const r = mm.getBoundingClientRect();
    const wx = map.x0 + ((e.clientX - r.left) * (W / r.width) - map.ox) / map.s;
    const wy = map.y0 + ((e.clientY - r.top) * (H / r.height) - map.oy) / map.s;
    const v = window.getView();
    const canvasEl = document.getElementById('canvas');
    window.setPan(canvasEl.clientWidth / 2 - wx * v.zoom, canvasEl.clientHeight / 2 - wy * v.zoom);
  }
  mm.onpointerdown = (e) => {
    e.preventDefault();
    mm.setPointerCapture(e.pointerId);
    jump(e);
    const move = (ev) => jump(ev);
    const up = () => { mm.removeEventListener('pointermove', move); mm.removeEventListener('pointerup', up); window.saveState(); };
    mm.addEventListener('pointermove', move); mm.addEventListener('pointerup', up);
  };
  window.renderMinimap();
})();
