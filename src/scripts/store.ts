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

/** Corona 👑 para destacar el mejor valorado (restaurante o plato). */
export function makeCrown(label = "Mejor valorado"): HTMLSpanElement {
  const crown = document.createElement("span");
  crown.className = "crown-badge";
  crown.textContent = "👑";
  crown.title = label;
  crown.setAttribute("aria-label", label);
  return crown;
}

/** Pinta un `.rating-badge` existente a partir de una calificación (o null).
 *  Reemplaza el patrón copy-paste className+innerHTML repartido por index /
 *  restaurante / oficial / usuario. `button` añade `.badge-btn` (badge clicable). */
export function paintRatingBadge(
  el: Element,
  score: number | null,
  opts: { button?: boolean } = {},
): void {
  const btn = opts.button ? " badge-btn" : "";
  if (score === null) {
    el.className = `rating-badge badge-empty${btn}`;
    el.innerHTML = '<i class="bi bi-star"></i>';
  } else {
    el.className = `rating-badge ${getRatingClass(score)}${btn}`;
    el.innerHTML = `<span class="rating-num">${score}</span>`;
  }
}

/** Pill "🌐 promedio · N" con la nota global (comunidad) de un oficial/plato. */
export function buildGlobalRatingPill(avg: number, count: number): HTMLElement {
  const pill = document.createElement("span");
  pill.className = "global-rating-pill";
  pill.title = `Promedio global basado en ${count} ${count === 1 ? "calificación" : "calificaciones"}`;
  pill.innerHTML = `<i class="bi bi-globe2"></i> ${avg} <span class="grp-count">· ${count}</span>`;
  return pill;
}

/** Rellena un heading con el nombre del restaurante. Los oficiales llevan el sello
 *  verificado pegado a la última palabra (`.name-tail-nowrap`) para que no caiga
 *  sola en una línea. Unifica el `fillName`/head-tail repartido por las páginas. */
export function fillRestaurantName(
  el: HTMLElement,
  name: string,
  isOfficial: boolean,
): void {
  el.textContent = "";
  if (!isOfficial) {
    el.textContent = name;
    return;
  }
  const idx = name.lastIndexOf(" ");
  const head = idx === -1 ? "" : name.slice(0, idx + 1);
  const tail = idx === -1 ? name : name.slice(idx + 1);
  if (head) el.appendChild(document.createTextNode(head));
  const tailSpan = document.createElement("span");
  tailSpan.className = "name-tail-nowrap";
  tailSpan.textContent = tail;
  const badge = document.createElement("i");
  badge.className = "bi bi-patch-check-fill verified-badge";
  badge.title = "Restaurante verificado";
  tailSpan.appendChild(badge);
  el.appendChild(tailSpan);
}

/** Sincroniza el estado visual de las `.sort-pill` (activa + flecha asc/desc).
 *  Mismo cuerpo que vivía copiado en index / oficial / restaurante / usuario. */
export function updateSortPills(field: string, dir: "asc" | "desc"): void {
  document.querySelectorAll<HTMLButtonElement>(".sort-pill").forEach((btn) => {
    const isActive = btn.dataset.field === field;
    btn.classList.toggle("active", isActive);
    const icon = btn.querySelector("i");
    if (icon)
      icon.className = isActive
        ? `bi bi-arrow-${dir === "asc" ? "up" : "down"}`
        : "bi bi-arrow-down-up";
  });
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
  | "dish:deleted"
  | "official:rated"
  | "official:added"
  | "official:carta-changed"
  | "official:profile-changed";

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
