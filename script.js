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
const { createFFmpeg, fetchFile } = FFmpeg || {};
let ffmpeg;          // экземпляр
let engineReady = false;
let lastOutputBlob = null;

const presetEl = document.getElementById('preset');
const processBtn = document.getElementById('processBtn');
const statusEl = document.getElementById('status');

let currentFile = null;

// перехватываем файл из блока 2
function handleFile(file){
  if (!file.type.startsWith('audio/')) { alert('Только аудио (MP3/WAV и т.п.)'); return; }
  if (file.size > 25 * 1024 * 1024) { alert('До 25 МБ на этапе MVP.'); return; }

  currentFile = file;
  fileNameEl.textContent = file.name;
  fileInfo.classList.remove('hidden');
  progressEl.style.width = '0%';
  downloadBtn.classList.add('hidden');
  statusEl.textContent = 'Файл готов к обработке.';
}

// инициализация движка (один раз)
async function ensureEngine() {
  if (engineReady) return;
  statusEl.textContent = 'Инициализация аудиодвижка… (первый запуск может занять ~10–20 сек)';
  ffmpeg = createFFmpeg({ log: false, corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js' });
  ffmpeg.setProgress(({ ratio }) => {
    // во время загрузки ядра ratio тоже идёт
    progressEl.style.width = Math.min(100, Math.round(ratio * 100)) + '%';
  });
  await ffmpeg.load();
  engineReady = true;
  statusEl.textContent = 'Движок готов.';
}

// маппинг пресетов → фильтры ffmpeg
function buildFilter(preset) {
  // Используем доступные в ffmpeg.wasm фильтры: highpass, lowpass, compand, volume.
  if (preset === 'voice') {
    // чистка речи: низ срезаем, верх мягко, лёгкий компандер, +3 dB
    return 'highpass=f=120,lowpass=f=8000,compand=attacks=0.02:releases=0.3:points=-80/-80|-40/-32|-20/-12|0/-3:soft-knee=6:gain=3';
  }
  if (preset === 'podcast') {
    // чуть более агрессивно + громче
    return 'highpass=f=100,lowpass=f=8500,compand=attacks=0.01:releases=0.25:points=-80/-80|-40/-30|-20/-10|0/-2:soft-knee=6:gain=5';
  }
  if (preset === 'music') {
    // лёгкая чистка без сильной компрессии
    return 'highpass=f=60,lowpass=f=16000,volume=2dB';
  }
  return 'volume=0dB';
}

async function processAudio() {
  if (!currentFile) { alert('Сначала выберите файл.'); return; }
  processBtn.disabled = true;
  downloadBtn.classList.add('hidden');
  statusEl.textContent = 'Подготовка…';

  try {
    await ensureEngine();

    // Имя входа/выхода
    const inName = 'input.' + (currentFile.name.split('.').pop() || 'wav');
    const outName = 'output.wav'; // WAV даёт совместимость (mp3 не всегда доступен в wasm-сборке)

    // Пишем файл во внутреннюю FS
    await ffmpeg.FS('writeFile', inName, await fetchFile(currentFile));

    // Фильтр
    const af = buildFilter(presetEl.value);

    // Попытка с компандером; если упадёт — fallback без него
    statusEl.textContent = 'Обработка…';
    ffmpeg.setProgress(({ ratio }) => {
      const p = Math.min(100, Math.round(ratio * 100));
      progressEl.style.width = p + '%';
    });

    try {
      await ffmpeg.run(
        '-i', inName,
        '-af', af,
        '-ar', '44100',  // частота
        '-ac', '1',      // моно для речи
        outName
      );
    } catch (e) {
      // fallback — без compand (на случай отсутствия фильтра в сборке)
      statusEl.textContent = 'Обработка (упрощённый режим)…';
      await ffmpeg.run(
        '-i', inName,
        '-af', 'highpass=f=120,lowpass=f=8000,volume=3dB',
        '-ar', '44100',
        '-ac', '1',
        outName
      );
    }

    const data = ffmpeg.FS('readFile', outName);
    lastOutputBlob = new Blob([data.buffer], { type: 'audio/wav' });

    downloadBtn.classList.remove('hidden');
    statusEl.textContent = 'Готово ✅';
  } catch (err) {
    console.error(err);
    alert('Не удалось обработать аудио. Проверь формат файла.');
    statusEl.textContent = 'Ошибка обработки.';
  } finally {
    processBtn.disabled = false;
  }
}

// поведение кнопок
if (processBtn) {
  processBtn.addEventListener('click', processAudio);
}
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    if (!lastOutputBlob) return;
    const url = URL.createObjectURL(lastOutputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NoiseGone_' + (currentFile?.name?.replace(/\.[^.]+$/, '') || 'output') + '.wav';
    a.click();
    URL.revokeObjectURL(url);
  });
}
