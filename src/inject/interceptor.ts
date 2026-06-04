import { Rule, TokenMap } from '../core/types.js';
import { anonymize } from '../core/detector.js';
import { deanonymize, TOKEN_OPEN, TOKEN_CLOSE } from '../core/tokenizer.js';

// State pushed from content script
let currentRules: Rule[] = [];
let masterEnabled = true;

// Listen for rules from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type === 'PG_RULES_UPDATE') {
    currentRules = event.data.rules;
    masterEnabled = event.data.masterEnabled;
  }
});

// Notify content script of protection status
function notifyBadge(count: number, error?: string) {
  window.postMessage(
    {
      type: 'PG_BADGE_UPDATE',
      count,
      error,
    },
    '*',
  );
}

// Detect if this is a ChatGPT conversation request by inspecting the body
function extractMessageText(body: any): { text: string; path: string[] } | null {
  if (!body || typeof body !== 'object') return null;

  // ChatGPT sends messages with a nested structure.
  // Look for the message content in known shapes, but also search generically.

  // Shape 1: { messages: [{ content: { parts: ["text"] } }] }
  if (Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const msg = body.messages[i];
      if (msg?.content?.parts && Array.isArray(msg.content.parts)) {
        for (let j = 0; j < msg.content.parts.length; j++) {
          if (typeof msg.content.parts[j] === 'string' && msg.content.parts[j].length > 0) {
            return {
              text: msg.content.parts[j],
              path: ['messages', String(i), 'content', 'parts', String(j)],
            };
          }
        }
      }
    }
  }

  return null;
}

function setNestedValue(obj: any, path: string[], value: string): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

// The buffering reassembler for SSE stream deanonymization
function createReassemblerTransform(map: TokenMap): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const encoder = new TextEncoder();
  let buffer = '';

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // Find the last position where a partial token could still be forming.
      // We can safely emit everything before the last TOKEN_OPEN that has no matching TOKEN_CLOSE.
      const lastOpen = buffer.lastIndexOf(TOKEN_OPEN);

      if (lastOpen === -1) {
        // No potential partial token — emit entire buffer after deanonymization
        const output = deanonymize(buffer, map);
        controller.enqueue(encoder.encode(output));
        buffer = '';
      } else {
        const afterOpen = buffer.indexOf(TOKEN_CLOSE, lastOpen);
        if (afterOpen !== -1) {
          // Complete token found — safe to emit everything including it
          const safeEnd = afterOpen + TOKEN_CLOSE.length;
          const safe = buffer.slice(0, safeEnd);
          buffer = buffer.slice(safeEnd);
          const output = deanonymize(safe, map);
          controller.enqueue(encoder.encode(output));
        } else {
          // Partial token at end — emit everything before the open bracket
          if (lastOpen > 0) {
            const safe = buffer.slice(0, lastOpen);
            buffer = buffer.slice(lastOpen);
            const output = deanonymize(safe, map);
            controller.enqueue(encoder.encode(output));
          }
          // Hold the rest in buffer
        }
      }
    },

    flush(controller) {
      if (buffer.length > 0) {
        const output = deanonymize(buffer, map);
        controller.enqueue(encoder.encode(output));
        buffer = '';
      }
    },
  });
}

// Check if URL looks like a ChatGPT conversation endpoint
function isChatEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'chatgpt.com' || u.hostname === 'chat.openai.com') &&
      u.pathname.includes('/conversation')
    );
  } catch {
    return false;
  }
}

// Store active maps keyed by a unique request id
const activeMaps = new Map<string, TokenMap>();
let requestCounter = 0;

// Proxy fetch
const originalFetch = window.fetch;

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (!masterEnabled || !isChatEndpoint(url) || !init?.body) {
      return originalFetch.call(window, input, init);
    }

    let bodyText: string;
    try {
      bodyText = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as ArrayBuffer);
    } catch {
      return originalFetch.call(window, input, init);
    }

    let bodyObj: any;
    try {
      bodyObj = JSON.parse(bodyText);
    } catch {
      return originalFetch.call(window, input, init);
    }

    const extracted = extractMessageText(bodyObj);

    if (!extracted) {
      // Unrecognized shape — pass through but warn
      notifyBadge(0, 'unrecognized');
      return originalFetch.call(window, input, init);
    }

    // Check for attachments
    if (bodyObj.messages) {
      for (const msg of bodyObj.messages) {
        if (msg?.content?.parts) {
          for (const part of msg.content.parts) {
            if (part && typeof part === 'object') {
              // Attachment detected — content script handles the gate
              window.postMessage({ type: 'PG_ATTACHMENT_DETECTED' }, '*');
            }
          }
        }
      }
    }

    const { text: anonText, map } = anonymize(extracted.text, currentRules);
    const count = map.toToken.size;

    if (count > 0) {
      setNestedValue(bodyObj, extracted.path, anonText);
      const newBody = JSON.stringify(bodyObj);
      const newInit = { ...init, body: newBody };

      notifyBadge(count);

      const requestId = `req_${++requestCounter}`;
      activeMaps.set(requestId, map);

      const response = await originalFetch.call(window, input, newInit);

      // Transform the response stream to deanonymize tokens
      if (response.body) {
        const transform = createReassemblerTransform(map);
        const transformedBody = response.body.pipeThrough(transform);
        const newResponse = new Response(transformedBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        return newResponse;
      }

      activeMaps.delete(requestId);
      return response;
    } else {
      notifyBadge(0);
      return originalFetch.call(window, input, init);
    }
  } catch (e) {
    // Never break the page — fall back to original fetch
    notifyBadge(0, 'error');
    return originalFetch.call(window, input, init);
  }
};
