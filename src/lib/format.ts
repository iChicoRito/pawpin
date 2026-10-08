/** "350 m" under a kilometer, "2.4 km" up to ten, "12 km" beyond. */
export function formatDistance(meters: number) {
  const whole = Math.round(meters);
  if (whole < 1000) return `${whole} m`;
  const km = meters / 1000;
  return km < 9.95 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** How long ago a time was: "Just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatAge(iso: string, now = Date.now()) {
  // A phone clock slightly behind the database gives a negative age, which also reads as just now.
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
