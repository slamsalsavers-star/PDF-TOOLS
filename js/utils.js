// Shared utilities for all PDF tool pages.
// Loaded before each tool's own script.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

function ensurePdf(name) {
  return name.endsWith('.pdf') ? name : `${name}.pdf`;
}

function formatSize(bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(msg, type = '') {
  const bar  = document.getElementById('statusBar');
  const text = document.getElementById('statusText');
  if (bar)  bar.className    = 'status-bar' + (type ? ` is-${type}` : '');
  if (text) text.textContent = msg;
}

function setProgress(pct) {
  const wrap = document.getElementById('progressWrap');
  const bar  = document.getElementById('progressBar');
  if (!wrap || !bar) return;
  if (pct == null) {
    wrap.style.display = 'none';
    bar.style.width    = '0%';
  } else {
    wrap.style.display = '';
    bar.style.width    = `${Math.min(100, pct)}%`;
  }
}

function toast(msg, type = 'info', ms = 3500) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className   = `toast toast-${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
