// utils.js loaded before this file provides:
// ensurePdf, formatSize, downloadBlob, setStatus, setProgress, toast
// pdfjsLib.GlobalWorkerOptions.workerSrc is also set there.

const state = {
  files: [],  // { id, name, file, pdfDoc, previewDoc, pageCount }
  nextId: 0,
};

// ── Utilities ──────────────────────────────────────────────────────────────

function setControls(on) {
  $('#mergeBtn, #clearBtn').prop('disabled', !on);
}

function totalPages() {
  return state.files.reduce((sum, f) => sum + f.pageCount, 0);
}

// ── Thumbnail ──────────────────────────────────────────────────────────────

async function renderThumbnail(entry, canvas) {
  try {
    const page     = await entry.previewDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.45 });
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  } catch (_) { /* silently skip */ }
}

// ── File Loading ───────────────────────────────────────────────────────────

async function loadSingleFile(file) {
  const id    = state.nextId++;
  const entry = { id, name: file.name, file, pdfDoc: null, previewDoc: null, pageCount: 0 };

  const buf = await file.arrayBuffer();

  try {
    entry.pdfDoc     = await PDFLib.PDFDocument.load(buf);
    entry.previewDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    entry.pageCount  = entry.pdfDoc.getPageCount();
  } catch (_) {
    toast(`Could not load "${file.name}" — it may be corrupt or password-protected.`, 'error');
    return null;
  }

  state.files.push(entry);
  return entry;
}

async function handleFiles(fileList) {
  const pdfs = Array.from(fileList).filter(f => f.type === 'application/pdf');

  if (!pdfs.length) {
    toast('No PDF files found. Please select valid PDF files.', 'warning');
    return;
  }

  setStatus(`Loading ${pdfs.length} file(s)…`, 'loading');
  setProgress(0);

  for (let i = 0; i < pdfs.length; i++) {
    await loadSingleFile(pdfs[i]);
    setProgress(Math.round(((i + 1) / pdfs.length) * 100));
  }

  setProgress(null);
  renderFileList();

  const total = totalPages();
  setStatus(
    `${state.files.length} file(s) · ${total} page(s) total. Drag to reorder, then click Merge.`,
    'success'
  );
}

// ── File List Rendering ────────────────────────────────────────────────────

function renderFileList() {
  const container = $('#fileList').empty();
  const count     = state.files.length;

  if (!count) {
    $('#fileListWrap').hide();
    $('#emptyState').show();
    setControls(false);
    setStatus('Add PDF files to begin.');
    return;
  }

  $('#fileListWrap').show();
  $('#emptyState').hide();
  setControls(true);

  $('#countBadge').text(`${count} file${count !== 1 ? 's' : ''} · ${totalPages()} pages`);

  state.files.forEach((entry, index) => {
    const card = createFileCard(entry, index);
    container.append(card);
    renderThumbnail(entry, card.find('canvas')[0]);
  });
}

function createFileCard(entry, index) {
  const isFirst = index === 0;
  const isLast  = index === state.files.length - 1;

  const card = $('<div>').addClass('file-card').attr('data-id', entry.id);

  const handle = $('<div>').addClass('drag-handle').html(
    `<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="4" cy="3"  r="1.5"/><circle cx="8" cy="3"  r="1.5"/>
      <circle cx="4" cy="8"  r="1.5"/><circle cx="8" cy="8"  r="1.5"/>
      <circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
    </svg>`
  );

  const thumb  = $('<div>').addClass('file-thumb');
  const canvas = document.createElement('canvas');
  thumb.append(canvas);

  const info = $('<div>').addClass('file-info');
  info.append(
    $('<div>').addClass('file-name').text(entry.name),
    $('<div>').addClass('file-meta').text(`${entry.pageCount} page${entry.pageCount !== 1 ? 's' : ''}`)
  );

  const controls = $('<div>').addClass('file-controls');

  const upBtn = $('<button>').addClass('btn btn-ghost btn-sm btn-icon').prop('disabled', isFirst).html(
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 15l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
  upBtn.on('click', () => moveFile(index, -1));

  const downBtn = $('<button>').addClass('btn btn-ghost btn-sm btn-icon').prop('disabled', isLast).html(
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
  downBtn.on('click', () => moveFile(index, 1));

  const removeBtn = $('<button>').addClass('btn btn-danger btn-sm btn-icon').html(
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>`
  );
  removeBtn.on('click', () => removeFile(entry.id));

  controls.append(upBtn, downBtn, removeBtn);
  card.append(handle, thumb, info, controls);

  // Drag-and-drop reordering
  card.attr('draggable', 'true');

  card.on('dragstart', function (e) {
    e.originalEvent.dataTransfer.setData('text/plain', entry.id);
    e.originalEvent.dataTransfer.effectAllowed = 'move';
    setTimeout(() => $(this).addClass('dragging'), 0);
  });
  card.on('dragend', function () {
    $(this).removeClass('dragging');
    $('.file-card').removeClass('drag-over');
  });
  card.on('dragover', function (e) {
    e.preventDefault();
    e.originalEvent.dataTransfer.dropEffect = 'move';
    $('.file-card').removeClass('drag-over');
    $(this).addClass('drag-over');
  });
  card.on('dragleave', function (e) {
    if (!$(this).is($(e.relatedTarget).closest('.file-card'))) {
      $(this).removeClass('drag-over');
    }
  });
  card.on('drop', function (e) {
    e.preventDefault();
    $(this).removeClass('drag-over');
    const fromId = parseInt(e.originalEvent.dataTransfer.getData('text/plain'), 10);
    const toId   = entry.id;
    if (fromId === toId) return;

    const fromIdx = state.files.findIndex(f => f.id === fromId);
    const toIdx   = state.files.findIndex(f => f.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = state.files.splice(fromIdx, 1);
    state.files.splice(toIdx, 0, moved);
    renderFileList();
  });

  return card;
}

// ── Reorder / Remove ───────────────────────────────────────────────────────

function moveFile(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.files.length) return;
  [state.files[index], state.files[newIndex]] = [state.files[newIndex], state.files[index]];
  renderFileList();
}

function removeFile(id) {
  const idx = state.files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const [entry] = state.files.splice(idx, 1);
  if (entry.previewDoc) entry.previewDoc.destroy();
  renderFileList();

  if (state.files.length) {
    setStatus(
      `${state.files.length} file(s) · ${totalPages()} page(s) total. Drag to reorder, then click Merge.`,
      'success'
    );
  }
}

// ── Merge & Download ───────────────────────────────────────────────────────

async function mergePdfs() {
  if (!state.files.length) return;

  setStatus(`Merging ${state.files.length} file(s)…`, 'loading');
  setProgress(0);

  try {
    const merged = await PDFLib.PDFDocument.create();

    for (let i = 0; i < state.files.length; i++) {
      const entry = state.files[i];
      const pages = await merged.copyPages(entry.pdfDoc, entry.pdfDoc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
      setProgress(Math.round(((i + 1) / state.files.length) * 100));
    }

    const bytes    = await merged.save();
    const blob     = new Blob([bytes], { type: 'application/pdf' });
    const rawName  = $('#outputName').val().trim() || 'merged';
    const fileName = ensurePdf(rawName);

    downloadBlob(blob, fileName);
    setProgress(null);
    setStatus(`Downloaded "${fileName}" — ${totalPages()} pages from ${state.files.length} file(s).`, 'success');
    toast('PDF merged and downloaded.', 'success');
  } catch (err) {
    setProgress(null);
    setStatus('Merge failed. One or more files may be unreadable.', 'error');
    toast('Merge failed.', 'error');
    console.error(err);
  }
}

// ── Upload Zone ────────────────────────────────────────────────────────────

const uploadZone    = document.getElementById('uploadZone');
const pdfFilesInput = document.getElementById('pdfFiles');

uploadZone.addEventListener('click', () => pdfFilesInput.click());
pdfFilesInput.addEventListener('change', () => handleFiles(pdfFilesInput.files));

uploadZone.addEventListener('dragover', e => {
  e.preventDefault(); uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', e => {
  if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

// Prevent file-list drag events from bubbling up to the upload zone
$('#fileList').on('dragover dragleave drop', function (e) { e.stopPropagation(); });

// ── Event Wiring ───────────────────────────────────────────────────────────

$('#mergeBtn').on('click', mergePdfs);

$('#clearBtn').on('click', function () {
  state.files.forEach(f => { if (f.previewDoc) f.previewDoc.destroy(); });
  state.files  = [];
  state.nextId = 0;
  pdfFilesInput.value = '';
  renderFileList();
  setStatus('Add PDF files to begin.');
  setProgress(null);
});
