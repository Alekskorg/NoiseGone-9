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
