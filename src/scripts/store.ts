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

// ─── DOM / formulario helpers ────────────────────────────────────────────────

/**
 * Fuerza el contenido del input a MAYÚSCULAS preservando la posición del caret.
 * Reemplaza el patrón copy-paste que vivía en RestaurantForm y DishForm.
 */
export function forceUppercase(el: HTMLInputElement): void {
  const pos = el.selectionStart;
  el.value = el.value.toUpperCase();
  if (pos !== null) el.setSelectionRange(pos, pos);
}

/**
 * Cablea el ciclo de vida compartido de un overlay modal (`.overlay` + `.is-open`):
 * click fuera cierra. Devuelve `open`/`close` listos para usar. Llamar dentro de
 * `astro:page-load` para tomar referencias frescas al DOM actual.
 *
 * Devuelve `null` si el overlay no existe en la página actual.
 */
export function createOverlay(
  overlayId: string,
  opts: { onClose?: () => void } = {}
): { overlay: HTMLElement; open: () => void; close: () => void } | null {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return null;

  const open = (): void => {
    overlay.classList.add("is-open");
  };
  const close = (): void => {
    overlay.classList.remove("is-open");
    opts.onClose?.();
  };

  // .onclick evita acumulación de listeners si el módulo re-ejecuta
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  return { overlay, open, close };
}
