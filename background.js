// Free LanguageTool check + built-in "professional & polite" rules. No AI model, no API key.

const PHRASES = [
  // informal -> professional
  ['gonna', 'going to', 'Informal: use "going to"'], ['wanna', 'want to', 'Informal: use "want to"'],
  ['gotta', 'have to', 'Informal: use "have to"'], ['lemme', 'let me', 'Informal wording'],
  ['gimme', 'give me', 'Informal wording'], ['kinda', 'somewhat', 'Informal: sounds more professional as "somewhat"'],
  ['sorta', 'somewhat', 'Informal wording'], ['dunno', 'do not know', 'Informal wording'],
  ['yeah', 'yes', 'Informal: use "yes"'], ['yep', 'yes', 'Informal: use "yes"'], ['nope', 'no', 'Informal: use "no"'],
  ['u', 'you', 'Text-speak: write "you"'], ['ur', 'your', 'Text-speak: check "your" / "you are"'],
  ['pls', 'please', 'Write "please"'], ['plz', 'please', 'Write "please"'], ['thx', 'thank you', 'Write "thank you"'],
  ['btw', 'by the way', 'Spell out for a professional tone'],
  ['asap', 'at your earliest convenience', 'More polite than "ASAP"'], ['cuz', 'because', 'Informal wording'],
  ['hey', 'Hello', 'More professional greeting'], ['hi there', 'Hello', 'More professional greeting'],
  ['sorry for the late reply', 'apologies for the delayed response', 'More professional apology'],
  ['sorry for late reply', 'apologies for the delayed response', 'More professional apology'],
  ['sorry for the delay', 'apologies for the delay', 'More professional apology'],
  ['a lot of', 'many', 'More concise and formal'], ['lots of', 'many', 'More concise and formal'],
  ['stuff', 'items', 'Vague: more specific wording is more professional'],
  ['get back to me', 'respond', 'More formal wording'], ['asap please', 'at your earliest convenience', 'More polite'],
  // politeness
  ['give me', 'could you please provide me with', 'More polite request'],
  ['send me', 'could you please send me', 'More polite request'],
  ['tell me', 'could you please let me know', 'More polite request'],
  ['show me', 'could you please show me', 'More polite request'],
  ['i want', 'I would like', 'More polite: "I would like"'], ['i need', 'I would need', 'More polite: "I would need"'],
  ['can you', 'could you', 'More polite: "could you"'], ['you must', 'you may want to', 'Softer, more polite'],
  ['you should', 'you may wish to', 'Softer, more polite'], ['you have to', 'you may need to', 'Softer, more polite'],
  ['do it', 'please proceed', 'More polite'], ['hurry up', 'please prioritise this when possible', 'More polite'],
  // contractions -> full forms (professional writing)
  ["don't", 'do not', 'Avoid contractions in formal writing'], ["doesn't", 'does not', 'Avoid contractions in formal writing'],
  ["didn't", 'did not', 'Avoid contractions in formal writing'], ["can't", 'cannot', 'Avoid contractions in formal writing'],
  ["won't", 'will not', 'Avoid contractions in formal writing'], ["isn't", 'is not', 'Avoid contractions in formal writing'],
  ["aren't", 'are not', 'Avoid contractions in formal writing'], ["wasn't", 'was not', 'Avoid contractions in formal writing'],
  ["weren't", 'were not', 'Avoid contractions in formal writing'], ["couldn't", 'could not', 'Avoid contractions in formal writing'],
  ["wouldn't", 'would not', 'Avoid contractions in formal writing'], ["shouldn't", 'should not', 'Avoid contractions in formal writing'],
  ["haven't", 'have not', 'Avoid contractions in formal writing'], ["hasn't", 'has not', 'Avoid contractions in formal writing'],
  ["i'm", 'I am', 'Avoid contractions in formal writing'], ["i'll", 'I will', 'Avoid contractions in formal writing'],
  ["i've", 'I have', 'Avoid contractions in formal writing'], ["i'd", 'I would', 'Avoid contractions in formal writing'],
  ["we're", 'we are', 'Avoid contractions in formal writing'], ["we'll", 'we will', 'Avoid contractions in formal writing'],
  ["we've", 'we have', 'Avoid contractions in formal writing'], ["they're", 'they are', 'Avoid contractions in formal writing'],
  ["you're", 'you are', 'Avoid contractions in formal writing'], ["you'll", 'you will', 'Avoid contractions in formal writing'],
  ["you've", 'you have', 'Avoid contractions in formal writing'], ["that's", 'that is', 'Avoid contractions in formal writing'],
  ["let's", 'let us', 'Avoid contractions in formal writing']
];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
const PHRASE_RE = new RegExp(`(?<![\\p{L}\\p{N}'’])(${PHRASES.map(p => esc(p[0])).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}'’])`, 'giu');
const PHRASE_MAP = new Map(PHRASES.map(p => [p[0].toLowerCase(), p]));
const IMPERATIVE_RE = /(^|[.!?]\s+|\n\s*)(send|give|tell|show|provide|share|update|check|confirm|reply|call|let|forward|fix|make|bring|pay|add|remove|attach|review|do)(?=\s)/giu;

function matchCase(orig, rep) {
  return /^\p{Lu}/u.test(orig) && !/^I\b/.test(rep) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep;
}

function toneMatches(text) {
  const phrases = [];
  let m;
  PHRASE_RE.lastIndex = 0;
  while ((m = PHRASE_RE.exec(text))) {
    const p = PHRASE_MAP.get(m[1].toLowerCase().replace(/’/g, "'"));
    if (!p) continue;
    // already polite? "Please send me ..." should not become "Please could you please send me ..."
    if (/^(could you|please|i would)/i.test(p[1]) && /(please|kindly)\s+$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    phrases.push({ offset: m.index, length: m[1].length, message: p[2], issueType: 'style', replacements: [matchCase(m[1], p[1])] });
  }
  const out = [...phrases];
  IMPERATIVE_RE.lastIndex = 0;
  while ((m = IMPERATIVE_RE.exec(text))) {
    const verb = m[2], offset = m.index + m[1].length;
    const t = { offset, length: verb.length, message: 'Add "please" to sound more polite', issueType: 'style',
      replacements: [(/^\p{Lu}/u.test(verb) ? 'Please ' : 'please ') + verb.toLowerCase()] };
    if (!phrases.some(p => p.offset < offset + verb.length && offset < p.offset + p.length)) out.push(t); // a fuller phrase rule wins
  }
  return out;
}


// ---- Bangla -> English translation for the voice button (free MyMemory service, no key) ----
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function chunkText(text, max = 140) { // the free API accepts ~500 bytes per request
  const parts = text.split(/(?<=[।.!?\n])\s*/u).filter(Boolean), out = [];
  let cur = '';
  const pushWords = p => {
    let w = '';
    for (const word of p.split(/\s+/)) { if ((w + ' ' + word).trim().length <= max) w = (w + ' ' + word).trim(); else { if (w) out.push(w); w = word; } }
    return w;
  };
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length <= max) { cur = (cur + ' ' + p).trim(); continue; }
    if (cur) out.push(cur);
    cur = p.length <= max ? p : pushWords(p);
  }
  if (cur) out.push(cur);
  return out;
}
async function translateText(text, from, to) {
  const pieces = [];
  for (const q of chunkText(text)) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`, { signal: ctl.signal });
      if (!r.ok) throw new Error('http');
      const j = await r.json();
      const out = j && j.responseData && j.responseData.translatedText;
      if (!out || /MYMEMORY WARNING/i.test(out) || j.responseStatus === 429) throw new Error('limit');
      pieces.push(decodeEntities(out).trim());
    } finally { clearTimeout(t); }
  }
  return pieces.join(' ');
}

const overlaps = (a, b) => a.offset < b.offset + b.length && b.offset < a.offset + a.length;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'translate') {
    translateText(msg.text, msg.from || 'bn', msg.to || 'en')
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.message === 'limit' ? 'Free translation limit reached for today' : e.name === 'AbortError' ? 'Translation timed out' : 'Translation failed - check your internet' }));
    return true;
  }
  if (msg.type !== 'check') return;
  if (msg.language === 'Bengali') return sendResponse({ ok: false, error: 'Bengali is not supported' });

  const letters = msg.text.match(/\p{L}/gu) || [];
  const latin = letters.filter(ch => /\p{Script=Latin}/u.test(ch)).length;
  if (msg.language === 'auto' && letters.length && latin / letters.length < 0.6) {
    return sendResponse({ ok: true, matches: [] }); // mostly non-Latin script (e.g. Bengali): nothing to check
  }

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  fetch('https://api.languagetool.org/v2/check', {
    method: 'POST', signal: ctl.signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text: msg.text, language: msg.language || 'auto', level: msg.picky ? 'picky' : 'default', preferredVariants: 'en-US' })
  })
    .then(r => { clearTimeout(to); if (!r.ok) throw new Error(r.status === 429 ? 'rate' : 'http'); return r.json(); })
    .then(j => {
      let matches = (j.matches || []).map(m => ({
        offset: m.offset, length: m.length, message: m.message,
        issueType: m.rule && m.rule.issueType, replacements: (m.replacements || []).slice(0, 4).map(x => x.value)
      }));

      // --- ignore spelling when the language is unidentified ---
      const det = j.language && j.language.detectedLanguage;
      const auto = !msg.language || msg.language === 'auto';
      const words = (msg.text.match(/[\p{L}']+/gu) || []).length;
      const spellCount = matches.filter(m => m.issueType === 'misspelling').length;
      const unsure = auto && det && ((typeof det.confidence === 'number' && det.confidence < 0.8) || det.source === 'fallback');
      const looksForeign = words >= 2 && spellCount / words > 0.4; // most words "wrong" => probably another language / romanised text
      if (unsure || looksForeign) matches = matches.filter(m => m.issueType !== 'misspelling');

      // --- professional & polite tone rules (English only) ---
      const isEnglish = !auto ? String(msg.language).startsWith('en') : !det || String(det.code).startsWith('en');
      if (msg.tone && isEnglish && !unsure && !looksForeign) {
        for (const t of toneMatches(msg.text)) if (!matches.some(m => overlaps(m, t))) matches.push(t);
      }

      matches.sort((a, b) => a.offset - b.offset);
      const clean = [];
      for (const m of matches) { const p = clean[clean.length - 1]; if (!p || m.offset >= p.offset + p.length) clean.push(m); }
      sendResponse({ ok: true, matches: clean });
    })
    .catch(e => sendResponse({ ok: false, error: e.name === 'AbortError' ? 'Check timed out' : e.message === 'rate' ? 'Rate limit, keep typing to retry' : 'Check failed' }));
  return true;
});
