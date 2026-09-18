const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const execFileP = require('util').promisify(require('child_process').execFile);
const { spawn } = require('child_process');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('setu.openBuilder', () => {
      const panel = vscode.window.createWebviewPanel(
        'setu.builder',
        'Setu Builder',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
        }
      );
      panel.webview.html = loadHtml(panel.webview, context);
      panel.webview.onDidReceiveMessage((msg) => handleMessage(msg, panel.webview, context));
    })
  );
}

async function handleMessage(msg, webview, context) {
  const cfg = vscode.workspace.getConfiguration('setu');
  try {
    switch (msg.type) {
      case 'getConfig':
        webview.postMessage({
          type: 'config',
          endpoint: cfg.get('llm.endpoint') || 'http://localhost:4000/v1/chat/completions',
          model: cfg.get('llm.model') || 'gpt-4o',
          hasKey: Boolean(await context.secrets.get('setu.llm.apiKey'))
        });
        break;
      case 'saveConfig':
        await cfg.update('llm.endpoint', msg.endpoint, vscode.ConfigurationTarget.Global);
        await cfg.update('llm.model', msg.model, vscode.ConfigurationTarget.Global);
        if (msg.apiKey) await context.secrets.store('setu.llm.apiKey', msg.apiKey);
        break;
      case 'generate': {
        const apiKey = await context.secrets.get('setu.llm.apiKey');
        const endpoint = cfg.get('llm.endpoint') || 'http://localhost:4000/v1/chat/completions';
        const model = cfg.get('llm.model') || 'gpt-4o';
        const code = await generate(endpoint, model, apiKey, msg.description, msg.context);
        webview.postMessage({ type: 'generated', id: msg.id, code });
        break;
      }
      case 'runBlock': {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const out = (msg.code || '').trim() ? await runBlockQueued(cwd, msg.code) : { ok: true, output: '(no output)' };
        webview.postMessage({ type: 'ran', id: msg.id, ...out });
        break;
      }
      case 'run': {
        const out = await runChain(msg.modules, msg.edges, msg.targetId);
        webview.postMessage({ type: 'ran', id: msg.id, ...out });
        break;
      }
      case 'restartKernel': {
        try { if (kernel) kernel.proc.kill(); } catch (_) {}
        kernel = null;
        webview.postMessage({ type: 'restarted' });
        break;
      }
      case 'loadGraph': {
        const loaded = await loadGraph();
        if (loaded) webview.postMessage({ type: 'graphLoaded', ...loaded });
        break;
      }
      case 'saveProject':
        await saveProject(msg.modules, msg.edges);
        break;
    }
  } catch (err) {
    webview.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
}

async function generate(endpoint, model, apiKey, description, context = []) {
  const deps = context.filter((d) => d && d.name).map((d) => {
    const names = [...definedNames(d.code || '')];
    return names.length ? `# from ${d.name} import ${names.join(', ')}\n${d.code}` : `# dependency ${d.name} (imported for side effects)\n${d.code}`;
  }).join('\n\n');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return a single Python code block only. No explanations, no markdown fences. Reuse the variables and functions from the dependency code; do not redefine them.' },
        { role: 'user', content: (deps ? deps + '\n\n# task\n' : '') + description }
      ],
      stream: false
    })
  });
  if (!res.ok) throw new Error(`LLM ${res.status} from ${endpoint}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const code = data.choices?.[0]?.message?.content;
  if (!code) throw new Error('Empty LLM response');
  return code.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
}

async function saveProject(modules, edges) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) throw new Error('Open a workspace folder first');
  const root = folders[0].uri;
  const nameById = new Map(modules.map((m) => [m.id, m.name]));
  const codeByName = new Map(modules.map((m) => [m.name, m.code]));
  for (const m of modules) {
    const imports = [...new Set(edges
      .filter((e) => e.to === m.id && e.from !== m.id)
      .map((e) => nameById.get(e.from))
      .filter((n) => n && n !== m.name))];
    const used = usedNames(m.code);
    const lines = imports.map((n) => {
      const need = [...used].filter((x) => definedNames(codeByName.get(n) ?? '').has(x));
      return need.length ? `from ${n} import ${need.join(', ')}` : `import ${n}`;
    }).filter((l) => !m.code.includes(l));
    const body = lines.length ? lines.join('\n') + '\n\n' + m.code : m.code;
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, m.name + '.py'), Buffer.from(body, 'utf8'));
  }
  vscode.window.showInformationMessage(`Saved ${modules.length} modules`);
}

function chainOrder(modules, edges, targetId) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const up = new Map(modules.map((m) => [m.id, []]));
  edges.forEach((e) => { if (e.to !== e.from && up.has(e.to) && up.has(e.from)) up.get(e.to).push(e.from); });
  const order = [], seen = new Set();
  (function visit(id) {
    if (seen.has(id)) return;
    seen.add(id);
    (up.get(id) || []).forEach(visit);
    if (byId.has(id)) order.push(byId.get(id));
  })(targetId);
  return order;
}

async function runChain(modules, edges, targetId) {
  const chain = chainOrder(modules, edges, targetId);
  if (!chain.length) throw new Error('Block not found');
  const script = chain.map((m) => `# --- ${m.name || m.id} ---\n${m.code}`).join('\n');
  try {
    const { stdout, stderr } = await execFileP('python3', ['-c', script], { timeout: 30000, cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
    const output = (stdout + (stderr ? '\n[stderr]\n' + stderr : '')).slice(0, 4000);
    return { ok: true, output: output || '(no output)' };
  } catch (err) {
    return { ok: false, output: String((err.stdout || '') + (err.stderr || '') + err.message).slice(0, 4000) };
  }
}

function usedNames(code) {
  return new Set(code.match(/[A-Za-z_]\w*/g) || []);
}

function definedNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/^(?:async\s+def\s+|def\s+|class\s+)(\w+)|^(\w+)\s*=[^=]/gm)) names.add(m[1] ?? m[2]);
  return names;
}

const KERNEL_PY = `
import sys, base64, traceback, io
real_out = sys.stdout
def emit(s):
    real_out.write(s + '\\n')
    real_out.flush()
ns = {}
emit('__SETU_READY__')
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    out, err = io.StringIO(), io.StringIO()
    prev_out, prev_err, prev_in = sys.stdout, sys.stderr, sys.stdin
    sys.stdout, sys.stderr, sys.stdin = out, err, io.StringIO()
    status = 0
    try:
        exec(base64.b64decode(line).decode('utf-8'), ns)
    except BaseException:
        status = 1
        traceback.print_exc(file=err)
    finally:
        sys.stdout, sys.stderr, sys.stdin = prev_out, prev_err, prev_in
    emit('__SETU_OUT__ ' + base64.b64encode(out.getvalue().encode('utf-8')).decode('ascii'))
    emit('__SETU_ERR__ ' + base64.b64encode(err.getvalue().encode('utf-8')).decode('ascii'))
    emit('__SETU_DONE__ ' + str(status))
`;

let kernel = null;
let kernelSerial = Promise.resolve();

function onKernelData(k, d) {
  k.buf += d.toString();
  let i;
  while ((i = k.buf.indexOf('\n')) >= 0) {
    const line = k.buf.slice(0, i).replace(/\r$/, '');
    k.buf = k.buf.slice(i + 1);
    if (!k.started) { if (line === '__SETU_READY__') { k.started = true; k.onReady(); } continue; }
    if (!k.current) continue;
    if (line.startsWith('__SETU_DONE__')) { const c = k.current; k.current = null; c.done({ code: line.slice(14).trim(), out: c.out, err: c.err }); }
    else if (line.startsWith('__SETU_OUT__ ')) k.current.out = line.slice(13);
    else if (line.startsWith('__SETU_ERR__ ')) k.current.err = line.slice(13);
  }
}

function ensureKernel(cwd) {
  if (kernel) return Promise.resolve(kernel);
  const proc = spawn('python3', ['-u', '-c', KERNEL_PY], { cwd });
  const k = { proc, buf: '', started: false, current: null, onReady: null };
  kernel = k;
  proc.stdout.on('data', (d) => onKernelData(k, d));
  proc.stderr.on('data', () => {});
  proc.stdin.on('error', () => {});
  proc.on('error', () => { if (kernel === k) kernel = null; });
  proc.on('exit', () => { if (kernel === k) kernel = null; });
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('python3 kernel did not start')), 10000);
    k.onReady = () => { clearTimeout(to); resolve(k); };
    proc.once('error', (e) => { clearTimeout(to); reject(e); });
    proc.once('exit', () => { clearTimeout(to); reject(new Error('python3 kernel exited during start')); });
  });
}

function runBlockQueued(cwd, code) {
  const p = kernelSerial.then(() => runBlock(cwd, code));
  kernelSerial = p.catch(() => {});
  return p;
}

async function runBlock(cwd, code) {
  const k = await ensureKernel(cwd);
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const unb64 = (s) => Buffer.from(s || '', 'base64').toString('utf8');
  const done = new Promise((resolve) => { k.current = { out: '', err: '', done: resolve }; });
  k.proc.stdin.write(b64(code) + '\n');
  const r = await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('Kernel timed out')), 35000))])
    .catch((e) => { try { k.proc.kill(); } catch (_) {} if (kernel === k) kernel = null; throw e; });
  const output = (unb64(r.out) + (unb64(r.err) ? '\n[stderr]\n' + unb64(r.err) : '')).slice(0, 4000);
  return { ok: r.code === '0', output: output || '(no output)' };
}

async function loadGraph() {
  const folders = vscode.workspace.workspaceFolders;
  const choice = await vscode.window.showQuickPick(['Scan current folder', 'Select files or folders…'], { placeHolder: 'Load graph from Python files' });
  if (!choice) return null;
  let files;
  if (choice.startsWith('Scan')) {
    if (!folders?.length) throw new Error('Open a workspace folder first');
    files = await vscode.workspace.findFiles('**/*.py', '**/{node_modules,.git,.vscode}/**');
  } else {
    const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: true, canSelectMany: true, filters: { Python: ['py'] }, openLabel: 'Load graph' });
    if (!picked?.length) return null;
    files = [];
    for (const u of picked) {
      const st = await vscode.workspace.fs.stat(u);
      if (st.type === vscode.FileType.Directory) await collectPy(u, files);
      else if (u.fsPath.endsWith('.py')) files.push(u);
    }
  }
  files = [...files].sort((a, b) => (a.fsPath < b.fsPath ? -1 : 1));
  const blocks = [];
  for (const [i, u] of files.entries()) {
    const code = Buffer.from(await vscode.workspace.fs.readFile(u)).toString('utf8');
    blocks.push({ id: 'g' + i, name: path.basename(u.fsPath, '.py'), code, x: 16 + (i % 3) * 300, y: 16 + Math.floor(i / 3) * 280 });
  }
  const idByName = new Map();
  blocks.forEach((b) => { if (!idByName.has(b.name)) idByName.set(b.name, b.id); });
  const edges = [];
  blocks.forEach((b) => {
    for (const dep of importedModules(b.code)) {
      const from = idByName.get(dep);
      if (from && from !== b.id) edges.push({ from, to: b.id, type: 'dep' });
    }
  });
  return { blocks, edges };
}

async function collectPy(dir, out) {
  for (const [name, type] of await vscode.workspace.fs.readDirectory(dir)) {
    const u = vscode.Uri.joinPath(dir, name);
    if (type === vscode.FileType.Directory) { if (!name.startsWith('.') && name !== 'node_modules') await collectPy(u, out); }
    else if (name.endsWith('.py')) out.push(u);
  }
}

function importedModules(code) {
  const deps = [];
  for (const m of code.matchAll(/^\s*from\s+([\w.]+)\s+import\s+\S.*|^\s*import\s+(.+)/gm)) {
    if (m[1]) { const d = m[1].split('.').pop(); if (d) deps.push(d); }
    else m[2].split(',').forEach((s) => { const d = s.trim().split('.')[0].split(' ')[0]; if (d) deps.push(d); });
  }
  return deps;
}

function loadHtml(webview, context) {
  const uri = (p) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', p));
  const file = path.join(context.extensionUri.fsPath, 'webview', 'index.html');
  return fs.readFileSync(file, 'utf8').replace(/{{(.+?)}}/g, (_, p) => uri(p));
}

function deactivate() { try { if (kernel) kernel.proc.kill(); } catch (_) {} kernel = null; }

module.exports = { activate, deactivate };
