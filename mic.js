// one-time grant of microphone access to the extension itself (used by offscreen.js)
const msg = document.getElementById('msg');
async function ask() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    msg.textContent = 'Done. Close this tab and click the mic (or press the shortcut) again.';
    msg.style.color = '#16a34a';
  } catch (e) {
    msg.textContent = e.name === 'NotAllowedError'
      ? 'Microphone was blocked. Click the icon at the left of the address bar, set Microphone to Allow, then click the button again.'
      : 'Could not open the microphone: ' + e.message;
    msg.style.color = '#dc2626';
  }
}
document.getElementById('allow').addEventListener('click', ask);
ask();
