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

let fabricCanvas  = null;  // pointer to ACTIVE page's Fabric canvas (let → all closures see reassignment)
const fabricCanvases = {}; // pageNum → fabric.Canvas

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
let activeShape     = 'rect'; // which shape is selected in the picker
let activeFormType  = null;   // which form element type is selected

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindUI();
});

function bindUI() {
  // File open (top-bar button)
  const fileInput = document.getElementById('pdfFileInput');
  document.getElementById('openBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadPDF(e.target.files[0]);
  });

  // ── Start screen: Open PDF card ──────────────────────────────
  const uploadCard = document.getElementById('uploadCard');
  uploadCard.addEventListener('click', () => fileInput.click());
  uploadCard.addEventListener('dragover', e => { e.preventDefault(); uploadCard.classList.add('drag-over'); });
  uploadCard.addEventListener('dragleave', () => uploadCard.classList.remove('drag-over'));
  uploadCard.addEventListener('drop', e => {
    e.preventDefault();
    uploadCard.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') loadPDF(f);
    else toast('Please drop a PDF file.', true);
  });

  // ── Start screen: New Document card ──────────────────────────
  document.getElementById('newDocCard').addEventListener('click', () => {
    document.getElementById('startScreen').style.display  = 'none';
    document.getElementById('newDocPanel').style.display  = '';
  });

  document.getElementById('newDocBack').addEventListener('click', () => {
    document.getElementById('newDocPanel').style.display  = 'none';
    document.getElementById('startScreen').style.display  = '';
  });

  // Orientation toggle
  document.querySelectorAll('input[name="ndOrient"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('orientPortrait').classList.toggle('orient-opt--active',  radio.value === 'portrait');
      document.getElementById('orientLandscape').classList.toggle('orient-opt--active', radio.value === 'landscape');
    });
  });

  // Pages spinner
  const ndPages = document.getElementById('ndPages');
  document.getElementById('ndPagesDec').addEventListener('click', () => {
    ndPages.value = Math.max(1, +ndPages.value - 1);
  });
  document.getElementById('ndPagesInc').addEventListener('click', () => {
    ndPages.value = Math.min(50, +ndPages.value + 1);
  });

  // Background swatches
  let selectedBg = '#ffffff';
  document.querySelectorAll('.nd-swatch[data-color]').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.nd-swatch').forEach(s => s.classList.remove('nd-swatch--active'));
      sw.classList.add('nd-swatch--active');
      selectedBg = sw.dataset.color;
      document.getElementById('ndBgColor').value = selectedBg;
    });
  });
  document.getElementById('ndBgColor').addEventListener('input', e => {
    document.querySelectorAll('.nd-swatch').forEach(s => s.classList.remove('nd-swatch--active'));
    document.querySelector('.nd-swatch--custom').classList.add('nd-swatch--active');
    selectedBg = e.target.value;
  });

  // Create document button
  document.getElementById('ndCreateBtn').addEventListener('click', () => {
    const size        = document.getElementById('ndPageSize').value;
    const orientation = document.querySelector('input[name="ndOrient"]:checked').value;
    const numPages    = Math.max(1, Math.min(50, parseInt(ndPages.value) || 1));
    createBlankPDF(size, orientation, numPages, selectedBg);
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tool === 'image') {
        document.getElementById('imageFileInput').click();
      } else {
        setTool(btn.dataset.tool);
      }
    });
  });

  // Forms panel — item selection
  document.querySelectorAll('.form-item-btn[data-form]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFormType = btn.dataset.form;
      document.querySelectorAll('.form-item-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTool('forms');
      const hint = document.getElementById('formsHint');
      const labels = {
        'sym-x': 'Cross ✕', 'sym-check': 'Check ✓', 'sym-square': 'Square ■',
        'text-single': 'Text field', 'text-multi': 'Multiline text',
        'radio': 'Radio button', 'checkbox': 'Checkbox', 'dropdown': 'Drop-down',
      };
      hint.textContent = `"${labels[activeFormType]}" selected — click on page to place.`;
      hint.classList.add('has-selection');
    });
  });

  // Shape picker
  document.querySelectorAll('.shape-item[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeShape = btn.dataset.shape;
      document.querySelectorAll('.shape-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTool('shape');
    });
  });

  // Image insert
  document.getElementById('imageFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      fabric.Image.fromURL(ev.target.result, img => {
        const maxW = fabricCanvas.width  * 0.5;
        const maxH = fabricCanvas.height * 0.5;
        if (img.width > maxW)             img.scaleToWidth(maxW);
        if (img.getScaledHeight() > maxH) img.scaleToHeight(maxH);
        img.set({
          left: (fabricCanvas.width  - img.getScaledWidth())  / 2,
          top:  (fabricCanvas.height - img.getScaledHeight()) / 2,
        });
        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.renderAll();
        pushHistory();
        setTool('select');
        toast('Image inserted — drag to reposition.');
      });
    };
    reader.readAsDataURL(file);
  });

  // Color, font & brush
  document.getElementById('colorPicker').addEventListener('input', updateToolOptions);
  document.getElementById('fontFamily').addEventListener('change', updateActiveTextProps);

  // Font size: live update while typing, clamp on blur
  const fontSizeEl = document.getElementById('fontSize');
  fontSizeEl.addEventListener('input', () => {
    const v = parseInt(fontSizeEl.value);
    if (v >= 6 && v <= 400) updateActiveTextProps();
  });
  fontSizeEl.addEventListener('change', () => {
    fontSizeEl.value = Math.max(6, Math.min(400, parseInt(fontSizeEl.value) || 18));
    updateActiveTextProps();
  });
  fontSizeEl.addEventListener('blur', () => {
    fontSizeEl.value = Math.max(6, Math.min(400, parseInt(fontSizeEl.value) || 18));
  });

  // Hold-to-repeat on dec / inc buttons
  function makeStepper(btnId, delta) {
    let holdTimer = null, holdInterval = null;
    const el = document.getElementById('fontSize');
    const step = () => {
      el.value = Math.max(6, Math.min(400, (parseInt(el.value) || 18) + delta));
      updateActiveTextProps();
    };
    const stop = () => { clearTimeout(holdTimer); clearInterval(holdInterval); };
    document.getElementById(btnId).addEventListener('mousedown', e => {
      e.preventDefault();
      step();
      holdTimer = setTimeout(() => { holdInterval = setInterval(step, 60); }, 400);
    });
    document.getElementById(btnId).addEventListener('mouseup',   stop);
    document.getElementById(btnId).addEventListener('mouseleave', stop);
  }
  makeStepper('fontSizeDec', -1);
  makeStepper('fontSizeInc',  1);
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

  // Add page
  document.getElementById('addPageBtn').addEventListener('click', () => addPageAfter(currentPage));

  // Download
  document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);

  // ── Text alignment ──────────────────────────────────────────────────
  document.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const obj = fabricCanvas.getActiveObject();
      if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('textAlign', btn.dataset.align);
        fabricCanvas.renderAll();
        pushHistory();
      }
    });
  });

  // ── Style toggles ───────────────────────────────────────────────────
  const styleMap = [
    { id: 'fmtBold',      prop: 'fontWeight', on: 'bold',   off: 'normal' },
    { id: 'fmtItalic',    prop: 'fontStyle',  on: 'italic', off: 'normal' },
    { id: 'fmtUnderline', prop: 'underline',  on: true,     off: false    },
    { id: 'fmtStrike',    prop: 'linethrough',on: true,     off: false    },
    { id: 'fmtOverline',  prop: 'overline',   on: true,     off: false    },
  ];
  styleMap.forEach(({ id, prop, on, off }) => {
    document.getElementById(id).addEventListener('click', () => {
      const obj = fabricCanvas.getActiveObject();
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
      const cur    = obj.get(prop);
      const isOn   = cur === on || cur === true;
      obj.set(prop, isOn ? off : on);
      document.getElementById(id).classList.toggle('active', !isOn);
      fabricCanvas.renderAll();
      pushHistory();
    });
  });

  // ── Line height ─────────────────────────────────────────────────────
  document.getElementById('lineHeightSlider').addEventListener('input', () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
    const v = parseFloat(document.getElementById('lineHeightSlider').value);
    obj.set('lineHeight', v);
    document.getElementById('lineHeightVal').textContent = v.toFixed(1);
    fabricCanvas.renderAll();
  });
  document.getElementById('lineHeightSlider').addEventListener('change', pushHistory);

  // ── Letter spacing ──────────────────────────────────────────────────
  document.getElementById('letterSpacingSlider').addEventListener('input', () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
    const v = parseInt(document.getElementById('letterSpacingSlider').value);
    obj.set('charSpacing', v);
    document.getElementById('letterSpacingVal').textContent = v;
    fabricCanvas.renderAll();
  });
  document.getElementById('letterSpacingSlider').addEventListener('change', pushHistory);

  // ── Text highlight ──────────────────────────────────────────────────
  document.getElementById('textBgColor').addEventListener('input', () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
    obj.set('textBackgroundColor', document.getElementById('textBgColor').value);
    fabricCanvas.renderAll();
  });
  document.getElementById('textBgColor').addEventListener('change', pushHistory);

  document.getElementById('clearTextBg').addEventListener('click', () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;
    obj.set('textBackgroundColor', '');
    fabricCanvas.renderAll();
    pushHistory();
  });

  // ── Opacity ─────────────────────────────────────────────────────────
  document.getElementById('opacitySlider').addEventListener('input', () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj) return;
    const v = parseInt(document.getElementById('opacitySlider').value);
    obj.set('opacity', v / 100);
    document.getElementById('opacityVal').textContent = v;
    fabricCanvas.renderAll();
  });
  document.getElementById('opacitySlider').addEventListener('change', pushHistory);

  // Filename — select all on focus so it's easy to retype
  document.getElementById('filenameBadge').addEventListener('focus', e => e.target.select());

  // Dropdown options modal
  setupDropdownOptModal();

  // Signature modal
  setupSignatureModal();

  // HTML content modal
  setupHtmlModal();

  // Table modal
  setupTableModal();
}

// ─── Per-page canvas helpers ──────────────────────────────────────────────────
function createPageSlot(pageNum) {
  const wrapper = document.createElement('div');
  wrapper.className    = 'page-wrapper';
  wrapper.id           = `pageWrapper-${pageNum}`;
  wrapper.dataset.page = pageNum;

  const label = document.createElement('div');
  label.className   = 'page-label';
  label.textContent = `Page ${pageNum}`;

  const spacer = document.createElement('div');
  spacer.className = 'page-spacer';
  spacer.id        = `pageSpacer-${pageNum}`;

  const outer = document.createElement('div');
  outer.className = `canvas-outer tool-${activeTool}`;
  outer.id        = `canvasOuter-${pageNum}`;

  const canvas = document.createElement('canvas');
  canvas.id = `pageCanvas-${pageNum}`;

  const hoverBox = document.createElement('div');
  hoverBox.className = 'text-hover-box';
  hoverBox.id        = `textHoverBox-${pageNum}`;

  outer.appendChild(canvas);
  outer.appendChild(hoverBox);
  spacer.appendChild(outer);
  wrapper.appendChild(label);
  wrapper.appendChild(spacer);

  const gap = document.createElement('div');
  gap.className = 'page-gap';

  const addBtn = document.createElement('button');
  addBtn.className     = 'add-page-btn';
  addBtn.dataset.after = pageNum;
  addBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg> Add Page`;
  addBtn.addEventListener('click', () => addPageAfter(parseInt(addBtn.dataset.after)));

  gap.appendChild(addBtn);
  wrapper.appendChild(gap);
  return wrapper;
}

function initFabricForPage(pageNum) {
  if (fabricCanvases[pageNum]) return fabricCanvases[pageNum];
  const canvasEl = document.getElementById(`pageCanvas-${pageNum}`);
  if (!canvasEl) return null;

  const fc = new fabric.Canvas(canvasEl, {
    selection: true,
    preserveObjectStacking: true,
  });

  const activate = () => {
    if (fabricCanvas !== fc) {
      fabricCanvas = fc;
      currentPage  = pageNum;
      updatePageLabel();
      updateUndoRedoBtns();
    }
  };

  fc.on('mouse:down',        opt => { activate(); onMouseDown(opt); });
  fc.on('mouse:move',        opt => { if (fabricCanvas === fc) onMouseMove(opt); });
  fc.on('mouse:up',          opt => { if (fabricCanvas === fc) onMouseUp(opt); });
  fc.on('object:modified',   ()  => { activate(); pushHistory(); });
  fc.on('path:created',      ()  => { activate(); pushHistory(); });
  fc.on('selection:created', opt => { activate(); onSelectionChange(opt); });
  fc.on('selection:updated', opt => { activate(); onSelectionChange(opt); });
  fc.on('selection:cleared', onSelectionCleared);
  fc.on('mouse:dblclick', opt => {
    activate();
    const t = opt.target;
    if (t?._isTable && t._tableState) openTableModalWithState(t._tableState, t);
    if (t?.name === 'form_field_dropdown') showDropdownOptModal(t);
  });

  // Text-hover outline: show dashed box over PDF text items in text tool mode
  fc.on('mouse:move', opt => {
    if (activeTool !== 'text') { clearTextHoverBox(pageNum); return; }
    const p   = fc.getPointer(opt.e);
    const hit = getTextItemAtPointSync(pageNum, p.x, p.y);
    if (hit) {
      showTextHoverBox(pageNum, hit.left, hit.top, hit.width, hit.height);
    } else {
      clearTextHoverBox(pageNum);
      // Eagerly load text content while hovering so next move is instant
      if (!pageTextCache[pageNum] && pdfDoc) getPageTextContent(pageNum).catch(() => {});
    }
  });
  fc.on('mouse:out', () => clearTextHoverBox(pageNum));

  fabricCanvases[pageNum] = fc;
  return fc;
}

let _pageObserver = null;

function setupPageObserver() {
  if (_pageObserver) _pageObserver.disconnect();
  const scrollEl = document.getElementById('canvasScroll');
  _pageObserver = new IntersectionObserver(entries => {
    let bestRatio = -1, bestPage = currentPage;
    entries.forEach(e => {
      if (e.intersectionRatio > bestRatio) {
        bestRatio = e.intersectionRatio;
        bestPage  = parseInt(e.target.dataset.page);
      }
    });
    if (bestPage !== currentPage && fabricCanvases[bestPage]) {
      currentPage  = bestPage;
      fabricCanvas = fabricCanvases[bestPage];
      updatePageLabel();
      updateUndoRedoBtns();
    }
  }, { root: scrollEl, threshold: [0, 0.25, 0.5, 0.75, 1.0] });

  document.querySelectorAll('.page-wrapper[data-page]').forEach(el => _pageObserver.observe(el));
}

// ─── Load PDF ─────────────────────────────────────────────────────────────────
async function loadPDF(file) {
  await loadFromBytes(await file.arrayBuffer(), file.name);
}

async function createBlankPDF(size, orientation, numPages, bgColor) {
  setStatus('Creating blank document…');
  try {
    const { PDFDocument, PageSizes, rgb } = PDFLib;

    const pageSizeMap = {
      Letter:  PageSizes.Letter,
      A4:      PageSizes.A4,
      Legal:   PageSizes.Legal,
      Tabloid: PageSizes.Tabloid,
      A3:      PageSizes.A3,
    };

    let [w, h] = pageSizeMap[size] || PageSizes.Letter;
    if (orientation === 'landscape') [w, h] = [h, w];

    const doc = await PDFDocument.create();

    // Parse hex background color to pdf-lib rgb()
    const hex = bgColor.replace('#', '');
    const r   = parseInt(hex.slice(0, 2), 16) / 255;
    const g   = parseInt(hex.slice(2, 4), 16) / 255;
    const b   = parseInt(hex.slice(4, 6), 16) / 255;
    const isWhite = r === 1 && g === 1 && b === 1;

    for (let i = 0; i < numPages; i++) {
      const page = doc.addPage([w, h]);
      if (!isWhite) {
        page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(r, g, b) });
      }
    }

    const bytes = await doc.save();
    const name  = `New Document.pdf`;

    // Reset new-doc panel back to start screen for next time
    document.getElementById('newDocPanel').style.display = 'none';
    document.getElementById('startScreen').style.display = '';

    await loadFromBytes(bytes.buffer, name);
  } catch (err) {
    setStatus('Failed to create document: ' + err.message);
    toast('Could not create document: ' + err.message, true);
    console.error(err);
  }
}

async function loadFromBytes(buffer, name, preservePageStates = false) {
  setStatus('Loading…');
  try {
    fileName = name;
    pdfBytes = buffer;

    pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    totalPages  = pdfDoc.numPages;
    currentPage = 1;

    // Clear per-document caches
    Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);
    Object.keys(pageBackgrounds).forEach(k => delete pageBackgrounds[k]);
    Object.keys(pageViewports).forEach(k => delete pageViewports[k]);
    // Always reset history; optionally preserve annotation states (for page add/remove)
    Object.keys(histStack).forEach(k => delete histStack[k]);
    Object.keys(histIdx).forEach(k => delete histIdx[k]);
    if (!preservePageStates) {
      Object.keys(pageStates).forEach(k => delete pageStates[k]);
    }

    // Dispose old Fabric canvases
    Object.values(fabricCanvases).forEach(fc => { try { fc.dispose(); } catch (_) {} });
    Object.keys(fabricCanvases).forEach(k => delete fabricCanvases[k]);
    fabricCanvas = null;

    document.getElementById('filenameBadge').value          = fileName.replace(/\.pdf$/i, '');
    document.getElementById('tbUpload').style.display       = 'none';
    document.getElementById('topbarFileInfo').style.display = 'flex';
    document.getElementById('tbEdit').style.display         = '';
    document.getElementById('uploadOverlay').style.display  = 'none';
    document.getElementById('canvasScroll').style.display   = '';

    // Build page slots in DOM
    const container = document.getElementById('pagesContainer');
    container.innerHTML = '';
    for (let p = 1; p <= totalPages; p++) {
      container.appendChild(createPageSlot(p));
    }

    // Render all pages
    for (let p = 1; p <= totalPages; p++) {
      await renderPage(p);
    }

    // Set page 1 as active
    fabricCanvas = fabricCanvases[1] || null;
    currentPage  = 1;

    setupPageObserver();
    document.getElementById('canvasScroll').scrollTop = 0;

    updatePageLabel();
    updateZoomLayout();
    updateUndoRedoBtns();
    setStatus(`"${fileName}" — ${totalPages} page${totalPages > 1 ? 's' : ''}.`);
  } catch (err) {
    setStatus('Failed to load: ' + err.message);
    toast('Could not open: ' + err.message, true);
    console.error(err);
  }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
async function renderPage(pageNum) {
  try {
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    // Render PDF page to offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width  = viewport.width;
    offscreen.height = viewport.height;
    const ctx = offscreen.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataURL = offscreen.toDataURL('image/jpeg', 0.92);
    pageBackgrounds[pageNum] = dataURL;
    pageViewports[pageNum]   = { width: viewport.width, height: viewport.height };

    // Create or reuse Fabric canvas for this page
    const fc = initFabricForPage(pageNum);
    if (!fc) return;

    fc.setWidth(viewport.width);
    fc.setHeight(viewport.height);

    // Restore annotations first — loadFromJSON calls clear() which wipes backgroundImage
    const saved = pageStates[pageNum];
    if (saved) {
      await new Promise(r => fc.loadFromJSON(saved, r, _fabricReviver));
    } else {
      fc.remove(...fc.getObjects());
    }

    // Set background image last so loadFromJSON cannot clear it
    await new Promise(resolve => {
      fabric.Image.fromURL(dataURL, bgImg => {
        bgImg.selectable = false;
        bgImg.evented    = false;
        bgImg.scaleToWidth(viewport.width);
        fc.setBackgroundImage(bgImg, () => { fc.renderAll(); resolve(); });
      });
    });

    applyZoomToPage(pageNum);
  } catch (err) {
    console.error(`Error rendering page ${pageNum}:`, err);
  }
}

// ─── Page Navigation ──────────────────────────────────────────────────────────
function goToPage(n) {
  if (!pdfDoc || n < 1 || n > totalPages) return;
  const wrapper = document.getElementById(`pageWrapper-${n}`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saveCurrentPageState() {
  if (!fabricCanvas) return;
  const json = fabricCanvas.toJSON(['name', '_dropdownOptions']);
  delete json.backgroundImage;
  delete json.background;
  pageStates[currentPage] = JSON.stringify(json);
}

function saveAllPageStates() {
  Object.entries(fabricCanvases).forEach(([p, fc]) => {
    const json = fc.toJSON(['name', '_dropdownOptions']);
    delete json.backgroundImage;
    delete json.background;
    pageStates[+p] = JSON.stringify(json);
  });
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
  const textIDs = ['optFontFamily','optFontSize','optTextAlign','optTextStyle','optLineHeight','optLetterSpacing','optTextHighlight'];
  textIDs.forEach(id => { document.getElementById(id).style.display = isText ? '' : 'none'; });
  document.getElementById('optBrush').style.display  = (tool === 'draw' || tool === 'shape') ? '' : 'none';
  document.getElementById('optColor').style.display  = tool === 'eraser' ? 'none' : '';
  document.getElementById('optShape').style.display  = tool === 'shape'  ? '' : 'none';
  document.getElementById('optForms').style.display  = tool === 'forms'  ? '' : 'none';
  if (tool !== 'forms') {
    // Clear form selection when switching away
    document.querySelectorAll('.form-item-btn').forEach(b => b.classList.remove('active'));
    const hint = document.getElementById('formsHint');
    if (hint) { hint.textContent = 'Select a type below, then click on the page to place it.'; hint.classList.remove('has-selection'); }
    activeFormType = null;
  }
  if (!isText) document.getElementById('optOpacity').style.display = 'none';

  // Cursor class — apply to all page canvas-outers
  document.querySelectorAll('.canvas-outer').forEach(o => {
    o.className = `canvas-outer tool-${tool}`;
  });

  // Clear text hover boxes when leaving text tool
  if (tool !== 'text') {
    document.querySelectorAll('.text-hover-box').forEach(b => b.classList.remove('visible'));
  }

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
    case 'shape':
    case 'forms':
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

function onSelectionChange() {
  syncTextControls();
  syncOpacityControl();
}

function onSelectionCleared() {
  const textIDs = ['optFontFamily','optFontSize','optTextAlign','optTextStyle','optLineHeight','optLetterSpacing','optTextHighlight'];
  if (activeTool !== 'text') {
    textIDs.forEach(id => { document.getElementById(id).style.display = 'none'; });
  }
  document.getElementById('optOpacity').style.display = 'none';
}

function syncTextControls() {
  const obj = fabricCanvas.getActiveObject();
  if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;

  // Show all text-specific controls
  ['optFontFamily','optFontSize','optTextAlign','optTextStyle','optLineHeight','optLetterSpacing','optTextHighlight']
    .forEach(id => { document.getElementById(id).style.display = ''; });
  document.getElementById('optBrush').style.display = 'none';

  // Basic props
  document.getElementById('colorPicker').value = rgbToHex(obj.fill) || '#000000';
  document.getElementById('fontFamily').value  = obj.fontFamily || 'Inter, system-ui, sans-serif';
  document.getElementById('fontSize').value = Math.round(obj.fontSize) || 18;

  // Alignment
  const align = obj.textAlign || 'left';
  document.querySelectorAll('[data-align]').forEach(b =>
    b.classList.toggle('active', b.dataset.align === align));

  // Style toggles
  document.getElementById('fmtBold').classList.toggle('active',      obj.fontWeight === 'bold');
  document.getElementById('fmtItalic').classList.toggle('active',    obj.fontStyle  === 'italic');
  document.getElementById('fmtUnderline').classList.toggle('active', !!obj.underline);
  document.getElementById('fmtStrike').classList.toggle('active',    !!obj.linethrough);
  document.getElementById('fmtOverline').classList.toggle('active',  !!obj.overline);

  // Line height
  const lh = obj.lineHeight || 1.16;
  document.getElementById('lineHeightSlider').value = lh;
  document.getElementById('lineHeightVal').textContent = lh.toFixed(1);

  // Letter spacing
  const ls = obj.charSpacing || 0;
  document.getElementById('letterSpacingSlider').value = ls;
  document.getElementById('letterSpacingVal').textContent = ls;

  // Highlight
  document.getElementById('textBgColor').value = obj.textBackgroundColor || '#fef08a';
}

function syncOpacityControl() {
  const obj = fabricCanvas.getActiveObject();
  if (!obj) return;
  const pct = Math.round((obj.opacity ?? 1) * 100);
  document.getElementById('optOpacity').style.display   = '';
  document.getElementById('opacitySlider').value        = pct;
  document.getElementById('opacityVal').textContent     = pct;
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

      const fontSizePx = Math.round(fs * RENDER_SCALE);
      const fontFamily = content.styles?.[item.fontName]?.fontFamily || 'sans-serif';
      const totalWidth = right - left;

      // Narrow down to the specific word the user clicked
      const wordInfo = detectWordAtX(item.str, canvasX - left, totalWidth, fontSizePx, fontFamily);
      if (wordInfo) {
        return {
          str:        wordInfo.word,
          left:       left + wordInfo.wordLeft,
          top,
          width:      wordInfo.wordWidth,
          height:     bottom - top,
          fontSize:   fontSizePx,
          fontFamily,
        };
      }

      return { str: item.str, left, top, width: totalWidth, height: bottom - top, fontSize: fontSizePx, fontFamily };
    }
  }
  return null;
}

function detectWordAtX(str, relativeX, totalWidth, fontSize, fontFamily) {
  const tmp = document.createElement('canvas');
  const ctx = tmp.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;
  const totalMeasured = ctx.measureText(str).width;
  if (!totalMeasured) return null;
  const scale = totalWidth / totalMeasured;

  let x = 0;
  for (const part of str.split(/(\s+)/)) {
    const w = ctx.measureText(part).width * scale;
    if (part.trim() && relativeX >= x && relativeX < x + w) {
      return { word: part, wordLeft: x, wordWidth: w };
    }
    x += w;
  }
  return null;
}

// Returns the bounding box of the text ITEM (not just a word) at (x,y) using the cache.
// Sync — returns null if cache not yet populated.
function getTextItemAtPointSync(pageNum, canvasX, canvasY) {
  const cached = pageTextCache[pageNum];
  if (!cached) return null;
  const { content, viewport } = cached;
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
      return { left, top, width: right - left, height: bottom - top };
    }
  }
  return null;
}

function showTextHoverBox(pageNum, left, top, width, height) {
  const box = document.getElementById(`textHoverBox-${pageNum}`);
  if (!box) return;
  box.style.left   = `${left   - 2}px`;
  box.style.top    = `${top    - 2}px`;
  box.style.width  = `${width  + 4}px`;
  box.style.height = `${height + 4}px`;
  box.classList.add('visible');
}

function clearTextHoverBox(pageNum) {
  const box = document.getElementById(`textHoverBox-${pageNum}`);
  if (box) box.classList.remove('visible');
}

// Restores custom properties (name, _dropdownOptions) after loadFromJSON
function _fabricReviver(serialized, fabricObj) {
  if (serialized.name)             fabricObj.name             = serialized.name;
  if (serialized._dropdownOptions) fabricObj._dropdownOptions = serialized._dropdownOptions;
}

// ─── Form Element Creators ────────────────────────────────────────────────────
function createFormElement(type, x, y, color) {
  switch (type) {
    case 'sym-x':     return _sym('✕', x, y, color, 26);
    case 'sym-check': return _sym('✓', x, y, color, 26);
    case 'sym-square':return _sym('■', x, y, color, 22);
    case 'text-single': return _formTextField(x, y, 200, 30, false, color);
    case 'text-multi':  return _formTextField(x, y, 200, 80, true,  color);
    case 'radio':       return _formRadio(x, y, color);
    case 'checkbox':    return _formCheckbox(x, y, color);
    case 'dropdown':    return _formDropdown(x, y, color);
    default: return null;
  }
}

function _sym(char, x, y, color, size) {
  return new fabric.IText(char, {
    left: x, top: y, fontSize: size, fill: color,
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: true, evented: true,
  });
}

function _formTextField(x, y, w, h, multiline, color) {
  const elements = [];

  elements.push(new fabric.Rect({
    left: 0, top: 0, width: w, height: h,
    fill: 'rgba(239,246,255,0.7)', stroke: color, strokeWidth: 1.5,
    rx: 3, ry: 3, selectable: false, evented: false,
  }));

  const label = multiline ? 'Multiline text...' : 'Text field...';
  elements.push(new fabric.Text(label, {
    left: 7, top: multiline ? 7 : Math.round((h - 12) / 2),
    fontSize: 11, fill: '#94a3b8',
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: false, evented: false,
  }));

  if (multiline) {
    // Faint guide lines suggesting rows
    for (let i = 1; i <= 2; i++) {
      const ly = 8 + i * Math.round((h - 10) / 3);
      elements.push(new fabric.Line([7, ly, w - 7, ly], {
        stroke: '#cbd5e1', strokeWidth: 0.7, selectable: false, evented: false,
      }));
    }
  }

  return new fabric.Group(elements, {
    left: x, top: y, selectable: true, evented: true,
    name: multiline ? 'form_field_text-multi' : 'form_field_text-single',
  });
}

function _formRadio(x, y, color) {
  const r = 9;
  const circle = new fabric.Circle({
    left: 0, top: 0, radius: r,
    fill: 'white', stroke: color, strokeWidth: 1.5,
    originX: 'left', originY: 'top', selectable: false, evented: false,
  });
  const label = new fabric.Text('Option', {
    left: r * 2 + 8, top: Math.round(r - 7),
    fontSize: 13, fill: '#334155',
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: false, evented: false,
  });
  return new fabric.Group([circle, label], { left: x, top: y, selectable: true, evented: true, name: 'form_field_radio' });
}

function _formCheckbox(x, y, color) {
  const size = 17;
  const box = new fabric.Rect({
    left: 0, top: 0, width: size, height: size,
    fill: 'white', stroke: color, strokeWidth: 1.5,
    rx: 2, ry: 2, selectable: false, evented: false,
  });
  const label = new fabric.Text('Checkbox', {
    left: size + 8, top: Math.round((size - 13) / 2),
    fontSize: 13, fill: '#334155',
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: false, evented: false,
  });
  return new fabric.Group([box, label], { left: x, top: y, selectable: true, evented: true, name: 'form_field_checkbox' });
}

function _formDropdown(x, y, color) {
  const w = 190, h = 30;
  const rect = new fabric.Rect({
    left: 0, top: 0, width: w, height: h,
    fill: 'rgba(239,246,255,0.7)', stroke: color, strokeWidth: 1.5,
    rx: 3, ry: 3, selectable: false, evented: false,
  });
  const sep = new fabric.Line([w - 30, 5, w - 30, h - 5], {
    stroke: color, strokeWidth: 1, opacity: 0.5, selectable: false, evented: false,
  });
  const placeholder = new fabric.Text('Select an option...', {
    left: 8, top: Math.round((h - 11) / 2),
    fontSize: 11, fill: '#94a3b8',
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: false, evented: false,
  });
  const arrow = new fabric.Text('▾', {
    left: w - 21, top: Math.round((h - 15) / 2),
    fontSize: 14, fill: color,
    fontFamily: 'Arial, Helvetica, sans-serif',
    selectable: false, evented: false,
  });
  const group = new fabric.Group([rect, sep, placeholder, arrow], {
    left: x, top: y, selectable: true, evented: true, name: 'form_field_dropdown',
  });
  group._dropdownOptions = ['Option 1', 'Option 2', 'Option 3'];
  return group;
}

// ─── Shape Path Builders ──────────────────────────────────────────────────────
function _shapeBounds(x1, y1, x2, y2) {
  return [Math.min(x1,x2), Math.max(x1,x2), Math.min(y1,y2), Math.max(y1,y2)];
}

function buildShapePath(key, x1, y1, x2, y2) {
  const [l, r, t, b] = _shapeBounds(x1, y1, x2, y2);
  const cx = (l+r)/2, cy = (t+b)/2;
  const rx = (r-l)/2, ry = (b-t)/2;

  switch (key) {
    case 'rect':
      return `M${l},${t} L${r},${t} L${r},${b} L${l},${b}Z`;

    case 'roundrect': {
      const rr = Math.max(0, Math.min(14, rx * 0.4, ry * 0.4));
      return `M${l+rr},${t} L${r-rr},${t} Q${r},${t} ${r},${t+rr}` +
             ` L${r},${b-rr} Q${r},${b} ${r-rr},${b}` +
             ` L${l+rr},${b} Q${l},${b} ${l},${b-rr}` +
             ` L${l},${t+rr} Q${l},${t} ${l+rr},${t}Z`;
    }

    case 'circle': {
      const cr = Math.min(rx, ry);
      const ncx = x1 + (x2 >= x1 ?  cr : -cr);
      const ncy = y1 + (y2 >= y1 ?  cr : -cr);
      return `M${ncx-cr},${ncy} A${cr},${cr} 0 0 1 ${ncx+cr},${ncy}` +
             ` A${cr},${cr} 0 0 1 ${ncx-cr},${ncy}Z`;
    }

    case 'ellipse':
      if (rx < 1 || ry < 1) return `M${l},${cy} L${r},${cy}`;
      return `M${l},${cy} A${rx},${ry} 0 0 1 ${r},${cy}` +
             ` A${rx},${ry} 0 0 1 ${l},${cy}Z`;

    case 'triangle':
      return `M${cx},${t} L${r},${b} L${l},${b}Z`;

    case 'diamond':
      return `M${cx},${t} L${r},${cy} L${cx},${b} L${l},${cy}Z`;

    case 'hexagon':
      return _nGonPath(cx, cy, rx, ry, 6);

    case 'pentagon':
      return _nGonPath(cx, cy, rx, ry, 5);

    case 'star':
      return _starPath(cx, cy, rx, ry, 5);

    case 'line':
      return `M${x1},${y1} L${x2},${y2}`;

    case 'arrow':
      return _arrowPath(x1, y1, x2, y2, false);

    case 'dbarrow':
      return _arrowPath(x1, y1, x2, y2, true);

    default:
      return `M${l},${t} L${r},${t} L${r},${b} L${l},${b}Z`;
  }
}

function _nGonPath(cx, cy, rx, ry, sides) {
  let d = '';
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i / sides) - Math.PI / 2;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    d += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  }
  return d + 'Z';
}

function _starPath(cx, cy, outerRx, outerRy, pts) {
  const inRx = outerRx * 0.38, inRy = outerRy * 0.38;
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a  = (Math.PI * i / pts) - Math.PI / 2;
    const rr = i % 2 === 0;
    const x  = cx + (rr ? outerRx : inRx) * Math.cos(a);
    const y  = cy + (rr ? outerRy : inRy) * Math.sin(a);
    d += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  }
  return d + 'Z';
}

function _arrowPath(x1, y1, x2, y2, doubleHead) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return `M${x1},${y1} L${x2},${y2}`;
  const angle = Math.atan2(dy, dx);
  const hl    = Math.max(12, Math.min(len * 0.28, 22));
  const ha    = 28 * Math.PI / 180;

  const ax1 = x2 - hl * Math.cos(angle - ha);
  const ay1 = y2 - hl * Math.sin(angle - ha);
  const ax2 = x2 - hl * Math.cos(angle + ha);
  const ay2 = y2 - hl * Math.sin(angle + ha);

  let d = `M${x1},${y1} L${x2},${y2} M${ax1},${ay1} L${x2},${y2} L${ax2},${ay2}`;

  if (doubleHead) {
    const bx1 = x1 + hl * Math.cos(angle - ha);
    const by1 = y1 + hl * Math.sin(angle - ha);
    const bx2 = x1 + hl * Math.cos(angle + ha);
    const by2 = y1 + hl * Math.sin(angle + ha);
    d += ` M${bx1},${by1} L${x1},${y1} L${bx2},${by2}`;
  }
  return d;
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
      // Place editable replacement text preserving original properties
      const txt = new fabric.IText(hit.str, {
        left:       hit.left,
        top:        hit.top,
        fontSize:   hit.fontSize,
        fill:       '#000000',
        fontFamily: hit.fontFamily,
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

    // Auto-switch back to select so the next click doesn't add another text box
    activeTool = 'select';
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === 'select');
    });
    document.querySelectorAll('.canvas-outer').forEach(o => { o.className = 'canvas-outer tool-select'; });
    fabricCanvas.selection = true;

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

  if (activeTool === 'highlight') {
    isDrawingShape = true;
    shapeOriginX   = p.x;
    shapeOriginY   = p.y;
    activeShapeObj = new fabric.Rect({
      left: p.x, top: p.y, width: 0, height: 0,
      fill: 'rgba(255,220,0,0.35)', stroke: 'rgba(200,170,0,0.5)',
      strokeWidth: 1, selectable: true,
    });
    fabricCanvas.add(activeShapeObj);
    fabricCanvas.renderAll();
  }

  if (activeTool === 'shape') {
    isDrawingShape = true;
    shapeOriginX   = p.x;
    shapeOriginY   = p.y;
    activeShapeObj = null; // created on first mouse:move
  }

  if (activeTool === 'forms' && activeFormType) {
    const color = document.getElementById('colorPicker').value;
    const obj   = createFormElement(activeFormType, p.x, p.y, color);
    if (obj) {
      fabricCanvas.add(obj);
      fabricCanvas.setActiveObject(obj);
      fabricCanvas.renderAll();
      pushHistory();
      if (activeFormType === 'dropdown') {
        showDropdownOptModal(obj); // open options editor right after placement
      }
    }
    setTool('select');
  }
}

function onMouseMove(opt) {
  if (!isDrawingShape) return;
  const p = fabricCanvas.getPointer(opt.e);

  if (activeTool === 'shape') {
    // Remove previous preview and recreate as a Path (handles all shape types uniformly)
    if (activeShapeObj) { fabricCanvas.remove(activeShapeObj); activeShapeObj = null; }
    const pathStr  = buildShapePath(activeShape, shapeOriginX, shapeOriginY, p.x, p.y);
    const isOpen   = activeShape === 'line' || activeShape === 'arrow' || activeShape === 'dbarrow';
    const color    = document.getElementById('colorPicker').value;
    const sw       = Math.max(1, parseInt(document.getElementById('brushSize').value));
    activeShapeObj = new fabric.Path(pathStr, {
      fill:          isOpen ? null : 'transparent',
      stroke:        color,
      strokeWidth:   sw,
      selectable:    true,
      evented:       true,
      objectCaching: false,
    });
    fabricCanvas.add(activeShapeObj);
    fabricCanvas.renderAll();
    return;
  }

  // highlight drag
  if (!activeShapeObj) return;
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
  if (activeShapeObj) {
    const bb = activeShapeObj.getBoundingRect();
    if (bb.width < 3 && bb.height < 3) {
      fabricCanvas.remove(activeShapeObj);
      fabricCanvas.renderAll();
    } else {
      pushHistory();
    }
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
    case 'r': case 'R': setTool('shape');     break;
    case 'f': case 'F': setTool('forms');     break;
    case 'e': case 'E': setTool('eraser');    break;
    case 'i': case 'I': document.getElementById('imageFileInput').click(); break;
    case 'Delete': case 'Backspace': {
      const objs = fabricCanvas.getActiveObjects();
      if (objs.length) {
        fabricCanvas.discardActiveObject();
        fabricCanvas.remove(...objs);
        fabricCanvas.renderAll();
        pushHistory();
      }
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

  const json = fabricCanvas.toJSON(['name', '_dropdownOptions']);
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
  fabricCanvas.loadFromJSON(jsonStr, () => {
    // Re-apply background after loadFromJSON clears it via clear()
    const bgURL = pageBackgrounds[currentPage];
    if (!bgURL) { fabricCanvas.renderAll(); return; }
    const vp = pageViewports[currentPage];
    fabric.Image.fromURL(bgURL, bgImg => {
      bgImg.selectable = false;
      bgImg.evented    = false;
      bgImg.scaleToWidth(vp.width);
      fabricCanvas.setBackgroundImage(bgImg, () => fabricCanvas.renderAll());
    });
  }, _fabricReviver);
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

function applyZoomToPage(pageNum, zoom) {
  zoom = zoom ?? ZOOM_STEPS[zoomIndex];
  const vp = pageViewports[pageNum];
  if (!vp) return;
  const spacer = document.getElementById(`pageSpacer-${pageNum}`);
  const outer  = document.getElementById(`canvasOuter-${pageNum}`);
  if (!spacer || !outer) return;
  spacer.style.width         = Math.round(vp.width  * zoom) + 'px';
  spacer.style.height        = Math.round(vp.height * zoom) + 'px';
  outer.style.transform      = `scale(${zoom})`;
  outer.style.transformOrigin = 'top left';
}

function updateZoomLayout() {
  const zoom = ZOOM_STEPS[zoomIndex];
  for (let p = 1; p <= totalPages; p++) applyZoomToPage(p, zoom);
  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  document.getElementById('zoomOut').disabled = zoomIndex === 0;
  document.getElementById('zoomIn').disabled  = zoomIndex === ZOOM_STEPS.length - 1;
}

// ─── Add Page ─────────────────────────────────────────────────────────────────
async function addPageAfter(afterPageNum) {
  if (!pdfDoc) return;
  setStatus('Adding page…');
  try {
    // Save all canvas states with renumbering: pages after insertion get +1
    const shiftedStates = {};
    saveAllPageStates();
    Object.entries(pageStates).forEach(([p, state]) => {
      const pNum = parseInt(p);
      shiftedStates[pNum > afterPageNum ? pNum + 1 : pNum] = state;
    });

    // Build new PDF with blank page inserted after afterPageNum
    const { PDFDocument } = PDFLib;
    const sourcePdf = await PDFDocument.load(pdfBytes.slice(0));
    const refPage   = sourcePdf.getPage(Math.min(afterPageNum, sourcePdf.getPageCount()) - 1);
    const { width, height } = refPage.getSize();

    const outputPdf = await PDFDocument.create();
    const pageCount = sourcePdf.getPageCount();
    const copies    = await outputPdf.copyPages(sourcePdf, [...Array(pageCount).keys()]);

    for (let i = 0; i < afterPageNum; i++) outputPdf.addPage(copies[i]);
    outputPdf.addPage([width, height]);
    for (let i = afterPageNum; i < pageCount; i++) outputPdf.addPage(copies[i]);

    const newBytes = await outputPdf.save();

    // Pre-populate shifted states before reload so they survive the load
    Object.keys(pageStates).forEach(k => delete pageStates[k]);
    Object.assign(pageStates, shiftedStates);

    await loadFromBytes(newBytes.buffer, fileName, true);

    // Scroll to newly inserted page
    setTimeout(() => {
      const wrapper = document.getElementById(`pageWrapper-${afterPageNum + 1}`);
      if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);

    toast(`Blank page added after page ${afterPageNum}.`);
  } catch (err) {
    setStatus('Error: ' + err.message);
    toast('Could not add page: ' + err.message, true);
    console.error(err);
  }
}

// ─── Download / Export ────────────────────────────────────────────────────────
async function downloadPDF() {
  if (!pdfDoc || !pdfBytes) return;
  saveAllPageStates();

  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  setStatus('Generating PDF…');

  try {
    const { PDFDocument } = PDFLib;
    const sourcePdf = await PDFDocument.load(pdfBytes.slice(0));
    const outputPdf = await PDFDocument.create();

    for (let i = 1; i <= totalPages; i++) {
      setStatus(`Exporting page ${i} of ${totalPages}…`);
      const { regular, formFields } = _splitPageAnnotations(i);
      const hasRegular = regular.length > 0;
      const hasForms   = formFields.length > 0;
      const origPage   = sourcePdf.getPage(i - 1);
      const { width: origW, height: origH } = origPage.getSize();

      let outPage;

      if (!hasRegular) {
        // No drawn annotations — copy the original page as-is
        const [copied] = await outputPdf.copyPages(sourcePdf, [i - 1]);
        outPage = outputPdf.addPage(copied);
      } else {
        // Composite only the regular (non-form-field) annotations
        if (!pageBackgrounds[i]) await renderPageOffscreen(i);

        const compositeURL = await compositeAnnotations(i, regular);
        const imgBytes = dataURLtoBytes(compositeURL);
        const img      = await outputPdf.embedJpg(imgBytes);
        outPage = outputPdf.addPage([origW, origH]);
        outPage.drawImage(img, { x: 0, y: 0, width: origW, height: origH });
      }

      // Embed interactive AcroForm fields on top of any placed form elements
      if (hasForms) {
        await addPdfFormFields(outputPdf, outPage, formFields, origH, i);
      }
    }

    const outBytes = await outputPdf.save();
    const blob     = new Blob([outBytes], { type: 'application/pdf' });
    const baseName = document.getElementById('filenameBadge').value.trim() || fileName.replace(/\.pdf$/i, '');
    const outName  = baseName + '.pdf';
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

function _splitPageAnnotations(pageNum) {
  const s = pageStates[pageNum];
  if (!s) return { regular: [], formFields: [] };
  try {
    const objs = JSON.parse(s).objects || [];
    const regular    = objs.filter(o => !o.name || !o.name.startsWith('form_field_'));
    const formFields = objs.filter(o =>  o.name &&  o.name.startsWith('form_field_'));
    return { regular, formFields };
  } catch { return { regular: [], formFields: [] }; }
}

function hasAnnotations(pageNum) {
  return _splitPageAnnotations(pageNum).regular.length > 0;
}

function hasFormFields(pageNum) {
  return _splitPageAnnotations(pageNum).formFields.length > 0;
}

// compositeAnnotations now takes an optional objects array to render (for filtering out form fields)
async function compositeAnnotations(pageNum, objectsOverride) {
  const bgURL = pageBackgrounds[pageNum];

  return new Promise((resolve, reject) => {
    const bgImg = new Image();
    bgImg.onload = () => {
      const comp = document.createElement('canvas');
      comp.width  = bgImg.width;
      comp.height = bgImg.height;
      const ctx   = comp.getContext('2d');
      ctx.drawImage(bgImg, 0, 0);

      const tempEl = document.createElement('canvas');
      tempEl.width  = bgImg.width;
      tempEl.height = bgImg.height;

      const tempFabric = new fabric.StaticCanvas(tempEl, {
        width:  bgImg.width,
        height: bgImg.height,
        enableRetinaScaling: false,
      });

      // Use filtered object list if provided; otherwise use full saved state
      const jsonStr = objectsOverride !== undefined
        ? JSON.stringify({ version: '5.3.1', objects: objectsOverride })
        : pageStates[pageNum];

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

// Embed real PDF AcroForm fields for each tracked form element
async function addPdfFormFields(pdf, pdfPage, formFields, origPageHeight, pageNum) {
  const form = pdf.getForm();
  for (let idx = 0; idx < formFields.length; idx++) {
    const obj  = formFields[idx];
    const type = (obj.name || '').replace('form_field_', '');

    // Canvas coords → PDF points (y-axis flipped, divided by RENDER_SCALE)
    const cl = obj.left   ?? 0;
    const ct = obj.top    ?? 0;
    const cw = (obj.width  ?? 100) * (obj.scaleX ?? 1);
    const ch = (obj.height ?? 30)  * (obj.scaleY ?? 1);

    const px = cl / RENDER_SCALE;
    const pw = cw / RENDER_SCALE;
    const ph = ch / RENDER_SCALE;
    // PDF y=0 is page BOTTOM, canvas y=0 is page TOP
    const py = origPageHeight - (ct + ch) / RENDER_SCALE;

    // Unique name per field: type + page number + index
    const fieldName = `${type}_pg${pageNum}_${idx}`;

    try {
      switch (type) {
        case 'text-single': {
          const f = form.createTextField(fieldName);
          f.addToPage(pdfPage, { x: px, y: py, width: pw, height: ph });
          f.setFontSize(11);
          break;
        }
        case 'text-multi': {
          const f = form.createTextField(fieldName);
          f.addToPage(pdfPage, { x: px, y: py, width: pw, height: ph });
          f.setFontSize(11);
          f.enableMultiline();
          break;
        }
        case 'checkbox': {
          // Only the small square is interactive, not the label
          const ctrlPts = 17 / RENDER_SCALE;
          const cyAdj   = origPageHeight - (ct + 17) / RENDER_SCALE;
          const f = form.createCheckBox(fieldName);
          f.addToPage(pdfPage, { x: px, y: cyAdj, width: ctrlPts, height: ctrlPts });
          break;
        }
        case 'radio': {
          // Radio circle (r=9, so diameter=18) at top-left of group
          const ctrlPts = 18 / RENDER_SCALE;
          const cyAdj   = origPageHeight - (ct + 18) / RENDER_SCALE;
          const rg = form.createRadioGroup(fieldName);
          rg.addOptionToPage('on', pdfPage, { x: px, y: cyAdj, width: ctrlPts, height: ctrlPts });
          break;
        }
        case 'dropdown': {
          const f = form.createDropdown(fieldName);
          f.addToPage(pdfPage, { x: px, y: py, width: pw, height: ph });
          const opts = Array.isArray(obj._dropdownOptions) && obj._dropdownOptions.length
            ? obj._dropdownOptions
            : ['Option 1', 'Option 2', 'Option 3'];
          f.setOptions(opts);
          try { f.setFontSize(11); } catch (_) {}
          break;
        }
        // sym-x / sym-check / sym-square are just visual IText, no interactive field needed
      }
    } catch (err) {
      console.warn(`Could not embed PDF form field "${type}":`, err);
    }
  }
}

async function renderPageOffscreen(pageNum) {
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
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

// ─── Dropdown Options Modal ───────────────────────────────────────────────────
let _dropdownTarget = null; // Fabric group being configured

function showDropdownOptModal(fabricGroup) {
  _dropdownTarget = fabricGroup;
  const opts = fabricGroup._dropdownOptions || ['Option 1', 'Option 2', 'Option 3'];

  const list = document.getElementById('dropdownOptList');
  list.innerHTML = '';
  opts.forEach(o => _addDropdownOptRow(o));

  document.getElementById('dropdownOptModal').style.display = 'flex';
  // Focus the first input
  const first = list.querySelector('input');
  if (first) setTimeout(() => first.focus(), 50);
}

function _addDropdownOptRow(value = '') {
  const list = document.getElementById('dropdownOptList');
  const row  = document.createElement('div');
  row.className = 'dropdown-opt-row';

  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.value       = value;
  inp.placeholder = 'Option text…';
  // Pressing Enter in an input adds a new row below
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _addDropdownOptRow();
      list.lastElementChild?.querySelector('input')?.focus();
    }
  });

  const rm = document.createElement('button');
  rm.className = 'dropdown-opt-remove';
  rm.title     = 'Remove';
  rm.innerHTML = '&times;';
  rm.addEventListener('click', () => {
    row.remove();
    // Keep at least one row
    if (!list.children.length) _addDropdownOptRow();
  });

  row.appendChild(inp);
  row.appendChild(rm);
  list.appendChild(row);
}

function _saveDropdownOpts() {
  const opts = [...document.querySelectorAll('#dropdownOptList .dropdown-opt-row input')]
    .map(i => i.value.trim())
    .filter(Boolean);

  if (!opts.length || !_dropdownTarget) { _closeDropdownOptModal(); return; }

  _dropdownTarget._dropdownOptions = opts;

  // Update the placeholder text inside the group so the visual reflects the choices
  const textItems = _dropdownTarget.getObjects('text');
  const placeholder = textItems.find(t => t.text.startsWith('Select') || t.text.endsWith('…') || t.text.includes('option'));
  if (placeholder) {
    placeholder.set('text', opts[0] + (opts.length > 1 ? ` (${opts.length})` : ''));
    _dropdownTarget.dirty = true;
    fabricCanvas.renderAll();
  }

  pushHistory();
  _closeDropdownOptModal();
}

function _closeDropdownOptModal() {
  document.getElementById('dropdownOptModal').style.display = 'none';
  _dropdownTarget = null;
}

function setupDropdownOptModal() {
  document.getElementById('dropdownOptClose') .addEventListener('click', _closeDropdownOptModal);
  document.getElementById('dropdownOptCancel').addEventListener('click', _closeDropdownOptModal);
  document.getElementById('dropdownOptDone')  .addEventListener('click', _saveDropdownOpts);
  document.getElementById('dropdownOptAdd')   .addEventListener('click', () => {
    _addDropdownOptRow();
    document.getElementById('dropdownOptList').lastElementChild?.querySelector('input')?.focus();
  });
  // Click outside modal box to close
  document.getElementById('dropdownOptModal').addEventListener('click', e => {
    if (e.target === document.getElementById('dropdownOptModal')) _closeDropdownOptModal();
  });
}

// ─── Signature Modal ──────────────────────────────────────────────────────────
function setupSignatureModal() {
  // Open button (in sidebar — only exists after file loads, but listener is safe to bind early)
  document.getElementById('openSigBtn').addEventListener('click', openSignatureModal);

  // Close
  document.getElementById('sigClose').addEventListener('click', closeSignatureModal);
  document.getElementById('sigModal').addEventListener('click', e => {
    if (e.target === document.getElementById('sigModal')) closeSignatureModal();
  });

  // Tab switching
  document.querySelectorAll('.sig-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.sigtab;
      document.getElementById('sigPanelDraw').style.display = which === 'draw' ? '' : 'none';
      document.getElementById('sigPanelType').style.display = which === 'type' ? '' : 'none';
    });
  });

  // Draw canvas
  const sigCanvas = document.getElementById('sigCanvas');
  const sigCtx    = sigCanvas.getContext('2d');
  let drawing = false, lx = 0, ly = 0;

  function sigPos(e) {
    const r = sigCanvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function sigStart(e) {
    drawing = true;
    const { x, y } = sigPos(e);
    lx = x; ly = y;
    sigCtx.beginPath();
    sigCtx.arc(x, y, 1, 0, Math.PI * 2);
    sigCtx.fillStyle = document.getElementById('sigColorPicker').value;
    sigCtx.fill();
  }
  function sigDraw(e) {
    if (!drawing) return;
    const { x, y } = sigPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(lx, ly);
    sigCtx.lineTo(x, y);
    sigCtx.strokeStyle = document.getElementById('sigColorPicker').value;
    sigCtx.lineWidth   = 2.2;
    sigCtx.lineCap     = 'round';
    sigCtx.lineJoin    = 'round';
    sigCtx.stroke();
    lx = x; ly = y;
  }
  function sigEnd() { drawing = false; }

  sigCanvas.addEventListener('mousedown',  sigStart);
  sigCanvas.addEventListener('mousemove',  sigDraw);
  sigCanvas.addEventListener('mouseup',    sigEnd);
  sigCanvas.addEventListener('mouseleave', sigEnd);
  sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); sigStart(e); }, { passive: false });
  sigCanvas.addEventListener('touchmove',  e => { e.preventDefault(); sigDraw(e);  }, { passive: false });
  sigCanvas.addEventListener('touchend',   sigEnd);

  // Clear
  document.getElementById('sigClearBtn').addEventListener('click', () => {
    const which = document.querySelector('.sig-tab.active')?.dataset.sigtab;
    if (which === 'draw') {
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    } else {
      document.getElementById('sigTypeInput').value = '';
      document.getElementById('sigTypePreview').textContent = 'Your Signature';
    }
  });

  // Type preview — live update
  function updateTypePreview() {
    const text  = document.getElementById('sigTypeInput').value.trim() || 'Your Signature';
    const font  = document.querySelector('input[name="sigFont"]:checked')?.value || 'Dancing Script';
    const color = document.getElementById('sigColorPicker').value;
    const prev  = document.getElementById('sigTypePreview');
    prev.textContent    = text;
    prev.style.fontFamily = `'${font}', cursive`;
    prev.style.color    = color;
  }
  document.getElementById('sigTypeInput').addEventListener('input', updateTypePreview);
  document.querySelectorAll('input[name="sigFont"]').forEach(r => r.addEventListener('change', updateTypePreview));
  document.getElementById('sigColorPicker').addEventListener('input', updateTypePreview);

  // Place
  document.getElementById('sigPlaceBtn').addEventListener('click', placeSignature);
}

function openSignatureModal() {
  document.getElementById('sigModal').style.display = 'flex';
}

function closeSignatureModal() {
  document.getElementById('sigModal').style.display = 'none';
}

async function placeSignature() {
  const which = document.querySelector('.sig-tab.active')?.dataset.sigtab;
  let dataURL;

  if (which === 'draw') {
    const sigCanvas = document.getElementById('sigCanvas');
    const sigCtx    = sigCanvas.getContext('2d');
    // Check if anything was actually drawn
    const pixels = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height).data;
    const hasInk = pixels.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasInk) { toast('Please draw your signature first.', true); return; }
    dataURL = sigCanvas.toDataURL('image/png');

  } else {
    const text  = document.getElementById('sigTypeInput').value.trim();
    if (!text) { toast('Please type your name or initials first.', true); return; }
    const font  = document.querySelector('input[name="sigFont"]:checked')?.value || 'Dancing Script';
    const color = document.getElementById('sigColorPicker').value;

    // Ensure Google Font is loaded before drawing to canvas
    try { await document.fonts.load(`bold 72px '${font}'`); } catch (_) {}

    const off = document.createElement('canvas');
    const ctx = off.getContext('2d');
    const fs  = 72;
    ctx.font  = `bold ${fs}px '${font}', cursive`;
    const w   = Math.ceil(ctx.measureText(text).width) + 32;
    const h   = Math.ceil(fs * 1.5);
    off.width  = w;
    off.height = h;
    ctx.font      = `bold ${fs}px '${font}', cursive`;
    ctx.fillStyle = color;
    ctx.fillText(text, 16, fs * 1.1);
    dataURL = off.toDataURL('image/png');
  }

  closeSignatureModal();

  fabric.Image.fromURL(dataURL, img => {
    // Scale so the signature is a reasonable fraction of the page width
    const maxW = fabricCanvas.width  * 0.38;
    const maxH = fabricCanvas.height * 0.15;
    if (img.width > maxW)             img.scaleToWidth(maxW);
    if (img.getScaledHeight() > maxH) img.scaleToHeight(maxH);

    // Place at bottom-right area (typical signature spot)
    img.set({
      left: fabricCanvas.width  * 0.55,
      top:  fabricCanvas.height * 0.78,
    });

    fabricCanvas.add(img);
    fabricCanvas.setActiveObject(img);
    fabricCanvas.renderAll();
    pushHistory();
    setTool('select');
    toast('Signature placed — drag it to reposition.');
  });
}

// ─── HTML Content Modal ───────────────────────────────────────────────────────
function setupHtmlModal() {
  document.getElementById('openHtmlBtn').addEventListener('click', openHtmlModal);
  document.getElementById('htmlClose').addEventListener('click', closeHtmlModal);
  document.getElementById('htmlCancelBtn').addEventListener('click', closeHtmlModal);
  document.getElementById('htmlModal').addEventListener('click', e => {
    if (e.target === document.getElementById('htmlModal')) closeHtmlModal();
  });

  // Debounced live preview scheduler
  let previewTimer;
  function schedulePreview() {
    document.getElementById('htmlPreviewStatus').textContent = 'updating…';
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      updateHtmlPreview();
      document.getElementById('htmlPreviewStatus').textContent = '';
    }, 350);
  }

  // Tab key inserts 2 spaces instead of moving focus
  [document.getElementById('htmlCodeInput'), document.getElementById('cssCodeInput')].forEach(ta => {
    ta.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 2;
      schedulePreview();
    });
    ta.addEventListener('input', schedulePreview);
  });

  // HTML / CSS tab switching
  document.querySelectorAll('.html-code-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.html-code-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.codetab;
      document.getElementById('htmlCodeInput').style.display = which === 'html' ? '' : 'none';
      document.getElementById('cssCodeInput').style.display  = which === 'css'  ? '' : 'none';
    });
  });

  document.getElementById('htmlInsertBtn').addEventListener('click', insertHtmlContent);
}

function openHtmlModal() {
  document.getElementById('htmlModal').style.display = 'flex';
  updateHtmlPreview();
}

function closeHtmlModal() {
  document.getElementById('htmlModal').style.display = 'none';
}

function updateHtmlPreview() {
  const html  = document.getElementById('htmlCodeInput').value;
  const css   = document.getElementById('cssCodeInput').value;
  const frame = document.getElementById('htmlPreviewFrame');
  frame.srcdoc = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:20px;font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1e293b}
${css}
</style>
</head><body>${html}</body></html>`;
}

async function insertHtmlContent() {
  if (typeof html2canvas === 'undefined') {
    toast('html2canvas library failed to load.', true);
    return;
  }

  const frame = document.getElementById('htmlPreviewFrame');
  const btn   = document.getElementById('htmlInsertBtn');
  btn.disabled = true;

  try {
    // Wait for the iframe to finish rendering
    if (frame.contentDocument?.readyState !== 'complete') {
      await new Promise(r => frame.addEventListener('load', r, { once: true }));
    }

    const body = frame.contentDocument.body;
    const captureCanvas = await html2canvas(body, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width:  body.scrollWidth,
      height: body.scrollHeight,
    });

    const dataURL = captureCanvas.toDataURL('image/png');
    closeHtmlModal();

    fabric.Image.fromURL(dataURL, img => {
      const maxW = fabricCanvas.width  * 0.85;
      const maxH = fabricCanvas.height * 0.85;
      if (img.width > maxW)             img.scaleToWidth(maxW);
      if (img.getScaledHeight() > maxH) img.scaleToHeight(maxH);
      img.set({
        left: (fabricCanvas.width  - img.getScaledWidth())  / 2,
        top:  (fabricCanvas.height - img.getScaledHeight()) / 2,
      });
      fabricCanvas.add(img);
      fabricCanvas.setActiveObject(img);
      fabricCanvas.renderAll();
      pushHistory();
      setTool('select');
      toast('HTML content inserted — drag to reposition.');
    });
  } catch (err) {
    toast('Capture failed: ' + err.message, true);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ─── Table Modal ──────────────────────────────────────────────────────────────
let tblResizing = null; // { type:'col'|'row', idx, startX/Y, startSize }

const tblState = {
  rows: 3, cols: 4,
  cells: null,
  sel: new Set(),
  lastR: -1, lastC: -1,
  headerRow: true,
  striped: false,
  borderW: 1,
  borderColor: '#cbd5e1',
  headerBg: '#334155',
  headerFg: '#ffffff',
  altBg: '#f8fafc',
  colWidths: null,
  rowHeights: null,
  _editingObj: null,
};

function tblEmptyCell() {
  return {
    content: '', bold: false, italic: false, underline: false,
    align: 'left', color: '', bg: '', fontSize: 13,
    rowSpan: 1, colSpan: 1, hidden: false,
  };
}

function setupTableModal() {
  document.getElementById('openTableBtn').addEventListener('click', openTableModal);
  document.getElementById('tblClose').addEventListener('click', closeTableModal);
  document.getElementById('tblCancelBtn').addEventListener('click', closeTableModal);
  document.getElementById('tableModal').addEventListener('click', e => {
    if (e.target === document.getElementById('tableModal')) closeTableModal();
  });

  // Reusable spinner binder
  function bindSpin(decId, incId, inputId, min, max, cb) {
    const el = document.getElementById(inputId);
    document.getElementById(decId).addEventListener('click', () => {
      const v = Math.max(min, parseInt(el.value) - 1);
      el.value = v; cb(v);
    });
    document.getElementById(incId).addEventListener('click', () => {
      const v = Math.min(max, parseInt(el.value) + 1);
      el.value = v; cb(v);
    });
    el.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, parseInt(el.value) || min));
      el.value = v; cb(v);
    });
  }

  bindSpin('tblRowsDec',   'tblRowsInc',   'tblRowsInput',  1,  50, v => tblResize(v, tblState.cols));
  bindSpin('tblColsDec',   'tblColsInc',   'tblColsInput',  1,  20, v => tblResize(tblState.rows, v));
  bindSpin('tblFontSzDec', 'tblFontSzInc', 'tblFontSzInput', 8, 72, v => tblApply('fontSize', v));

  // Row / col operations
  // Insert always above / left of the active cell (Excel behaviour)
  document.getElementById('tblAddRowAbove').addEventListener('click', () => tblAddRow(true));
  document.getElementById('tblDelRow').addEventListener('click', tblDelRow);
  document.getElementById('tblAddColLeft').addEventListener('click', () => tblAddCol(true));
  document.getElementById('tblDelCol').addEventListener('click', tblDelCol);

  // Merge / split
  document.getElementById('tblMerge').addEventListener('click', tblMerge);
  document.getElementById('tblSplit').addEventListener('click', tblSplit);

  // Format toggles
  document.getElementById('tblFmtBold').addEventListener('click', () => {
    const cell = tblFirstSel(); if (!cell) return;
    tblApply('bold', !cell.bold);
  });
  document.getElementById('tblFmtItalic').addEventListener('click', () => {
    const cell = tblFirstSel(); if (!cell) return;
    tblApply('italic', !cell.italic);
  });
  document.getElementById('tblFmtUnder').addEventListener('click', () => {
    const cell = tblFirstSel(); if (!cell) return;
    tblApply('underline', !cell.underline);
  });

  document.querySelectorAll('[data-tbl-align]').forEach(btn => {
    btn.addEventListener('click', () => tblApply('align', btn.dataset.tblAlign));
  });

  document.getElementById('tblTextColor').addEventListener('input', e => tblApply('color', e.target.value));
  document.getElementById('tblCellBg').addEventListener('input', e => tblApply('bg', e.target.value));
  document.getElementById('tblClearCellBg').addEventListener('click', () => tblApply('bg', ''));

  // Table style
  document.getElementById('tblHeaderRow').addEventListener('change', e => {
    tblSyncContent(); tblState.headerRow = e.target.checked; tblRender();
  });
  document.getElementById('tblStriped').addEventListener('change', e => {
    tblSyncContent(); tblState.striped = e.target.checked; tblRender();
  });
  document.getElementById('tblBorderStyle').addEventListener('change', e => {
    tblSyncContent(); tblState.borderW = parseInt(e.target.value); tblRender();
  });
  document.getElementById('tblBorderColor').addEventListener('input', e => {
    tblSyncContent(); tblState.borderColor = e.target.value; tblRender();
  });
  document.getElementById('tblHeaderBg').addEventListener('input', e => {
    tblSyncContent(); tblState.headerBg = e.target.value; tblRender();
  });
  document.getElementById('tblAltRowBg').addEventListener('input', e => {
    tblSyncContent(); tblState.altBg = e.target.value; tblRender();
  });

  document.getElementById('tblInsertBtn').addEventListener('click', tblInsert);
}

function openTableModal() {
  Object.assign(tblState, {
    rows: 3, cols: 4, sel: new Set(), lastR: -1, lastC: -1,
    headerRow: true, striped: false, borderW: 1,
    borderColor: '#cbd5e1', headerBg: '#334155', headerFg: '#ffffff', altBg: '#f8fafc',
    colWidths: Array(4).fill(120), rowHeights: Array(3).fill(null),
    _editingObj: null,
  });
  tblState.cells = Array.from({ length: 3 }, () => Array.from({ length: 4 }, tblEmptyCell));

  document.getElementById('tblRowsInput').value   = 3;
  document.getElementById('tblColsInput').value   = 4;
  document.getElementById('tblFontSzInput').value = 13;
  document.getElementById('tblHeaderRow').checked = true;
  document.getElementById('tblStriped').checked   = false;
  document.getElementById('tblBorderStyle').value = '1';
  document.getElementById('tblBorderColor').value = '#cbd5e1';
  document.getElementById('tblHeaderBg').value    = '#334155';
  document.getElementById('tblAltRowBg').value    = '#f8fafc';
  document.getElementById('tblTextColor').value   = '#1e293b';
  document.getElementById('tblCellBg').value      = '#ffffff';

  document.getElementById('tableModal').style.display = 'flex';
  tblRender();
}

function openTableModalWithState(savedState, fabricObj) {
  Object.assign(tblState, {
    rows:        savedState.rows,
    cols:        savedState.cols,
    cells:       JSON.parse(JSON.stringify(savedState.cells)),
    headerRow:   savedState.headerRow,
    striped:     savedState.striped,
    borderW:     savedState.borderW,
    borderColor: savedState.borderColor,
    headerBg:    savedState.headerBg,
    headerFg:    savedState.headerFg,
    altBg:       savedState.altBg,
    colWidths:   [...(savedState.colWidths  || Array(savedState.cols).fill(120))],
    rowHeights:  [...(savedState.rowHeights || Array(savedState.rows).fill(null))],
    sel: new Set(), lastR: -1, lastC: -1,
    _editingObj: fabricObj,
  });

  document.getElementById('tblRowsInput').value   = tblState.rows;
  document.getElementById('tblColsInput').value   = tblState.cols;
  document.getElementById('tblFontSzInput').value = 13;
  document.getElementById('tblHeaderRow').checked = tblState.headerRow;
  document.getElementById('tblStriped').checked   = tblState.striped;
  document.getElementById('tblBorderStyle').value = String(tblState.borderW);
  document.getElementById('tblBorderColor').value = tblState.borderColor;
  document.getElementById('tblHeaderBg').value    = tblState.headerBg;
  document.getElementById('tblAltRowBg').value    = tblState.altBg;

  document.getElementById('tableModal').style.display = 'flex';
  tblRender();
}

function closeTableModal() {
  document.getElementById('tableModal').style.display = 'none';
}

function tblSyncContent() {
  document.querySelectorAll('.tbl-cell').forEach(el => {
    const r = +el.dataset.r, c = +el.dataset.c;
    if (tblState.cells[r]?.[c]) tblState.cells[r][c].content = el.innerText.trimEnd();
  });
}

function tblEsc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tblRender() {
  // Do NOT call tblSyncContent() here — callers that change structure already
  // sync before modifying state; calling it here reads the stale pre-op DOM
  // and overwrites newly inserted/moved cells with wrong content.

  // Ensure dimension arrays match current table size
  if (!tblState.colWidths  || tblState.colWidths.length  !== tblState.cols)
    tblState.colWidths  = Array(tblState.cols).fill(120);
  if (!tblState.rowHeights || tblState.rowHeights.length !== tblState.rows)
    tblState.rowHeights = Array(tblState.rows).fill(null);

  const { cells, headerRow, striped, borderW, borderColor,
          headerBg, headerFg, altBg, colWidths, rowHeights } = tblState;
  const border = borderW ? `${borderW}px solid ${borderColor}` : 'none';

  let html = `<table style="border-collapse:collapse;table-layout:fixed;font-family:system-ui,-apple-system,sans-serif;">`;
  html += '<colgroup>' + colWidths.map(w => `<col style="width:${w}px">`).join('') + '</colgroup>';

  for (let r = 0; r < tblState.rows; r++) {
    const isHeader = headerRow && r === 0;
    const rowBg    = isHeader ? headerBg : (striped && r % 2 === 0 ? altBg : '');
    html += '<tr>';

    for (let c = 0; c < tblState.cols; c++) {
      const cell = cells[r]?.[c];
      if (!cell || cell.hidden) continue;

      const tag = isHeader ? 'th' : 'td';
      const rs  = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '';
      const cs  = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
      const bg  = cell.bg || rowBg;
      const fg  = cell.color || (isHeader ? headerFg : '#1e293b');
      const fw  = cell.bold ? '700' : (isHeader ? '600' : '400');
      const rowH = rowHeights[r] ? `height:${rowHeights[r]}px;` : 'min-height:36px;';

      const style = [
        border !== 'none' ? `border:${border};` : '',
        'padding:8px 12px;',
        rowH,
        `text-align:${cell.align};`,
        `font-size:${cell.fontSize}px;`,
        `color:${fg};`,
        bg ? `background:${bg};` : '',
        `font-weight:${fw};`,
        cell.italic    ? 'font-style:italic;'         : '',
        cell.underline ? 'text-decoration:underline;' : '',
        'vertical-align:middle;outline:none;box-sizing:border-box;overflow:hidden;',
      ].filter(Boolean).join('');

      const isSel = tblState.sel.has(`${r},${c}`);
      html += `<${tag}${rs}${cs} class="tbl-cell${isSel ? ' tbl-cell-selected' : ''}" ` +
              `contenteditable="true" data-r="${r}" data-c="${c}" style="${style}">${tblEsc(cell.content)}</${tag}>`;
    }
    html += '</tr>';
  }
  html += '</table>';

  document.getElementById('tblEditorWrap').innerHTML = html;
  tblBindCells();
  tblUpdateSelInfo();
  tblUpdateFormatUI();
}

function tblBindCells() {
  const allCells = [...document.querySelectorAll('.tbl-cell')];

  allCells.forEach(el => {
    const r = +el.dataset.r, c = +el.dataset.c;

    // Show resize cursor when hovering near a cell border
    el.addEventListener('mousemove', e => {
      if (tblResizing) return;
      const rect = el.getBoundingClientRect();
      const nearR = rect.right  - e.clientX >= 0 && rect.right  - e.clientX < 6;
      const nearB = rect.bottom - e.clientY >= 0 && rect.bottom - e.clientY < 6;
      el.style.cursor = nearR ? 'col-resize' : nearB ? 'row-resize' : '';
    });
    el.addEventListener('mouseleave', () => { if (!tblResizing) el.style.cursor = ''; });

    el.addEventListener('mousedown', e => {
      const rect = el.getBoundingClientRect();
      const nearR = rect.right  - e.clientX >= 0 && rect.right  - e.clientX < 6;
      const nearB = rect.bottom - e.clientY >= 0 && rect.bottom - e.clientY < 6;

      // Start a resize drag if near a border
      if (nearR || nearB) {
        e.preventDefault();
        e.stopPropagation();
        if (nearR) {
          tblResizing = { type: 'col', idx: c, startX: e.clientX,
                          startSize: tblState.colWidths[c] || el.offsetWidth };
        } else {
          tblResizing = { type: 'row', idx: r, startY: e.clientY,
                          startSize: tblState.rowHeights[r] || el.offsetHeight };
        }
        document.addEventListener('mousemove', tblDragResize);
        document.addEventListener('mouseup',   tblEndResize);
        return;
      }

      // Normal cell selection
      if (e.shiftKey && tblState.lastR >= 0) {
        e.preventDefault();
        tblSelRange(tblState.lastR, tblState.lastC, r, c);
      } else if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        tblToggleSel(r, c);
      } else {
        tblSel(r, c);
      }
    });

    el.addEventListener('focus', () => {
      if (!tblState.sel.has(`${r},${c}`)) tblSel(r, c);
      tblUpdateFormatUI();
    });

    el.addEventListener('input', () => {
      if (tblState.cells[r]?.[c]) tblState.cells[r][c].content = el.innerText.trimEnd();
    });

    el.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const idx  = allCells.indexOf(el);
      const next = allCells[e.shiftKey ? idx - 1 : idx + 1];
      if (next) { next.focus(); next.dispatchEvent(new MouseEvent('mousedown')); }
    });
  });
}

function tblDragResize(e) {
  if (!tblResizing) return;
  if (tblResizing.type === 'col') {
    const newW = Math.max(40, tblResizing.startSize + e.clientX - tblResizing.startX);
    tblState.colWidths[tblResizing.idx] = newW;
    const cols = document.querySelectorAll('#tblEditorWrap col');
    if (cols[tblResizing.idx]) cols[tblResizing.idx].style.width = newW + 'px';
    document.body.style.cursor = 'col-resize';
  } else {
    const newH = Math.max(24, tblResizing.startSize + e.clientY - tblResizing.startY);
    tblState.rowHeights[tblResizing.idx] = newH;
    document.querySelectorAll(`.tbl-cell[data-r="${tblResizing.idx}"]`).forEach(cell => {
      cell.style.height = newH + 'px';
    });
    document.body.style.cursor = 'row-resize';
  }
}

function tblEndResize() {
  tblResizing = null;
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', tblDragResize);
  document.removeEventListener('mouseup',   tblEndResize);
}

// ── Selection helpers ──────────────────────────────────────────
function tblSel(r, c) {
  tblState.sel.clear();
  tblState.sel.add(`${r},${c}`);
  tblState.lastR = r; tblState.lastC = c;
  tblUpdateHighlights();
  tblUpdateSelInfo();
  tblUpdateFormatUI();
}

function tblToggleSel(r, c) {
  const key = `${r},${c}`;
  tblState.sel.has(key) ? tblState.sel.delete(key) : tblState.sel.add(key);
  tblState.lastR = r; tblState.lastC = c;
  tblUpdateHighlights();
  tblUpdateSelInfo();
}

function tblSelRange(r1, c1, r2, c2) {
  tblState.sel.clear();
  const [minR, maxR] = [Math.min(r1,r2), Math.max(r1,r2)];
  const [minC, maxC] = [Math.min(c1,c2), Math.max(c1,c2)];
  for (let r = minR; r <= maxR; r++)
    for (let c = minC; c <= maxC; c++)
      if (tblState.cells[r]?.[c] && !tblState.cells[r][c].hidden)
        tblState.sel.add(`${r},${c}`);
  tblUpdateHighlights();
  tblUpdateSelInfo();
  tblUpdateFormatUI();
}

function tblUpdateHighlights() {
  document.querySelectorAll('.tbl-cell').forEach(el => {
    el.classList.toggle('tbl-cell-selected', tblState.sel.has(`${el.dataset.r},${el.dataset.c}`));
  });
}

function tblUpdateSelInfo() {
  const n = tblState.sel.size;
  document.getElementById('tblSelInfo').textContent = n > 0 ? `${n} cell${n > 1 ? 's' : ''} selected` : '';
}

function tblUpdateFormatUI() {
  if (tblState.sel.size !== 1) return;
  const [r, c] = [...tblState.sel][0].split(',').map(Number);
  const cell = tblState.cells[r]?.[c];
  if (!cell) return;

  document.getElementById('tblFmtBold').classList.toggle('active',   cell.bold);
  document.getElementById('tblFmtItalic').classList.toggle('active', cell.italic);
  document.getElementById('tblFmtUnder').classList.toggle('active',  cell.underline);
  document.querySelectorAll('[data-tbl-align]').forEach(b =>
    b.classList.toggle('active', b.dataset.tblAlign === cell.align));

  document.getElementById('tblFontSzInput').value = cell.fontSize || 13;
  if (cell.color) document.getElementById('tblTextColor').value = cell.color;
  if (cell.bg)    document.getElementById('tblCellBg').value    = cell.bg;
}

function tblFirstSel() {
  if (!tblState.sel.size) return null;
  const [r, c] = [...tblState.sel][0].split(',').map(Number);
  return tblState.cells[r]?.[c] || null;
}

// ── Apply formatting to selected cells ────────────────────────
function tblApply(prop, value) {
  tblSyncContent();
  tblState.sel.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    const cell = tblState.cells[r]?.[c];
    if (cell && !cell.hidden) cell[prop] = value;
  });
  tblRender();
}

// ── Structural operations ──────────────────────────────────────
function tblResize(newRows, newCols) {
  tblSyncContent();

  // Sync colWidths array
  if (!tblState.colWidths) tblState.colWidths = [];
  while (tblState.colWidths.length < newCols) tblState.colWidths.push(120);
  if (tblState.colWidths.length > newCols) tblState.colWidths.splice(newCols);

  // Sync rowHeights array
  if (!tblState.rowHeights) tblState.rowHeights = [];
  while (tblState.rowHeights.length < newRows) tblState.rowHeights.push(null);
  if (tblState.rowHeights.length > newRows) tblState.rowHeights.splice(newRows);

  for (let r = 0; r < tblState.cells.length; r++) {
    while (tblState.cells[r].length < newCols) tblState.cells[r].push(tblEmptyCell());
    if (tblState.cells[r].length > newCols) tblState.cells[r].splice(newCols);
  }
  while (tblState.cells.length < newRows)
    tblState.cells.push(Array.from({ length: newCols }, tblEmptyCell));
  if (tblState.cells.length > newRows) tblState.cells.splice(newRows);

  tblState.rows = newRows;
  tblState.cols = newCols;
  tblState.sel.clear();
  tblRender();
}

function tblAddRow(above) {
  tblSyncContent();
  // Use the focused row (lastR) as anchor — falls back to start/end only when no cell ever clicked
  const ref = tblState.lastR >= 0 ? tblState.lastR : (above ? 0 : tblState.rows - 1);
  const pos = above ? ref : ref + 1;
  tblState.cells.splice(pos, 0, Array.from({ length: tblState.cols }, tblEmptyCell));
  tblState.rowHeights.splice(pos, 0, null);
  tblState.rows++;
  document.getElementById('tblRowsInput').value = tblState.rows;
  // Keep lastR pointing at the same original row after insertion shifts it
  if (above && tblState.lastR >= ref) tblState.lastR++;
  tblState.sel.clear();
  tblRender();
}

function tblDelRow() {
  if (tblState.rows <= 1) { toast('Table must have at least 1 row.', true); return; }
  tblSyncContent();
  const selRows = [...new Set([...tblState.sel].map(k => +k.split(',')[0]))];
  const toDelete = selRows.length ? selRows :
                   (tblState.lastR >= 0 ? [tblState.lastR] : [tblState.rows - 1]);
  toDelete.sort((a, b) => b - a).forEach(r => {
    tblState.cells.splice(r, 1);
    tblState.rowHeights.splice(r, 1);
    tblState.rows--;
  });
  document.getElementById('tblRowsInput').value = tblState.rows;
  tblState.lastR = Math.min(tblState.lastR, tblState.rows - 1);
  tblState.sel.clear();
  tblRender();
}

function tblAddCol(left) {
  tblSyncContent();
  const ref = tblState.lastC >= 0 ? tblState.lastC : (left ? 0 : tblState.cols - 1);
  const pos = left ? ref : ref + 1;
  tblState.cells.forEach(row => row.splice(pos, 0, tblEmptyCell()));
  tblState.colWidths.splice(pos, 0, tblState.colWidths[ref] || 120);
  tblState.cols++;
  document.getElementById('tblColsInput').value = tblState.cols;
  if (left && tblState.lastC >= ref) tblState.lastC++;
  tblState.sel.clear();
  tblRender();
}

function tblDelCol() {
  if (tblState.cols <= 1) { toast('Table must have at least 1 column.', true); return; }
  tblSyncContent();
  const selCols = [...new Set([...tblState.sel].map(k => +k.split(',')[1]))];
  const toDelete = selCols.length ? selCols :
                   (tblState.lastC >= 0 ? [tblState.lastC] : [tblState.cols - 1]);
  toDelete.sort((a, b) => b - a).forEach(c => {
    tblState.cells.forEach(row => row.splice(c, 1));
    tblState.colWidths.splice(c, 1);
    tblState.cols--;
  });
  document.getElementById('tblColsInput').value = tblState.cols;
  tblState.lastC = Math.min(tblState.lastC, tblState.cols - 1);
  tblState.sel.clear();
  tblRender();
}

function tblMerge() {
  if (tblState.sel.size < 2) { toast('Select 2 or more cells to merge.', true); return; }
  tblSyncContent();

  const coords = [...tblState.sel].map(k => k.split(',').map(Number));
  const minR = Math.min(...coords.map(([r]) => r)), maxR = Math.max(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([,c]) => c)), maxC = Math.max(...coords.map(([,c]) => c));

  const combined = coords.map(([r,c]) => tblState.cells[r][c].content).filter(Boolean).join(' ');
  const primary  = tblState.cells[minR][minC];
  primary.rowSpan = maxR - minR + 1;
  primary.colSpan = maxC - minC + 1;
  primary.content = combined;
  primary.hidden  = false;

  for (let r = minR; r <= maxR; r++)
    for (let c = minC; c <= maxC; c++)
      if (r !== minR || c !== minC) {
        Object.assign(tblState.cells[r][c], { hidden: true, content: '', rowSpan: 1, colSpan: 1 });
      }

  tblState.sel.clear();
  tblState.sel.add(`${minR},${minC}`);
  tblRender();
}

function tblSplit() {
  if (tblState.sel.size !== 1) { toast('Select exactly one merged cell to split.', true); return; }
  tblSyncContent();

  const [r, c] = [...tblState.sel][0].split(',').map(Number);
  const cell    = tblState.cells[r][c];
  if (cell.rowSpan === 1 && cell.colSpan === 1) { toast('Selected cell is not merged.', true); return; }

  const maxR = r + cell.rowSpan - 1, maxC = c + cell.colSpan - 1;
  for (let rr = r; rr <= maxR; rr++)
    for (let cc = c; cc <= maxC; cc++) {
      const tc = tblState.cells[rr][cc];
      tc.hidden = false; tc.rowSpan = 1; tc.colSpan = 1;
      if (rr !== r || cc !== c) tc.content = '';
    }

  tblState.sel.clear();
  tblRender();
}

// ── Insert / update PDF image ──────────────────────────────────
async function tblInsert() {
  tblSyncContent();
  const wrap = document.getElementById('tblEditorWrap');
  if (!wrap.querySelector('table')) { toast('No table to insert.', true); return; }
  if (typeof html2canvas === 'undefined') { toast('html2canvas not available.', true); return; }

  const btn = document.getElementById('tblInsertBtn');
  btn.disabled = true;

  try {
    // Clear selection for a clean capture
    tblState.sel.clear();
    tblRender();

    const table = wrap.querySelector('table');
    const cap   = await html2canvas(table, {
      backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
    });

    // Snapshot the full table state so the image can be re-edited later
    const savedState = {
      rows: tblState.rows, cols: tblState.cols,
      cells: JSON.parse(JSON.stringify(tblState.cells)),
      headerRow: tblState.headerRow, striped: tblState.striped,
      borderW: tblState.borderW, borderColor: tblState.borderColor,
      headerBg: tblState.headerBg, headerFg: tblState.headerFg, altBg: tblState.altBg,
      colWidths:  [...tblState.colWidths],
      rowHeights: [...tblState.rowHeights],
    };

    const existingObj = tblState._editingObj;
    const dataURL     = cap.toDataURL('image/png');
    closeTableModal();

    fabric.Image.fromURL(dataURL, img => {
      img._isTable    = true;
      img._tableState = savedState;

      if (existingObj && fabricCanvas.contains(existingObj)) {
        // Replace in-place, preserving the original position / scale / angle
        img.set({
          left:   existingObj.left,   top:    existingObj.top,
          scaleX: existingObj.scaleX, scaleY: existingObj.scaleY,
          angle:  existingObj.angle,
        });
        fabricCanvas.remove(existingObj);
        toast('Table updated.');
      } else {
        const maxW = fabricCanvas.width  * 0.9;
        const maxH = fabricCanvas.height * 0.9;
        if (img.width > maxW)             img.scaleToWidth(maxW);
        if (img.getScaledHeight() > maxH) img.scaleToHeight(maxH);
        img.set({
          left: (fabricCanvas.width  - img.getScaledWidth())  / 2,
          top:  (fabricCanvas.height - img.getScaledHeight()) / 2,
        });
        toast('Table inserted — double-click to re-edit.');
      }

      fabricCanvas.add(img);
      fabricCanvas.setActiveObject(img);
      fabricCanvas.renderAll();
      pushHistory();
      setTool('select');
    });
  } catch (err) {
    toast('Capture failed: ' + err.message, true);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}
