# Setu

VS Code extension to create projects as modular code with a graph visual.

Create modules as graph nodes, see dependencies as edges, scaffold code from the graph — instead of managing folders/files by hand.

`Setu` (सेतु = bridge) bridges the architecture diagram and the actual files: the graph _is_ the project scaffolding.

Status: early working prototype (Python-first). See [`IDEA.md`](IDEA.md) for the product idea.

## Features

- **Graph canvas** — modules are draggable code blocks, dependencies are clickable edges (`dep` / `input` / `output`).
- **Per-block Python** — each block holds one module's code, with syntax-highlight read view, run output, and pass/fail dot.
- **AI codegen (optional)** — describe a block, Setu sends it plus upstream block code to an OpenAI-compatible endpoint (LiteLLM works as-is) and fills in the code.
- **Run** — `▶` runs a single block in a persistent `python3` kernel (state carries across blocks); dependency chains run in topological order.
- **Save Project** — writes one `<module_name>.py` per block into the open workspace folder, prepending only the imports the block actually uses.
- **Load Graph** — scans the workspace (or picked files/folders) for `*.py`, creates one block per file, and draws edges from `import` statements.
- **Canvas extras** — pan (drag background), zoom (buttons or `Ctrl`+scroll, `1:1` resets), minimap (click to jump), per-tab persisted state.

## Prerequisites

- VS Code `^1.85.0`
- Node.js + `npx` (only for packaging via `vsce`)
- `python3` on `PATH` (only for running blocks)

No other dependencies. No build step, no bundler, no npm install.

## Install from source

```sh
git clone https://github.com/uukti/Setu.git
cd Setu
./build.sh
code --install-extension setu-*.vsix
```

Then in VS Code:

1. `Ctrl+Shift+P` → `Developer: Reload Window` (picks up the freshly installed extension).
2. Open any folder as your workspace (`File → Open Folder`) — Save/Run/Load need one.
3. `Ctrl+Shift+P` → `Setu: Open Builder` (opens as an editor tab).

To update after pulling new code, re-run `./build.sh` and reinstall the `.vsix` (same filename pattern, version in `package.json`).

### Run without installing (development)

Open this repo in VS Code and press `F5`. That launches an Extension Development Host with Setu pre-loaded — no `.vsix` needed.

## Usage

### 1. Build the graph

- Press **+ Code Block**, give it a `module_name` (valid Python filename stem, e.g. `auth`, `db`, `api`).
- Write Python in the CODE box, or click **👁** to toggle the highlighted read view.
- Drag from a block's **●** (right edge) onto another block to create a dependency edge (`from → to` means `to` uses `from`).
- Click the edge label to cycle `dep → input → output`; click `×` on the edge to delete it.
- Drag the background to pan; `Ctrl`+scroll (or `+`/`-`) to zoom; `1:1` resets. The minimap (bottom-right, appears when blocks exist) jumps on click.

### 2. Generate code with AI (optional)

1. Click **⚙ LLM** in the top bar.
2. Set **Endpoint** (default `http://localhost:4000/v1/chat/completions` — any OpenAI-compatible URL), **Model** (default `gpt-4o`), and **API key** (stored in VS Code Secrets, never in settings), then **Save**.
3. On any block, click **✦ AI**, describe the module, click **Generate**. Upstream connected blocks are sent as context so the model reuses their names instead of redefining them.

Config lives in Settings under `Setu` (`setu.llm.endpoint`, `setu.llm.model`); the key lives in Secrets (`setu.llm.apiKey`).

### 3. Run

- **▶** on a block runs just that block's code in the persistent kernel (`↻ Restart` kills the kernel and clears all outputs).
- Output appears under the block; the dot turns green (pass) or red (fail).
- Dependency-aware runs execute the upstream chain first (topological order, 30s timeout, output truncated to 4000 chars).

### 4. Save to files

Click **Save Project**. For each named block, Setu writes `<name>.py` into the workspace root, prepending `from <dep> import <used_names>` (or bare `import <dep>`) lines only for imports the block body actually references and doesn't already contain.

### 5. Load from files

Click **Load Graph** → either **Scan current folder** (`**/*.py`, skipping `node_modules/.git/.vscode`) or pick files/folders. Existing blocks match by module name (code is refreshed in place); new files become new blocks; edges are inferred from `import`/`from … import` lines.

Canvas layout, blocks, and edges persist per-tab via webview state (survives reloads of the panel, not across machines).

## Project structure

```text
Setu/
  package.json        # extension manifest: command setu.openBuilder, setu.llm.* config
  extension.js        # thin host: registers the panel, resolves {{…}} URIs, handles
                      # getConfig/saveConfig/generate/runBlock/run/saveProject/
                      # restartKernel/loadGraph + the python3 kernel. No UI here.
  build.sh            # npx -y @vscode/vsce package
  IDEA.md             # product idea (the only spec)
  AGENTS.md           # contributor/agent structure rules — read before changing code
  webview/
    index.html        # load order + globals wiring only (CSS/JS include list)
    base.css vscode.js
    topbar/           # top bar styles
    canvas/           # canvas.js (pan/zoom/edges/save/load state), minimap.js + css
    code-block/       # code-block.js (block DOM, AI prompt, run, highlight) + css
    llm-config/       # llm-config.js (endpoint/model/key panel) + css
```

One component = one directory under `webview/` (see `AGENTS.md` — the DON'Ts there are enforced).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Setu: Open Builder` not found | Reload window after installing the `.vsix`; check `code --list-extensions \| grep setu`. |
| `Open a workspace folder first` | `File → Open Folder` — Save/Run/Load need a workspace root. |
| `python3 kernel did not start` / run fails | Ensure `python3 --version` works on `PATH`. `↻ Restart` kills a wedged kernel. |
| `LLM 4xx/5xx from <endpoint>` | Check endpoint URL, model name, and API key under ⚙ LLM. LiteLLM proxy URLs work as-is. |
| `Empty LLM response` | Endpoint returned no `choices[0].message.content` — retry or try another model. |
| Blank panel / old UI after update | Re-run `./build.sh`, reinstall the `.vsix`, then Reload Window. |

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — one component per directory, no shared abstractions until two components need them, no imports/bundler (globals + load order), `extension.js` stays a loader. Smallest diff that works wins.

## License

MIT — see [LICENSE](LICENSE).
