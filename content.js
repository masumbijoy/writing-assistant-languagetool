(() => {
  let settings = { enabled: true, picky: true, autoFix: false, tone: true, voiceLang: 'bn-BD', language: 'auto', disabledSites: [] };
  // the top page's host, also inside cross-origin iframes, so "off on this site" covers embedded editors too
  const SITE = (() => {
    try { const a = location.ancestorOrigins; return new URL(a && a.length ? a[a.length - 1] : location.href).hostname; } catch (_) { return location.hostname; }
  })();
  const isOn = () => settings.enabled && !(settings.disabledSites || []).includes(SITE);
  chrome.storage.sync.get(settings, s => { settings = { ...settings, ...s }; });
  chrome.storage.onChanged.addListener(ch => {
    for (const k in ch) settings[k] = ch[k].newValue;
    if (!isOn()) { matches = []; hideUI(); } else if (active) schedule(300);
  });

  let active = null, timer = null, matches = [], seq = 0, applying = false, busy = false, status = '';
  let host, root, badge, panel, layer, pop, mic, rafId = 0, wd = null, voiceState = '', rec = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const isPlain = el => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  const isEditable = el => el && (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && ['text', 'search', ''].includes((el.getAttribute('type') || '').toLowerCase())) ||
    el.isContentEditable);
  // never send card numbers, one-time codes, IDs and similar fields to the checking service
  const SENSITIVE_AC = /cc-|one-time-code|password|transaction|bday|username|email|tel/i;
  const SENSITIVE_NAME = /card|cvv|cvc|ccv|ssn|social.?sec|otp|passcode|iban|swift|routing|account.?(no|num)|\bpin\b|tax.?id|passport/i;
  const isSensitive = el => el.type === 'password' || SENSITIVE_AC.test(el.getAttribute('autocomplete') || '') ||
    /numeric|decimal|tel|email/i.test(el.getAttribute('inputmode') || '') ||
    SENSITIVE_NAME.test([el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder')].filter(Boolean).join(' '));

  // ---------- text <-> DOM mapping ----------
  function blockOf(node, rootEl) {
    let n = node.parentNode;
    while (n && n !== rootEl) {
      if (n.nodeType === 1 && /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|PRE|TR)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return rootEl;
  }
  function extract(el) {
    if (isPlain(el)) return { text: el.value, segs: null };
    const segs = []; let text = '', last = null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const b = blockOf(n, el);
      if (last && b !== last) text += '\n';
      last = b;
      segs.push({ node: n, start: text.length, end: text.length + n.nodeValue.length });
      text += n.nodeValue;
    }
    return { text, segs };
  }
  function locate(segs, off, isEnd) {
    for (const s of segs) if (off >= s.start && (off < s.end || (isEnd && off <= s.end))) return { node: s.node, offset: off - s.start };
    return null;
  }
  function nearest(text, orig, around) {
    let best = -1, i = -1;
    while ((i = text.indexOf(orig, i + 1)) >= 0) if (best < 0 || Math.abs(i - around) < Math.abs(best - around)) best = i;
    return best;
  }

  // ---------- geometry ----------
  const MIRROR = ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontFamily', 'lineHeight', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize', 'direction'];
  function computeRects() {
    const out = matches.map(() => []);
    if (!active || !matches.length) return out;
    const box = active.getBoundingClientRect();
    if (isPlain(active)) {
      const cs = getComputedStyle(active), d = document.createElement('div');
      MIRROR.forEach(p => { d.style[p] = cs[p]; });
      d.style.position = 'fixed'; d.style.visibility = 'hidden'; d.style.pointerEvents = 'none';
      d.style.left = box.left + 'px'; d.style.top = box.top + 'px';
      d.style.whiteSpace = active.tagName === 'INPUT' ? 'pre' : 'pre-wrap';
      d.style.overflowWrap = 'break-word';
      d.textContent = active.value;
      document.body.appendChild(d);
      const tn = d.firstChild;
      matches.forEach((m, i) => {
        if (!tn) return;
        try {
          const r = document.createRange(); r.setStart(tn, m.offset); r.setEnd(tn, Math.min(m.offset + m.length, tn.length));
          out[i] = [...r.getClientRects()].map(q => ({ left: q.left - active.scrollLeft, top: q.top - active.scrollTop, width: q.width, height: q.height }));
        } catch (_) {}
      });
      d.remove();
    } else {
      const cur = extract(active);
      matches.forEach((m, i) => {
        const a = locate(cur.segs, m.offset, false), z = locate(cur.segs, m.offset + m.length, true);
        if (!a || !z) return;
        try {
          const r = document.createRange(); r.setStart(a.node, a.offset); r.setEnd(z.node, z.offset);
          out[i] = [...r.getClientRects()].map(q => ({ left: q.left, top: q.top, width: q.width, height: q.height }));
        } catch (_) {}
      });
    }
    // keep only the part inside the visible field
    return out.map(list => list.filter(q => q.width > 0 && q.top + q.height > box.top && q.top < box.bottom && q.left < box.right && q.left + q.width > box.left));
  }

  // ---------- applying fixes ----------
  let lastKey = 0;
  document.addEventListener('keydown', () => { lastKey = performance.now(); }, true);
  function pointToOffset(segs, node, off) {
    if (!segs.length) return 0;
    for (const s of segs) if (s.node === node) return s.start + Math.min(off, s.end - s.start);
    let pos = 0;
    try {
      const r = document.createRange(); r.setStart(node, off); r.collapse(true);
      for (const s of segs) { if (r.comparePoint(s.node, s.node.length) <= 0) pos = s.end; }
    } catch (_) {}
    return pos;
  }
  function saveSel(el, segs) {
    const sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    return { s: pointToOffset(segs, r.startContainer, r.startOffset), e: pointToOffset(segs, r.endContainer, r.endOffset) };
  }
  // put the user's cursor/selection back, shifted for the replaced text, so typing continues where they were
  function restoreSel(el, saved, off, len, repLen) {
    if (!saved) return;
    const adj = p => repLen === null || p <= off ? p : p >= off + len ? p + repLen - len : off + repLen;
    const cur = extract(el);
    const a = locate(cur.segs, adj(saved.s), true), z = locate(cur.segs, adj(saved.e), true);
    if (!a || !z) return;
    const r = document.createRange(); r.setStart(a.node, a.offset); r.setEnd(z.node, z.offset);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  const norm = s => s.replace(/\u00a0/g, ' ');
  async function replaceRange(el, off, len, rep) {
    if (isPlain(el)) {
      const v = el.value, caret = el.selectionStart;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, v.slice(0, off) + rep + v.slice(off + len));
      const nc = caret > off + len ? caret + rep.length - len : (caret > off ? off + rep.length : caret);
      const put = () => { try { el.setSelectionRange(nc, nc); } catch (_) {} };
      put();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      put(); requestAnimationFrame(put); // frameworks may move the caret to the end after re-rendering
      return true;
    }
    // rich editors (WhatsApp, Gmail, Slack...): select, let the editor register it, edit, verify, then put the cursor back
    const cur = extract(el);
    const before = cur.text;
    const saved = saveSel(el, cur.segs);
    const t0 = performance.now();
    const a = locate(cur.segs, off, false), z = locate(cur.segs, off + len, true);
    if (!a || !z) return false;
    const r = document.createRange(); r.setStart(a.node, a.offset); r.setEnd(z.node, z.offset);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    await sleep(45);
    const want = norm(before.substr(off, len)).replace(/\s+/g, '');
    if (lastKey > t0 || extract(el).text !== before || norm(getSelection().toString()).replace(/\s+/g, '') !== want) {
      restoreSel(el, saved, off, len, null); return false; // user typed or selection didn't take: change nothing
    }
    if (rep === '') document.execCommand('delete'); else document.execCommand('insertText', false, rep);
    await sleep(45);
    if (lastKey > t0) return true; // user kept typing: leave their text and cursor alone
    const expected = norm(before.slice(0, off) + rep + before.slice(off + len));
    if (norm(extract(el).text) !== expected) { document.execCommand('undo'); await sleep(45); restoreSel(el, saved, off, len, null); return false; }
    restoreSel(el, saved, off, len, rep.length);
    return true;
  }
  // verifies the text is still what we checked before touching it
  async function applyOne(m, rep) {
    const { text } = extract(active);
    let off = m.offset;
    if (text.substr(off, m.length) !== m.original) { off = nearest(text, m.original, m.offset); if (off < 0) return false; }
    return (await replaceRange(active, off, m.length, rep)) ? off : false;
  }
  async function pickReplacement(m, rep) {
    if (!active || busy) return;
    applying = true;
    const off = await applyOne(m, rep);
    applying = false;
    matches = matches.filter(x => x !== m);
    if (off !== false) {
      const delta = rep.length - m.length;
      matches.forEach(x => { if (x.offset > m.offset) x.offset += delta; });
    }
    closePop(); render(); schedule(1200);
  }
  async function fixAll() {
    if (!active || busy) return;
    busy = true; applying = true; closePop();
    const list = matches.filter(m => m.replacements.length).sort((a, b) => b.offset - a.offset); // end → start keeps offsets valid
    for (const m of list) { if (!active) break; await applyOne(m, m.replacements[0]); await sleep(60); }
    applying = false; busy = false; matches = [];
    render(); schedule(500);
  }

  // ---------- checking ----------
  function schedule(delay = 900) {
    clearTimeout(timer);
    if (!isOn() || !active) return;
    timer = setTimeout(runCheck, delay);
  }
  function runCheck() {
    if (!active || !isOn() || busy) return;
    const { text } = extract(active);
    if (text.trim().length < 3) { matches = []; status = ''; render(); return; }
    if (text.length > 19000) { status = 'Text too long'; render(); return; }
    const my = ++seq;
    status = 'Checking…'; render();
    clearTimeout(wd);
    wd = setTimeout(() => { if (my === seq && status === 'Checking…') { status = 'warn:Check timed out, keep typing to retry'; render(); } }, 25000);
    chrome.runtime.sendMessage({ type: 'check', text, language: settings.language, picky: settings.picky, tone: settings.tone }, res => {
      if (my !== seq || !active) return;
      if (chrome.runtime.lastError || !res || !res.ok) { status = 'warn:' + ((res && res.error) || 'Check failed'); render(); return; }
      clearTimeout(wd);
      const changed = extract(active).text !== text; // user kept typing meanwhile
      status = '';
      matches = res.matches.map(m => ({ ...m, original: text.substr(m.offset, m.length) }));
      if (changed) { revalidate(); schedule(600); }
      else if (settings.autoFix) autoFix(text);
      render();
    });
  }
  async function autoFix(text) {
    const lastWord = text.search(/\S+$/);
    const typos = matches.filter(m => m.issueType === 'misspelling' && m.replacements.length && (/\s$/.test(text) || m.offset < lastWord));
    if (!typos.length || busy) return;
    busy = true; applying = true;
    for (const m of typos.sort((a, b) => b.offset - a.offset)) { if (!active) break; await applyOne(m, m.replacements[0]); }
    applying = false; busy = false;
    matches = matches.filter(m => !typos.includes(m));
    render(); schedule(500);
  }
  function revalidate() {
    if (!active || !matches.length) return;
    const { text } = extract(active);
    matches = matches.filter(m => {
      if (text.substr(m.offset, m.length) === m.original) return true;
      const o = nearest(text, m.original, m.offset);
      if (o >= 0 && Math.abs(o - m.offset) <= 40) { m.offset = o; return true; }
      return false;
    });
  }

  // ---------- UI ----------
  const COLORS = { misspelling: '#dc2626', grammar: '#2563eb', style: '#7c3aed' };
  const LABELS = { misspelling: 'Spelling', grammar: 'Grammar', style: 'Style' };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ensureUI() {
    if (host) return;
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
      #layer{position:fixed;left:0;top:0;pointer-events:none}
      .ul{position:fixed;border-bottom:2px solid;background:rgba(220,38,38,.08);pointer-events:none}
      .badge{position:fixed;display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:#16a34a;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);user-select:none;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .badge.issues{background:#dc2626}.badge.busy{background:#6b7280}.badge.warn{background:#d97706}
      .mic{position:fixed;display:none;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#2563eb;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);user-select:none}
      .mic.on{background:#dc2626;animation:pulse 1s infinite}.mic.busy{background:#6b7280}
      @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.6)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}
      .box{position:fixed;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.28);font-size:13px;line-height:1.35}
      .pop{width:260px;padding:10px}
      .panel{width:330px;max-height:320px;overflow:auto}
      .tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:3px}
      .msg{color:#4b5563;margin:2px 0 8px}
      .rep{display:inline-block;margin:0 6px 4px 0;padding:4px 10px;border-radius:7px;border:1px solid #86efac;background:#f0fdf4;color:#166534;cursor:pointer;font-size:13px;font-weight:600}
      .rep:hover{background:#dcfce7}
      .ign{border:0;background:none;color:#6b7280;cursor:pointer;font-size:12px;padding:4px 2px}
      .head{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff}
      .fix{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px}
      .item{padding:8px 10px;border-bottom:1px solid #f3f4f6}.old{text-decoration:line-through;color:#dc2626;margin-right:6px}
      .ok{padding:14px;text-align:center;color:#16a34a}
    </style><div id="layer"></div><div class="badge" id="b"></div><div class="mic" id="mic"></div><div class="box panel" id="p" hidden></div><div class="box pop" id="pop" hidden></div>`;
    layer = root.getElementById('layer'); badge = root.getElementById('b'); panel = root.getElementById('p'); pop = root.getElementById('pop');
    mic = root.getElementById('mic');
    mic.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
    mic.addEventListener('click', toggleMic);
    for (const el of [badge, panel, pop, mic]) el.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
    badge.addEventListener('click', () => { closePop(); panel.hidden = !panel.hidden; render(); });
    document.documentElement.appendChild(host);
  }
  function hideUI() { if (host) { layer.innerHTML = ''; badge.style.display = 'none'; mic.style.display = 'none'; panel.hidden = true; pop.hidden = true; } }
  function closePop() { if (pop) pop.hidden = true; }

  function caretRect() {
    const box = active.getBoundingClientRect();
    try {
      if (isPlain(active)) {
        const cs = getComputedStyle(active), d = document.createElement('div');
        MIRROR.forEach(p => { d.style[p] = cs[p]; });
        d.style.position = 'fixed'; d.style.visibility = 'hidden'; d.style.pointerEvents = 'none';
        d.style.left = box.left + 'px'; d.style.top = box.top + 'px';
        d.style.whiteSpace = active.tagName === 'INPUT' ? 'pre' : 'pre-wrap'; d.style.overflowWrap = 'break-word';
        d.textContent = active.value; // anchor at the END of the text so the badge never covers it
        const s = document.createElement('span'); s.textContent = '\u200b'; d.appendChild(s);
        document.body.appendChild(d);
        const q = s.getBoundingClientRect(); d.remove();
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        return { left: q.left - active.scrollLeft, top: q.top - active.scrollTop, height: q.height || lh };
      }
      const cur = extract(active), last = cur.segs[cur.segs.length - 1];
      if (last) {
        const r = document.createRange(); r.setStart(last.node, last.node.length); r.collapse(true);
        const q = r.getBoundingClientRect();
        if (q.height > 0) return { left: q.right, top: q.top, height: q.height };
      }
    } catch (_) {}
    return { left: box.left + 12, top: box.top, height: Math.min(box.height, 24) };
  }

  let rectCache = [];
  function render() {
    if (!active || !isOn()) return hideUI();
    ensureUI();
    revalidate();
    const box = active.getBoundingClientRect();
    if (box.width === 0 || box.bottom < 0 || box.top > innerHeight) return hideUI();

    // underlines directly under the words
    rectCache = computeRects();
    layer.innerHTML = '';
    matches.forEach((m, i) => {
      const c = COLORS[m.issueType] || COLORS.grammar;
      rectCache[i].forEach(q => {
        const u = document.createElement('div'); u.className = 'ul';
        u.style.cssText = `left:${q.left}px;top:${q.top}px;width:${q.width}px;height:${q.height}px;border-color:${c};background:${c}14`;
        layer.appendChild(u);
      });
    });

    // badge + mic live together at the right end of the field (never over the text or placeholder)
    // empty box: only the mic is shown; the green badge appears once you start typing
    if (extract(active).text.trim() === '' && !status.startsWith('warn:')) { badge.style.display = 'none'; panel.hidden = true; placeMic(box, 0); return; }
    const n = matches.length;
    let txt, cls = '', tip;
    if (status.startsWith('warn:')) { txt = '!'; cls = 'warn'; tip = status.slice(5); }
    else if (status) { txt = '…'; cls = 'busy'; tip = status; }
    else if (n) { txt = String(n); cls = 'issues'; tip = `${n} issue${n > 1 ? 's' : ''} - click to review`; }
    else { txt = '✓'; tip = 'Looks good'; }
    badge.textContent = txt; badge.title = tip; badge.className = 'badge ' + cls; badge.style.display = 'flex';
    const bw = badge.offsetWidth, bh = badge.offsetHeight;
    const mp = placeMic(box, bw);
    let bx = mp.mx - bw - 6;                       // just left of the mic
    let by = mp.my + mp.mh / 2 - bh / 2;           // same line as the mic
    bx = Math.max(box.left + 4, Math.min(innerWidth - bw - 4, bx));
    by = Math.max(4, Math.min(innerHeight - bh - 4, by));
    badge.style.left = bx + 'px'; badge.style.top = by + 'px';

    if (!panel.hidden) {
      if (!n) panel.innerHTML = status.startsWith('warn:') ? `<div class="ok" style="color:#d97706">${esc(status.slice(5))}</div>` : status ? `<div class="ok" style="color:#6b7280">${esc(status)}</div>` : '<div class="ok">No issues found 🎉</div>';
      else {
        panel.innerHTML = `<div class="head"><b>${n} suggestion${n > 1 ? 's' : ''}</b><button class="fix" id="all">Fix all</button></div>` +
          matches.map((m, i) => `<div class="item"><div><span class="old">${esc(m.original) || '␣'}</span><button class="rep" data-i="${i}">${esc(m.replacements[0]) || '(remove)'}</button></div><div class="msg" style="margin:0">${esc(m.message)}</div></div>`).join('');
        root.getElementById('all').onclick = fixAll;
        panel.querySelectorAll('.rep').forEach(b => { b.onclick = () => { const m = matches[+b.dataset.i]; pickReplacement(m, m.replacements[0]); }; });
      }
      const ph = panel.offsetHeight, pw = panel.offsetWidth;
      panel.style.left = Math.max(4, Math.min(innerWidth - pw - 4, bx + bw - pw)) + 'px';
      panel.style.top = (by + bh + 6 + ph < innerHeight ? by + bh + 6 : Math.max(4, by - ph - 6)) + 'px';
    }
  }
  function schedRender() { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; render(); }); }

  function openPopFor(i) {
    const m = matches[i], rects = rectCache[i];
    if (!m || !rects || !rects.length) return;
    const q = rects[0], c = COLORS[m.issueType] || COLORS.grammar;
    panel.hidden = true;
    pop.innerHTML = `<div class="tag" style="color:${c}">${LABELS[m.issueType] || 'Suggestion'}</div><div class="msg">${esc(m.message)}</div>` +
      m.replacements.map((r, j) => `<button class="rep" data-j="${j}">${esc(r) || '(remove)'}</button>`).join('') +
      `<div><button class="ign" id="ign">Ignore</button></div>`;
    pop.hidden = false;
    pop.querySelectorAll('.rep').forEach(b => { b.onclick = () => pickReplacement(m, m.replacements[+b.dataset.j]); });
    root.getElementById('ign').onclick = () => { matches = matches.filter(x => x !== m); closePop(); render(); };
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(4, Math.min(innerWidth - pw - 4, q.left)) + 'px';
    pop.style.top = (q.top + q.height + 6 + ph < innerHeight ? q.top + q.height + 6 : Math.max(4, q.top - ph - 6)) + 'px';
  }


  // ---------- voice: speak Bangla -> English text ----------
  // blue mic: inside the field, on the first text line, at the right end (next to the site's own mic icon)
  function placeMic(box, bw) {
    mic.style.display = 'flex';
    mic.className = 'mic ' + (voiceState === 'listening' ? 'on' : voiceState === 'busy' ? 'busy' : '');
    const sc = voiceShortcut ? ` (${voiceShortcut})` : '';
    mic.title = voiceState === 'listening' ? `Listening... click to stop${sc}` : voiceState === 'busy' ? 'Translating...' : `Speak Bangla - types English${sc} · v${VERSION}`;
    const mw = mic.offsetWidth || 22, mh = mic.offsetHeight || 22;
    const cs = getComputedStyle(active);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.3;
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const multi = active.tagName !== 'INPUT' && (box.height - padT - padB) > lh * 1.6; // text wraps onto several lines
    let outside = multi;
    if (!outside) { // one-line field: stay inside only while the text has not reached the icons
      const zoneLeft = box.right - mw - 8 - (bw ? bw + 6 : 0) - 8;
      if (caretRect().left > zoneLeft) outside = true;
    }
    let my;
    if (outside) { my = box.top - mh - 4; if (my < 4) my = box.bottom + 4; }       // outside the box: can never cover text
    else if (box.height < 44 || active.tagName === 'INPUT') my = box.top + box.height / 2 - mh / 2; // one-line field: centred inside, right end
    else my = box.top + padT + lh / 2 - mh / 2;
    const mx = Math.max(4, Math.min(innerWidth - mw - 4, box.right - mw - 8));
    my = Math.max(4, Math.min(innerHeight - mh - 4, my));
    mic.style.left = mx + 'px'; mic.style.top = my + 'px';
    return { mx, my, mw, mh };
  }
  function prepInsert(t, before) {
    let out = t.trim();
    if (before.trim() === '' || /[.!?]\s*$/.test(before)) out = out.charAt(0).toUpperCase() + out.slice(1);
    if (before && !/\s$/.test(before)) out = ' ' + out;
    return out;
  }
  function insertAtCaret(el, text) {
    el.focus();
    if (isPlain(el)) {
      const v = el.value, s = el.selectionStart == null ? v.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
      const piece = prepInsert(text, v.slice(0, s));
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, v.slice(0, s) + piece + v.slice(e));
      try { el.setSelectionRange(s + piece.length, s + piece.length); } catch (_) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const cur = extract(el), saved = saveSel(el, cur.segs);
    let before;
    if (saved) before = cur.text.slice(0, saved.s);
    else { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); before = cur.text; }
    document.execCommand('insertText', false, prepInsert(text, before));
  }
  const VERSION = (() => { try { const m = chrome.runtime.getManifest(); return m.version_name || m.version; } catch (_) { return '?'; } })();
  let voiceShortcut = '';
  try { chrome.runtime.sendMessage({ type: 'getShortcut' }, r => { if (!chrome.runtime.lastError && r) voiceShortcut = r.shortcut || ''; }); } catch (_) {}
  // keyboard shortcut from background.js: start in the focused field of this frame, or stop if this frame is listening
  chrome.runtime.onMessage.addListener(msg => {
    if (!msg || msg.type !== 'toggleVoice') return;
    if (voiceState === 'listening') return stopVoice();
    if (!document.hasFocus() || !isOn()) return;
    const el = document.activeElement;
    if (el !== active) {
      if (!isEditable(el) || isSensitive(el)) return;
      active = el; matches = []; status = ''; ensureUI(); schedule(300);
    }
    ensureUI(); toggleMic();
  });
  let wantVoice = false, vq = Promise.resolve(), vPending = 0, vRestarts = [], voiceTarget = null;
  function voiceFail(msg) {
    wantVoice = false;
    try { if (rec) rec.abort(); } catch (_) {}
    voiceState = vPending > 0 ? 'busy' : ''; status = 'warn:' + msg; render();
  }
  function stopVoice() { wantVoice = false; try { if (rec) rec.stop(); } catch (_) {} }
  function queueTranslate(t) {
    vPending++;
    vq = vq.then(() => new Promise(done => {
      chrome.runtime.sendMessage({ type: 'translate', text: t, from: 'bn', to: 'en' }, res => {
        vPending--;
        if (chrome.runtime.lastError || !res || !res.ok) status = 'warn:' + ((res && res.error) || 'Translation failed');
        else { try { insertAtCaret(voiceTarget, res.text); status = ''; } catch (_) {} schedule(700); }
        if (!wantVoice && vPending === 0 && voiceState === 'busy') voiceState = '';
        render(); done();
      });
    }));
  }
  function toggleMic() {
    if (voiceState === 'listening') return stopVoice();   // click again = stop
    if (voiceState) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return voiceFail('Voice input is not supported on this page');
    if (!active) return;
    voiceTarget = active; wantVoice = true; vRestarts = []; status = '';
    const begin = () => {
      rec = new SR();
      rec.lang = settings.voiceLang || 'bn-BD';
      rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) queueTranslate(t); } // typed as you speak, phrase by phrase
        }
      };
      rec.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'aborted') return; // harmless: we restart below
        voiceFail(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone blocked - allow the mic for this site' : e.error === 'network' ? 'Voice needs an internet connection' : 'Voice error: ' + e.error);
      };
      rec.onend = () => {
        if (wantVoice) { // Chrome ends sessions after silence; quietly start a new one so it never stops until you click
          const now = Date.now(); vRestarts = vRestarts.filter(t => now - t < 5000); vRestarts.push(now);
          if (vRestarts.length > 6) return voiceFail('Microphone keeps stopping - click the mic to try again');
          try { begin(); } catch (_) { voiceFail('Could not restart the microphone'); }
          return;
        }
        voiceState = vPending > 0 ? 'busy' : ''; render();
      };
      rec.start();
    };
    voiceState = 'listening'; render();
    try { begin(); } catch (_) { voiceFail('Could not start the microphone'); }
  }

  // ---------- events ----------
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (host && e.composedPath().includes(host)) return;
    if (!isEditable(el) || isSensitive(el)) return;
    if (el === active) return;
    active = el; matches = []; status = ''; hideUI();
    if (isOn()) { ensureUI(); schedule(300); }
  }, true);
  document.addEventListener('input', e => {
    if (e.target !== active || applying) return;
    closePop(); status = ''; schedule(900); schedRender();
  }, true);
  document.addEventListener('mouseup', e => {
    if (!active || !matches.length || (host && e.composedPath().includes(host))) return;
    const x = e.clientX, y = e.clientY;
    setTimeout(() => {
      const i = rectCache.findIndex(list => list.some(q => x >= q.left - 2 && x <= q.left + q.width + 2 && y >= q.top - 2 && y <= q.top + q.height + 2));
      if (i >= 0) openPopFor(i); else closePop();
    }, 0);
  }, true);
  document.addEventListener('focusout', e => {
    if (e.target !== active) return;
    setTimeout(() => {
      const ae = document.activeElement;
      if (ae !== active && !(host && (ae === host || host.contains(ae)))) { active = null; matches = []; hideUI(); }
    }, 250);
  }, true);
  document.addEventListener('selectionchange', () => { if (active) schedRender(); });
  document.addEventListener('keyup', () => { if (active) schedRender(); }, true);
  addEventListener('scroll', schedRender, true);
  addEventListener('resize', schedRender);
  setInterval(() => { if (active && matches.length && !document.hidden) schedRender(); }, 500);
})();
