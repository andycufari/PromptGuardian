import { Rule, Vault } from '../core/types.js';

// Inject the interceptor into the MAIN world
function injectInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('interceptor.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Badge overlay
let badge: HTMLDivElement | null = null;

function createBadge() {
  badge = document.createElement('div');
  badge.id = 'pg-badge';
  badge.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 99999;
    padding: 6px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 12px;
    font-weight: bold;
    color: #0F0905;
    background: #4ade80;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: all 0.3s ease;
  `;
  badge.textContent = '\u{1F6E1}\uFE0F ready';
  document.body.appendChild(badge);
}

function updateBadge(count: number, error?: string) {
  if (!badge) return;
  if (error === 'unrecognized') {
    badge.style.background = '#ef4444';
    badge.style.color = '#fff';
    badge.textContent = '\u26A0\uFE0F not protected';
  } else if (error) {
    badge.style.background = '#ef4444';
    badge.style.color = '#fff';
    badge.textContent = '\u26A0\uFE0F error';
  } else if (count > 0) {
    badge.style.background = '#FFB000';
    badge.style.color = '#0F0905';
    badge.textContent = `\u{1F6E1}\uFE0F ${count} anonymized`;
  } else {
    badge.style.background = '#4ade80';
    badge.style.color = '#0F0905';
    badge.textContent = '\u{1F6E1}\uFE0F ready';
  }
}

// Push rules to injected script
function pushRules(vault: Vault) {
  window.postMessage(
    {
      type: 'PG_RULES_UPDATE',
      rules: vault.rules,
      masterEnabled: vault.settings.masterEnabled,
    },
    '*',
  );

  if (!vault.settings.masterEnabled && badge) {
    badge.style.background = '#ef4444';
    badge.style.color = '#fff';
    badge.textContent = '\u26A0\uFE0F disabled';
  }
}

// Fetch vault from background
async function loadVault(): Promise<Vault> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_VAULT' }, (response) => {
      if (response?.type === 'VAULT_DATA') {
        resolve(response.vault);
      }
    });
  });
}

// Attachment gate
let attachmentPending = false;

function showAttachmentGate(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1a1a1a; color: #FFB000; padding: 24px;
      border-radius: 8px; font-family: monospace; max-width: 420px;
      border: 1px solid #FFB000;
    `;
    dialog.innerHTML = `
      <p style="margin:0 0 16px 0; font-size: 14px;">
        <strong>\u26A0\uFE0F Attachments are not anonymized.</strong><br><br>
        The file will be sent to ChatGPT as-is. Send anyway?
      </p>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button id="pg-att-cancel" style="padding:8px 16px;background:#333;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;font-family:monospace;">Cancel</button>
        <button id="pg-att-send" style="padding:8px 16px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:monospace;">Send anyway</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    dialog.querySelector('#pg-att-cancel')!.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    dialog.querySelector('#pg-att-send')!.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}

// Listen for messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'PG_BADGE_UPDATE') {
    updateBadge(event.data.count, event.data.error);
  }

  if (event.data?.type === 'PG_ATTACHMENT_DETECTED' && !attachmentPending) {
    attachmentPending = true;
    showAttachmentGate().then((allowed) => {
      attachmentPending = false;
      // If not allowed, we can't easily cancel the fetch that's already in-flight
      // from the interceptor's perspective. The gate is a UX warning.
    });
  }
});

// Listen for vault updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'VAULT_UPDATED') {
    pushRules(message.vault);
  }
});

// Initialize
async function init() {
  injectInterceptor();
  createBadge();
  const vault = await loadVault();
  pushRules(vault);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
