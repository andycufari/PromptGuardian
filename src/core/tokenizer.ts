import { TokenMap } from './types.js';

export const TOKEN_OPEN = '\u27E6';   // ⟦
export const TOKEN_CLOSE = '\u27E7';  // ⟧

export function createTokenMap(): TokenMap {
  return {
    toToken: new Map(),
    toReal: new Map(),
  };
}

// Sanitize token type to safe uppercase alphanumeric + underscore
function sanitizeTokenType(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();
  return cleaned || 'VALUE';
}

export function getOrCreateToken(
  map: TokenMap,
  realValue: string,
  tokenType: string,
): string {
  const existing = map.toToken.get(realValue);
  if (existing) return existing;

  const safeType = sanitizeTokenType(tokenType);

  // Count existing tokens of this type to get the next index
  let count = 0;
  for (const token of map.toReal.keys()) {
    if (token.startsWith(`${TOKEN_OPEN}${safeType}_`)) {
      count++;
    }
  }

  const token = `${TOKEN_OPEN}${safeType}_${count + 1}${TOKEN_CLOSE}`;
  map.toToken.set(realValue, token);
  map.toReal.set(token, realValue);
  return token;
}

export function deanonymize(text: string, map: TokenMap): string {
  // Match anything between sentinel brackets ⟦...⟧ (non-greedy)
  const tokenPattern = new RegExp(
    `${escapeRegex(TOKEN_OPEN)}[^${escapeRegex(TOKEN_CLOSE)}]+${escapeRegex(TOKEN_CLOSE)}`,
    'g',
  );

  return text.replace(tokenPattern, (match) => {
    return map.toReal.get(match) ?? match;
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
