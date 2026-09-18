const llmBtn = document.getElementById('llm-btn');
const llmPanel = document.getElementById('llm-config');
const llmEndpoint = llmPanel.querySelector('.endpoint');
const llmModel = llmPanel.querySelector('.model');
const llmKey = llmPanel.querySelector('.key');
const llmStatus = llmPanel.querySelector('.llm-status');

llmBtn.onclick = () => llmPanel.classList.toggle('hidden');

llmPanel.querySelector('.llm-save').onclick = () => {
  window.vscode.postMessage({ type: 'saveConfig', endpoint: llmEndpoint.value.trim(), model: llmModel.value.trim(), apiKey: llmKey.value });
  llmStatus.textContent = 'saved';
  llmKey.value = '';
};

window.onMessage((msg) => {
  if (msg.type !== 'config') return;
  llmEndpoint.value = msg.endpoint || '';
  llmModel.value = msg.model || '';
  llmKey.placeholder = msg.hasKey ? 'key saved - type to replace' : 'API key';
  llmStatus.textContent = '';
});

window.vscode.postMessage({ type: 'getConfig' });
