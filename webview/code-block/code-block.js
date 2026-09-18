let codeBlockCount = 0;
const blocks = new Map();
window.getBlockEl = function (id) { return blocks.get(id); };

function highlightPy(src) {
  return src.replace(/([&<>])|(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(True|False|None|and|or|not|if|elif|else|for|while|in|is|def|return|class|import|from|as|with|try|except|finally|raise|pass|lambda|yield|async|await|assert|del|global|nonlocal)\b|(@\w[\w.]*)|\b(\d[\w.]*)/gm,
    (m, html, com, str, kw, dec, num) => {
      if (html) return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[html];
      const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (com) return `<span class="tok-c">${e(com)}</span>`;
      if (str) return `<span class="tok-s">${e(str)}</span>`;
      if (kw) return `<span class="tok-k">${kw}</span>`;
      if (dec) return `<span class="tok-d">${e(dec)}</span>`;
      if (num) return `<span class="tok-n">${num}</span>`;
      return m;
    });
}

function createCodeBlock(data = {}) {
  const id = data.id ?? 'b' + codeBlockCount++;
  const n = parseInt(String(id).slice(1), 10);
  if (!Number.isNaN(n) && n >= codeBlockCount) codeBlockCount = n + 1;
  const d = document.createElement('div');
  d.className = 'block';
  d.dataset.id = id;
  d.style.left = (data.x ?? 16 + (codeBlockCount * 24) % 160) + 'px';
  d.style.top = (data.y ?? 16 + (codeBlockCount * 24) % 160) + 'px';

  d.innerHTML = `
    <div class="in-port" title="Input - drop connections here"></div>
    <div class="out-port" title="Output - drag to connect"></div>
    <div class="head">
      <span class="grip" title="Drag to move">⠿</span>
      <input class="name" placeholder="module_name" spellcheck="false">
      <span class="status-dot" title="idle"></span>
    </div>
    <div class="toolbar">
      <button class="ai icon-btn ghost" title="Generate Python code from a description">✦ AI</button>
      <button class="run icon-btn ghost" title="Run this block">▶</button>
      <button class="view icon-btn ghost" title="Toggle highlighted read view">👁</button>
      <button class="del icon-btn danger-ghost" title="Delete block">&times;</button>
    </div>
    <div class="ai-box hidden">
      <span class="fld-label">AI PROMPT</span>
      <textarea class="desc" placeholder="Describe what this module should do..."></textarea>
      <div class="ai-row"><button class="gen primary">Generate</button><button class="cancel ghost">Cancel</button><span class="status"></span></div>
    </div>
    <span class="fld-label">CODE</span>
    <textarea class="code" spellcheck="false" placeholder="# python code..."></textarea>
    <pre class="code-view hidden" title="Click to edit"></pre>
    <pre class="run-out hidden"></pre>
  `;

  const name = d.querySelector('.name');
  const code = d.querySelector('.code');
  const aiBtn = d.querySelector('.ai');
  const aiBox = d.querySelector('.ai-box');
  const desc = d.querySelector('.desc');
  const gen = d.querySelector('.gen');
  const status = d.querySelector('.status');

  name.value = data.name ?? '';
  desc.value = data.desc ?? '';
  code.value = data.code ?? '';
  if (data.open) aiBox.classList.remove('hidden');

  aiBtn.onclick = () => aiBox.classList.toggle('hidden');
  d.querySelector('.cancel').onclick = () => { aiBox.classList.add('hidden'); desc.value = ''; window.saveState?.(); };
  d.querySelector('.del').onclick = () => { blocks.delete(id); window.removeNodeEdges(id); d.remove(); window.saveState?.(); };
  gen.onclick = () => {
    if (!desc.value.trim()) return;
    status.textContent = 'generating...';
    setDot('busy');
    gen.disabled = true;
    const deps = (window.edges || []).filter((e) => e.to === id && e.from !== id)
      .map((e) => blocks.get(e.from)).filter(Boolean)
      .map((b) => ({ name: b.querySelector('.name').value.trim(), code: b.querySelector('.code').value }));
    window.vscode.postMessage({ type: 'generate', id, description: desc.value.trim(), context: deps });
  };
  [name, desc, code].forEach((el) => el.addEventListener('input', () => window.saveState?.()));

  const runBtn = d.querySelector('.run');
  const viewBtn = d.querySelector('.view');
  const codeView = d.querySelector('.code-view');
  const renderView = () => { codeView.innerHTML = code.value ? highlightPy(code.value) : '<span class="tok-c"># python code...</span>'; };
  const toEdit = () => { code.classList.remove('hidden'); codeView.classList.add('hidden'); viewBtn.textContent = '👁'; window.redrawEdges?.(); };
  viewBtn.onclick = () => {
    if (codeView.classList.contains('hidden')) { renderView(); code.classList.add('hidden'); codeView.classList.remove('hidden'); viewBtn.textContent = '✎'; }
    else toEdit();
    window.redrawEdges?.();
  };
  codeView.onclick = () => { if (!window.getSelection()?.toString()) toEdit(); };
  const runOut = d.querySelector('.run-out');
  const dot = d.querySelector('.status-dot');
  const setDot = (s) => { dot.dataset.state = s; dot.title = s; };
  runBtn.onclick = () => {
    status.textContent = 'running...';
    setDot('busy');
    runOut.classList.add('hidden');
    window.vscode.postMessage({ type: 'runBlock', id, code: code.value });
  };

  d.onpointerdown = (e) => {
    if (e.target.closest('input,textarea,button,.in-port,.out-port,.run-out,.code-view')) return;
    d.setPointerCapture(e.pointerId);
    const p0 = window.canvasPoint(e.clientX, e.clientY);
    const dx = p0.x - d.offsetLeft, dy = p0.y - d.offsetTop;
    const move = (ev) => { const p = window.canvasPoint(ev.clientX, ev.clientY); d.style.left = (p.x - dx) + 'px'; d.style.top = (p.y - dy) + 'px'; window.redrawEdges?.(); };
    const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); window.saveState?.(); };
    d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
  };

  blocks.set(id, d);
  return d;
}

window.onMessage((msg) => {
  if (msg.type !== 'generated' && msg.type !== 'error' && msg.type !== 'ran') return;
  const d = blocks.get(msg.id);
  if (!d) return;
  if (msg.type === 'ran') {
    const out = d.querySelector('.run-out');
    out.textContent = msg.output;
    out.classList.remove('hidden');
    out.dataset.ok = msg.ok ? 'ok' : 'fail';
    d.querySelector('.status').textContent = msg.ok ? 'done' : 'failed';
    const dot = d.querySelector('.status-dot');
    if (dot) { dot.dataset.state = msg.ok ? 'ok' : 'fail'; dot.title = msg.ok ? 'last run passed' : 'last run failed'; }
    return;
  }
  const gen = d.querySelector('.gen');
  const status = d.querySelector('.status');
  const dot = d.querySelector('.status-dot');
  if (msg.type === 'generated') { d.querySelector('.code').value = msg.code; status.textContent = 'done'; if (dot) dot.dataset.state = 'ok'; if (!d.querySelector('.code-view').classList.contains('hidden')) d.querySelector('.code-view').innerHTML = highlightPy(msg.code); }
  else { status.textContent = msg.message; if (dot) dot.dataset.state = 'fail'; }
  gen.disabled = false;
});
