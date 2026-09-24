// Los permission_denied esperados de assertFails llenan la salida de avisos
// del SDK. Se ocultan solo esos; cualquier otro aviso se sigue mostrando.
const { setLogLevel } = require('@firebase/logger');
setLogLevel('error');

const originalWarn = console.warn;
console.warn = (...args) => {
  const text = args.map((a) => String(a)).join(' ');
  if (/PERMISSION_DENIED|permission_denied/.test(text)) return;
  originalWarn(...args);
};
