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
// === NoiseGone Upload Demo ===
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const progressEl = document.getElementById('progress');
const downloadBtn = document.getElementById('downloadBtn');
const dropText = document.getElementById('dropText');

if (dropZone && fileInput) {
  const activate = () => dropZone.classList.add('dragover');
  const deactivate = () => dropZone.classList.remove('dragover');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); activate(); });
  dropZone.addEventListener('dragleave', deactivate);
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    deactivate();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('audio/')) {
    alert('Можно загружать только аудиофайлы (MP3, WAV и т.п.)');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    alert('Файл слишком большой (до 25 МБ).');
    return;
  }

  fileNameEl.textContent = file.name;
  fileInfo.classList.remove('hidden');
  progressEl.style.width = '0%';
  downloadBtn.classList.add('hidden');

  // Фейковая обработка
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      downloadBtn.classList.remove('hidden');
    }
    progressEl.style.width = progress + '%';
  }, 200);

  // Скачать тот же файл (эмуляция)
  downloadBtn.onclick = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NoiseGone_' + file.name;
    a.click();
    URL.revokeObjectURL(url);
  };
}
// === Block 3: Реальная обработка через ffmpeg.wasm ===

// DOM ссылки (убедись, что эти id есть в index.html)
const presetEl   = document.getElementById('preset');
const processBtn = document.getElementById('processBtn');
const statusEl   = document.getElementById('status');
const downloadBtn = document.getElementById('downloadBtn');
const fileInfo   = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const progressEl = document.getElementById('progress');

let currentFile = null;       // <-- объявляем заранее (не ниже!)
let lastOutputBlob = null;

// Безопасно получаем фабрики из глобала, если он есть
const hasFFmpeg = typeof window !== 'undefined' && window.FFmpeg && typeof window.FFmpeg.createFFmpeg === 'function';
const createFFmpeg = hasFFmpeg ? window.FFmpeg.createFFmpeg : null;
const fetchFile    = hasFFmpeg ? window.FFmpeg.fetchFile    : null;

let ffmpeg = null;
let engineReady = false;

// Инициализация движка (один раз)
async function ensureEngine() {
  if (engineReady) return;

  if (!hasFFmpeg) {
    // Пользователь подключил скрипт после script.js или не подключил вовсе
    throw new Error('FFmpeg не загружен. Проверь подключение <script src="https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.min.js"> в <head> выше script.js.');
  }

  statusEl && (statusEl.textContent = 'Инициализация аудиодвижка… (10–20 сек при первом запуске)');
  ffmpeg = createFFmpeg({
    log: false,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js'
  });

  ffmpeg.setProgress(({ ratio }) => {
    if (progressEl) progressEl.style.width = Math.min(100, Math.round((ratio || 0) * 100)) + '%';
  });

  await ffmpeg.load();
  engineReady = true;
  statusEl && (statusEl.textContent = 'Движок готов.');
}

// Построение фильтра по пресету
function buildFilter(preset) {
  switch (preset) {
    case 'voice':
      return 'highpass=f=120,lowpass=f=8000,compand=attacks=0.02:releases=0.3:points=-80/-80|-40/-32|-20/-12|0/-3:soft-knee=6:gain=3';
    case 'podcast':
      return 'highpass=f=100,lowpass=f=8500,compand=attacks=0.01:releases=0.25:points=-80/-80|-40/-30|-20/-10|0/-2:soft-knee=6:gain=5';
    case 'music':
      return 'highpass=f=60,lowpass=f=16000,volume=2dB';
    default:
      return 'volume=0dB';
  }
}

// Запуск обработки
async function processAudio() {
  if (!currentFile) { alert('Сначала выберите аудиофайл.'); return; }

  processBtn && (processBtn.disabled = true);
  downloadBtn && downloadBtn.classList.add('hidden');
  statusEl && (statusEl.textContent = 'Подготовка…');
  progressEl && (progressEl.style.width = '0%');

  try {
    await ensureEngine();

    const ext = (currentFile.name.split('.').pop() || 'wav').toLowerCase();
    const inName  = 'input.' + ext;
    const outName = 'output.wav'; // WAV для надёжности

    await ffmpeg.FS('writeFile', inName, await fetchFile(currentFile));

    const af = buildFilter(presetEl ? presetEl.value : 'voice');

    statusEl && (statusEl.textContent = 'Обработка…');

    try {
      await ffmpeg.run('-i', inName, '-af', af, '-ar', '44100', '-ac', '1', outName);
    } catch (e) {
      // fallback без compand
      statusEl && (statusEl.textContent = 'Обработка (упрощённый режим)…');
      await ffmpeg.run('-i', inName, '-af', 'highpass=f=120,lowpass=f=8000,volume=3dB', '-ar', '44100', '-ac', '1', outName);
    }

    const data = ffmpeg.FS('readFile', outName);
    lastOutputBlob = new Blob([data.buffer], { type: 'audio/wav' });

    downloadBtn && downloadBtn.classList.remove('hidden');
    statusEl && (statusEl.textContent = 'Готово ✅');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Не удалось обработать аудио.');
    statusEl && (statusEl.textContent = 'Ошибка обработки.');
  } finally {
    processBtn && (processBtn.disabled = false);
  }
}

// Привязываем кнопку "Обработать"
processBtn && processBtn.addEventListener('click', processAudio);

// Кнопка "Скачать результат"
downloadBtn && downloadBtn.addEventListener('click', () => {
  if (!lastOutputBlob) return;
  const url = URL.createObjectURL(lastOutputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NoiseGone_' + (currentFile?.name?.replace(/\.[^.]+$/, '') || 'output') + '.wav';
  a.click();
  URL.revokeObjectURL(url);
});
