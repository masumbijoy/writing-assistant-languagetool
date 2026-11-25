// Settings panel: clicking the toolbar icon opens popup.html as a rounded floating panel inside the page
// (Chrome's own popup window always has square corners). Only the top frame shows it.
(() => {
  if (window.top !== window) return;
  let wrap = null, frame = null;
  const W = 392; // same size and edge as the WP Image Grabber panel
  function close() {
    if (!wrap) return;
    wrap.remove(); wrap = frame = null;
    removeEventListener('message', onMsg); document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onKey, true);
  }
  function onMsg(e) {
    if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.wa) return;
    if (e.data.wa === 'close') close();
    else if (e.data.wa === 'size') frame.style.height = Math.min(e.data.h + 2, innerHeight * 0.92) + 'px'; // +2 for the border
  }
  const onOutside = e => { if (wrap && !e.composedPath().includes(wrap)) close(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  function open() {
    wrap = document.createElement('div');
    wrap.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;display:block;';
    const root = wrap.attachShadow({ mode: 'closed' });
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html?panel=1');
    frame.allow = '';
    const st = document.createElement('style');
    st.textContent = `iframe{display:block;width:${W}px;height:520px;max-height:92vh;border:1px solid #d0d0d5;border-radius:12px;` +
      'box-shadow:0 10px 40px rgba(0,0,0,.25);background:#fff;color-scheme:normal;overflow:hidden}' +
      '@media (prefers-color-scheme:dark){iframe{border-color:#3a3a40;background:#1f1f23}}';
    root.append(st, frame);
    document.documentElement.appendChild(wrap);
    addEventListener('message', onMsg);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (!msg || msg.type !== 'togglePanel') return;
    wrap ? close() : open();
    sendResponse({ ok: true });
  });
})();
