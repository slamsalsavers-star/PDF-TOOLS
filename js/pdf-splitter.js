/* PDF Splitter page script extracted from html */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const state = {
  pdfBytes: null,
  pdfDoc: null,
  previewDoc: null,
  pageCount: 0,
  splitResults: [],
};

function padNumber(num) {
  return num.toString().padStart(6, '0');
}

function updateStatus(message) {
  $('#status').text(message);
}

function getStartNumber() {
  const value = parseInt($('#startNo').val(), 10);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

function buildFileName(pageIndex) {
  const prefix = $('#prefix').val().trim();
  return `${prefix}${padNumber(getStartNumber() + pageIndex)}`;
}

function setControls(enabled) {
  $('#selectAllBtn').prop('disabled', !enabled);
  $('#deselectAllBtn').prop('disabled', !enabled);
  $('#splitBtn').prop('disabled', !enabled);
  $('#downloadZipBtn').prop('disabled', !enabled);
  $('#clearBtn').prop('disabled', !enabled);
}

function parseRangeGroups(value) {
  if (!value) return [];
  const groups = [];
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(part);
    if (rangeMatch) {
      let start = parseInt(rangeMatch[1], 10);
      let end = parseInt(rangeMatch[2], 10);
      if (start > end) [start, end] = [end, start];
      const group = [];
      for (let x = start; x <= end; x += 1) {
        if (x >= 1 && x <= state.pageCount) {
          group.push(x - 1);
        }
      }
      if (group.length) groups.push(group);
    } else {
      const valueIndex = parseInt(part, 10);
      if (!Number.isNaN(valueIndex) && valueIndex >= 1 && valueIndex <= state.pageCount) {
        groups.push([valueIndex - 1]);
      }
    }
  }
  return groups;
}

function selectAllItems() {
  $('#pages .page-select, #rangeGroups .group-select').prop('checked', true);
}

function deselectAllItems() {
  $('#pages .page-select, #rangeGroups .group-select').prop('checked', false);
}

function buildGroupFileName(pageIndexes) {
  const prefix = $('#prefix').val().trim();
  if (!pageIndexes.length) return `${prefix}group`;
  const start = pageIndexes[0] + 1;
  const end = pageIndexes[pageIndexes.length - 1] + 1;
  return pageIndexes.length === 1
    ? `${prefix}${padNumber(start)}`
    : `${prefix}${padNumber(start)}-${padNumber(end)}`;
}

function getRangeGroups() {
  const rangeText = $('#rangeInput').val().trim();
  if (!rangeText) return [];
  return parseRangeGroups(rangeText);
}

function buildSplitGroups() {
  const rangeGroups = getRangeGroups();
  if (rangeGroups.length) {
    return rangeGroups;
  }
  const selectedIndexes = getSelectedPageIndexes();
  return selectedIndexes.map((pageIndex) => [pageIndex]);
}

function createGroupCard(pageIndexes, groupIndex) {
  const label = pageIndexes.length > 1
    ? `Range ${pageIndexes[0] + 1}-${pageIndexes[pageIndexes.length - 1] + 1}`
    : `Page ${pageIndexes[0] + 1}`;
  const wrapper = $('<div>').addClass('group-card').attr('data-group-index', groupIndex);

  const initialName = buildGroupFileName(pageIndexes);
  const header = $('<div>').addClass('group-card-header');
  const checkbox = $('<input type="checkbox" class="group-select" checked />');
  const title = $('<span>').text(label);
  header.append(checkbox, title);
  wrapper.append(header);

  const info = $('<div>').addClass('meta');
  info.append($('<div>').addClass('page-info').append(
    $('<span>').text(`${pageIndexes.length} page(s)`),
    $('<span>').text(`Output: ${initialName}.pdf`)
  ));

  const nameLabel = $('<label>').text('Group filename');
  const nameInput = $('<input type="text" class="group-name" />').val(initialName);
  info.append(nameLabel, nameInput);

  const downloadButton = $('<button>').addClass('secondary').text('Download Group');
  downloadButton.on('click', function () {
    const result = state.splitResults[groupIndex];
    if (!result) return;
    const currentName = nameInput.val().trim() || initialName;
    result.fileName = currentName.endsWith('.pdf') ? currentName : `${currentName}.pdf`;
    downloadBlob(result.blob, result.fileName);
  });
  nameInput.on('input', function () {
    const currentName = $(this).val().trim() || initialName;
    const finalName = currentName.endsWith('.pdf') ? currentName : `${currentName}.pdf`;
    if (state.splitResults[groupIndex]) {
      state.splitResults[groupIndex].fileName = finalName;
    }
    wrapper.find('.page-info span:last-child').text(`Output: ${finalName}`);
  });

  const filenameRow = $('<div>').addClass('filename-row');
  filenameRow.append(nameInput, downloadButton);
  info.append(nameLabel, filenameRow);

  wrapper.append(info);
  return wrapper;
}

function showSplitGroups(groups) {
  $('#rangeGroups').empty();
  if (!groups.length) return;
  $('#rangeGroups').append($('<h3>').text('Split Groups'));
  groups.forEach((group, index) => {
    $('#rangeGroups').append(createGroupCard(group, index));
  });
}

async function renderPreviewCanvas(pageIndex, scale) {
  const canvas = document.getElementById('previewCanvas');
  const page = await state.previewDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
}

let previewScale = 1;
let previewPageIndex = null;

async function openPreview(pageIndex) {
  previewPageIndex = pageIndex;
  previewScale = 1;
  $('#previewTitle').text(`Preview page ${pageIndex + 1}`);
  $('#zoomLevel').text(`${Math.round(previewScale * 100)}%`);
  await renderPreviewCanvas(pageIndex, previewScale);
  $('#previewModal').removeClass('hidden');

  const previewCanvasElement = document.getElementById('previewCanvas');
  if (previewCanvasElement) {
    previewCanvasElement.onwheel = async function (event) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      await changePreviewScale(delta);
    };
  }
}

async function changePreviewScale(delta) {
  if (previewPageIndex === null) return;
  previewScale = Math.max(0.4, Math.min(3, previewScale + delta));
  $('#zoomLevel').text(`${Math.round(previewScale * 100)}%`);
  await renderPreviewCanvas(previewPageIndex, previewScale);
}

function closePreview() {
  $('#previewModal').addClass('hidden');
  previewPageIndex = null;
}

function createPageCard(pageIndex) {
  const pageNumber = pageIndex + 1;
  const wrapper = $('<div>').addClass('page-card').attr('data-page-index', pageIndex);

  const thumb = $('<div>').addClass('thumb');
  const canvas = document.createElement('canvas');
  const checkbox = $('<input type="checkbox" class="page-select" checked />');
  const title = $('<span>').text(`Page ${pageNumber}`);

  thumb.append(checkbox, title, canvas);

  const meta = $('<div>').addClass('meta');
  const pageInfo = $('<div>').addClass('page-info').append(
    $('<span>').text(`#${pageNumber}`),
    $('<span>').text('Selected')
  );
  const label = $('<label>').text('Output filename');
  const input = $('<input type="text" class="page-name" />').val(buildFileName(pageIndex));
  meta.append(pageInfo, label, input);

  const downloadButton = $('<button>').addClass('secondary').text('Download Page');

  downloadButton.on('click', async function () {
    const name = input.val().trim() || buildFileName(pageIndex);
    const result = await splitPage(pageIndex, name + '.pdf');
    downloadBlob(result.blob, result.fileName);
  });

  const filenameRow = $('<div>').addClass('filename-row');
  filenameRow.append(input, downloadButton);

  canvas.addEventListener('click', () => openPreview(pageIndex));
  title.on('click', () => openPreview(pageIndex));

  meta.append(label, filenameRow);
  wrapper.append(thumb, meta);
  return wrapper;
}

async function renderThumbnail(pageIndex, canvas) {
  const page = await state.previewDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 0.5 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');

  await page.render({ canvasContext: context, viewport }).promise;
}

async function loadPdf() {
  const file = $('#pdfFile')[0].files[0];
  if (!file) { alert('Please choose a PDF file first.'); return; }

  updateStatus('Loading PDF...');
  const arrayBuffer = await file.arrayBuffer();
  state.pdfBytes = arrayBuffer;
  state.pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  state.previewDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  state.pageCount = state.pdfDoc.getPageCount();
  state.splitResults = [];

  $('#pages').empty();

  for (let i = 0; i < state.pageCount; i += 1) {
    const card = createPageCard(i);
    $('#pages').append(card);
    await renderThumbnail(i, card.find('canvas')[0]);
  }

  $('#rangeGroups').empty();
  updateStatus(`Loaded ${state.pageCount} pages. Choose pages and click Split.`);
  setControls(true);
}

function getSelectedPageIndexes() {
  const selected = [];
  $('#pages .page-card').each(function () {
    const item = $(this);
    const index = parseInt(item.attr('data-page-index'), 10);
    if (item.find('.page-select').prop('checked')) {
      selected.push(index);
    }
  });
  return selected;
}

async function splitPage(pageIndex, fileName) {
  const newPdf = await PDFLib.PDFDocument.create();
  const [page] = await newPdf.copyPages(state.pdfDoc, [pageIndex]);
  newPdf.addPage(page);

  const bytes = await newPdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return { blob, fileName };
}

async function mergePages(pageIndexes, fileName) {
  const newPdf = await PDFLib.PDFDocument.create();
  const pages = await newPdf.copyPages(state.pdfDoc, pageIndexes);
  for (const page of pages) { newPdf.addPage(page); }
  const bytes = await newPdf.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName };
}

async function splitPages(pageIndexes) {
  const results = [];
  for (const pageIndex of pageIndexes) {
    const card = $(`#pages .page-card[data-page-index='${pageIndex}']`);
    const fileName = card.find('.page-name').val().trim() || buildFileName(pageIndex);
    const result = await splitPage(pageIndex, fileName + '.pdf');
    results.push(result);
  }
  return results;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadZip() {
  const zip = new JSZip();

  const rangeGroups = getRangeGroups();
  if (rangeGroups.length) {
    for (let index = 0; index < rangeGroups.length; index += 1) {
      const groupPages = rangeGroups[index];
      const defaultName = buildGroupFileName(groupPages) + '.pdf';
      const card = $(`#rangeGroups .group-card[data-group-index='${index}']`);
      const customName = card.find('.group-name').val().trim();
      const isChecked = card.find('.group-select').prop('checked');
      if (!card.length || isChecked) {
        const fileName = customName ? (customName.endsWith('.pdf') ? customName : `${customName}.pdf`) : defaultName;
        const result = await mergePages(groupPages, fileName);
        zip.file(result.fileName, result.blob);
      }
    }
  } else if (state.splitResults.length) {
    state.splitResults.forEach((item, index) => {
      const groupCard = $(`#rangeGroups .group-card[data-group-index='${index}']`);
      if (!groupCard.length || groupCard.find('.group-select').prop('checked')) {
        const currentName = groupCard.find('.group-name').val().trim() || item.fileName;
        item.fileName = currentName.endsWith('.pdf') ? currentName : `${currentName}.pdf`;
        zip.file(item.fileName, item.blob);
      }
    });
  }

  const selectedPageIndexes = getSelectedPageIndexes();
  if (selectedPageIndexes.length) {
    const pageResults = await splitPages(selectedPageIndexes);
    for (const result of pageResults) { zip.file(result.fileName, result.blob); }
  }

  if (Object.keys(zip.files).length === 0) {
    alert('No selected pages or split groups available for ZIP. Select pages or set a split range first.');
    return;
  }

  updateStatus('Generating ZIP...');
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'pdf-split-results.zip');
  updateStatus('ZIP downloaded.');
}

$('#loadBtn').on('click', loadPdf);
$('#zoomInBtn').on('click', async function () { await changePreviewScale(0.2); });
$('#zoomOutBtn').on('click', async function () { await changePreviewScale(-0.2); });
$('#closePreviewBtn').on('click', closePreview);
$('#previewModal').on('click', function (event) { if (event.target.id === 'previewModal') { closePreview(); } });

async function runSplitGroups() {
  const groups = buildSplitGroups();
  if (!groups.length) { alert('Enter a valid range or select pages to split.'); return false; }
  $('#rangeGroups').empty();
  updateStatus('Preparing split groups...');
  state.splitResults = [];
  for (const pageIndexes of groups) {
    const result = await mergePages(pageIndexes, buildGroupFileName(pageIndexes) + '.pdf');
    state.splitResults.push(result);
  }
  showSplitGroups(groups);
  updateStatus(`Created ${state.splitResults.length} split group(s). Download individually or ZIP them.`);
  return true;
}

$('#splitBtn').on('click', async function () { await runSplitGroups(); });

$('#selectAllBtn').on('click', function () { selectAllItems(); });
$('#deselectAllBtn').on('click', function () { deselectAllItems(); });

$('#downloadZipBtn').on('click', async function () {
  if (!state.splitResults.length && !getSelectedPageIndexes().length) {
    const confirmSplit = confirm('No split output ready yet. Run Split now?');
    if (confirmSplit) {
      const didSplit = await runSplitGroups();
      if (!didSplit) { return; }
    } else { return; }
  }
  await downloadZip();
});

$('#clearBtn').on('click', function () {
  $('#pdfFile').val('');
  $('#pages').empty();
  updateStatus('Load a PDF to begin.');
  setControls(false);
  state.pdfBytes = null;
  state.pdfDoc = null;
  state.previewDoc = null;
  state.pageCount = 0;
  state.splitResults = [];
});
