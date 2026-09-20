const canvas = document.getElementById('canvas');
const world = document.createElement('div');
world.id = 'world';
world.appendChild(document.getElementById('edges'));
canvas.prepend(world);
const pan = { x: 0, y: 0 };
let zoom = 1;
window.getView = function () { return { x: pan.x, y: pan.y, zoom }; };
window.setPan = function (x, y) { pan.x = x; pan.y = y; applyView(); };
function applyView() {
  world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  canvas.style.backgroundSize = (22 * zoom) + 'px ' + (22 * zoom) + 'px';
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = Math.round(zoom * 100) + '%';
}
function zoomAt(cx, cy, factor) {
  const r = canvas.getBoundingClientRect();
  const wx = (cx - r.left - pan.x) / zoom, wy = (cy - r.top - pan.y) / zoom;
  zoom = Math.min(2, Math.max(0.4, zoom * factor));
  pan.x = cx - r.left - wx * zoom;
  pan.y = cy - r.top - wy * zoom;
  applyView();
}
document.getElementById('zoom-in').onclick = (e) => { const r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); window.saveState(); };
document.getElementById('zoom-out').onclick = (e) => { const r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); window.saveState(); };
document.getElementById('zoom-reset').onclick = () => { zoom = 1; applyView(); window.saveState(); };
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey && e.target !== canvas) return;
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  window.saveState();
}, { passive: false });
document.getElementById('add').onclick = () => {
  world.appendChild(createCodeBlock());
  window.redrawEdges();
  window.saveState();
};
document.getElementById('add-lib').onclick = () => {
  world.appendChild(createLibBlock());
  window.redrawEdges();
  window.saveState();
};

window.edges = [];

canvas.onpointerdown = (e) => {
  if (e.target !== canvas) return;
  e.preventDefault();
  const sx = e.clientX - pan.x, sy = e.clientY - pan.y;
  const move = (ev) => { pan.x = ev.clientX - sx; pan.y = ev.clientY - sy; applyView(); };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); window.saveState(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
};

window.canvasPoint = function (cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom };
};

function portY(b, i, total, side) {
  const p = b.querySelector(side);
  const base = b.offsetTop + p.offsetTop;
  const span = 40;
  return base + (total <= 1 ? 0 : (span * i) / (total - 1) - span / 2);
}

window.redrawEdges = function redrawEdges() {
  const svg = document.getElementById('edges');
  if (!svg) return;
  svg.querySelectorAll('g').forEach((g) => g.remove());
  const ns = 'http://www.w3.org/2000/svg';

  const byId = new Map();
  document.querySelectorAll('#canvas .block').forEach((b) => byId.set(b.dataset.id, b));

  const outgoing = new Map(), incoming = new Map();
  window.edges.forEach((e) => {
    outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1);
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
  });
  const outUsed = new Map(), inUsed = new Map();

  window.edges.forEach((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) return;
    const oi = outUsed.get(e.from) || 0; outUsed.set(e.from, oi + 1);
    const ii = inUsed.get(e.to) || 0; inUsed.set(e.to, ii + 1);
    const x1 = a.offsetLeft + a.offsetWidth, y1 = portY(a, oi, outgoing.get(e.from), '.out-port');
    const x2 = b.offsetLeft, y2 = portY(b, ii, incoming.get(e.to), '.in-port');

    const g = document.createElementNS(ns, 'g');
    g.dataset.type = e.type;
    const fwd = x2 >= x1 + 40;
    const dx = fwd ? Math.max(40, (x2 - x1) / 2) : 60;
    const lift = fwd ? 0 : 60 + 12 * ((oi + ii) % 3);
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${fwd ? y1 : y1 - lift}, ${x2 - dx} ${fwd ? y2 : y2 - lift}, ${x2} ${y2}`);
    line.setAttribute('marker-end', 'url(#arrow)');
    g.appendChild(line);

    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - lift;
    const fromName = a.querySelector('.name').value.trim() || 'untitled';
    const toName = b.querySelector('.name').value.trim() || 'untitled';
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'edge-type');
    label.setAttribute('x', mx); label.setAttribute('y', my - 6);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = e.type;
    const labelTip = document.createElementNS(ns, 'title');
    labelTip.textContent = `${toName} uses ${fromName} - click to change connection type`;
    label.appendChild(labelTip);
    label.onclick = () => { e.type = e.type === 'dep' ? 'input' : e.type === 'input' ? 'output' : 'dep'; window.redrawEdges(); window.saveState(); };
    g.appendChild(label);

    const del = document.createElementNS(ns, 'text');
    del.setAttribute('class', 'edge-del');
    del.setAttribute('x', mx); del.setAttribute('y', my + 14);
    del.setAttribute('text-anchor', 'middle');
    del.textContent = '\u00d7';
    const delTip = document.createElementNS(ns, 'title');
    delTip.textContent = `Delete connection (${toName} stops using ${fromName})`;
    del.appendChild(delTip);
    del.onclick = () => { window.edges = window.edges.filter((x) => x !== e); window.redrawEdges(); window.saveState(); };
    g.appendChild(del);

    svg.appendChild(g);
  });
};

window.removeNodeEdges = function (id) {
  window.edges = window.edges.filter((e) => e.from !== id && e.to !== id);
  window.redrawEdges();
};

canvas.addEventListener('pointerdown', (e) => {
  const out = e.target.closest('.out-port');
  if (!out) return;
  e.preventDefault();
  const fromBlock = out.closest('.block');
  const fromId = fromBlock.dataset.id;
  const svg = document.getElementById('edges');
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('class', 'temp');
  line.setAttribute('marker-end', 'url(#arrow)');
  line.setAttribute('x1', fromBlock.offsetLeft + fromBlock.offsetWidth);
  line.setAttribute('y1', fromBlock.offsetTop + out.offsetTop);
  const p = canvasPoint(e.clientX, e.clientY);
  line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
  svg.appendChild(line);
  const move = (ev) => { const q = canvasPoint(ev.clientX, ev.clientY); line.setAttribute('x2', q.x); line.setAttribute('y2', q.y); };
  const up = (ev) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    line.remove();
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const toBlock = target && target.closest('.block');
    if (toBlock && toBlock.dataset.id !== fromId && toBlock.dataset.kind !== 'lib') {
      window.edges.push({ from: fromId, to: toBlock.dataset.id, type: 'dep' });
      window.redrawEdges();
      window.saveState();
    }
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});

document.getElementById('load').onclick = () => window.vscode.postMessage({ type: 'loadGraph' });
document.getElementById('restart').onclick = () => window.vscode.postMessage({ type: 'restartKernel' });

window.loadGraphData = function (blocks, edges) {
  const seen = new Map(window.getModules().map((m) => [m.name, m.id]));
  const remap = new Map();
  (blocks || []).forEach((b) => {
    if (seen.has(b.name)) {
      const el = window.getBlockEl(seen.get(b.name));
      if (el) el.querySelector('.code').value = b.code ?? '';
      remap.set(b.id, seen.get(b.name));
      return;
    }
    const el = createCodeBlock({ ...b, id: undefined });
    world.appendChild(el);
    remap.set(b.id, el.dataset.id);
    seen.set(b.name, el.dataset.id);
  });
  (edges || []).forEach((e) => {
    const from = remap.get(e.from), to = remap.get(e.to);
    if (from && to && from !== to && !window.edges.some((x) => x.from === from && x.to === to)) window.edges.push({ from, to, type: 'dep' });
  });
  window.redrawEdges();
  window.saveState();
};
window.getModules = function () {
  return [...document.querySelectorAll('#canvas .block')]
    .map((b) => ({ id: b.dataset.id, kind: b.dataset.kind || 'code', name: b.querySelector('.name').value.trim(), version: b.querySelector('.version')?.value.trim() || '', code: b.querySelector('.code')?.value || '' }));
};

document.getElementById('save-project').onclick = () => {
  const modules = window.getModules().filter((m) => m.name);
  if (!modules.length) return;
  window.vscode.postMessage({ type: 'saveProject', modules, edges: window.edges });
};

window.saveState = function () {
  updateChrome();
  const blocks = [...document.querySelectorAll('#canvas .block')].map((b) => ({
    id: b.dataset.id,
    kind: b.dataset.kind || 'code',
    name: b.querySelector('.name').value,
    version: b.querySelector('.version')?.value ?? '',
    desc: b.querySelector('.desc')?.value ?? '',
    code: b.querySelector('.code')?.value ?? '',
    open: Boolean(b.querySelector('.ai-box') && !b.querySelector('.ai-box').classList.contains('hidden')),
    x: parseInt(b.style.left, 10) || 0,
    y: parseInt(b.style.top, 10) || 0
  }));
  window.vscode.setState({ blocks, edges: window.edges, pan: { ...pan }, zoom });
};

window.loadState = function () {
  const s = window.vscode.getState();
  if (!s) { updateChrome(); return; }
  if (s.pan) { pan.x = s.pan.x || 0; pan.y = s.pan.y || 0; }
  if (typeof s.zoom === 'number' && s.zoom >= 0.4 && s.zoom <= 2) zoom = s.zoom;
  applyView();
  if (!s.blocks?.length && !s.edges?.length) return;
  (s.blocks || []).forEach((b) => world.appendChild(b.kind === 'lib' ? createLibBlock(b) : createCodeBlock(b)));
  window.edges = s.edges || [];
  window.redrawEdges();
  updateChrome();
};

function updateChrome() {
  const n = document.querySelectorAll('#canvas .block').length;
  const hint = document.getElementById('empty-hint');
  if (hint) hint.classList.toggle('hidden', n > 0);
  const st = document.getElementById('graph-status');
  if (st) st.textContent = n + (n === 1 ? ' module' : ' modules') + ' • ' + window.edges.length + ' edges';
  window.renderMinimap?.();
}
window.loadState();

window.onMessage((msg) => {
  if (msg.type === 'restarted') {
    document.querySelectorAll('#canvas .block').forEach((b) => {
      const out = b.querySelector('.run-out');
      if (out) { out.textContent = ''; out.classList.add('hidden'); out.removeAttribute('data-ok'); }
      const st = b.querySelector('.status');
      if (st) st.textContent = '';
      const dot = b.querySelector('.status-dot');
      if (dot) { delete dot.dataset.state; dot.title = 'idle'; }
    });
    return;
  }
  if (msg.type !== 'graphLoaded') return;
  window.loadGraphData(msg.blocks, msg.edges);
});
