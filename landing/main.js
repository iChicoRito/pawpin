document.documentElement.classList.add('js');

// Scroll reveal. Each element shows once.
const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      seen.unobserve(entry.target);
    }
  },
  { threshold: 0.2 }
);
document.querySelectorAll('.reveal').forEach((el) => seen.observe(el));

// The nav gets its line once the page has moved.
const nav = document.querySelector('.nav');
new IntersectionObserver(([entry]) => nav.classList.toggle('stuck', !entry.isIntersecting)).observe(
  document.querySelector('.hero h1')
);

// The video's own play button, until the video starts.
const video = document.querySelector('.player video');
const play = document.querySelector('.play');
play.addEventListener('click', () => video.play());
video.addEventListener('play', () => (play.hidden = true));

// The theme button. The choice is kept for the next visit.
const root = document.documentElement;
document.querySelector('.theme-btn').addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', root.dataset.theme);
  } catch {}
});
