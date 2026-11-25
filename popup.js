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



// ---- custom voice shortcuts: click a box, press any combination ----
const RESERVED = { 'meta+Space': 'macOS Spotlight', 'ctrl+Space': 'macOS input switching', 'meta+KeyQ': 'Quit Chrome', 'meta+KeyW': 'Close tab',
  'ctrl+KeyW': 'Close tab', 'meta+KeyT': 'New tab', 'ctrl+KeyT': 'New tab', 'meta+KeyN': 'New window', 'ctrl+KeyN': 'New window',
  'meta+KeyC': 'Copy', 'ctrl+KeyC': 'Copy', 'meta+KeyV': 'Paste', 'ctrl+KeyV': 'Paste', 'meta+KeyX': 'Cut', 'ctrl+KeyX': 'Cut',
  'meta+KeyA': 'Select all', 'ctrl+KeyA': 'Select all', 'meta+KeyZ': 'Undo', 'ctrl+KeyZ': 'Undo', 'meta+Tab': 'App switcher', 'alt+Tab': 'App switcher' };
const RECORDERS = [
  { key: 'voiceKey', def: SC_MAC ? 'shift+meta+Space' : 'ctrl+shift+Space', box: 'scBox', off: 'scOff', reset: 'scReset', msg: 'scMsg', other: 'voiceKeyBn' },
  { key: 'voiceKeyBn', def: SC_DEFAULT_BN, box: 'scBoxBn', off: 'scOffBn', reset: 'scResetBn', msg: 'scMsgBn', other: 'voiceKey' }
];
let recording = null; // the recorder waiting for keys
const hint = (r, t, err) => { $(r.msg).textContent = t || ''; $(r.msg).className = 'hint' + (err ? ' err' : ''); };
const show = (r, k) => { $(r.box).textContent = scLabel(k); $(r.box).classList.remove('on'); if (recording === r) recording = null; };
const current = (r, cb) => chrome.storage.sync.get({ [r.key]: r.def }, s => cb(s[r.key]));
const save = (r, k) => chrome.storage.sync.set({ [r.key]: k }, () => { show(r, k); hint(r, k === 'off' ? 'Shortcut is off.' : 'Saved. Reload open tabs to use it there.'); });
for (const r of RECORDERS) {
  current(r, k => show(r, k));
  $(r.box).addEventListener('click', () => {
    if (recording && recording !== r) { current(recording, k => show(recording, k)); hint(recording, ''); }
    recording = r; $(r.box).textContent = 'Press keys…'; $(r.box).classList.add('on'); hint(r, 'Press Esc to cancel');
  });
  $(r.off).addEventListener('click', () => save(r, 'off'));
  $(r.reset).addEventListener('click', () => save(r, r.def));
}
document.addEventListener('keydown', e => {
  const r = recording;
  if (!r) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { current(r, k => show(r, k)); return hint(r, ''); }
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'CapsLock', 'Fn'].includes(e.key)) return; // wait for the main key
  const k = scFromEvent(e);
  const fn = /^F([1-9]|1[0-9])$/.test(e.code);
  if (!fn && !(e.ctrlKey || e.altKey || e.metaKey)) return hint(r, 'Use Ctrl, ' + (SC_MAC ? '⌥ Option or ⌘ Cmd' : 'Alt or Win') + ' with a key (or an F-key), so normal typing is not taken over', true);
  const bare = k.replace(/^(shift\+)/, '').replace(/\+shift\+/, '+');
  if (RESERVED[k] || RESERVED[bare] && !e.shiftKey) return hint(r, scLabel(k) + ' is used by ' + (RESERVED[k] || RESERVED[bare]) + '. Try another.', true);
  const o = RECORDERS.find(x => x.key === r.other);
  current(o, ok => { if (scNormalize(ok) === k) return hint(r, scLabel(k) + ' is already your other voice shortcut. Try another.', true); save(r, k); });
}, true);
