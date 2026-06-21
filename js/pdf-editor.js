/* =====================
   PDF Editor — js/pdf-editor.js
   Renderer : PDF.js  |  Annotations : Fabric.js  |  Export : pdf-lib
   ===================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ─── State ────────────────────────────────────────────────────────────────────
const RENDER_SCALE = 1.5; // base render scale (canvas pixels per PDF point)
const ZOOM_STEPS   = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

let pdfDoc       = null;   // PDF.js document
let pdfBytes     = null;   // original ArrayBuffer (for pdf-lib export)
let fileName     = '';
let totalPages   = 0;
let currentPage  = 1;
let zoomIndex    = 2;      // index into ZOOM_STEPS → default 1.0
let activeTool   = 'select';

let fabricCanvas = null;   // active Fabric.js canvas

// Per-page data
const pageStates      = {};  // pageNum → fabric JSON string (objects only)
const pageBackgrounds = {};  // pageNum → data URL (rendered PDF page)
const pageViewports   = {};  // pageNum → {width, height} at RENDER_SCALE

// Undo / redo per page
const histStack = {};  // pageNum → [json, ...]
const histIdx   = {};  // pageNum → number

// PDF text content cache (for click-to-edit existing text)
const pageTextCache = {};  // pageNum → { content, viewport }

// Shape-drawing state
let isDrawingShape  = false;
let shapeOriginX    = 0;
let shapeOriginY    = 0;
let activeShapeObj  = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupFabric();
  bindUI();
});

function setupFabric() {
  fabricCanvas = new fabric.Canvas('editorCanvas', {
    selection: true,
    preserveObjectStacking: true,
  });

  // Mouse events for shape/text tools
  fabricCanvas.on('mouse:down',     onMouseDown);
  fabricCanvas.on('mouse:move',     onMouseMove);
  fabricCanvas.on('mouse:up',       onMouseUp);
  fabricCanvas.on('object:modified', () => pushHistory());
  fabricCanvas.on('path:created',    () => pushHistory());

  // Sync toolbar controls when a text object is selected
  fabricCanvas.on('selection:created', syncTextControls);
  fabricCanvas.on('selection:updated', syncTextControls);
  fabricCanvas.on('selection:cleared', () => {
    if (activeTool !== 'text') {
      document.getElementById('optFontSize').style.display   = 'none';
      document.getElementById('optFontFamily').style.display = 'none';
    }
  });
}

function bindUI() {
  // File open
  const fileInput = document.getElementById('pdfFileInput');
  document.getElementById('openBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadPDF(e.target.files[0]);
  });

  // Upload zone drag-and-drop
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') loadPDF(f);
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // Color, font & brush
  document.getElementById('colorPicker').addEventListener('input', updateToolOptions);
  document.getElementById('fontFamily').addEventListener('change', updateActiveTextProps);
  document.getElementById('fontSize').addEventListener('change', updateActiveTextProps);
  document.getElementById('brushSize').addEventListener('input', () => {
    const v = document.getElementById('brushSize').value;
    document.getElementById('brushVal').textContent = v;
    if (fabricCanvas.isDrawingMode) {
      fabricCanvas.freeDrawingBrush.width = parseInt(v);
    }
  });

  // Undo / Redo
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);

  // Zoom
  document.getElementById('zoomIn').addEventListener('click', () => adjustZoom(1));
  document.getElementById('zoomOut').addEventListener('click', () => adjustZoom(-1));

  // Page nav
  document.getElementById('prevPage').addEventListener('click', () => goToPage(currentPage - 1));
  document.getElementById('nextPage').addEventListener('click', () => goToPage(currentPage + 1));

  // Download
  document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
}

// ─── Load PDF ─────────────────────────────────────────────────────────────────
async function loadPDF(file) {
  setStatus('Loading PDF…');
  try {
    fileName = file.name;
    pdfBytes = await file.arrayBuffer();

    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
    totalPages  = pdfDoc.numPages;
    currentPage = 1;

    // Clear per-document caches
    Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);

    document.getElementById('filenameBadge').textContent = fileName;
    document.getElementById('tbUpload').style.display = 'none';
    document.getElementById('tbEdit').style.display   = '';
    document.getElementById('uploadOverlay').style.display = 'none';
    document.getElementById('canvasScroll').style.display  = '';

    await renderPage(1);
    setStatus(`Loaded "${fileName}" — ${totalPages} page${totalPages > 1 ? 's' : ''}.`);
  } catch (err) {
    setStatus('Failed to load PDF: ' + err.message);
    toast('Could not open PDF: ' + err.message, true);
    console.error(err);
  }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
async function renderPage(pageNum) {
  setStatus(`Rendering page ${pageNum}…`);
  try {
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    // Render PDF page to offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width  = viewport.width;
    offscreen.height = viewport.height;
    await page.render({ canvasContext: offscreen.getContext('2d'), viewport }).promise;

    const dataURL = offscreen.toDataURL('image/jpeg', 0.92);
    pageBackgrounds[pageNum] = dataURL;
    pageViewports[pageNum]   = { width: viewport.width, height: viewport.height };

    // Size the Fabric canvas
    fabricCanvas.setWidth(viewport.width);
    fabricCanvas.setHeight(viewport.height);

    // Set background, then load saved annotations
    await new Promise(resolve => {
      fabric.Image.fromURL(dataURL, bgImg => {
        bgImg.selectable = false;
        bgImg.evented    = false;
        bgImg.scaleToWidth(viewport.width);

        fabricCanvas.setBackgroundImage(bgImg, () => {
          // Remove existing objects
          fabricCanvas.remove(...fabricCanvas.getObjects());

          const saved = pageStates[pageNum];
          if (saved) {
            fabricCanvas.loadFromJSON(saved, () => {
              fabricCanvas.renderAll();
              resolve();
            });
          } else {
            fabricCanvas.renderAll();
            resolve();
          }
        });
      });
    });

    updateZoomLayout();
    updatePageLabel();
    updateUndoRedoBtns();
    setStatus(`Page ${pageNum} of ${totalPages}`);
  } catch (err) {
    setStatus('Error rendering page: ' + err.message);
    console.error(err);
  }
}

// ─── Page Navigation ──────────────────────────────────────────────────────────
async function goToPage(n) {
  if (!pdfDoc || n < 1 || n > totalPages || n === currentPage) return;
  saveCurrentPageState();
  currentPage = n;
  await renderPage(n);
}

function saveCurrentPageState() {
  if (!fabricCanvas) return;
  const json = fabricCanvas.toJSON();
  delete json.backgroundImage;
  delete json.background;
  pageStates[currentPage] = JSON.stringify(json);
}

// ─── Tools ────────────────────────────────────────────────────────────────────
function setTool(tool) {
  activeTool = tool;

  // Update active button
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });

  // Reset fabric state
  fabricCanvas.isDrawingMode = false;
  fabricCanvas.selection     = false;
  fabricCanvas.discardActiveObject();

  // Show/hide option panels
  const isText = tool === 'text';
  document.getElementById('optFontFamily').style.display = isText ? '' : 'none';
  document.getElementById('optFontSize').style.display   = isText ? '' : 'none';
  document.getElementById('optBrush').style.display      = tool === 'draw' ? '' : 'none';
  document.getElementById('optColor').style.display      = tool === 'eraser' ? 'none' : '';

  // Cursor class
  const outer = document.getElementById('canvasOuter');
  outer.className = `canvas-outer tool-${tool}`;

  switch (tool) {
    case 'select':
      fabricCanvas.selection = true;
      fabricCanvas.getObjects().forEach(o => { o.selectable = true; o.evented = true; });
      fabricCanvas.renderAll();
      break;

    case 'draw':
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.freeDrawingBrush.color = document.getElementById('colorPicker').value;
      fabricCanvas.freeDrawingBrush.width = parseInt(document.getElementById('brushSize').value);
      break;

    case 'highlight':
    case 'rect':
    case 'text':
    case 'eraser':
      // handled in mouse events
      break;
  }
}

function updateToolOptions() {
  const color = document.getElementById('colorPicker').value;
  if (activeTool === 'draw' && fabricCanvas.isDrawingMode) {
    fabricCanvas.freeDrawingBrush.color = color;
  }
  // Update selected object's color
  const active = fabricCanvas.getActiveObject();
  if (active) {
    if (active.type === 'i-text' || active.type === 'text') {
      active.set('fill', color);
    } else {
      active.set('stroke', color);
    }
    fabricCanvas.renderAll();
  }
}

function updateActiveTextProps() {
  const active = fabricCanvas.getActiveObject();
  if (active && (active.type === 'i-text' || active.type === 'text')) {
    active.set('fontSize',   parseInt(document.getElementById('fontSize').value));
    active.set('fontFamily', document.getElementById('fontFamily').value);
    fabricCanvas.renderAll();
    pushHistory();
  }
}

function syncTextControls() {
  const obj = fabricCanvas.getActiveObject();
  if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
  document.getElementById('optFontFamily').style.display = '';
  document.getElementById('optFontSize').style.display   = '';
  document.getElementById('optBrush').style.display      = 'none';
  document.getElementById('colorPicker').value = rgbToHex(obj.fill) || '#000000';
  document.getElementById('fontFamily').value  = obj.fontFamily || 'Inter, system-ui, sans-serif';
  const snapped = [10,12,14,16,18,24,32,48,64].reduce((a,b) =>
    Math.abs(b - obj.fontSize) < Math.abs(a - obj.fontSize) ? b : a);
  document.getElementById('fontSize').value = snapped;
}

function rgbToHex(color) {
  if (!color || color.startsWith('#')) return color;
  const m = color.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}

// ─── PDF Text Detection ───────────────────────────────────────────────────────
async function getPageTextContent(pageNum) {
  if (pageTextCache[pageNum]) return pageTextCache[pageNum];
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const content  = await page.getTextContent();
  pageTextCache[pageNum] = { content, viewport };
  return pageTextCache[pageNum];
}

async function getTextAtPoint(canvasX, canvasY) {
  const { content, viewport } = await getPageTextContent(currentPage);
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const fs   = Math.abs(item.transform[3]);
    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    const pdfW = item.width || 0;
    if (pdfW <= 0 || fs <= 0) continue;

    const [cx0, cy0] = viewport.convertToViewportPoint(pdfX,        pdfY);
    const [cx1, cy1] = viewport.convertToViewportPoint(pdfX + pdfW, pdfY + fs);
    const left   = Math.min(cx0, cx1);
    const right  = Math.max(cx0, cx1);
    const top    = Math.min(cy0, cy1);
    const bottom = Math.max(cy0, cy1);
    const pad    = 4;
    if (canvasX >= left - pad && canvasX <= right + pad &&
        canvasY >= top  - pad && canvasY <= bottom + pad) {
      return { str: item.str, left, top, width: right - left, height: bottom - top,
               fontSize: Math.round(fs * RENDER_SCALE) };
    }
  }
  return null;
}

// ─── Mouse Handlers ───────────────────────────────────────────────────────────
async function onMouseDown(opt) {
  const p     = fabricCanvas.getPointer(opt.e);
  const color = document.getElementById('colorPicker').value;
  const font  = document.getElementById('fontFamily').value;
  const size  = parseInt(document.getElementById('fontSize').value);

  if (activeTool === 'text') {
    // Try to detect an existing PDF text span under the click
    const hit = pdfDoc ? await getTextAtPoint(p.x, p.y) : null;

    if (hit) {
      // White out the original text
      fabricCanvas.add(new fabric.Rect({
        left:       hit.left  - 1,
        top:        hit.top   - 1,
        width:      hit.width  + 2,
        height:     hit.height + 2,
        fill:       '#ffffff',
        selectable: false,
        evented:    false,
      }));
      // Place editable replacement text
      const txt = new fabric.IText(hit.str, {
        left:       hit.left,
        top:        hit.top,
        fontSize:   Math.max(8, Math.round(hit.fontSize * 0.80)),
        fill:       color,
        fontFamily: font,
        editable:   true,
      });
      fabricCanvas.add(txt);
      fabricCanvas.setActiveObject(txt);
      txt.enterEditing();
      txt.selectAll();
    } else {
      // Place fresh text at click point
      const txt = new fabric.IText('Text', {
        left:       p.x,
        top:        p.y,
        fontSize:   size,
        fill:       color,
        fontFamily: font,
        editable:   true,
      });
      fabricCanvas.add(txt);
      fabricCanvas.setActiveObject(txt);
      txt.enterEditing();
      txt.selectAll();
    }

    setTool('select');
    pushHistory();
    return;
  }

  if (activeTool === 'eraser') {
    const target = fabricCanvas.findTarget(opt.e);
    if (target && target !== fabricCanvas.backgroundImage) {
      fabricCanvas.remove(target);
      fabricCanvas.renderAll();
      pushHistory();
    }
    return;
  }

  if (activeTool === 'highlight' || activeTool === 'rect') {
    isDrawingShape = true;
    shapeOriginX   = p.x;
    shapeOriginY   = p.y;

    if (activeTool === 'highlight') {
      activeShapeObj = new fabric.Rect({
        left: p.x, top: p.y,
        width: 0,  height: 0,
        fill:        'rgba(255,220,0,0.35)',
        stroke:      'rgba(200,170,0,0.5)',
        strokeWidth: 1,
        selectable:  true,
      });
    } else {
      activeShapeObj = new fabric.Rect({
        left: p.x, top: p.y,
        width: 0,  height: 0,
        fill:        'transparent',
        stroke:      color,
        strokeWidth: Math.max(2, parseInt(document.getElementById('brushSize').value)),
        selectable:  true,
      });
    }
    fabricCanvas.add(activeShapeObj);
    fabricCanvas.renderAll();
  }
}

function onMouseMove(opt) {
  if (!isDrawingShape || !activeShapeObj) return;
  const p = fabricCanvas.getPointer(opt.e);
  const w = p.x - shapeOriginX;
  const h = p.y - shapeOriginY;

  activeShapeObj.set({
    left:   w < 0 ? p.x : shapeOriginX,
    top:    h < 0 ? p.y : shapeOriginY,
    width:  Math.abs(w),
    height: Math.abs(h),
  });
  fabricCanvas.renderAll();
}

function onMouseUp() {
  if (!isDrawingShape) return;
  isDrawingShape = false;
  if (activeShapeObj && (activeShapeObj.width < 3 || activeShapeObj.height < 3)) {
    fabricCanvas.remove(activeShapeObj);
    fabricCanvas.renderAll();
  } else {
    pushHistory();
  }
  activeShapeObj = null;
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
function onKeyDown(e) {
  if (!pdfDoc) return;
  const tag = document.activeElement.tagName.toLowerCase();
  const editing = fabricCanvas.getActiveObject()?.isEditing;

  if (tag === 'input' || tag === 'textarea' || tag === 'select' || editing) return;

  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return; }
  if (ctrl && (e.key === 'y' || e.key === 'Z')) { e.preventDefault(); redo(); return; }

  switch (e.key) {
    case 'v': case 'V': setTool('select');    break;
    case 't': case 'T': setTool('text');      break;
    case 'h': case 'H': setTool('highlight'); break;
    case 'd': case 'D': setTool('draw');      break;
    case 'r': case 'R': setTool('rect');      break;
    case 'e': case 'E': setTool('eraser');    break;
    case 'Delete': case 'Backspace': {
      const obj = fabricCanvas.getActiveObject();
      if (obj) { fabricCanvas.remove(obj); fabricCanvas.renderAll(); pushHistory(); }
      break;
    }
    case 'ArrowLeft':  goToPage(currentPage - 1); break;
    case 'ArrowRight': goToPage(currentPage + 1); break;
  }
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
const MAX_HISTORY = 25;

function pushHistory() {
  const p = currentPage;
  if (!histStack[p]) { histStack[p] = []; histIdx[p] = -1; }

  // Trim forward history
  histStack[p] = histStack[p].slice(0, histIdx[p] + 1);

  const json = fabricCanvas.toJSON();
  delete json.backgroundImage;
  delete json.background;
  histStack[p].push(JSON.stringify(json));

  if (histStack[p].length > MAX_HISTORY) histStack[p].shift();
  histIdx[p] = histStack[p].length - 1;

  // Sync current state
  pageStates[p] = histStack[p][histIdx[p]];
  updateUndoRedoBtns();
}

function undo() {
  const p = currentPage;
  if (!histStack[p] || histIdx[p] <= 0) return;
  histIdx[p]--;
  applyHistoryState(histStack[p][histIdx[p]]);
  pageStates[p] = histStack[p][histIdx[p]];
  updateUndoRedoBtns();
}

function redo() {
  const p = currentPage;
  if (!histStack[p] || histIdx[p] >= histStack[p].length - 1) return;
  histIdx[p]++;
  applyHistoryState(histStack[p][histIdx[p]]);
  pageStates[p] = histStack[p][histIdx[p]];
  updateUndoRedoBtns();
}

function applyHistoryState(jsonStr) {
  fabricCanvas.remove(...fabricCanvas.getObjects());
  fabricCanvas.loadFromJSON(jsonStr, fabricCanvas.renderAll.bind(fabricCanvas));
}

function updateUndoRedoBtns() {
  const p = currentPage;
  document.getElementById('undoBtn').disabled = !histStack[p] || histIdx[p] <= 0;
  document.getElementById('redoBtn').disabled = !histStack[p] || histIdx[p] >= histStack[p].length - 1;
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────
function adjustZoom(dir) {
  const newIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, zoomIndex + dir));
  if (newIdx === zoomIndex) return;
  zoomIndex = newIdx;
  updateZoomLayout();
}

function updateZoomLayout() {
  const zoom = ZOOM_STEPS[zoomIndex];
  const vp   = pageViewports[currentPage];
  if (!vp) return;

  const visW = Math.round(vp.width  * zoom);
  const visH = Math.round(vp.height * zoom);

  const spacer = document.getElementById('canvasSpacer');
  const outer  = document.getElementById('canvasOuter');

  spacer.style.width  = visW + 'px';
  spacer.style.height = visH + 'px';
  outer.style.transform = `scale(${zoom})`;

  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  document.getElementById('zoomOut').disabled = zoomIndex === 0;
  document.getElementById('zoomIn').disabled  = zoomIndex === ZOOM_STEPS.length - 1;
}

// ─── Download / Export ────────────────────────────────────────────────────────
async function downloadPDF() {
  if (!pdfDoc || !pdfBytes) return;
  saveCurrentPageState();

  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  setStatus('Generating PDF…');

  try {
    const { PDFDocument } = PDFLib;
    const sourcePdf = await PDFDocument.load(pdfBytes.slice(0));
    const outputPdf = await PDFDocument.create();

    for (let i = 1; i <= totalPages; i++) {
      setStatus(`Exporting page ${i} of ${totalPages}…`);
      const hasAnnot = hasAnnotations(i);

      if (!hasAnnot) {
        const [copied] = await outputPdf.copyPages(sourcePdf, [i - 1]);
        outputPdf.addPage(copied);
      } else {
        // Ensure background is cached
        if (!pageBackgrounds[i]) await renderPageOffscreen(i);

        const compositeURL = await compositeAnnotations(i);
        const origPage     = sourcePdf.getPage(i - 1);
        const { width: origW, height: origH } = origPage.getSize();

        const imgBytes = dataURLtoBytes(compositeURL);
        const img      = await outputPdf.embedJpg(imgBytes);
        const page     = outputPdf.addPage([origW, origH]);
        page.drawImage(img, { x: 0, y: 0, width: origW, height: origH });
      }
    }

    const outBytes = await outputPdf.save();
    const blob     = new Blob([outBytes], { type: 'application/pdf' });
    const outName  = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';
    saveAs(blob, outName);
    setStatus('PDF saved.');
    toast('Saved: ' + outName);
  } catch (err) {
    setStatus('Export failed: ' + err.message);
    toast('Export failed: ' + err.message, true);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

function hasAnnotations(pageNum) {
  const s = pageStates[pageNum];
  if (!s) return false;
  try { return (JSON.parse(s).objects || []).length > 0; }
  catch { return false; }
}

async function compositeAnnotations(pageNum) {
  const bgURL = pageBackgrounds[pageNum];

  return new Promise((resolve, reject) => {
    const bgImg = new Image();
    bgImg.onload = () => {
      const comp = document.createElement('canvas');
      comp.width  = bgImg.width;
      comp.height = bgImg.height;
      const ctx   = comp.getContext('2d');
      ctx.drawImage(bgImg, 0, 0);

      // Render annotations on a temp fabric StaticCanvas
      const tempEl = document.createElement('canvas');
      tempEl.width  = bgImg.width;
      tempEl.height = bgImg.height;

      const tempFabric = new fabric.StaticCanvas(tempEl, {
        width:  bgImg.width,
        height: bgImg.height,
        enableRetinaScaling: false,
      });

      const jsonStr = pageStates[pageNum];
      tempFabric.loadFromJSON(jsonStr, () => {
        tempFabric.setBackgroundColor('rgba(0,0,0,0)', () => {
          tempFabric.renderAll();
          ctx.drawImage(tempEl, 0, 0);
          const result = comp.toDataURL('image/jpeg', 0.92);
          try { tempFabric.dispose(); } catch (_) {}
          resolve(result);
        });
      });
    };
    bgImg.onerror = reject;
    bgImg.src = bgURL;
  });
}

async function renderPageOffscreen(pageNum) {
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  pageBackgrounds[pageNum] = canvas.toDataURL('image/jpeg', 0.92);
  pageViewports[pageNum]   = { width: viewport.width, height: viewport.height };
}

function dataURLtoBytes(dataURL) {
  const base64 = dataURL.split(',')[1];
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg) {
  document.getElementById('statusText').textContent = msg;
}

function updatePageLabel() {
  document.getElementById('pageLabel').textContent = `${currentPage} / ${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
