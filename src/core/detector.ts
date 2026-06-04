import { Rule, Span, TokenMap } from './types.js';
import { createTokenMap, getOrCreateToken } from './tokenizer.js';

const SOURCE_PRIORITY: Record<Rule['source'], number> = {
  plain: 0,
  custom: 1,
  preset: 2,
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/[\s\-]/g, '').split('').map(Number);
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

function findMatchesForRule(rule: Rule, text: string): Span[] {
  const spans: Span[] = [];

  if (rule.match.kind === 'literal') {
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
        matchedText: text.slice(idx, idx + value.length),
      });
      pos = idx + 1;
    }
  } else {
    let re: RegExp;
    try {
      re = new RegExp(rule.match.pattern, rule.match.flags);
    } catch {
      return spans; // bad regex — skip silently
    }

    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const matchedText = m[0];

      // Luhn check for credit cards
      if (rule.id === 'preset-credit-card') {
        const digits = matchedText.replace(/[\s\-]/g, '');
        if (!luhnCheck(digits)) {
          if (!re.global) break;
          continue;
        }
      }

      spans.push({
        start: m.index,
        end: m.index + matchedText.length,
        rule,
        matchedText,
      });

      if (!re.global) break;
      if (matchedText.length === 0) {
        re.lastIndex++;
      }
    }
  }

  return spans;
}

function resolveSpans(spans: Span[]): Span[] {
  // Sort by priority (lower = higher priority), then longest, then leftmost
  spans.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.rule.source];
    const pb = SOURCE_PRIORITY[b.rule.source];
    if (pa !== pb) return pa - pb;
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  // Greedy non-overlapping selection
  const accepted: Span[] = [];
  const claimed = new Set<number>();

  for (const span of spans) {
    let overlaps = false;
    for (let i = span.start; i < span.end; i++) {
      if (claimed.has(i)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    accepted.push(span);
    for (let i = span.start; i < span.end; i++) {
      claimed.add(i);
    }
  }

  // Return sorted by position for replacement
  return accepted.sort((a, b) => a.start - b.start);
}

export function anonymize(
  text: string,
  rules: Rule[],
): { text: string; map: TokenMap } {
  const enabledRules = rules.filter((r) => r.enabled);
  const map = createTokenMap();

  if (!text || enabledRules.length === 0) {
    return { text, map };
  }

  // Collect all spans
  const allSpans: Span[] = [];
  for (const rule of enabledRules) {
    allSpans.push(...findMatchesForRule(rule, text));
  }

  if (allSpans.length === 0) {
    return { text, map };
  }

  const resolved = resolveSpans(allSpans);

  // Replace right-to-left to preserve indices
  let result = text;
  for (let i = resolved.length - 1; i >= 0; i--) {
    const span = resolved[i];
    const token = getOrCreateToken(map, span.matchedText, span.rule.tokenType);
    result = result.slice(0, span.start) + token + result.slice(span.end);
  }

  return { text: result, map };
}
