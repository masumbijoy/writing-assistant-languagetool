# Writing Assistant (Chrome extension)

A Manifest V3 Chrome extension that checks spelling, grammar and style as you type in any text box, with one-click fixes. No AI model and no API key: it uses the free [LanguageTool](https://languagetool.org) public API plus built-in rules.

## Features

- **Live checking** in `<textarea>`, text/search `<input>` and `contenteditable` editors (Gmail, WhatsApp Web, Slack…). Password, card, CVV, one-time-code and similar sensitive fields are skipped.
- **Inline underlines** colour-coded by type (red = spelling, blue = grammar, purple = style), with a popover of suggestions per issue.
- **Badge + panel** showing the issue count, with per-item fixes and **Fix all**.
- **Professional & polite tone** rules (English only): informal words → formal, contractions → full forms, softer requests, adds "please" to bare imperatives.
- **Picky mode** (LanguageTool `level=picky`) and optional **auto-fix of spelling** mistakes.
- **Voice input**: speak Bangla (bn-BD / bn-IN), English text is typed at the cursor (Chrome speech recognition + MyMemory translation).
- Language: auto-detect, English (US/UK), German, French, Spanish. Mostly non-Latin text is skipped in auto mode.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Use the toolbar popup to toggle features, pick languages, or turn checking off for the current site.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: `storage` permission, host access to LanguageTool and MyMemory, content script on all URLs |
| `background.js` | Service worker: calls LanguageTool, filters unreliable spelling hits, adds tone rules, proxies translation |
| `content.js` | Text extraction/DOM mapping, underline geometry, safe replacement in plain and rich editors, badge/panel/popover UI (Shadow DOM), voice input |
| `popup.html` / `popup.js` | Settings UI stored in `chrome.storage.sync` |
| `icons/` | 16/32/48/128 px icons |

## Privacy

Text you type in any editable field is sent to `api.languagetool.org` for checking, and voice transcripts are sent to `api.mymemory.translated.net` for translation. Turn it off for a site (popup → On this site) or globally (popup → Enabled) where you type confidential text.

## Limits

The free LanguageTool API is rate-limited (about 20 requests/min, 20k characters per request; the extension stops at 19,000 characters). MyMemory has a daily free quota.
