//#region src/core/presets.ts
var PRESET_RULES = [
	{
		id: "preset-email",
		source: "preset",
		enabled: true,
		label: "Email",
		tokenType: "EMAIL",
		match: {
			kind: "regex",
			pattern: "[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}",
			flags: "gi"
		}
	},
	{
		id: "preset-cuit",
		source: "preset",
		enabled: true,
		label: "CUIT/CUIL",
		tokenType: "CUIT",
		match: {
			kind: "regex",
			pattern: "\\b(20|23|24|27|30|33|34)\\-?\\d{8}\\-?\\d\\b",
			flags: "g"
		}
	},
	{
		id: "preset-phone-ar",
		source: "preset",
		enabled: true,
		label: "Phone (AR)",
		tokenType: "PHONE",
		match: {
			kind: "regex",
			pattern: "(?:\\+?54\\s?)?(?:9\\s?)?(?:11|[2-9]\\d{1,3})\\s?\\d{4}[\\s\\-]?\\d{4}\\b",
			flags: "g"
		}
	},
	{
		id: "preset-credit-card",
		source: "preset",
		enabled: true,
		label: "Credit Card",
		tokenType: "CARD",
		match: {
			kind: "regex",
			pattern: "\\b(?:\\d[\\s\\-]?){13,19}\\b",
			flags: "g"
		}
	},
	{
		id: "preset-ip",
		source: "preset",
		enabled: false,
		label: "IPv4",
		tokenType: "IP",
		match: {
			kind: "regex",
			pattern: "\\b(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b",
			flags: "g"
		}
	},
	{
		id: "preset-dni-raw",
		source: "preset",
		enabled: false,
		label: "DNI (raw 7-8 digits)",
		tokenType: "DNI",
		match: {
			kind: "regex",
			pattern: "\\b\\d{7,8}\\b",
			flags: "g"
		}
	}
];
//#endregion
//#region src/core/vault.ts
var VAULT_KEY = "pg_vault";
function createDefaultVault() {
	return {
		rules: PRESET_RULES.map((r) => ({ ...r })),
		settings: { masterEnabled: true }
	};
}
async function getVault() {
	return new Promise((resolve) => {
		chrome.storage.local.get(VAULT_KEY, (result) => {
			if (result[VAULT_KEY]) resolve(result[VAULT_KEY]);
			else {
				const defaultVault = createDefaultVault();
				chrome.storage.local.set({ [VAULT_KEY]: defaultVault }, () => {
					resolve(defaultVault);
				});
			}
		});
	});
}
async function setVault(vault) {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [VAULT_KEY]: vault }, () => {
			resolve();
		});
	});
}
//#endregion
//#region src/background/service-worker.ts
chrome.runtime.onInstalled.addListener(async () => {
	await getVault();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_VAULT") {
		getVault().then((vault) => sendResponse({
			type: "VAULT_DATA",
			vault
		})).catch((e) => sendResponse({
			type: "ERROR",
			error: String(e)
		}));
		return true;
	}
	if (message.type === "SET_VAULT") {
		setVault(message.vault).then(() => {
			sendResponse({ type: "VAULT_SAVED" });
			chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] }, (tabs) => {
				for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, {
					type: "VAULT_UPDATED",
					vault: message.vault
				});
			});
		}).catch((e) => sendResponse({
			type: "ERROR",
			error: String(e)
		}));
		return true;
	}
	return false;
});
//#endregion
