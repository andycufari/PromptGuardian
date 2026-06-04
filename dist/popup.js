//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/popup/popup.ts
var vault;
var masterToggle = document.getElementById("master-toggle");
var presetsList = document.getElementById("presets-list");
var customList = document.getElementById("custom-list");
var plainList = document.getElementById("plain-list");
var customLabel = document.getElementById("custom-label");
var customToken = document.getElementById("custom-token");
var customPattern = document.getElementById("custom-pattern");
var customFlags = document.getElementById("custom-flags");
var customError = document.getElementById("custom-error");
var customAdd = document.getElementById("custom-add");
var plainValue = document.getElementById("plain-value");
var plainToken = document.getElementById("plain-token");
var plainAccent = document.getElementById("plain-accent");
var plainAdd = document.getElementById("plain-add");
async function loadVault() {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type: "GET_VAULT" }, (response) => {
			if (response?.type === "VAULT_DATA") resolve(response.vault);
		});
	});
}
async function saveVault() {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({
			type: "SET_VAULT",
			vault
		}, (response) => {
			resolve();
		});
	});
}
function generateId() {
	return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function renderPresets() {
	const presets = vault.rules.filter((r) => r.source === "preset");
	presetsList.innerHTML = "";
	for (const rule of presets) {
		const el = document.createElement("div");
		el.className = "rule-item";
		const noteHtml = rule.id === "preset-dni-raw" ? "<span class=\"rule-note\"> may over-match any 7-8 digit number</span>" : "";
		el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}>
        <span class="rule-label">${rule.label}</span>
        <span class="rule-type">[${rule.tokenType}]</span>
        ${noteHtml}
      </div>
    `;
		presetsList.appendChild(el);
	}
	presetsList.querySelectorAll(".rule-toggle").forEach((cb) => {
		cb.addEventListener("change", (e) => {
			const id = e.target.dataset.id;
			const rule = vault.rules.find((r) => r.id === id);
			if (rule) {
				rule.enabled = e.target.checked;
				saveVault();
			}
		});
	});
}
function renderCustom() {
	const customs = vault.rules.filter((r) => r.source === "custom");
	customList.innerHTML = "";
	for (const rule of customs) {
		const el = document.createElement("div");
		el.className = "rule-item";
		const match = rule.match;
		el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}>
        <span class="rule-label">${rule.label}</span>
        <span class="rule-type">/${match.pattern}/${match.flags}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}">x</button>
      </div>
    `;
		customList.appendChild(el);
	}
	customList.querySelectorAll(".rule-toggle").forEach((cb) => {
		cb.addEventListener("change", (e) => {
			const id = e.target.dataset.id;
			const rule = vault.rules.find((r) => r.id === id);
			if (rule) {
				rule.enabled = e.target.checked;
				saveVault();
			}
		});
	});
	customList.querySelectorAll(".delete-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const id = e.target.dataset.id;
			vault.rules = vault.rules.filter((r) => r.id !== id);
			saveVault();
			renderCustom();
		});
	});
}
function renderPlain() {
	const plains = vault.rules.filter((r) => r.source === "plain");
	plainList.innerHTML = "";
	for (const rule of plains) {
		const el = document.createElement("div");
		el.className = "rule-item";
		const match = rule.match;
		const accentLabel = match.accentInsensitive ? " [accent-free]" : "";
		el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}>
        <span class="rule-label">"${match.value}"</span>
        <span class="rule-type">[${rule.tokenType}]${accentLabel}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}">x</button>
      </div>
    `;
		plainList.appendChild(el);
	}
	plainList.querySelectorAll(".rule-toggle").forEach((cb) => {
		cb.addEventListener("change", (e) => {
			const id = e.target.dataset.id;
			const rule = vault.rules.find((r) => r.id === id);
			if (rule) {
				rule.enabled = e.target.checked;
				saveVault();
			}
		});
	});
	plainList.querySelectorAll(".delete-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const id = e.target.dataset.id;
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
masterToggle.addEventListener("change", () => {
	vault.settings.masterEnabled = masterToggle.checked;
	saveVault();
});
customAdd.addEventListener("click", () => {
	const label = customLabel.value.trim();
	const tokenType = customToken.value.trim().toUpperCase();
	const pattern = customPattern.value;
	const flags = customFlags.value.trim();
	if (!label || !tokenType || !pattern) {
		customError.textContent = "All fields are required.";
		return;
	}
	try {
		new RegExp(pattern, flags);
	} catch (e) {
		customError.textContent = `Invalid regex: ${e.message}`;
		return;
	}
	customError.textContent = "";
	const rule = {
		id: generateId(),
		source: "custom",
		enabled: true,
		label,
		tokenType,
		match: {
			kind: "regex",
			pattern,
			flags
		}
	};
	vault.rules.push(rule);
	saveVault();
	renderCustom();
	customLabel.value = "";
	customToken.value = "";
	customPattern.value = "";
	customFlags.value = "gi";
});
plainAdd.addEventListener("click", () => {
	const value = plainValue.value.trim();
	const tokenType = plainToken.value.trim().toUpperCase();
	if (!value || !tokenType) return;
	const rule = {
		id: generateId(),
		source: "plain",
		enabled: true,
		label: value,
		tokenType,
		match: {
			kind: "literal",
			value,
			accentInsensitive: plainAccent.checked
		}
	};
	vault.rules.push(rule);
	saveVault();
	renderPlain();
	plainValue.value = "";
	plainToken.value = "";
	plainAccent.checked = false;
});
async function init() {
	vault = await loadVault();
	renderAll();
}
init();
//#endregion
