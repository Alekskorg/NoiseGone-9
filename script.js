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
