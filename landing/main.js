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

// The file size is read from the APK itself, so it is right after every new build.
// With no file on the server, the buttons say so instead of handing over an error page.
fetch('pawpin.apk', { method: 'HEAD' })
  .then((response) => {
    const bytes = Number(response.headers.get('content-length'));
    if (!response.ok) throw new Error(String(response.status));
    if (!bytes) return;
    document.querySelectorAll('[data-apk-size]').forEach((el) => {
      el.textContent = `${Math.round(bytes / 1048576)} MB`;
      el.hidden = false;
    });
  })
  .catch(() => {
    document.querySelectorAll('[data-apk]').forEach((el) => el.setAttribute('aria-disabled', 'true'));
    document.querySelector('[data-apk-missing]').hidden = false;
  });

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
