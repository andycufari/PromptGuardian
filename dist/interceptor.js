function createTokenMap() {
	return {
		toToken: /* @__PURE__ */ new Map(),
		toReal: /* @__PURE__ */ new Map()
	};
}
function sanitizeTokenType(raw) {
	return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "").toUpperCase() || "VALUE";
}
function getOrCreateToken(map, realValue, tokenType) {
	const existing = map.toToken.get(realValue);
	if (existing) return existing;
	const safeType = sanitizeTokenType(tokenType);
	let count = 0;
	for (const token of map.toReal.keys()) if (token.startsWith(`⟦${safeType}_`)) count++;
	const token = `⟦${safeType}_${count + 1}⟧`;
	map.toToken.set(realValue, token);
	map.toReal.set(token, realValue);
	return token;
}
function deanonymize(text, map) {
	const tokenPattern = new RegExp(`${escapeRegex("⟦")}[^${escapeRegex("⟧")}]+${escapeRegex("⟧")}`, "g");
	return text.replace(tokenPattern, (match) => {
		return map.toReal.get(match) ?? match;
	});
}
function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//#endregion
//#region src/core/detector.ts
var SOURCE_PRIORITY = {
	plain: 0,
	custom: 1,
	preset: 2
};
function stripDiacritics(s) {
	return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function luhnCheck(digits) {
	const nums = digits.replace(/[\s\-]/g, "").split("").map(Number);
	if (nums.length < 13 || nums.length > 19) return false;
	let sum = 0;
	let alternate = false;
	for (let i = nums.length - 1; i >= 0; i--) {
		let n = nums[i];
		if (alternate) {
			n *= 2;
			if (n > 9) n -= 9;
		}
		sum += n;
		alternate = !alternate;
	}
	return sum % 10 === 0;
}
function findMatchesForRule(rule, text) {
	const spans = [];
	if (rule.match.kind === "literal") {
		const { value, accentInsensitive } = rule.match;
		const searchText = accentInsensitive ? stripDiacritics(text) : text;
		const searchValue = accentInsensitive ? stripDiacritics(value) : value;
		const lowerSearch = searchText.toLowerCase();
		const lowerValue = searchValue.toLowerCase();
		let pos = 0;
		while (true) {
			const idx = lowerSearch.indexOf(lowerValue, pos);
			if (idx === -1) break;
			spans.push({
				start: idx,
				end: idx + value.length,
				rule,
				matchedText: text.slice(idx, idx + value.length)
			});
			pos = idx + 1;
		}
	} else {
		let re;
		try {
			re = new RegExp(rule.match.pattern, rule.match.flags);
		} catch {
			return spans;
		}
		let m;
		while ((m = re.exec(text)) !== null) {
			const matchedText = m[0];
			if (rule.id === "preset-credit-card") {
				if (!luhnCheck(matchedText.replace(/[\s\-]/g, ""))) {
					if (!re.global) break;
					continue;
				}
			}
			spans.push({
				start: m.index,
				end: m.index + matchedText.length,
				rule,
				matchedText
			});
			if (!re.global) break;
			if (matchedText.length === 0) re.lastIndex++;
		}
	}
	return spans;
}
function resolveSpans(spans) {
	spans.sort((a, b) => {
		const pa = SOURCE_PRIORITY[a.rule.source];
		const pb = SOURCE_PRIORITY[b.rule.source];
		if (pa !== pb) return pa - pb;
		const lenDiff = b.end - b.start - (a.end - a.start);
		if (lenDiff !== 0) return lenDiff;
		return a.start - b.start;
	});
	const accepted = [];
	const claimed = /* @__PURE__ */ new Set();
	for (const span of spans) {
		let overlaps = false;
		for (let i = span.start; i < span.end; i++) if (claimed.has(i)) {
			overlaps = true;
			break;
		}
		if (overlaps) continue;
		accepted.push(span);
		for (let i = span.start; i < span.end; i++) claimed.add(i);
	}
	return accepted.sort((a, b) => a.start - b.start);
}
function anonymize(text, rules) {
	const enabledRules = rules.filter((r) => r.enabled);
	const map = createTokenMap();
	if (!text || enabledRules.length === 0) return {
		text,
		map
	};
	const allSpans = [];
	for (const rule of enabledRules) allSpans.push(...findMatchesForRule(rule, text));
	if (allSpans.length === 0) return {
		text,
		map
	};
	const resolved = resolveSpans(allSpans);
	let result = text;
	for (let i = resolved.length - 1; i >= 0; i--) {
		const span = resolved[i];
		const token = getOrCreateToken(map, span.matchedText, span.rule.tokenType);
		result = result.slice(0, span.start) + token + result.slice(span.end);
	}
	return {
		text: result,
		map
	};
}
//#endregion
//#region src/inject/interceptor.ts
var currentRules = [];
var masterEnabled = true;
window.addEventListener("message", (event) => {
	if (event.source !== window) return;
	if (event.data?.type === "PG_RULES_UPDATE") {
		currentRules = event.data.rules;
		masterEnabled = event.data.masterEnabled;
	}
});
function notifyBadge(count, error) {
	window.postMessage({
		type: "PG_BADGE_UPDATE",
		count,
		error
	}, "*");
}
function extractMessageText(body) {
	if (!body || typeof body !== "object") return null;
	if (Array.isArray(body.messages)) for (let i = body.messages.length - 1; i >= 0; i--) {
		const msg = body.messages[i];
		if (msg?.content?.parts && Array.isArray(msg.content.parts)) {
			for (let j = 0; j < msg.content.parts.length; j++) if (typeof msg.content.parts[j] === "string" && msg.content.parts[j].length > 0) return {
				text: msg.content.parts[j],
				path: [
					"messages",
					String(i),
					"content",
					"parts",
					String(j)
				]
			};
		}
	}
	return null;
}
function setNestedValue(obj, path, value) {
	let current = obj;
	for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
	current[path[path.length - 1]] = value;
}
function createReassemblerTransform(map) {
	const decoder = new TextDecoder("utf-8", { fatal: false });
	const encoder = new TextEncoder();
	let buffer = "";
	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });
			const lastOpen = buffer.lastIndexOf("⟦");
			if (lastOpen === -1) {
				const output = deanonymize(buffer, map);
				controller.enqueue(encoder.encode(output));
				buffer = "";
			} else {
				const afterOpen = buffer.indexOf("⟧", lastOpen);
				if (afterOpen !== -1) {
					const safeEnd = afterOpen + 1;
					const safe = buffer.slice(0, safeEnd);
					buffer = buffer.slice(safeEnd);
					const output = deanonymize(safe, map);
					controller.enqueue(encoder.encode(output));
				} else if (lastOpen > 0) {
					const safe = buffer.slice(0, lastOpen);
					buffer = buffer.slice(lastOpen);
					const output = deanonymize(safe, map);
					controller.enqueue(encoder.encode(output));
				}
			}
		},
		flush(controller) {
			if (buffer.length > 0) {
				const output = deanonymize(buffer, map);
				controller.enqueue(encoder.encode(output));
				buffer = "";
			}
		}
	});
}
function isChatEndpoint(url) {
	try {
		const u = new URL(url);
		return (u.hostname === "chatgpt.com" || u.hostname === "chat.openai.com") && u.pathname.includes("/conversation");
	} catch {
		return false;
	}
}
var activeMaps = /* @__PURE__ */ new Map();
var requestCounter = 0;
var originalFetch = window.fetch;
window.fetch = async function(input, init) {
	try {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (!masterEnabled || !isChatEndpoint(url) || !init?.body) return originalFetch.call(window, input, init);
		let bodyText;
		try {
			bodyText = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body);
		} catch {
			return originalFetch.call(window, input, init);
		}
		let bodyObj;
		try {
			bodyObj = JSON.parse(bodyText);
		} catch {
			return originalFetch.call(window, input, init);
		}
		const extracted = extractMessageText(bodyObj);
		if (!extracted) {
			notifyBadge(0, "unrecognized");
			return originalFetch.call(window, input, init);
		}
		if (bodyObj.messages) {
			for (const msg of bodyObj.messages) if (msg?.content?.parts) {
				for (const part of msg.content.parts) if (part && typeof part === "object") window.postMessage({ type: "PG_ATTACHMENT_DETECTED" }, "*");
			}
		}
		const { text: anonText, map } = anonymize(extracted.text, currentRules);
		const count = map.toToken.size;
		if (count > 0) {
			setNestedValue(bodyObj, extracted.path, anonText);
			const newBody = JSON.stringify(bodyObj);
			const newInit = {
				...init,
				body: newBody
			};
			notifyBadge(count);
			const requestId = `req_${++requestCounter}`;
			activeMaps.set(requestId, map);
			const response = await originalFetch.call(window, input, newInit);
			if (response.body) {
				const transform = createReassemblerTransform(map);
				const transformedBody = response.body.pipeThrough(transform);
				return new Response(transformedBody, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers
				});
			}
			activeMaps.delete(requestId);
			return response;
		} else {
			notifyBadge(0);
			return originalFetch.call(window, input, init);
		}
	} catch (e) {
		notifyBadge(0, "error");
		return originalFetch.call(window, input, init);
	}
};
//#endregion
