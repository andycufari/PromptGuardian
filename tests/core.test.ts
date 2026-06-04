import { describe, it, expect } from 'vitest';
import { anonymize } from '../src/core/detector.js';
import { deanonymize, TOKEN_OPEN, TOKEN_CLOSE } from '../src/core/tokenizer.js';
import { PRESET_RULES } from '../src/core/presets.js';
import { Rule } from '../src/core/types.js';

// Helper to make plain rules
function plainRule(
  id: string,
  value: string,
  tokenType: string,
  accentInsensitive = false,
): Rule {
  return {
    id,
    source: 'plain',
    enabled: true,
    label: value,
    tokenType,
    match: { kind: 'literal', value, accentInsensitive },
  };
}

function customRule(
  id: string,
  pattern: string,
  flags: string,
  tokenType: string,
): Rule {
  return {
    id,
    source: 'custom',
    enabled: true,
    label: tokenType,
    tokenType,
    match: { kind: 'regex', pattern, flags },
  };
}

describe('Tokenizer', () => {
  it('round-trip identity', () => {
    const rules = [
      plainRule('p1', 'John', 'NAME'),
      plainRule('p2', 'john@example.com', 'EMAIL'),
    ];
    const input = 'Hello John, your email is john@example.com right?';
    const { text, map } = anonymize(input, rules);
    expect(text).not.toContain('John');
    expect(text).not.toContain('john@example.com');
    const restored = deanonymize(text, map);
    expect(restored).toBe(input);
  });

  it('same value gets same token', () => {
    const rules = [plainRule('p1', 'Alice', 'NAME')];
    const input = 'Alice met Alice at the park';
    const { text, map } = anonymize(input, rules);
    const token = map.toToken.get('Alice')!;
    expect(text).toBe(`${token} met ${token} at the park`);
  });

  it('per-type counters', () => {
    const rules = [
      plainRule('p1', 'Alice', 'NAME'),
      plainRule('p2', 'Bob', 'NAME'),
    ];
    const input = 'Alice and Bob';
    const { text } = anonymize(input, rules);
    expect(text).toContain(`${TOKEN_OPEN}NAME_1${TOKEN_CLOSE}`);
    expect(text).toContain(`${TOKEN_OPEN}NAME_2${TOKEN_CLOSE}`);
  });
});

describe('Detector', () => {
  it('empty input returns unchanged', () => {
    const { text, map } = anonymize('', PRESET_RULES);
    expect(text).toBe('');
    expect(map.toToken.size).toBe(0);
  });

  it('input with zero PII returns unchanged', () => {
    const { text, map } = anonymize('Hello world, how are you?', PRESET_RULES);
    expect(text).toBe('Hello world, how are you?');
    expect(map.toToken.size).toBe(0);
  });

  it('detects email', () => {
    const { text } = anonymize('Contact me at test@example.com please', PRESET_RULES);
    expect(text).not.toContain('test@example.com');
    expect(text).toContain(`${TOKEN_OPEN}EMAIL_1${TOKEN_CLOSE}`);
  });

  it('detects CUIT', () => {
    const { text } = anonymize('Mi CUIT es 20-12345678-9', PRESET_RULES);
    expect(text).not.toContain('20-12345678-9');
    expect(text).toContain(`${TOKEN_OPEN}CUIT_1${TOKEN_CLOSE}`);
  });

  it('DNI_RAW is off by default', () => {
    const dniRule = PRESET_RULES.find((r) => r.id === 'preset-dni-raw')!;
    expect(dniRule.enabled).toBe(false);

    const { text } = anonymize('DNI 12345678', PRESET_RULES);
    // Should NOT be anonymized since DNI_RAW is disabled
    expect(text).toContain('12345678');
  });

  it('Luhn check rejects invalid card numbers', () => {
    const cardOnly: Rule[] = [PRESET_RULES.find((r) => r.id === 'preset-credit-card')!];

    // 4111111111111111 is a valid Luhn number
    const { text: t1 } = anonymize('Card: 4111111111111111', cardOnly);
    expect(t1).toContain(`${TOKEN_OPEN}CARD_1${TOKEN_CLOSE}`);

    // 1234567890123456 is not valid Luhn
    const { text: t2 } = anonymize('Number: 1234567890123456', cardOnly);
    expect(t2).toContain('1234567890123456');
  });

  it('precedence: plain > custom > preset', () => {
    const rules: Rule[] = [
      ...PRESET_RULES,
      plainRule('plain-email', 'test@example.com', 'MY_EMAIL'),
    ];
    const { text } = anonymize('Email: test@example.com', rules);
    // Plain rule should win over preset email
    expect(text).toContain(`${TOKEN_OPEN}MY_EMAIL_1${TOKEN_CLOSE}`);
    expect(text).not.toContain(`${TOKEN_OPEN}EMAIL_1${TOKEN_CLOSE}`);
  });

  it('longest match wins within same priority', () => {
    const rules: Rule[] = [
      customRule('c1', 'foo', 'g', 'SHORT'),
      customRule('c2', 'foobar', 'g', 'LONG'),
    ];
    const { text } = anonymize('foobar', rules);
    expect(text).toContain(`${TOKEN_OPEN}LONG_1${TOKEN_CLOSE}`);
    expect(text).not.toContain(`${TOKEN_OPEN}SHORT_1${TOKEN_CLOSE}`);
  });

  it('overlapping spans: left-to-right non-overlapping', () => {
    const rules: Rule[] = [
      plainRule('p1', 'abcd', 'A'),
      plainRule('p2', 'cdef', 'B'),
    ];
    const { text } = anonymize('abcdef', rules);
    // 'abcd' starts earlier and they overlap, so 'abcd' wins
    expect(text).toContain(`${TOKEN_OPEN}A_1${TOKEN_CLOSE}`);
    // 'cdef' overlaps with accepted 'abcd' so it's rejected
    // remaining 'ef' is literal
    expect(text).toContain('ef');
  });

  it('accent-insensitive plain match', () => {
    const rules = [plainRule('p1', 'Andres', 'NAME', true)];
    const input = 'Hola Andrés, como estas?';
    const { text, map } = anonymize(input, rules);
    expect(text).toContain(`${TOKEN_OPEN}NAME_1${TOKEN_CLOSE}`);
    // The matched text should be the original accented version
    const realValues = Array.from(map.toReal.values());
    expect(realValues).toContain('Andrés');
  });

  it('bad regex in custom rule does not crash', () => {
    const rules: Rule[] = [
      customRule('bad', '(unclosed', 'g', 'BAD'),
      plainRule('p1', 'hello', 'WORD'),
    ];
    const { text } = anonymize('hello world', rules);
    expect(text).toContain(`${TOKEN_OPEN}WORD_1${TOKEN_CLOSE}`);
  });
});

describe('SSE Reassembler (deanonymize)', () => {
  it('handles complete tokens', () => {
    const rules = [plainRule('p1', 'Alice', 'NAME')];
    const { map } = anonymize('Alice', rules);
    const token = `${TOKEN_OPEN}NAME_1${TOKEN_CLOSE}`;
    expect(deanonymize(`Hello ${token}!`, map)).toBe('Hello Alice!');
  });

  it('handles multiple tokens in one string', () => {
    const rules = [
      plainRule('p1', 'Alice', 'NAME'),
      plainRule('p2', 'Bob', 'NAME'),
    ];
    const input = 'Alice and Bob';
    const { text, map } = anonymize(input, rules);
    // Round-trip: deanonymize the anonymized text should give back original
    expect(deanonymize(text, map)).toBe(input);
  });
});
