// Settings panel: clicking the toolbar icon opens popup.html as a rounded floating panel inside the page
// (Chrome's own popup window always has square corners). Only the top frame shows it.
(() => {
  if (window.top !== window) return;
  let wrap = null, frame = null;
  const W = 370;
  function close() {
    if (!wrap) return;
    wrap.remove(); wrap = frame = null;
    removeEventListener('message', onMsg); document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onKey, true);
  }
  function onMsg(e) {
    if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.wa) return;
    if (e.data.wa === 'close') close();
    else if (e.data.wa === 'size') frame.style.height = Math.min(e.data.h, innerHeight - 24) + 'px';
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
    frame.style.cssText = `display:block;width:${W}px;height:520px;max-height:calc(100vh - 24px);border:0;border-radius:16px;` +
      'box-shadow:0 12px 40px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.08);background:transparent;color-scheme:normal;overflow:hidden;';
    root.appendChild(frame);
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
