const button = document.getElementById('reduceMotion');
const hero = document.querySelector('.hero');
const stage = document.querySelector('.hero-figure');
const field = document.querySelector('.molecular-field');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let manual = false;
try { manual = localStorage.getItem('spectral-reduce-motion') === '1'; } catch {}
let pending = 0, scrollFrame = 0;

function resetDepth() {
  cancelAnimationFrame(pending);
  pending = 0;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  field.style.removeProperty('--field-scroll');
  for (const key of ['--tilt-x', '--tilt-y']) stage.style.removeProperty(key);
  for (const key of ['--field-x', '--field-y']) field.style.removeProperty(key);
}

function sync() {
  const reduced = manual || preference.matches;
  document.body.classList.toggle('motion-reduced', reduced);
  document.body.classList.toggle('motion-paused', document.hidden);
  button.setAttribute('aria-pressed', String(reduced));
  button.disabled = preference.matches;
  if (reduced || document.hidden) resetDepth();
}

button.addEventListener('click', () => {
  manual = !manual;
  try { localStorage.setItem('spectral-reduce-motion', manual ? '1' : '0'); } catch {}
  sync();
});
preference.addEventListener('change', sync);
finePointer.addEventListener('change', resetDepth);
document.addEventListener('visibilitychange', sync);
window.addEventListener('hashchange', resetDepth);
window.addEventListener('pagehide', resetDepth);
document.addEventListener('pointerleave', resetDepth);
document.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !finePointer.matches || manual || preference.matches || document.hidden || pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const x = Math.max(-1, Math.min(1, 2 * event.clientX / innerWidth - 1));
    const y = Math.max(-1, Math.min(1, 2 * event.clientY / innerHeight - 1));
    field.style.setProperty('--field-x', (x * 12) + 'px');
    field.style.setProperty('--field-y', (y * 9) + 'px');
    if (hero.contains(event.target)) {
      stage.style.setProperty('--tilt-x', (x * 5) + 'deg');
      stage.style.setProperty('--tilt-y', (-y * 4) + 'deg');
    }
  });
}, {passive:true});
window.addEventListener('scroll', () => {
  if (scrollFrame || manual || preference.matches || document.hidden) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    field.style.setProperty('--field-scroll', Math.min(16, scrollY * .035) + 'px');
  });
}, {passive:true});
hero.addEventListener('pointerleave', () => {
  cancelAnimationFrame(pending);
  pending = 0;
  stage.style.removeProperty('--tilt-x');
  stage.style.removeProperty('--tilt-y');
});
sync();