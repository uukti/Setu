window.vscode = acquireVsCodeApi();
window._msgHandlers = [];
window.onMessage = (fn) => window._msgHandlers.push(fn);
window.addEventListener('message', (e) => window._msgHandlers.forEach((h) => h(e.data)));
