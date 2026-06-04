import { describe, it, expect } from 'vitest';
import { TOKEN_OPEN, TOKEN_CLOSE, createTokenMap, getOrCreateToken, deanonymize } from '../src/core/tokenizer.js';

// Standalone reassembler logic (mirrors the interceptor's createReassemblerTransform but works on strings)
// This tests the core buffering algorithm.

class Reassembler {
  private buffer = '';
  private output = '';
  private map: Map<string, string>;

  constructor(map: Map<string, string>) {
    this.map = map;
  }

  push(chunk: string) {
    this.buffer += chunk;

    const lastOpen = this.buffer.lastIndexOf(TOKEN_OPEN);

    if (lastOpen === -1) {
      this.output += this.detoken(this.buffer);
      this.buffer = '';
    } else {
      const afterOpen = this.buffer.indexOf(TOKEN_CLOSE, lastOpen);
      if (afterOpen !== -1) {
        const safeEnd = afterOpen + TOKEN_CLOSE.length;
        const safe = this.buffer.slice(0, safeEnd);
        this.buffer = this.buffer.slice(safeEnd);
        this.output += this.detoken(safe);
      } else {
        if (lastOpen > 0) {
          const safe = this.buffer.slice(0, lastOpen);
          this.buffer = this.buffer.slice(lastOpen);
          this.output += this.detoken(safe);
        }
      }
    }
  }

  flush(): string {
    if (this.buffer.length > 0) {
      this.output += this.detoken(this.buffer);
      this.buffer = '';
    }
    return this.output;
  }

  private detoken(text: string): string {
    const pattern = new RegExp(
      `${escapeRegex(TOKEN_OPEN)}[A-Z_]+\\d*_\\d+${escapeRegex(TOKEN_CLOSE)}`,
      'g',
    );
    return text.replace(pattern, (match) => this.map.get(match) ?? match);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('SSE Reassembler — split token test', () => {
  const tokenMap = createTokenMap();
  const token = getOrCreateToken(tokenMap, 'Alice', 'NAME');
  const fullText = `Hello ${token} how are you?`;
  const expected = 'Hello Alice how are you?';

  it('handles complete token in single chunk', () => {
    const r = new Reassembler(tokenMap.toReal);
    r.push(fullText);
    expect(r.flush()).toBe(expected);
  });

  it('handles token split at every possible character position', () => {
    // Split the full text at every character position
    for (let i = 1; i < fullText.length; i++) {
      const r = new Reassembler(tokenMap.toReal);
      r.push(fullText.slice(0, i));
      r.push(fullText.slice(i));
      const result = r.flush();
      expect(result).toBe(expected);
    }
  });

  it('handles token split into 3 chunks at every position pair', () => {
    for (let i = 1; i < fullText.length - 1; i++) {
      for (let j = i + 1; j < fullText.length; j++) {
        const r = new Reassembler(tokenMap.toReal);
        r.push(fullText.slice(0, i));
        r.push(fullText.slice(i, j));
        r.push(fullText.slice(j));
        const result = r.flush();
        expect(result).toBe(expected);
      }
    }
  });

  it('handles byte-level splits of multi-byte unicode brackets', () => {
    // TOKEN_OPEN (⟦ = U+27E6) is 3 bytes in UTF-8: 0xE2 0x9F 0xA6
    // TOKEN_CLOSE (⟧ = U+27E7) is 3 bytes: 0xE2 0x9F 0xA7
    // Simulate byte-level splitting using a single streaming TextDecoder
    // (mirrors what the real interceptor's TransformStream does)
    const encoder = new TextEncoder();
    const bytes = encoder.encode(fullText);

    for (let i = 1; i < bytes.length; i++) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const r = new Reassembler(tokenMap.toReal);

      // Streaming decode: first chunk with stream:true, second chunk flushes
      const chunk1Text = decoder.decode(bytes.slice(0, i), { stream: true });
      const chunk2Text = decoder.decode(bytes.slice(i)); // final, flushes

      if (chunk1Text) r.push(chunk1Text);
      if (chunk2Text) r.push(chunk2Text);
      const result = r.flush();
      expect(result).toBe(expected);
    }
  });

  it('handles multiple tokens in streamed text', () => {
    const map2 = createTokenMap();
    const t1 = getOrCreateToken(map2, 'Alice', 'NAME');
    const t2 = getOrCreateToken(map2, 'Bob', 'NAME');
    const text = `Dear ${t1}, please contact ${t2} about this.`;
    const exp = 'Dear Alice, please contact Bob about this.';

    // Split at every position
    for (let i = 1; i < text.length; i++) {
      const r = new Reassembler(map2.toReal);
      r.push(text.slice(0, i));
      r.push(text.slice(i));
      expect(r.flush()).toBe(exp);
    }
  });

  it('passes through text with no tokens unchanged', () => {
    const r = new Reassembler(tokenMap.toReal);
    r.push('Hello world');
    expect(r.flush()).toBe('Hello world');
  });

  it('handles empty chunks', () => {
    const r = new Reassembler(tokenMap.toReal);
    r.push('');
    r.push(fullText);
    r.push('');
    expect(r.flush()).toBe(expected);
  });
});
