// utils.js loaded before this file provides:
// ensurePdf, formatSize, downloadBlob, setStatus, setProgress, toast
// pdfjsLib.GlobalWorkerOptions.workerSrc is also set there.

const state = {
  pdfDoc: null,
  previewDoc: null,
  pageCount: 0,
  splitResults: [],
};

// ── Utilities ──────────────────────────────────────────────────────────────

function pad(n) { return n.toString().padStart(6, '0'); }

function getStartNumber() {
  const v = parseInt($('#startNo').val(), 10);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

function buildFileName(pageIndex) {
  return `${$('#prefix').val().trim()}${pad(getStartNumber() + pageIndex)}`;
}

function buildGroupFileName(pageIndexes) {
  const prefix = $('#prefix').val().trim();
  if (!pageIndexes.length) return `${prefix}group`;
  const s = pageIndexes[0] + 1;
  const e = pageIndexes[pageIndexes.length - 1] + 1;
  return pageIndexes.length === 1 ? `${prefix}${pad(s)}` : `${prefix}${pad(s)}-${pad(e)}`;
}

function setControls(on) {
  ['#selectAllBtn', '#deselectAllBtn', '#splitBtn', '#downloadZipBtn', '#clearBtn']
    .forEach(sel => $(sel).prop('disabled', !on));
}

// ── Range Parsing ──────────────────────────────────────────────────────────

function parseRangeGroups(value) {
  if (!value) return [];
  const groups = [];
  for (const part of value.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (m) {
      let s = parseInt(m[1], 10), e = parseInt(m[2], 10);
      if (s > e) [s, e] = [e, s];
      const g = [];
      for (let x = s; x <= e; x++) if (x >= 1 && x <= state.pageCount) g.push(x - 1);
      if (g.length) groups.push(g);
    } else {
      const v = parseInt(part, 10);
      if (!Number.isNaN(v) && v >= 1 && v <= state.pageCount) groups.push([v - 1]);
    }
  }
  return groups;
}

function getRangeGroups() { return parseRangeGroups($('#rangeInput').val().trim()); }

// ── Selection ──────────────────────────────────────────────────────────────

function selectAllItems() {
  $('#pages .page-check').prop('checked', true);
  $('#rangeGroups .group-select').prop('checked', true);
  $('#pages .page-card').addClass('is-selected');
  $('#rangeGroups .group-card').addClass('is-checked');
}

function deselectAllItems() {
  $('#pages .page-check').prop('checked', false);
  $('#rangeGroups .group-select').prop('checked', false);
  $('#pages .page-card').removeClass('is-selected');
  $('#rangeGroups .group-card').removeClass('is-checked');
}

function getSelectedPageIndexes() {
  const out = [];
  $('#pages .page-card').each(function () {
    if ($(this).find('.page-check').prop('checked'))
      out.push(parseInt($(this).attr('data-page-index'), 10));
  });
  return out;
}

// ── PDF Operations ─────────────────────────────────────────────────────────

async function splitPage(pageIndex, fileName) {
  const doc = await PDFLib.PDFDocument.create();
  const [p] = await doc.copyPages(state.pdfDoc, [pageIndex]);
  doc.addPage(p);
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName };
}

async function mergePages(pageIndexes, fileName) {
  const doc   = await PDFLib.PDFDocument.create();
  const pages = await doc.copyPages(state.pdfDoc, pageIndexes);
  pages.forEach(p => doc.addPage(p));
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName };
}

async function splitPages(pageIndexes) {
  const results = [];
  for (const idx of pageIndexes) {
    const card = $(`#pages .page-card[data-page-index='${idx}']`);
    const raw  = card.find('.page-name-input').val().trim() || buildFileName(idx);
    results.push(await splitPage(idx, ensurePdf(raw)));
  }
  return results;
}

function buildSplitGroups() {
  const rg = getRangeGroups();
  if (rg.length) return rg;
  return getSelectedPageIndexes().map(i => [i]);
}

// ── Download ───────────────────────────────────────────────────────────────

async function downloadZip() {
  const zip = new JSZip();
  const rangeGroups = getRangeGroups();

  if (rangeGroups.length) {
    for (let i = 0; i < rangeGroups.length; i++) {
      const card    = $(`#rangeGroups .group-card[data-group-index='${i}']`);
      const checked = !card.length || card.find('.group-select').prop('checked');
      if (!checked) continue;
      const fallback = ensurePdf(buildGroupFileName(rangeGroups[i]));
      const custom   = card.find('.group-name').val().trim();
      const result   = await mergePages(rangeGroups[i], custom ? ensurePdf(custom) : fallback);
      zip.file(result.fileName, result.blob);
    }
  } else if (state.splitResults.length) {
    state.splitResults.forEach((item, i) => {
      const card    = $(`#rangeGroups .group-card[data-group-index='${i}']`);
      const checked = !card.length || card.find('.group-select').prop('checked');
      if (!checked) return;
      const custom  = card.find('.group-name').val().trim();
      item.fileName = custom ? ensurePdf(custom) : item.fileName;
      zip.file(item.fileName, item.blob);
    });
  } else {
    const selected = getSelectedPageIndexes();
    if (selected.length) {
      const results = await splitPages(selected);
      results.forEach(r => zip.file(r.fileName, r.blob));
    }
  }

  if (Object.keys(zip.files).length === 0) {
    toast('Nothing to download. Select pages or set a split range.', 'warning');
    return;
  }

  setStatus('Generating ZIP…', 'loading');
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'pdf-split-results.zip');
  const count = Object.keys(zip.files).length;
  setStatus(`ZIP downloaded — ${count} file(s).`, 'success');
  toast('ZIP downloaded successfully.', 'success');
}

// ── Group Cards ────────────────────────────────────────────────────────────

function createGroupCard(pageIndexes, groupIndex) {
  const label       = pageIndexes.length > 1
    ? `Pages ${pageIndexes[0] + 1}–${pageIndexes[pageIndexes.length - 1] + 1}`
    : `Page ${pageIndexes[0] + 1}`;
  const initialName = buildGroupFileName(pageIndexes);

  const wrapper  = $('<div>').addClass('group-card is-checked').attr('data-group-index', groupIndex);
  const checkbox = $('<input type="checkbox" class="group-select" checked />');
  checkbox.on('change', function () { wrapper.toggleClass('is-checked', this.checked); });

  const meta = $('<div>').addClass('group-meta');
  meta.append(
    $('<div>').addClass('group-title').text(label),
    $('<div>').addClass('group-sub').text(`${pageIndexes.length} page(s)  ·  Output: ${ensurePdf(initialName)}`)
  );

  const nameInput = $('<input type="text" class="input group-name" />').val(initialName);
  nameInput.on('input', function () {
    const fin = ensurePdf($(this).val().trim() || initialName);
    if (state.splitResults[groupIndex]) state.splitResults[groupIndex].fileName = fin;
    wrapper.find('.group-sub').text(`${pageIndexes.length} page(s)  ·  Output: ${fin}`);
  });

  const dlBtn = $('<button>').addClass('btn btn-success btn-sm').html(
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12" stroke-linecap="round" stroke-linejoin="round"/></svg> Download`
  );
  dlBtn.on('click', async function () {
    const result = state.splitResults[groupIndex];
    if (!result) { toast('Click Split first.', 'warning'); return; }
    result.fileName = ensurePdf(nameInput.val().trim() || initialName);
    downloadBlob(result.blob, result.fileName);
  });

  meta.append($('<div>').addClass('name-row').append(nameInput));
  wrapper.append(checkbox, meta, $('<div>').addClass('group-actions').append(dlBtn));
  return wrapper;
}

function showSplitGroups(groups) {
  $('#rangeGroups').empty();
  if (!groups.length) { $('#rangeGroupsWrap').hide(); return; }
  groups.forEach((g, i) => $('#rangeGroups').append(createGroupCard(g, i)));
  $('#rangeGroupsWrap').show();
}

// ── Page Cards ─────────────────────────────────────────────────────────────

function createPageCard(pageIndex) {
  const wrapper   = $('<div>').addClass('page-card is-selected').attr('data-page-index', pageIndex);
  const thumbWrap = $('<div>').addClass('thumb-wrap');
  const canvas    = document.createElement('canvas');
  const overlay   = $('<div>').addClass('thumb-overlay').html(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
  thumbWrap.append(canvas, overlay).on('click', () => openPreview(pageIndex));

  const body   = $('<div>').addClass('card-body');
  const header = $('<div>').addClass('card-header');
  const check  = $('<input type="checkbox" class="page-check" checked />');
  check.on('change', function () { wrapper.toggleClass('is-selected', this.checked); });
  header.append($('<span>').addClass('page-label').text(`Page ${pageIndex + 1}`), check);

  const nameInput = $('<input type="text" class="page-name-input" />').val(buildFileName(pageIndex));

  const dlBtn = $('<button>').addClass('btn btn-ghost btn-sm').html(
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12" stroke-linecap="round" stroke-linejoin="round"/></svg> Download`
  );
  dlBtn.on('click', async function (e) {
    e.stopPropagation();
    const result = await splitPage(pageIndex, ensurePdf(nameInput.val().trim() || buildFileName(pageIndex)));
    downloadBlob(result.blob, result.fileName);
  });

  body.append(header, nameInput, $('<div>').addClass('card-footer').append(dlBtn));
  wrapper.append(thumbWrap, body);
  return wrapper;
}

// ── Preview ────────────────────────────────────────────────────────────────

let previewScale     = 1.5;
let previewPageIndex = null;

async function renderPreviewCanvas(pageIndex, scale) {
  const canvas   = document.getElementById('previewCanvas');
  const page     = await state.previewDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

async function openPreview(pageIndex) {
  previewPageIndex = pageIndex;
  previewScale     = 1.5;
  $('#previewTitle').text(`Page ${pageIndex + 1} of ${state.pageCount}`);
  $('#zoomLevel').text(`${Math.round(previewScale * 100)}%`);
  await renderPreviewCanvas(pageIndex, previewScale);
  $('#previewModal').removeClass('hidden');

  document.getElementById('previewCanvas').onwheel = async function (e) {
    e.preventDefault();
    await changePreviewScale(e.deltaY < 0 ? 0.15 : -0.15);
  };
}

async function changePreviewScale(delta) {
  if (previewPageIndex === null) return;
  previewScale = Math.max(0.3, Math.min(4, previewScale + delta));
  $('#zoomLevel').text(`${Math.round(previewScale * 100)}%`);
  await renderPreviewCanvas(previewPageIndex, previewScale);
}

async function navigatePreview(delta) {
  if (previewPageIndex === null) return;
  const next = previewPageIndex + delta;
  if (next < 0 || next >= state.pageCount) return;
  previewPageIndex = next;
  $('#previewTitle').text(`Page ${previewPageIndex + 1} of ${state.pageCount}`);
  await renderPreviewCanvas(previewPageIndex, previewScale);
}

function closePreview() {
  $('#previewModal').addClass('hidden');
  document.getElementById('previewCanvas').onwheel = null;
  previewPageIndex = null;
}

// ── Thumbnails ─────────────────────────────────────────────────────────────

async function renderThumbnail(pageIndex, canvas) {
  const page     = await state.previewDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 0.6 });
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

// ── Load PDF ───────────────────────────────────────────────────────────────

async function loadPdf() {
  const file = document.getElementById('pdfFile').files[0];
  if (!file) { toast('Please choose a PDF file first.', 'warning'); return; }

  if (state.previewDoc) { state.previewDoc.destroy(); state.previewDoc = null; }

  setStatus('Loading PDF…', 'loading');
  setProgress(0);
  state.splitResults = [];

  try {
    const buf        = await file.arrayBuffer();
    state.pdfDoc     = await PDFLib.PDFDocument.load(buf);
    state.previewDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    state.pageCount  = state.pdfDoc.getPageCount();
  } catch (_) {
    setStatus('Failed to load PDF — the file may be corrupt or password-protected.', 'error');
    setProgress(null);
    toast('Error loading PDF.', 'error');
    return;
  }

  $('#pages').empty();
  $('#rangeGroups').empty();
  $('#rangeGroupsWrap').hide();
  $('#pagesWrap').show();
  $('#emptyState').hide();

  for (let i = 0; i < state.pageCount; i++) {
    const card = createPageCard(i);
    $('#pages').append(card);
    await renderThumbnail(i, card.find('canvas')[0]);
    setProgress(Math.round(((i + 1) / state.pageCount) * 100));
  }

  setProgress(null);
  setStatus(`Loaded ${state.pageCount} page(s) from "${file.name}". Select pages or set a range, then click Split.`, 'success');
  setControls(true);
}

// ── Run Split ──────────────────────────────────────────────────────────────

async function runSplitGroups() {
  const groups = buildSplitGroups();
  if (!groups.length) {
    toast('Enter a valid range or select at least one page.', 'warning');
    return false;
  }

  $('#rangeGroups').empty();
  setStatus('Preparing split groups…', 'loading');
  state.splitResults = [];

  for (const pageIndexes of groups) {
    const result = await mergePages(pageIndexes, ensurePdf(buildGroupFileName(pageIndexes)));
    state.splitResults.push(result);
  }

  showSplitGroups(groups);
  setStatus(`${state.splitResults.length} group(s) ready. Download individually or as a ZIP.`, 'success');
  toast(`${state.splitResults.length} group(s) ready.`, 'success');
  return true;
}

// ── Upload Zone ────────────────────────────────────────────────────────────

const uploadZone   = document.getElementById('uploadZone');
const pdfFileInput = document.getElementById('pdfFile');

uploadZone.addEventListener('click', () => pdfFileInput.click());
pdfFileInput.addEventListener('change', () => {
  const f = pdfFileInput.files[0];
  if (f) $('#chosenFileName').text(f.name);
});
uploadZone.addEventListener('dragover', e => {
  e.preventDefault(); uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    const dt = new DataTransfer(); dt.items.add(f);
    pdfFileInput.files = dt.files;
    $('#chosenFileName').text(f.name);
  } else {
    toast('Please drop a PDF file.', 'warning');
  }
});

// ── Event Wiring ───────────────────────────────────────────────────────────

$('#loadBtn').on('click', loadPdf);
$('#splitBtn').on('click', () => runSplitGroups());
$('#selectAllBtn').on('click', selectAllItems);
$('#deselectAllBtn').on('click', deselectAllItems);

$('#downloadZipBtn').on('click', async function () {
  if (!state.splitResults.length && !getSelectedPageIndexes().length) {
    if (!confirm('No split output ready. Run Split now?')) return;
    if (!(await runSplitGroups())) return;
  }
  await downloadZip();
});

$('#clearBtn').on('click', function () {
  if (state.previewDoc) { state.previewDoc.destroy(); }
  pdfFileInput.value = '';
  $('#chosenFileName').text('');
  $('#rangeInput').val('');
  $('#pages').empty();
  $('#rangeGroups').empty();
  $('#rangeGroupsWrap').hide();
  $('#pagesWrap').hide();
  $('#emptyState').show();
  setStatus('Load a PDF to begin.');
  setProgress(null);
  setControls(false);
  Object.assign(state, { pdfDoc: null, previewDoc: null, pageCount: 0, splitResults: [] });
});

$('#zoomInBtn').on('click',   () => changePreviewScale(0.2));
$('#zoomOutBtn').on('click',  () => changePreviewScale(-0.2));
$('#prevPageBtn').on('click', () => navigatePreview(-1));
$('#nextPageBtn').on('click', () => navigatePreview(1));
$('#closePreviewBtn').on('click', closePreview);
$('#previewModal').on('click', function (e) { if (e.target.id === 'previewModal') closePreview(); });

document.addEventListener('keydown', async e => {
  if ($('#previewModal').hasClass('hidden')) return;
  if (e.key === 'Escape')     { closePreview(); return; }
  if (e.key === 'ArrowRight') await navigatePreview(1);
  if (e.key === 'ArrowLeft')  await navigatePreview(-1);
  if (e.key === '+')          await changePreviewScale(0.2);
  if (e.key === '-')          await changePreviewScale(-0.2);
});
