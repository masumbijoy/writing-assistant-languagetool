# Writing Assistant (Chrome extension)

A Manifest V3 Chrome extension that checks spelling, grammar and style as you type in any text box, with one-click fixes. No AI model and no API key: it uses the free [LanguageTool](https://languagetool.org) public API plus built-in rules.

## Features

- **Live checking** in `<textarea>`, text/search `<input>` and `contenteditable` editors (Gmail, WhatsApp Web, Slack…). Password, card, CVV, one-time-code and similar sensitive fields are skipped.
- **Inline underlines** colour-coded by type (red = spelling, blue = grammar, purple = style), with a popover of suggestions per issue.
- **Badge + panel** showing the issue count, with per-item fixes and **Fix all**.
- **Professional & polite tone** rules (English only): informal words → formal, contractions → full forms, softer requests, adds "please" to bare imperatives.
- **Picky mode** (LanguageTool `level=picky`) and optional **auto-fix of spelling** mistakes.
- **Voice input**: speak Bangla (bn-BD / bn-IN); English text (translated) or Bangla text is typed at the cursor (Chrome speech recognition + MyMemory translation). Click the blue mic, or press **⌘⇧Space** (Mac) / **Ctrl+Shift+Space** (Windows/Linux) in a text field to start and stop. A second shortcut, **⇧⌘B** (Mac) / **Ctrl+Shift+B** by default, types what you say in **Bangla** without translating. To use your own shortcuts, open the popup, click a shortcut box and press any combination (with Ctrl, Alt/Option or Cmd, or an F-key); **Turn off** and **Reset** are next to it.
- Language: auto-detect, English (US/UK), German, French, Spanish. Mostly non-Latin text is skipped in auto mode.

## Build

```bash
./build.sh
```

Creates `dist/writing-assistant/` (only the extension files) and `dist/writing-assistant-<version>.zip`. The version number is shown on `chrome://extensions`, under the popup title, and in the mic tooltip, so you can tell which build is loaded.

## Install (developer mode)

1. Run `./build.sh` (or skip it and use this folder directly).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select `dist/writing-assistant`.
4. Use the toolbar popup to toggle features, pick languages, or turn checking off for the current site.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: `storage` permission, host access to LanguageTool and MyMemory, content script on all URLs |
| `background.js` | Service worker: calls LanguageTool, filters unreliable spelling hits, adds tone rules, proxies translation |
| `shortcut.js` | Shared helpers to record, match and display the custom voice shortcut |
| `content.js` | Text extraction/DOM mapping, underline geometry, safe replacement in plain and rich editors, badge/panel/popover UI (Shadow DOM), voice input |
| `popup.html` / `popup.js` | Settings UI stored in `chrome.storage.sync` |
| `icons/` | 16/32/48/128 px icons |

## Privacy

Text you type in any editable field is sent to `api.languagetool.org` for checking, and voice transcripts are sent to `api.mymemory.translated.net` for translation. Turn it off for a site (popup → On this site) or globally (popup → Enabled) where you type confidential text.

## Limits

The free LanguageTool API is rate-limited (about 20 requests/min, 20k characters per request; the extension stops at 19,000 characters). MyMemory has a daily free quota.
