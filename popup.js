const $ = id => document.getElementById(id);
{ const m = chrome.runtime.getManifest(); $('ver').textContent = 'v' + m.version; }
chrome.storage.sync.get(null, s => {
  for (const k of ['enabled', 'tone', 'picky', 'autoFix']) $(k).checked = s[k] === undefined ? k !== 'autoFix' : s[k];
  $('voiceLang').value = s.voiceLang || 'bn-BD';
  $('language').value = s.language && s.language !== 'Bengali' ? s.language : 'auto';
});
for (const k of ['enabled', 'tone', 'picky', 'autoFix']) $(k).addEventListener('change', () => chrome.storage.sync.set({ [k]: $(k).checked }));
$('language').addEventListener('change', () => chrome.storage.sync.set({ language: $('language').value }));
$('voiceLang').addEventListener('change', () => chrome.storage.sync.set({ voiceLang: $('voiceLang').value }));

// per-site switch (activeTab gives the current tab's URL only while the popup is open)
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  let host = '';
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch (_) {}
  if (!host) return;
  $('host').textContent = '(' + host + ')';
  $('siteRow').hidden = false;
  chrome.storage.sync.get({ disabledSites: [] }, s => { $('site').checked = !s.disabledSites.includes(host); });
  $('site').addEventListener('change', () => chrome.storage.sync.get({ disabledSites: [] }, s => {
    const list = s.disabledSites.filter(h => h !== host);
    if (!$('site').checked) list.push(host);
    chrome.storage.sync.set({ disabledSites: list });
  }));
});



// ---- custom voice shortcut: click the box, press any combination ----
const DEFAULT_KEY = SC_MAC ? 'shift+meta+Space' : 'ctrl+shift+Space';
const RESERVED = { 'meta+Space': 'macOS Spotlight', 'ctrl+Space': 'macOS input switching', 'meta+KeyQ': 'Quit Chrome', 'meta+KeyW': 'Close tab',
  'ctrl+KeyW': 'Close tab', 'meta+KeyT': 'New tab', 'ctrl+KeyT': 'New tab', 'meta+KeyN': 'New window', 'ctrl+KeyN': 'New window',
  'meta+KeyC': 'Copy', 'ctrl+KeyC': 'Copy', 'meta+KeyV': 'Paste', 'ctrl+KeyV': 'Paste', 'meta+KeyX': 'Cut', 'ctrl+KeyX': 'Cut',
  'meta+KeyA': 'Select all', 'ctrl+KeyA': 'Select all', 'meta+KeyZ': 'Undo', 'ctrl+KeyZ': 'Undo', 'meta+Tab': 'App switcher', 'alt+Tab': 'App switcher' };
let recording = false;
const hint = (t, err) => { $('scMsg').textContent = t || ''; $('scMsg').className = 'hint' + (err ? ' err' : ''); };
const show = k => { $('scBox').textContent = scLabel(k); $('scBox').classList.remove('on'); recording = false; };
const save = k => chrome.storage.sync.set({ voiceKey: k }, () => { show(k); hint(k === 'off' ? 'Shortcut is off. Use the blue mic button.' : 'Saved. Reload open tabs to use it there.'); });
chrome.storage.sync.get({ voiceKey: DEFAULT_KEY }, s => show(s.voiceKey));
$('scBox').addEventListener('click', () => { recording = true; $('scBox').textContent = 'Press keys…'; $('scBox').classList.add('on'); hint('Press Esc to cancel'); });
$('scOff').addEventListener('click', () => save('off'));
$('scReset').addEventListener('click', () => save(DEFAULT_KEY));
document.addEventListener('keydown', e => {
  if (!recording) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { chrome.storage.sync.get({ voiceKey: DEFAULT_KEY }, s => show(s.voiceKey)); return hint(''); }
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'CapsLock', 'Fn'].includes(e.key)) return; // wait for the main key
  const k = scFromEvent(e);
  const fn = /^F([1-9]|1[0-9])$/.test(e.code);
  if (!fn && !(e.ctrlKey || e.altKey || e.metaKey)) return hint('Use Ctrl, ' + (SC_MAC ? '⌥ Option or ⌘ Cmd' : 'Alt or Win') + ' with a key (or an F-key), so normal typing is not taken over', true);
  const bare = k.replace(/^(shift\+)/, '').replace(/\+shift\+/, '+');
  if (RESERVED[k] || RESERVED[bare] && !e.shiftKey) return hint(scLabel(k) + ' is used by ' + (RESERVED[k] || RESERVED[bare]) + '. Try another.', true);
  save(k);
}, true);
