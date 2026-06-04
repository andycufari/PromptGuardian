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

### Quick install (no build needed)

1. Download or clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `dist/` folder

### From source

```bash
git clone git@github.com:andycufari/PromptGuardian.git
cd PromptGuardian
npm install
npm run build
```

Then load the `dist/` folder in `chrome://extensions` as above.

## Usage

Click the extension icon to open the popup.

### Protect a value

The main way to use PromptGuardian. Just type what you want to hide:

1. Enter the text (your name, ID number, address, etc.)
2. Pick a category (Name, ID, Address, Phone, Company, Other)
3. Click **PROTECT**

That's it. The category automatically determines what ChatGPT sees instead of your real data. For example, if you protect "Juan Perez" with category **Name**, ChatGPT will see `NAME_1` instead.

Want to customize the replacement label? Click **"Replace by"** to expand and type your own.

Check **"Ignore accents"** if you want `Andres` to also catch `Andres`.

### Auto-detection

Built-in rules that automatically detect common patterns in your messages. Toggle them on/off:

- **Email** — on by default
- **CUIT/CUIL** — on by default
- **Phone (AR)** — on by default
- **Credit Card** — on by default (with Luhn validation to reduce false matches)
- **IPv4** — off by default
- **DNI (raw digits)** — off by default (may over-match any 7-8 digit number)

### Advanced: custom patterns

Hidden by default. Click to expand. Add your own regex patterns for advanced matching.

### Badge

A small overlay on the ChatGPT page shows live protection status:
- **N anonymized** (amber) — N values were replaced in your last message
- **ready** (green) — extension is active, waiting for input
- **not protected** (red) — interception failed or master toggle is off

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
