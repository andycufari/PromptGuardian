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
var protectedList = document.getElementById("protected-list");
var protectValue = document.getElementById("protect-value");
var protectCategory = document.getElementById("protect-category");
var protectAccent = document.getElementById("protect-accent");
var protectReplace = document.getElementById("protect-replace");
var protectPreview = document.getElementById("protect-preview");
var protectAdd = document.getElementById("protect-add");
var customLabel = document.getElementById("custom-label");
var customToken = document.getElementById("custom-token");
var customPattern = document.getElementById("custom-pattern");
var customFlags = document.getElementById("custom-flags");
var customError = document.getElementById("custom-error");
var customAdd = document.getElementById("custom-add");
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
function escapeHtml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function getEffectiveTokenType() {
	const custom = protectReplace.value.trim().toUpperCase();
	if (custom) return custom;
	return protectCategory.value;
}
function updatePreview() {
	protectPreview.textContent = getEffectiveTokenType();
}
protectCategory.addEventListener("change", updatePreview);
protectReplace.addEventListener("input", updatePreview);
function renderProtected() {
	const plains = vault.rules.filter((r) => r.source === "plain");
	protectedList.innerHTML = "";
	const typeCounts = {};
	const typeTotal = {};
	for (const rule of plains) typeTotal[rule.tokenType] = (typeTotal[rule.tokenType] || 0) + 1;
	for (const rule of plains) {
		typeCounts[rule.tokenType] = (typeCounts[rule.tokenType] || 0) + 1;
		const count = typeCounts[rule.tokenType];
		const displayType = typeTotal[rule.tokenType] > 1 ? `${rule.tokenType}_${count}` : rule.tokenType;
		const el = document.createElement("div");
		el.className = "rule-item";
		const match = rule.match;
		el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}>
        <span class="rule-label">"${escapeHtml(match.value)}"</span>
        <span class="rule-arrow">&rarr;</span>
        <span class="rule-type">${escapeHtml(displayType)}</span>
      </div>
      <div class="rule-actions">
        <button class="delete-btn" data-id="${rule.id}" title="Remove">&times;</button>
      </div>
    `;
		protectedList.appendChild(el);
	}
	bindToggleAndDelete(protectedList, renderProtected);
}
protectAdd.addEventListener("click", () => {
	const value = protectValue.value.trim();
	if (!value) return;
	const tokenType = getEffectiveTokenType().replace(/[^A-Za-z0-9_]/g, "").toUpperCase() || "VALUE";
	const rule = {
		id: generateId(),
		source: "plain",
		enabled: true,
		label: value,
		tokenType,
		match: {
			kind: "literal",
			value,
			accentInsensitive: protectAccent.checked
		}
	};
	vault.rules.push(rule);
	saveVault();
	renderProtected();
	protectValue.value = "";
	protectReplace.value = "";
	protectAccent.checked = false;
	updatePreview();
});
function renderPresets() {
	const presets = vault.rules.filter((r) => r.source === "preset");
	presetsList.innerHTML = "";
	for (const rule of presets) {
		const el = document.createElement("div");
		el.className = "rule-item";
		const noteHtml = rule.id === "preset-dni-raw" ? "<span class=\"rule-note\"> may over-match</span>" : "";
		el.innerHTML = `
      <div class="rule-info">
        <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}>
        <span class="rule-label">${escapeHtml(rule.label)}</span>
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
customAdd.addEventListener("click", () => {
	const label = customLabel.value.trim();
	const tokenType = customToken.value.trim().toUpperCase().replace(/[^A-Za-z0-9_]/g, "") || "CUSTOM";
	const pattern = customPattern.value;
	const flags = customFlags.value.trim();
	if (!label || !pattern) {
		customError.textContent = "Label and pattern are required.";
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
function bindToggleAndDelete(container, rerender) {
	container.querySelectorAll(".rule-toggle").forEach((cb) => {
		cb.addEventListener("change", (e) => {
			const id = e.target.dataset.id;
			const rule = vault.rules.find((r) => r.id === id);
			if (rule) {
				rule.enabled = e.target.checked;
				saveVault();
			}
		});
	});
	container.querySelectorAll(".delete-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const id = e.target.closest(".delete-btn").dataset.id;
			vault.rules = vault.rules.filter((r) => r.id !== id);
			saveVault();
			rerender();
		});
	});
}
masterToggle.addEventListener("change", () => {
	vault.settings.masterEnabled = masterToggle.checked;
	saveVault();
});
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
//#endregion
