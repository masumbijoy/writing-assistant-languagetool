const $ = id => document.getElementById(id);
{ const m = chrome.runtime.getManifest(); $('ver').textContent = 'v' + (m.version_name || m.version); }
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

// voice shortcut: show the current keys; Chrome only lets users change them on its own shortcuts page
chrome.commands.getAll(cmds => {
  const c = cmds.find(x => x.name === 'toggle-voice');
  if (c && c.shortcut) $('shortcut').textContent = c.shortcut;
});
$('changeShortcut').addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
