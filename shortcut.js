// shortcut format: modifiers in fixed order + the physical key code, e.g. "meta+shift+Space", "ctrl+alt+KeyV"
const SC_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const SC_MODS = ['ctrl', 'alt', 'shift', 'meta'];
const SC_LEGACY = { 'mod+shift+space': SC_MAC ? 'shift+meta+Space' : 'ctrl+shift+Space', 'alt+shift+v': 'alt+shift+KeyV', 'ctrl+shift+m': 'ctrl+shift+KeyM' };
const scNormalize = s => SC_LEGACY[s] || s || 'off';
const scFromEvent = e => [...SC_MODS.filter(m => e[m + 'Key']), e.code].join('+');
const scMatches = (s, e) => { s = scNormalize(s); return s !== 'off' && s === scFromEvent(e); };
function scLabel(s) {
  s = scNormalize(s);
  if (s === 'off') return 'Off';
  const parts = s.split('+'), code = parts.pop();
  const sym = SC_MAC ? { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' } : { ctrl: 'Ctrl+', alt: 'Alt+', shift: 'Shift+', meta: 'Win+' };
  const key = code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ')
    .replace(/^Arrow(\w+)/, (_, d) => ({ Up: '↑', Down: '↓', Left: '←', Right: '→' }[d]))
    .replace(/^(Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/,
      k => ({ Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' }[k]));
  return parts.map(m => sym[m]).join('') + key;
}
