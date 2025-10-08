/* ============================================================
 * NoiseGone — script.js (локальный UMD FFmpeg, Block 1–3)
 * ============================================================ */

// защита от повторной инициализации
if (window.__NG_BOOTED__) {
  console.warn('NoiseGone: script.js уже инициализирован. Второй запуск пропущен.');
} else {
  window.__NG_BOOTED__ = true;

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
  // DOM-элементы (объявляем один раз)
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

  // ---------- Приём файла: надёжные проверки ----------
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
    if (!isAudioFile(file)) {
      alert('Это не аудиофайл. Поддержка: MP3, WAV, M4A, AAC, OGG, OPUS, FLAC и др.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('Файл слишком большой. На этапе MVP — до 25 МБ.');
      return;
    }
    showFileSelected(file);
  }

  // ---------- Drag & Drop + input ----------
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
      const target = e.target as HTMLInputElement;
      const f = target.files?.[0];
      handleAudioFile(f);
    });
  }

  /* ---------- ЛОКАЛЬНЫЙ ffmpeg.wasm (UMD) ---------- */
  // Пробуем несколько путей, чтобы работало и локально, и на хостинге
  const FF_BASES = [
    '/ffmpeg/umd/',      // Для хостингов, где /public - это корень сайта
    './ffmpeg/umd/',     // Относительный путь (надежный)
    '/public/ffmpeg/umd/' // Для локальных серверов, где корень - это папка проекта
  ];
  let FF_BASE = '';

  // Получаем глобал, куда UMD экспортирует FFmpeg
  function getFFmpegGlobal() {
    return (typeof FFmpeg !== 'undefined' && FFmpeg)
        || (typeof window !== 'undefined' && (window as any).FFmpeg)
        || (typeof self !== 'undefined' && (self as any).FFmpeg)
        || null;
  }

  function ffmpegAvailable() {
    const g = getFFmpegGlobal();
    return !!(g && typeof g.createFFmpeg === 'function' && typeof g.fetchFile === 'function');
  }

  // Последовательно пробуем загрузить ffmpeg.min.js из разных базовых путей
  function tryLoadLocalFFmpeg(bases = FF_BASES, i = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      if (i >= bases.length) {
        return reject(new Error(`Не нашли ffmpeg.min.js ни по одному пути. Пробовали: ${bases.join(', ')}`));
      }
      const base = bases[i];
      const s = document.createElement('script');
      s.src = base + 'ffmpeg.min.js';
      s.async = true; // Используем async для лучшей производительности
      s.onload = () => {
        setTimeout(() => {
          if (ffmpegAvailable()) {
            FF_BASE = base;
            resolve(base);
          } else {
            // Если FFmpeg не появился, считаем это ошибкой для этого пути
            tryLoadLocalFFmpeg(bases, i + 1).then(resolve).catch(reject);
          }
        }, 50); // Небольшая задержка, чтобы глобальная переменная успела определиться
      };
      s.onerror = () => {
        console.log(`Путь ${base} не сработал, пробуем следующий...`);
        tryLoadLocalFFmpeg(bases, i + 1).then(resolve).catch(reject);
      };
      document.head.appendChild(s);
    });
  }


  async function loadLocalFFmpeg() {
    if (ffmpegAvailable()) return;
    await tryLoadLocalFFmpeg();
  }

  let createFFmpegFn: any = null;
  let fetchFileFn: any    = null;
  let ffmpeg: any = null;
  let engineReady = false;
  let engineLoading = false;

  async function ensureEngine(){
    if (engineReady) return;
    if (engineLoading) {
      // Если уже грузится, ждем завершения
      while (!engineReady) { await new Promise(r => setTimeout(r, 150)); }
      return;
    }
    engineLoading = true;

    try {
      await loadLocalFFmpeg();
      if (!ffmpegAvailable()) {
        throw new Error(`FFmpeg не был загружен. Убедитесь, что папка /ffmpeg находится в правильном месте.`);
      }

      const g = getFFmpegGlobal();
      createFFmpegFn = g.createFFmpeg;
      fetchFileFn    = g.fetchFile;

      if (statusEl) statusEl.textContent = 'Инициализация аудиодвижка… (10–20 сек)';
      ffmpeg = createFFmpegFn({
        log: false,
        corePath: FF_BASE + 'ffmpeg-core.js'
      });

      ffmpeg.setProgress(({ ratio }: { ratio: number }) => {
        if (progressEl) progressEl.style.width = Math.min(100, Math.round((ratio || 0) * 100)) + '%';
      });

      await ffmpeg.load();
      engineReady = true;
      if (statusEl) statusEl.textContent = 'Движок готов.';
    } finally {
      engineLoading = false;
    }
  }

  function buildFilter(preset: string | undefined){
    switch(preset){
      case 'voice':   return 'highpass=f=120,lowpass=f=8000,compand=attacks=0.02:releases=0.3:points=-80/-80|-40/-32|-20/-12|0/-3:soft-knee=6:gain=3';
      case 'podcast': return 'highpass=f=100,lowpass=f=8500,compand=attacks=0.01:releases=0.25:points=-80/-80|-40/-30|-20/-10|0/-2:soft-knee=6:gain=5';
      case 'music':   return 'highpass=f=60,lowpass=f=16000,volume=2dB';
      default:        return 'volume=0dB';
    }
  }

  async function processAudio(){
    if (!currentFile) { alert('Сначала выберите аудиофайл.'); return; }

    if (processBtn) (processBtn as HTMLButtonElement).disabled = true;
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (statusEl) statusEl.textContent = 'Подготовка…';
    if (progressEl) progressEl.style.width = '0%';

    try{
      await ensureEngine();

      const ext = (currentFile.name.split('.').pop() || 'wav').toLowerCase();
      const inName  = 'input.' + ext;
      const outName = 'output.wav';

      await ffmpeg.FS('writeFile', inName, await fetchFileFn(currentFile));

      const af = buildFilter(presetEl ? (presetEl as HTMLSelectElement).value : 'voice');

      if (statusEl) statusEl.textContent = 'Обработка…';
      try{
        await ffmpeg.run('-i', inName, '-af', af, '-ar', '44100', '-ac', '1', outName);
      }catch(e){
        console.warn('Сложный фильтр не сработал, применяется упрощенный:', e);
        if (statusEl) statusEl.textContent = 'Обработка (упрощённый режим)…';
        await ffmpeg.run('-i', inName, '-af', 'highpass=f=120,lowpass=f=8000,volume=3dB', '-ar', '44100', '-ac', '1', outName);
      }

      const data = ffmpeg.FS('readFile', outName);
      lastOutputBlob = new Blob([data.buffer], { type:'audio/wav' });

      if (downloadBtn) downloadBtn.classList.remove('hidden');
      if (statusEl) statusEl.textContent = 'Готово ✅';
    }catch(err: any){
      console.error(err);
      alert(err.message || 'Не удалось обработать аудио.');
      if (statusEl) statusEl.textContent = 'Ошибка обработки.';
    }finally{
      if (processBtn) (processBtn as HTMLButtonElement).disabled = false;
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

