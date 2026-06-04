import { Rule, Vault } from '../core/types.js';

let vault: Vault;

// DOM refs
const masterToggle = document.getElementById('master-toggle') as HTMLInputElement;
const presetsList = document.getElementById('presets-list')!;
const customList = document.getElementById('custom-list')!;
const protectedList = document.getElementById('protected-list')!;

// Protect form
const protectValue = document.getElementById('protect-value') as HTMLInputElement;
const protectCategory = document.getElementById('protect-category') as HTMLSelectElement;
const protectAccent = document.getElementById('protect-accent') as HTMLInputElement;
const protectReplace = document.getElementById('protect-replace') as HTMLInputElement;
const protectPreview = document.getElementById('protect-preview')!;
const protectAdd = document.getElementById('protect-add')!;

// Custom form
const customLabel = document.getElementById('custom-label') as HTMLInputElement;
const customToken = document.getElementById('custom-token') as HTMLInputElement;
const customPattern = document.getElementById('custom-pattern') as HTMLInputElement;
const customFlags = document.getElementById('custom-flags') as HTMLInputElement;
const customError = document.getElementById('custom-error')!;
const customAdd = document.getElementById('custom-add')!;

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Protect a value (plain rules) ---

function getEffectiveTokenType(): string {
  const custom = protectReplace.value.trim().toUpperCase();
  if (custom) return custom;
  return protectCategory.value;
}

function updatePreview() {
  protectPreview.textContent = getEffectiveTokenType();
}

protectCategory.addEventListener('change', updatePreview);
protectReplace.addEventListener('input', updatePreview);

function renderProtected() {
  const plains = vault.rules.filter((r) => r.source === 'plain');
  protectedList.innerHTML = '';

  for (const rule of plains) {
    const el = document.createElement('div');
    el.className = 'rule-item';
    const match = rule.match as { kind: 'literal'; value: string; accentInsensitive: boolean };
    el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="rule-label">"${escapeHtml(match.value)}"</span>
        <span class="rule-arrow">&rarr;</span>
        <span class="rule-type">${escapeHtml(rule.tokenType)}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}" title="Remove">&times;</button>
      </div>
    `;
    protectedList.appendChild(el);
  }

  bindToggleAndDelete(protectedList, renderProtected);
}

protectAdd.addEventListener('click', () => {
  const value = protectValue.value.trim();
  if (!value) return;

  const tokenType = getEffectiveTokenType().replace(/[^A-Za-z0-9_]/g, '').toUpperCase() || 'VALUE';

  const rule: Rule = {
    id: generateId(),
    source: 'plain',
    enabled: true,
    label: value,
    tokenType,
    match: {
      kind: 'literal',
      value,
      accentInsensitive: protectAccent.checked,
    },
  };

  vault.rules.push(rule);
  saveVault();
  renderProtected();

  protectValue.value = '';
  protectReplace.value = '';
  protectAccent.checked = false;
  updatePreview();
});

// --- Presets ---

function renderPresets() {
  const presets = vault.rules.filter((r) => r.source === 'preset');
  presetsList.innerHTML = '';

  for (const rule of presets) {
    const el = document.createElement('div');
    el.className = 'rule-item';

    const isDniRaw = rule.id === 'preset-dni-raw';
    const noteHtml = isDniRaw
      ? '<span class="rule-note"> may over-match</span>'
      : '';

    el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="rule-label">${escapeHtml(rule.label)}</span>
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

// --- Custom regex (advanced) ---

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
        <span class="rule-label">${escapeHtml(rule.label)}</span>
        <span class="rule-type">/${escapeHtml(match.pattern)}/${escapeHtml(match.flags)}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}" title="Remove">&times;</button>
      </div>
    `;
    customList.appendChild(el);
  }

  bindToggleAndDelete(customList, renderCustom);
}

customAdd.addEventListener('click', () => {
  const label = customLabel.value.trim();
  const tokenType = customToken.value.trim().toUpperCase().replace(/[^A-Za-z0-9_]/g, '') || 'CUSTOM';
  const pattern = customPattern.value;
  const flags = customFlags.value.trim();

  if (!label || !pattern) {
    customError.textContent = 'Label and pattern are required.';
    return;
  }

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

// --- Shared helpers ---

function bindToggleAndDelete(container: HTMLElement, rerender: () => void) {
  container.querySelectorAll('.rule-toggle').forEach((cb) => {
    (cb as HTMLInputElement).addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.id!;
      const rule = vault.rules.find((r) => r.id === id);
      if (rule) {
        rule.enabled = (e.target as HTMLInputElement).checked;
        saveVault();
      }
    });
  });

  container.querySelectorAll('.delete-btn').forEach((btn) => {
    (btn as HTMLButtonElement).addEventListener('click', (e) => {
      const id = ((e.target as HTMLElement).closest('.delete-btn') as HTMLButtonElement).dataset.id!;
      vault.rules = vault.rules.filter((r) => r.id !== id);
      saveVault();
      rerender();
    });
  });
}

// --- Master toggle ---

masterToggle.addEventListener('change', () => {
  vault.settings.masterEnabled = masterToggle.checked;
  saveVault();
});

// --- Init ---

function renderAll() {
  masterToggle.checked = vault.settings.masterEnabled;
  renderProtected();
  renderPresets();
  renderCustom();
}

async function init() {
  vault = await loadVault();
  renderAll();
  updatePreview();
}

init();
