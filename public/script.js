/* ============================================================
 * NoiseGone — script.js (локальный UMD FFmpeg, чистый JS)
 * ============================================================ */

// защита от повторной инициализации
if (window.__NG_BOOTED__) {
  console.warn('NoiseGone: script.js уже инициализирован. Второй запуск пропущен.');
} else {
  window.__NG_BOOTED__ = true;

  /* ===== Блок 1: сервисные мелочи ===== */
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
  // DOM
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

  // Проверки файла
  const EXT_OK = ['.mp3','.wav','.m4a','.aac','.ogg','.opus','.flac','.wma','.aiff','.aif','.caf'];
  const isAudioByExt = (name='') => EXT_OK.some(ext => (name||'').toLowerCase().endsWith(ext));
  const isAudioFile  = (f) => (f && f.type && f.type.startsWith('audio/')) || isAudioByExt(f && f.name);

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

  // Drag & Drop + input
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
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleAudioFile(f);
    });

    fileInput.addEventListener('change', (e) => {
      const target = e.target;
      const files = target && target.files;
      const f = files && files[0];
      handleAudioFile(f);
    });
  }

  /* ---------- ЛОКАЛЬНЫЙ ffmpeg.wasm (UMD) — просто и надёжно ---------- */
  // В Vercel файлы из public лежат в корне: /ffmpeg/umd/*
  const FF_BASE = '/ffmpeg/umd/';

  function ffmpegGlobal() {
    if (typeof FFmpeg !== 'undefined') return FFmpeg;
    if (typeof window !== 'undefined' && window.FFmpeg) return window.FFmpeg;
    return null;
  }

  function ffmpegAvailable() {
    const g = ffmpegGlobal();
    return !!(g && typeof g.createFFmpeg === 'function' && typeof g.fetchFile === 'function');
  }

  function loadLocalFFmpeg() {
    return new Promise((resolve, reject) => {
      if (ffmpegAvailable()) return resolve();
      const s = document.createElement('script');
      s.src = FF_BASE + 'ffmpeg.lib.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('FFmpeg: не удалось загрузить ' + s.src));
      document.head.appendChild(s);
    });
  }

  let createFFmpegFn = null;
  let fetchFileFn    = null;
  let ffmpeg = null;
  let engineReady = false;
  let engineLoading = false;

  async function ensureEngine(){
    if (engineReady) return;
    if (engineLoading) { while (!engineReady) { await new Promise(r => setTimeout(r, 120)); } return; }
    engineLoading = true;

    try {
      await loadLocalFFmpeg();
      if (!ffmpegAvailable()) throw new Error('FFmpeg не загружен. Проверьте путь: ' + FF_BASE);

      const g = ffmpegGlobal();
      createFFmpegFn = g.createFFmpeg;
      fetchFileFn    = g.fetchFile;

      if (statusEl) statusEl.textContent = 'Инициализация аудиодвижка… (10–20 сек)';
      ffmpeg = createFFmpegFn({
        log: false,
        corePath: FF_BASE + 'ffmpeg-core.js'
      });

      ffmpeg.setProgress(({ ratio }) => {
        if (progressEl) progressEl.style.width = Math.min(100, Math.round((ratio || 0) * 100)) + '%';
      });

      await ffmpeg.load();
      engineReady = true;
      if (statusEl) statusEl.textContent = 'Движок готов.';
    } finally {
      engineLoading = false;
    }
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
      const outName = 'output.wav';

      await ffmpeg.FS('writeFile', inName, await fetchFileFn(currentFile));

      const af = buildFilter(presetEl ? presetEl.value : 'voice');

      if (statusEl) statusEl.textContent = 'Обработка…';
      try{
        await ffmpeg.run('-i', inName, '-af', af, '-ar', '44100', '-ac', '1', outName);
      }catch(e){
        console.warn('Сложный фильтр не сработал, применяю упрощенный:', e);
        if (statusEl) statusEl.textContent = 'Обработка (упрощённый режим)…';
        await ffmpeg.run('-i', inName, '-af', 'highpass=f=120,lowpass=f=8000,volume=3dB', '-ar', '44100', '-ac', '1', outName);
      }

      const data = ffmpeg.FS('readFile', outName);
      lastOutputBlob = new Blob([data.buffer], { type:'audio/wav' });

      if (downloadBtn) downloadBtn.classList.remove('hidden');
      if (statusEl) statusEl.textContent = 'Готово ✅';
    }catch(err){
      console.error(err);
      alert((err && err.message) || 'Не удалось обработать аудио.');
      if (statusEl) statusEl.textContent = 'Ошибка обработки.';
    }finally{
      if (processBtn) processBtn.disabled = false;
    }
  }

  if (processBtn) processBtn.addEventListener('click', processAudio);

  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    if (!lastOutputBlob) return;
    const url = URL.createObjectURL(lastOutputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NoiseGone_' + (currentFile && currentFile.name ? currentFile.name.replace(/\.[^.]+$/, '') : 'output') + '.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}


    

