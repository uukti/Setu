# AGENTS.md

Plain JS extension, no build/test/lint, no deps. Run: F5 in VS Code.
Files: `package.json` (command contrib) + `extension.js` (thin webview-panel loader) + `webview/` (one dir per component, `{{path}}` placeholders → resource URIs).

Spec: `README.md` + `IDEA.md` are the only spec. Don't invent product direction.

## Structure (strict — DON'T break this)

- DON'T create a new top-level file or `webview/` subdir unless the task explicitly asks for it. Fix in place.
- DON'T create shared abstractions (`common/`, `utils.js`, `base.js`, mixins, helpers) until two components actually use them. Duplicate 5 lines instead.
- DON'T leave empty placeholder files or scaffold dirs "for later". Later scaffolds for itself.
- DON'T use imports, bundlers, or npm deps. Components talk only via `index.html` load order + `window.*` globals — like `window.saveState`, `window.vscode`, `window.onMessage`. Don't do `import x from './y'` like it's a webpack app.
- DON'T select or style across components (no `.canvas .block input` from topbar code, no global `button {}` resets outside `base.css`). Each component styles only its own DOM.
- DON'T reorder `<script>`/`<link>` tags in `index.html` casually — load order IS the dependency graph. Don't do async/defer, don't inline big logic there; it's wiring only.
- DON'T put UI markup, CSS, or node/python logic in `extension.js`. It stays a loader: register view (`setu.openBuilder`), resolve `{{...}}` → resource URIs, serve html, handle messages. Don't do `panel.webview.html = "<div>..."` like it's a template file.
- DON'T add `package.json` contributes (commands, config keys, views) without wiring them in `extension.js` in the same diff. Don't do a manifest-only change.
- DON'T rename message types (`getConfig`, `saveConfig`, `generate`, `runBlock`, `run`, `restartKernel`, `loadGraph`, `saveProject`) on one side only. Extension ↔ webview strings must match exactly — grep both sides before changing.
- DON'T store the LLM API key in settings/state/DOM. It goes in `context.secrets` (`setu.llm.apiKey`) only. Don't do `localStorage.setItem('key', ...)` like it's a web app.
- DON'T commit scratch or build output: `*.vsix`, `node_modules/`, `__pycache__/`, `*.pyc`, test `*.py` files. Don't do `git add .` blindly — check `git status` first.

## Coding (ponytail, always on, default: full)

- DON'T build what YAGNI doesn't need. No speculative flags, no "flexible framework", no config for a value that never changes. Fewest files, shortest diff.
- DON'T add a dependency when stdlib / a native platform feature / one line does it. Don't do a date-picker lib for `<input type="date">`, custom fetch wrappers for one call, etc.
- DON'T write boilerplate around a one-liner. If it fits in one line, keep it one line.
- DO mark deliberate shortcuts that cut a real corner with a `ponytail:` comment naming the ceiling + upgrade path (e.g. `// ponytail: O(n²) edge redraw, switch to incremental if >500 nodes lag`).

## Workflow (strict)

- DON'T scaffold ahead. Owner plans each component; agent executes only what is asked.
- DON'T invent architecture when the plan is ambiguous — ask instead.
- DON'T batch unrelated changes. Each new component: smallest diff, fewest files.
