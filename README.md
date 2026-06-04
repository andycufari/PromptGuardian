# PromptGuardian

A Manifest V3 Chrome extension that anonymizes your personal information before it reaches ChatGPT. The model never sees your real PII — only opaque placeholder tokens. Local-only, no backend, no telemetry.

## How it works

```
You type:  "My email is john@example.com and my CUIT is 20-12345678-9"
ChatGPT sees:  "My email is ⟦EMAIL_1⟧ and my CUIT is ⟦CUIT_1⟧"
You see the reply with your real values swapped back in.
```

### Architecture

**3-tier detection engine** — All PII matching normalizes into a unified `Rule` type with clear precedence:

1. **Plain values** (highest priority) — Literal strings you own: your name, DNI, addresses. Supports accent-insensitive matching.
2. **Custom regex** — Your own patterns with live validation.
3. **Presets** — Built-in toggleable rules: Email, CUIT/CUIL, Argentine phone, Credit Card (with Luhn validation), IPv4, DNI.

**Network-layer interception** — A script injected into the page's MAIN world proxies `window.fetch`. Outbound requests have PII replaced with `⟦TYPE_n⟧` tokens. Inbound SSE streams are transformed through a **buffering reassembler** that correctly handles tokens split across chunk boundaries — no naive per-chunk `.replace()`.

**Ephemeral token maps** — The bidirectional `real value <-> token` mapping lives only for the duration of one request/response round-trip. It is never persisted.

## Install

```bash
git clone git@github.com:andycufari/PromptGuardian.git
cd PromptGuardian
npm install
npm run build
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Usage

Click the extension icon to open the popup. There are three ways to protect your data:

### 1. Presets (built-in detectors)

Toggle on/off the built-in rules. Enabled by default: Email, CUIT/CUIL, Argentine Phone, Credit Card (Luhn-validated). Disabled by default: IPv4, DNI (raw 7-8 digits — high false-positive rate).

### 2. Custom Regex

Add your own regex patterns. Example:

| Field        | Value             |
|--------------|-------------------|
| Label        | `Passport`        |
| Token type   | `PASSPORT`        |
| Pattern      | `[A-Z]{3}\d{6}`   |
| Flags        | `gi`              |

The regex is validated live — if it doesn't compile, you'll see an inline error.

### 3. Plain Values (recommended for personal data)

Add literal strings you want to protect. This is the simplest and most reliable option.

| Field       | What to enter                         |
|-------------|---------------------------------------|
| **Value**   | The actual text to hide (your name, ID number, address, etc.) |
| **Token type** | A short label — becomes part of the placeholder. Use simple alphanumeric like `NAME`, `DNI`, `ADDRESS` |
| **Accent-insensitive** | Check this if you want `Andres` to also match `Andres` |

**Example:** To protect your name "Juan Perez":
- Value: `Juan Perez`
- Token type: `NAME`
- ChatGPT will see: `⟦NAME_1⟧`
- You'll see the reply with `Juan Perez` swapped back in

> **Tip:** The token type should be a simple label, not the value itself. Use `NAME` not `Juan Perez`. Use `DNI` not `12345678`.

### Badge

A small overlay on the ChatGPT page shows live protection status:
- **🛡️ N anonymized** (amber) — N values were replaced in your last message
- **🛡️ ready** (green) — extension is active, waiting for input
- **⚠️ not protected** (red) — interception failed or master toggle is off

### Master toggle

The switch in the top-right corner of the popup enables/disables all protection globally.

### Attachments

Files (images, PDFs) are **not anonymized** in v1. When you attach a file, a blocking dialog warns you before sending.

## Testing

```bash
npm test
```

23 unit tests covering detection precedence, span-locking, Luhn validation, round-trip identity, and SSE reassembler split-token correctness at every byte boundary.

## Security note

v1 stores the rule vault as **plain JSON** in `chrome.storage.local`. This protects your PII from the AI model, not from local disk access. The storage abstraction (`getVault`/`setVault`) is designed as a single seam where encryption can drop in later.

## Stack

- TypeScript (strict mode)
- Vite (bundler)
- Vitest (tests)
- Manifest V3
- No frameworks — plain TS + DOM

## License

ISC
