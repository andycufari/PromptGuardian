import { Rule, Vault } from '../core/types.js';

let vault: Vault;

// DOM refs
const masterToggle = document.getElementById('master-toggle') as HTMLInputElement;
const presetsList = document.getElementById('presets-list')!;
const customList = document.getElementById('custom-list')!;
const plainList = document.getElementById('plain-list')!;

// Custom form
const customLabel = document.getElementById('custom-label') as HTMLInputElement;
const customToken = document.getElementById('custom-token') as HTMLInputElement;
const customPattern = document.getElementById('custom-pattern') as HTMLInputElement;
const customFlags = document.getElementById('custom-flags') as HTMLInputElement;
const customError = document.getElementById('custom-error')!;
const customAdd = document.getElementById('custom-add')!;

// Plain form
const plainValue = document.getElementById('plain-value') as HTMLInputElement;
const plainToken = document.getElementById('plain-token') as HTMLInputElement;
const plainAccent = document.getElementById('plain-accent') as HTMLInputElement;
const plainAdd = document.getElementById('plain-add')!;

async function loadVault(): Promise<Vault> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_VAULT' }, (response) => {
      if (response?.type === 'VAULT_DATA') {
        resolve(response.vault);
      }
    });
  });
}

async function saveVault() {
  return new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: 'SET_VAULT', vault }, (response) => {
      resolve();
    });
  });
}

function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function renderPresets() {
  const presets = vault.rules.filter((r) => r.source === 'preset');
  presetsList.innerHTML = '';

  for (const rule of presets) {
    const el = document.createElement('div');
    el.className = 'rule-item';

    const isDniRaw = rule.id === 'preset-dni-raw';
    const noteHtml = isDniRaw
      ? '<span class="rule-note"> may over-match any 7-8 digit number</span>'
      : '';

    el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="rule-label">${rule.label}</span>
        <span class="rule-type">[${rule.tokenType}]</span>
        ${noteHtml}
      </div>
    `;
    presetsList.appendChild(el);
  }

  presetsList.querySelectorAll('.rule-toggle').forEach((cb) => {
    (cb as HTMLInputElement).addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.id!;
      const rule = vault.rules.find((r) => r.id === id);
      if (rule) {
        rule.enabled = (e.target as HTMLInputElement).checked;
        saveVault();
      }
    });
  });
}

function renderCustom() {
  const customs = vault.rules.filter((r) => r.source === 'custom');
  customList.innerHTML = '';

  for (const rule of customs) {
    const el = document.createElement('div');
    el.className = 'rule-item';
    const match = rule.match as { kind: 'regex'; pattern: string; flags: string };
    el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="rule-label">${rule.label}</span>
        <span class="rule-type">/${match.pattern}/${match.flags}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}">x</button>
      </div>
    `;
    customList.appendChild(el);
  }

  customList.querySelectorAll('.rule-toggle').forEach((cb) => {
    (cb as HTMLInputElement).addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.id!;
      const rule = vault.rules.find((r) => r.id === id);
      if (rule) {
        rule.enabled = (e.target as HTMLInputElement).checked;
        saveVault();
      }
    });
  });

  customList.querySelectorAll('.delete-btn').forEach((btn) => {
    (btn as HTMLButtonElement).addEventListener('click', (e) => {
      const id = (e.target as HTMLButtonElement).dataset.id!;
      vault.rules = vault.rules.filter((r) => r.id !== id);
      saveVault();
      renderCustom();
    });
  });
}

function renderPlain() {
  const plains = vault.rules.filter((r) => r.source === 'plain');
  plainList.innerHTML = '';

  for (const rule of plains) {
    const el = document.createElement('div');
    el.className = 'rule-item';
    const match = rule.match as { kind: 'literal'; value: string; accentInsensitive: boolean };
    const accentLabel = match.accentInsensitive ? ' [accent-free]' : '';
    el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="rule-label">"${match.value}"</span>
        <span class="rule-type">[${rule.tokenType}]${accentLabel}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}">x</button>
      </div>
    `;
    plainList.appendChild(el);
  }

  plainList.querySelectorAll('.rule-toggle').forEach((cb) => {
    (cb as HTMLInputElement).addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.id!;
      const rule = vault.rules.find((r) => r.id === id);
      if (rule) {
        rule.enabled = (e.target as HTMLInputElement).checked;
        saveVault();
      }
    });
  });

  plainList.querySelectorAll('.delete-btn').forEach((btn) => {
    (btn as HTMLButtonElement).addEventListener('click', (e) => {
      const id = (e.target as HTMLButtonElement).dataset.id!;
      vault.rules = vault.rules.filter((r) => r.id !== id);
      saveVault();
      renderPlain();
    });
  });
}

function renderAll() {
  masterToggle.checked = vault.settings.masterEnabled;
  renderPresets();
  renderCustom();
  renderPlain();
}

// Master toggle
masterToggle.addEventListener('change', () => {
  vault.settings.masterEnabled = masterToggle.checked;
  saveVault();
});

// Add custom rule
customAdd.addEventListener('click', () => {
  const label = customLabel.value.trim();
  const tokenType = customToken.value.trim().toUpperCase();
  const pattern = customPattern.value;
  const flags = customFlags.value.trim();

  if (!label || !tokenType || !pattern) {
    customError.textContent = 'All fields are required.';
    return;
  }

  // Validate regex
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    customError.textContent = `Invalid regex: ${(e as Error).message}`;
    return;
  }

  customError.textContent = '';

  const rule: Rule = {
    id: generateId(),
    source: 'custom',
    enabled: true,
    label,
    tokenType,
    match: { kind: 'regex', pattern, flags },
  };

  vault.rules.push(rule);
  saveVault();
  renderCustom();

  customLabel.value = '';
  customToken.value = '';
  customPattern.value = '';
  customFlags.value = 'gi';
});

// Add plain value
plainAdd.addEventListener('click', () => {
  const value = plainValue.value.trim();
  const tokenType = plainToken.value.trim().toUpperCase();

  if (!value || !tokenType) return;

  const rule: Rule = {
    id: generateId(),
    source: 'plain',
    enabled: true,
    label: value,
    tokenType,
    match: {
      kind: 'literal',
      value,
      accentInsensitive: plainAccent.checked,
    },
  };

  vault.rules.push(rule);
  saveVault();
  renderPlain();

  plainValue.value = '';
  plainToken.value = '';
  plainAccent.checked = false;
});

// Init
async function init() {
  vault = await loadVault();
  renderAll();
}

init();
