// utils.js loaded before this file provides:
// ensurePdf, formatSize, downloadBlob, setStatus, setProgress, toast
// pdfjsLib.GlobalWorkerOptions.workerSrc is also set there.

// ── State ──
let currentFile    = null;
let conversionMode = 'text';

// ── DOM ──
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('pdfFile');
const chosenName = document.getElementById('chosenFileName');
const convertBtn = document.getElementById('convertBtn');
const clearBtn   = document.getElementById('clearBtn');
const outputName = document.getElementById('outputName');
const emptyState = document.getElementById('emptyState');
const modeHint   = document.getElementById('modeHint');

const MODE_HINTS = {
  text:  'Extracts text and preserves basic formatting. Best for text-heavy PDFs.',
  image: 'Renders each page as an image. Pixel-perfect layout but text is not editable.',
};

// ── Mode toggle ──
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    conversionMode = btn.dataset.mode;
    modeHint.textContent = MODE_HINTS[conversionMode];
  });
});

// ── Upload ──
uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) setFile(e.target.files[0]);
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    setFile(f);
  } else {
    toast('Please drop a valid PDF file.', 'error');
  }
});

function setFile(file) {
  currentFile = file;
  chosenName.textContent = file.name;
  outputName.value       = file.name.replace(/\.pdf$/i, '');
  convertBtn.disabled    = false;
  clearBtn.disabled      = false;
  emptyState.style.display = 'none';
  setStatus(`Ready: ${file.name} (${formatSize(file.size)})`, 'success');
  setProgress(null);
}

clearBtn.addEventListener('click', () => {
  currentFile = null;
  fileInput.value        = '';
  chosenName.textContent = '';
  outputName.value       = '';
  convertBtn.disabled    = true;
  clearBtn.disabled      = true;
  emptyState.style.display = '';
  setStatus('Drop a PDF file to get started.');
  setProgress(null);
});

// ── Convert ──
convertBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  convertBtn.disabled = true;
  clearBtn.disabled   = true;

  try {
    const arrayBuffer = await currentFile.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const filename    = (outputName.value.trim() || 'converted').replace(/\.docx$/i, '');

    if (conversionMode === 'text') {
      await convertText(pdfDoc, filename);
    } else {
      await convertImage(pdfDoc, filename);
    }

    toast('Download started!', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Conversion failed: ' + (err.message || err), 'error');
    toast('Conversion failed. Try switching to Image mode for complex PDFs.', 'error');
  } finally {
    convertBtn.disabled = false;
    clearBtn.disabled   = false;
  }
});

// ── Text Extraction Mode ──
async function convertText(pdfDoc, filename) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  setProgress(0);
  const children = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setStatus(`Extracting text — page ${i} of ${pdfDoc.numPages}…`, 'loading');
    setProgress(((i - 1) / pdfDoc.numPages) * 80);

    const page        = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    if (i > 1) {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }

    const paras = buildParagraphs(textContent, { Paragraph, TextRun, HeadingLevel });
    children.push(...paras);
  }

  setStatus('Building document…', 'loading');
  setProgress(88);

  const doc  = new Document({ sections: [{ children }] });
  setProgress(95);
  const blob = await Packer.toBlob(doc);

  setProgress(100);
  setStatus(`Done — ${pdfDoc.numPages} page(s) converted.`, 'success');
  saveAs(blob, `${filename}.docx`);
}

function buildParagraphs(textContent, { Paragraph, TextRun, HeadingLevel }) {
  const items = textContent.items.filter(i => typeof i.str === 'string' && i.str.length > 0);
  if (!items.length) return [new Paragraph({ children: [] })];

  // Find most-common font size as body baseline
  const sizeFreq = {};
  for (const item of items) {
    const s = Math.round(Math.abs(item.transform[3]));
    if (s > 0) sizeFreq[s] = (sizeFreq[s] || 0) + 1;
  }
  const bodySize = parseInt(
    Object.entries(sizeFreq).sort((a, b) => b[1] - a[1])[0][0]
  );

  // Group items into lines by y-position
  const Y_TOL = 3;
  const lines  = [];
  for (const item of items) {
    const y    = item.transform[5];
    const line = lines.find(l => Math.abs(l.y - y) <= Y_TOL);
    if (line) { line.items.push(item); }
    else      { lines.push({ y, items: [item] }); }
  }

  lines.sort((a, b) => b.y - a.y);
  lines.forEach(l => l.items.sort((a, b) => a.transform[4] - b.transform[4]));

  // Group lines into paragraphs based on vertical gaps
  const paragraphs = [];
  let group = [];

  for (let i = 0; i < lines.length; i++) {
    group.push(lines[i]);
    const isLast = i === lines.length - 1;

    if (!isLast) {
      const gap          = lines[i].y - lines[i + 1].y;
      const groupMaxSize = Math.max(
        ...group.flatMap(l => l.items.map(it => Math.abs(it.transform[3])))
      );
      const lineHeight = (groupMaxSize || bodySize) * 1.5;

      if (gap > lineHeight * 1.6) {
        paragraphs.push(makeDocParagraph(group, bodySize, { Paragraph, TextRun, HeadingLevel }));
        group = [];
      }
    }
  }
  if (group.length) {
    paragraphs.push(makeDocParagraph(group, bodySize, { Paragraph, TextRun, HeadingLevel }));
  }

  return paragraphs.length ? paragraphs : [new Paragraph({ children: [] })];
}

function makeDocParagraph(lines, bodySize, { Paragraph, TextRun, HeadingLevel }) {
  const allItems = lines.flatMap(l => l.items);
  const avgSize  = allItems.reduce((s, i) => s + Math.abs(i.transform[3]), 0) / allItems.length;

  let heading;
  if (avgSize >= bodySize * 2.0)      heading = HeadingLevel.HEADING_1;
  else if (avgSize >= bodySize * 1.5) heading = HeadingLevel.HEADING_2;
  else if (avgSize >= bodySize * 1.3) heading = HeadingLevel.HEADING_3;

  const runs = allItems
    .filter(item => item.str)
    .map(item => {
      const fontName = (item.fontName || '').toLowerCase();
      return new TextRun({
        text:    item.str + (item.hasEOL ? ' ' : ''),
        bold:    /bold/i.test(fontName) || heading !== undefined,
        italics: /italic|oblique/i.test(fontName),
        size:    Math.max(16, Math.round(Math.abs(item.transform[3]) * 2)),
      });
    });

  if (!runs.length) return new Paragraph({ children: [] });
  return new Paragraph({ heading, children: runs });
}

// ── Image Render Mode ──
async function convertImage(pdfDoc, filename) {
  const { Document, Packer, Paragraph, ImageRun } = docx;

  setProgress(0);
  const children     = [];
  const RENDER_SCALE = 2;
  const MAX_WIDTH_PX = 576;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setStatus(`Rendering page ${i} of ${pdfDoc.numPages}…`, 'loading');
    setProgress(((i - 1) / pdfDoc.numPages) * 85);

    const page     = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas  = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    const ctx     = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const physW    = viewport.width  / RENDER_SCALE;
    const physH    = viewport.height / RENDER_SCALE;
    const ratio    = Math.min(1, MAX_WIDTH_PX / physW);
    const displayW = Math.round(physW * ratio);
    const displayH = Math.round(physH * ratio);

    children.push(new Paragraph({
      pageBreakBefore: i > 1,
      children: [new ImageRun({ data: buffer, transformation: { width: displayW, height: displayH } })],
    }));
  }

  setStatus('Building document…', 'loading');
  setProgress(90);

  const doc  = new Document({ sections: [{ children }] });
  setProgress(95);
  const blob = await Packer.toBlob(doc);

  setProgress(100);
  setStatus(`Done — ${pdfDoc.numPages} page(s) converted.`, 'success');
  saveAs(blob, `${filename}.docx`);
}
