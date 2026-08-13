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

// ─── Combobox creable (single, basado en strings) ────────────────────────────

/**
 * Cablea un combobox "creable" de valor único basado en strings: muestra las
 * opciones existentes, filtra al escribir y ofrece "Crear/Agregar «X»" cuando el
 * texto no coincide con ninguna. Mismo comportamiento que los combobox de tipo
 * (DishForm) y ciudad (RestaurantForm), pero genérico y sin tabla/id detrás — el
 * valor ES el texto del input (en MAYÚSCULAS).
 *
 * Llamar dentro de `astro:page-load`: los nodos del swap anterior mueren con su
 * DOM, así que `addEventListener` sobre elementos frescos no acumula listeners.
 *
 * El caller aporta el marcado (`.cc-*`) y el CSS de las opciones
 * (`.cc-option`, `.is-create`, `.is-empty`). `getOptions` se lee en vivo, así que
 * las opciones pueden llegar async (p.ej. tras un fetch) sin re-cablear.
 */
export function wireCreatableCombobox(cfg: {
  combobox: HTMLElement;
  input: HTMLInputElement;
  dropdown: HTMLElement;
  clearBtn?: HTMLButtonElement | null;
  getOptions: () => string[];
  createVerb?: string;
  emptyText?: string;
}): { setValue: (v: string) => void; getValue: () => string; close: () => void } {
  const { combobox, input, dropdown } = cfg;
  const clearBtn = cfg.clearBtn ?? null;
  const verb = cfg.createVerb ?? "Crear";

  function syncClear(): void {
    if (clearBtn) clearBtn.hidden = !input.value.trim();
  }

  function select(value: string): void {
    input.value = value;
    syncClear();
    close();
  }

  function render(query: string): void {
    const q = query.trim().toUpperCase();
    const opts = cfg.getOptions();
    const filtered = q ? opts.filter((o) => o.includes(q)) : opts;
    const exact = opts.some((o) => o === q);
    dropdown.innerHTML = "";

    filtered.forEach((o) => {
      const el = document.createElement("div");
      el.className = "cc-option" + (o === q ? " is-selected" : "");
      el.textContent = o;
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", () => select(o));
      dropdown.appendChild(el);
    });

    // Opción para crear una nueva (texto sin coincidencia exacta).
    if (q && !exact) {
      const el = document.createElement("div");
      el.className = "cc-option is-create flex-row";
      el.innerHTML = `<i class="bi bi-plus-lg"></i> ${verb} "<span class="cc-create-name"></span>"`;
      el.querySelector(".cc-create-name")!.textContent = q;
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", () => select(q));
      dropdown.appendChild(el);
    }

    if (dropdown.childElementCount === 0) {
      const el = document.createElement("div");
      el.className = "cc-option is-empty";
      el.textContent = cfg.emptyText ?? "Escribe para crear una opción";
      dropdown.appendChild(el);
    }
  }

  function openDropdown(): void {
    render(input.value);
    dropdown.hidden = false;
    combobox.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }
  function close(): void {
    dropdown.hidden = true;
    combobox.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
  }

  input.addEventListener("input", () => {
    forceUppercase(input);
    syncClear();
    if (dropdown.hidden) openDropdown();
    else render(input.value);
  });
  input.addEventListener("focus", () => {
    if (dropdown.hidden) openDropdown();
  });
  input.addEventListener("click", () => {
    if (dropdown.hidden) openDropdown();
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!combobox.contains(document.activeElement)) close();
    }, 150);
  });
  // Enter confirma el texto escrito en vez de enviar el formulario.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !dropdown.hidden) {
      e.preventDefault();
      select(input.value.trim());
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("mousedown", (e) => e.preventDefault());
    clearBtn.addEventListener("click", () => {
      input.value = "";
      syncClear();
      input.focus();
      openDropdown();
    });
  }

  return {
    setValue: (v: string) => {
      input.value = v;
      syncClear();
      close();
    },
    getValue: () => input.value.trim(),
    close,
  };
}

// ─── Combobox creable MULTI (chips) ──────────────────────────────────────────

/**
 * Igual que {@link wireCreatableCombobox} pero de selección múltiple: cada valor
 * confirmado se muestra como chip (pin + nombre + ✕) y el input se limpia para
 * seguir agregando. Mismo comportamiento que el combobox de ciudades del
 * RestaurantForm, extraído para reutilizarlo (p.ej. ciudad de oficiales).
 *
 * El caller aporta el marcado (`.cc-*` + contenedor de chips) y el CSS de chips.
 * `flush()` agrega lo que quedó escrito sin confirmar (llamar antes de guardar).
 */
export function wireCreatableMultiCombobox(cfg: {
  combobox: HTMLElement;
  input: HTMLInputElement;
  dropdown: HTMLElement;
  chips: HTMLElement;
  getOptions: () => string[];
  createVerb?: string;
  pinIcon?: string;
}): { getValues: () => string[]; setValues: (v: string[]) => void; flush: () => void } {
  const { combobox, input, dropdown, chips } = cfg;
  const verb = cfg.createVerb ?? "Agregar";
  let selected: string[] = [];

  function renderChips(): void {
    chips.innerHTML = "";
    chips.hidden = selected.length === 0;
    if (selected.length === 0) return;

    const pin = document.createElement("i");
    pin.className = `bi ${cfg.pinIcon ?? "bi-geo-alt-fill"} cc-chip-pin`;
    chips.appendChild(pin);

    selected.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "cc-chip";
      const label = document.createElement("span");
      label.className = "cc-chip-label";
      label.textContent = c;
      chip.appendChild(label);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "cc-chip-x";
      x.setAttribute("aria-label", `Quitar ${c}`);
      x.innerHTML = `<i class="bi bi-x-lg"></i>`;
      x.addEventListener("mousedown", (e) => e.preventDefault());
      x.onclick = () => remove(c);
      chip.appendChild(x);
      chips.appendChild(chip);
    });
  }

  function add(value: string): void {
    const v = value.trim().toUpperCase();
    if (!v) return;
    if (!selected.includes(v)) selected.push(v);
    renderChips();
    input.value = "";
    input.focus();
    close();
  }

  function remove(value: string): void {
    selected = selected.filter((c) => c !== value);
    renderChips();
  }

  function render(query: string): void {
    const q = query.trim().toUpperCase();
    const pool = cfg.getOptions().filter((c) => !selected.includes(c));
    const filtered = q ? pool.filter((c) => c.includes(q)) : pool;
    const exact = pool.includes(q) || selected.includes(q);
    dropdown.innerHTML = "";

    filtered.forEach((c) => {
      const opt = document.createElement("div");
      opt.className = "cc-option";
      opt.textContent = c;
      opt.addEventListener("mousedown", (e) => e.preventDefault());
      opt.addEventListener("click", () => add(c));
      dropdown.appendChild(opt);
    });

    if (q && !exact) {
      const opt = document.createElement("div");
      opt.className = "cc-option is-create flex-row";
      opt.innerHTML = `<i class="bi bi-plus-lg"></i> ${verb} "<span class="cc-create-name"></span>"`;
      opt.querySelector(".cc-create-name")!.textContent = q;
      opt.addEventListener("mousedown", (e) => e.preventDefault());
      opt.addEventListener("click", () => add(q));
      dropdown.appendChild(opt);
    }

    if (dropdown.childElementCount === 0) {
      close();
      return;
    }
    dropdown.hidden = false;
    combobox.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }

  function open(): void {
    render(input.value);
  }
  function close(): void {
    dropdown.hidden = true;
    combobox.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
  }

  input.addEventListener("input", () => {
    forceUppercase(input);
    open();
  });
  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!combobox.contains(document.activeElement)) close();
    }, 150);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(input.value);
    }
  });

  return {
    getValues: () => [...selected],
    setValues: (v: string[]) => {
      selected = [...new Set(v.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      input.value = "";
      renderChips();
      close();
    },
    // Incluye lo que quedó escrito sin confirmar como chip (llamar antes de guardar).
    flush: () => add(input.value),
  };
}

// ─── Formato de precio (separador de miles) ──────────────────────────────────

/** Convierte una cadena de dígitos en un entero con puntos de miles.
 *  `"1000" → "1.000"`, `"1500000" → "1.500.000"`. Ignora todo lo no numérico y
 *  elimina ceros a la izquierda. Cadena vacía → "". */
export function formatThousands(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Formatea un input de precio en tiempo real mientras se escribe, preservando
 *  la posición del caret (contando dígitos desde la derecha). El valor numérico
 *  real se recupera con `raw.replace(/\D/g, "")`. */
export function attachThousandsFormat(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    const sel = input.selectionStart ?? input.value.length;
    const digitsRight = input.value.slice(sel).replace(/\D/g, "").length;
    const formatted = formatThousands(input.value);
    input.value = formatted;
    // Reposiciona el caret tras los mismos `digitsRight` dígitos contando desde
    // el final, para que reinsertar los puntos no lo desplace.
    let pos = formatted.length;
    let seen = 0;
    while (pos > 0 && seen < digitsRight) {
      pos--;
      if (/\d/.test(formatted[pos]!)) seen++;
    }
    input.setSelectionRange(pos, pos);
  });
}
