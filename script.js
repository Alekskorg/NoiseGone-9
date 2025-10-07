/* ===== Блок 1: сервисные мелочи ===== */
// Год в футере
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();
});

// Бургер-меню
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    nav.dataset.collapsed = expanded ? 'true' : 'false';
  });
}

/* ===== Блок 2+3: Загрузка и обработка ===== */
// DOM-элементы (ОБЪЯВЛЯЕМ ОДИН РАЗ!)
const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const fileInfo   = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const progressEl = document.getElementById('progress');
const statusEl   = document.getElementById('status');
const processBtn = document.getElementById('processBtn');
const downloadBtn= document.getElementById('downloadBtn');
const presetEl   = document.getElementById('preset');

// Состояние
let currentFile = null;
let lastOutputBlob = null;

/* ---------- Приём файла: надёжные проверки ---------- */
const EXT_OK = ['.mp3','.wav','.m4a','.aac','.ogg','.opus','.flac','.wma','.aiff','.aif','.caf'];
const isAudioByExt = (name='') => EXT_OK.some(ext => (name||'').toLowerCase().endsWith(ext));
const isAudioFile  = (f) => (f?.type && f.type.startsWith('audio/')) || isAudioByExt(f?.name);

function showFileSelected(file){
  currentFile = file;
  if (fileNameEl) fileNameEl.textContent = file.name || 'audio';
  if (fileInfo) fileInfo.classList.remove('hidden');
  if (progressEl) progressEl.style.width = '0%';
  if (downloadBtn) downloadBtn.classList.add('hidden');
  if (statusEl) statusEl.textContent = 'Файл готов к обработке.';
}

function handleAudioFile(file){
  if (!file) return;
  if (!isAudioFile(file)) { alert('Это не аудиофайл. Поддержка: MP3, WAV, M4A, AAC, OGG, OPUS, FLAC и др.'); return; }
  if (file.size > 25 * 1024 * 1024) { alert('Файл слишком большой. На этапе MVP — до 25 МБ.'); return; }
  showFileSelected(file);
}

/* ---------- Drag & Drop + input ---------- */
if (dropZone && fileInput){
  const activate = () => dropZone.classList.add('dragover');
  const deactivate = () => dropZone.classList.remove('dragover');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    activate();
  });
  dropZone.addEventListener('dragleave', deactivate);
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    deactivate();
    const f = e.dataTransfer?.files?.[0];
    handleAudioFile(f);
  });

  fileInput.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    handleAudioFile(f);
  });
}

/* ---------- ffmpeg.wasm подключение ---------- */
const hasFFmpeg = typeof window !== 'undefined'
  && window.FFmpeg
  && typeof window.FFmpeg.createFFmpeg === 'function';

const createFFmpeg = hasFFmpeg ? window.FFmpeg.createFFmpeg : null;
const fetchFile    = hasFFmpeg ? window.FFmpeg.fetchFile    : null;

let ffmpeg = null;
let engineReady = false;

async function ensureEngine(){
  if (engineReady) return;
  if (!hasFFmpeg) {
    throw new Error('FFmpeg не загружен. Проверь, что в <head> подключено: https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.min.js (выше script.js).');
  }
  if (statusEl) statusEl.textContent = 'Инициализация аудиодвижка… (10–20 сек при первом запуске)';

  ffmpeg = createFFmpeg({ log:false, corePath:'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js' });
  ffmpeg.setProgress(({ ratio }) => {
    if (progressEl) progressEl.style.width = Math.min(100, Math.round((ratio||0)*100)) + '%';
  });
  await ffmpeg.load();
  engineReady = true;
  if (statusEl) statusEl.textContent = 'Движок готов.';
}

function buildFilter(preset){
  switch(preset){
    case 'voice':   return 'highpass=f=120,lowpass=f=8000,compand=attacks=0.02:releases=0.3:points=-80/-80|-40/-32|-20/-12|0/-3:soft-knee=6:gain=3';
    case 'podcast': return 'highpass=f=100,lowpass=f=8500,compand=attacks=0.01:releases=0.25:points=-80/-80|-40/-30|-20/-10|0/-2:soft-knee=6:gain=5';
    case 'music':   return 'highpass=f=60,lowpass=f=16000,volume=2dB';
    default:        return 'volume=0dB';
  }
}

async function processAudio(){
  if (!currentFile) { alert('Сначала выберите аудиофайл.'); return; }

  if (processBtn) processBtn.disabled = true;
  if (downloadBtn) downloadBtn.classList.add('hidden');
  if (statusEl) statusEl.textContent = 'Подготовка…';
  if (progressEl) progressEl.style.width = '0%';

  try{
    await ensureEngine();

    const ext = (currentFile.name.split('.').pop() || 'wav').toLowerCase();
    const inName  = 'input.' + ext;
    const outName = 'output.wav'; // WAV — надёжно

    await ffmpeg.FS('writeFile', inName, await fetchFile(currentFile));
    const af = buildFilter(presetEl ? presetEl.value : 'voice');

    if (statusEl) statusEl.textContent = 'Обработка…';
    try{
      await ffmpeg.run('-i', inName, '-af', af, '-ar', '44100', '-ac', '1', outName);
    }catch(e){
      if (statusEl) statusEl.textContent = 'Обработка (упрощённый режим)…';
      await ffmpeg.run('-i', inName, '-af', 'highpass=f=120,lowpass=f=8000,volume=3dB', '-ar', '44100', '-ac', '1', outName);
    }

    const data = ffmpeg.FS('readFile', outName);
    lastOutputBlob = new Blob([data.buffer], { type:'audio/wav' });

    if (downloadBtn) downloadBtn.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Готово ✅';
  }catch(err){
    console.error(err);
    alert(err.message || 'Не удалось обработать аудио.');
    if (statusEl) statusEl.textContent = 'Ошибка обработки.';
  }finally{
    if (processBtn) processBtn.disabled = false;
  }
}

/* Кнопки */
if (processBtn) processBtn.addEventListener('click', processAudio);

if (downloadBtn) downloadBtn.addEventListener('click', () => {
  if (!lastOutputBlob) return;
  const url = URL.createObjectURL(lastOutputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NoiseGone_' + (currentFile?.name?.replace(/\.[^.]+$/, '') || 'output') + '.wav';
  a.click();
  URL.revokeObjectURL(url);
});

