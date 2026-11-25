// Speech recognition in the extension's own page, so sites that forbid the microphone
// (Permissions-Policy: microphone=()) cannot block voice typing. Results go back via background.js.
let rec = null, want = false, restarts = [];
const send = m => chrome.runtime.sendMessage({ from: 'offscreen', ...m }).catch(() => {});

function begin(lang) {
  const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
  if (!SR) return fail('not-supported');
  rec = new SR();
  rec.lang = lang; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) send({ type: 'result', text: t }); }
    }
  };
  rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') fail(e.error); };
  rec.onend = () => {
    if (!want) return send({ type: 'end' });
    const now = Date.now(); restarts = restarts.filter(t => now - t < 5000); restarts.push(now);
    if (restarts.length > 6) return fail('keeps-stopping');
    try { rec.start(); } catch (_) { fail('restart'); } // Chrome ends sessions after silence: keep listening until stopped
  };
  rec.start();
}
function fail(error) { want = false; try { rec && rec.abort(); } catch (_) {} send({ type: 'error', error }); }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  sendResponse({ ok: true }); // answer so the background's await never hangs or rejects
  if (msg.type === 'start') {
    want = false; try { rec && rec.abort(); } catch (_) {}
    want = true; restarts = [];
    try { begin(msg.lang || 'bn-BD'); } catch (_) { fail('start'); }
  } else if (msg.type === 'stop') { want = false; try { rec && rec.stop(); } catch (_) {} }
});
