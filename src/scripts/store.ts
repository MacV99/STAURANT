// ─── Rating helpers ────────────────────────────────────────────────────────────

export function getRatingClass(score: number): string {
  if (score <= 4) return "badge-low";
  if (score <= 7) return "badge-mid";
  return "badge-high";
}

export function getRatingBadgeHTML(score: number | null): string {
  if (score === null) return `<span class="rating-badge badge-empty"><i class="bi bi-star-fill"></i></span>`;
  const cls = getRatingClass(score);
  return `<span class="rating-badge ${cls}"><span class="rating-num">${score}</span></span>`;
}

// ─── Event bus ─────────────────────────────────────────────────────────────────

type AppEvent =
  | "restaurant:created"
  | "restaurant:updated"
  | "restaurant:deleted"
  | "restaurant:visited"
  | "dish:created"
  | "dish:updated"
  | "dish:first-rated"
  | "dish:deleted";

export function emit(event: AppEvent, detail?: unknown): void {
  document.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(
  event: AppEvent,
  handler: (e: CustomEvent) => void
): void {
  document.addEventListener(event, handler as EventListener);
}
