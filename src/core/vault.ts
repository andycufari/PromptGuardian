import { Vault, Rule } from './types.js';
import { PRESET_RULES } from './presets.js';

const VAULT_KEY = 'pg_vault';

export function createDefaultVault(): Vault {
  return {
    rules: PRESET_RULES.map((r) => ({ ...r })),
    settings: {
      masterEnabled: true,
    },
  };
}

export async function getVault(): Promise<Vault> {
  return new Promise((resolve) => {
    chrome.storage.local.get(VAULT_KEY, (result) => {
      if (result[VAULT_KEY]) {
        resolve(result[VAULT_KEY] as Vault);
      } else {
        const defaultVault = createDefaultVault();
        chrome.storage.local.set({ [VAULT_KEY]: defaultVault }, () => {
          resolve(defaultVault);
        });
      }
    });
  });
}

export async function setVault(vault: Vault): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [VAULT_KEY]: vault }, () => {
      resolve();
    });
  });
}
