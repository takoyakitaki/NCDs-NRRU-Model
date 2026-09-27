// On-screen console (eruda) for debugging inside the LINE app, where there are
// no devtools. Off for everyone unless the URL has ?debug=1; the flag sticks for
// the tab so it survives the LIFF login redirect. ?debug=0 turns it off.
(() => {
  const flag = new URLSearchParams(location.search).get('debug');
  try {
    if (flag === '1') sessionStorage.setItem('vv_debug', '1');
    if (flag === '0') sessionStorage.removeItem('vv_debug');
    if (sessionStorage.getItem('vv_debug') !== '1') return;
  } catch {
    if (flag !== '1') return;
  }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.min.js';
  s.onload = () => window.eruda.init();
  document.head.appendChild(s);
})();
