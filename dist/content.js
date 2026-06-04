//#region src/content/content.ts
function injectInterceptor() {
	const script = document.createElement("script");
	script.src = chrome.runtime.getURL("interceptor.js");
	script.onload = () => script.remove();
	(document.head || document.documentElement).appendChild(script);
}
var badge = null;
function createBadge() {
	badge = document.createElement("div");
	badge.id = "pg-badge";
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
	badge.textContent = "🛡️ ready";
	document.body.appendChild(badge);
}
function updateBadge(count, error) {
	if (!badge) return;
	if (error === "unrecognized") {
		badge.style.background = "#ef4444";
		badge.style.color = "#fff";
		badge.textContent = "⚠️ not protected";
	} else if (error) {
		badge.style.background = "#ef4444";
		badge.style.color = "#fff";
		badge.textContent = "⚠️ error";
	} else if (count > 0) {
		badge.style.background = "#FFB000";
		badge.style.color = "#0F0905";
		badge.textContent = `\u{1F6E1}\uFE0F ${count} anonymized`;
	} else {
		badge.style.background = "#4ade80";
		badge.style.color = "#0F0905";
		badge.textContent = "🛡️ ready";
	}
}
function pushRules(vault) {
	window.postMessage({
		type: "PG_RULES_UPDATE",
		rules: vault.rules,
		masterEnabled: vault.settings.masterEnabled
	}, "*");
	if (!vault.settings.masterEnabled && badge) {
		badge.style.background = "#ef4444";
		badge.style.color = "#fff";
		badge.textContent = "⚠️ disabled";
	}
}
async function loadVault() {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type: "GET_VAULT" }, (response) => {
			if (response?.type === "VAULT_DATA") resolve(response.vault);
		});
	});
}
var attachmentPending = false;
function showAttachmentGate() {
	return new Promise((resolve) => {
		const overlay = document.createElement("div");
		overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
    `;
		const dialog = document.createElement("div");
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
		dialog.querySelector("#pg-att-cancel").addEventListener("click", () => {
			overlay.remove();
			resolve(false);
		});
		dialog.querySelector("#pg-att-send").addEventListener("click", () => {
			overlay.remove();
			resolve(true);
		});
	});
}
window.addEventListener("message", (event) => {
	if (event.source !== window) return;
	if (event.data?.type === "PG_BADGE_UPDATE") updateBadge(event.data.count, event.data.error);
	if (event.data?.type === "PG_ATTACHMENT_DETECTED" && !attachmentPending) {
		attachmentPending = true;
		showAttachmentGate().then((allowed) => {
			attachmentPending = false;
		});
	}
});
chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === "VAULT_UPDATED") pushRules(message.vault);
});
async function init() {
	injectInterceptor();
	createBadge();
	pushRules(await loadVault());
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
//#endregion
