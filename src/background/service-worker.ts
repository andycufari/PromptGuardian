import { getVault, setVault } from '../core/vault.js';
import { Vault } from '../core/types.js';

export type MessageRequest =
  | { type: 'GET_VAULT' }
  | { type: 'SET_VAULT'; vault: Vault };

export type MessageResponse =
  | { type: 'VAULT_DATA'; vault: Vault }
  | { type: 'VAULT_SAVED' }
  | { type: 'ERROR'; error: string };

chrome.runtime.onInstalled.addListener(async () => {
  // Seed default vault on first install
  await getVault();
});

chrome.runtime.onMessage.addListener(
  (
    message: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    if (message.type === 'GET_VAULT') {
      getVault()
        .then((vault) => sendResponse({ type: 'VAULT_DATA', vault }))
        .catch((e) => sendResponse({ type: 'ERROR', error: String(e) }));
      return true; // async response
    }

    if (message.type === 'SET_VAULT') {
      setVault(message.vault)
        .then(() => {
          sendResponse({ type: 'VAULT_SAVED' });
          // Notify all content scripts of vault change
          chrome.tabs.query({ url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] }, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { type: 'VAULT_UPDATED', vault: message.vault });
              }
            }
          });
        })
        .catch((e) => sendResponse({ type: 'ERROR', error: String(e) }));
      return true;
    }

    return false;
  },
);
