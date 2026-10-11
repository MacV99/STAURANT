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

/** Nombre de plato para LISTAS: abrevia palabras muy obvias solo si el nombre
 *  es largo ("Hamburguesa doble con tocineta" → "Hamb. doble con tocineta").
 *  El nombre completo sigue en el modal y en la búsqueda. */
export function shortDishName(name: string): string {
  if (name.length <= 18) return name;
  return name.replace(/\bhamburguesa\b/gi, (w) =>
    w[0] === w[0].toUpperCase() && w[1] === w[1].toUpperCase() ? "HAMB." : w[0] + "amb.",
  );
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
  pill.innerHTML = `<i class="bi bi-globe2"></i> ${avg} <span class="grp-count">· <i class="bi bi-person-fill"></i> ${count}</span>`;
  return pill;
}

/** Logo de un restaurante oficial (img) o placeholder con la inicial del nombre
 *  si no tiene logo o la imagen falla. Clase base `.logo-avatar`; `extraClass`
 *  añade variantes de tamaño (p.ej. `logo-avatar-lg` en el header). Se usa en el
 *  header /oficial, las cards del inicio y las de /explorar. */
export function buildOfficialLogo(
  logoUrl: string | null,
  name: string,
  extraClass = "",
): HTMLElement {
  const base = extraClass ? `logo-avatar ${extraClass}` : "logo-avatar";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const placeholder = () => {
    const box = document.createElement("div");
    box.className = `${base} logo-avatar-placeholder`;
    box.textContent = initial;
    box.setAttribute("aria-label", name);
    return box;
  };
  if (!logoUrl) return placeholder();
  const img = document.createElement("img");
  img.className = base;
  img.src = logoUrl;
  img.alt = name;
  img.onerror = () => img.replaceWith(placeholder());
  return img;
}

/** Pill de calificación con etiqueta (Global 🌐 / Personal 👤), mismo estilo visual
 *  que `.global-rating-pill`. Se usa en el header oficial donde antes iba el badge:
 *  la nota se parte en dos pills (comunidad vs. tú). `score` null → em dash. */
export function buildRatingPill(
  kind: "global" | "personal",
  score: number | null,
  count?: number,
): HTMLElement {
  const pill = document.createElement("span");
  pill.className = "global-rating-pill";
  const icon = kind === "global" ? "bi-globe2" : "bi-person-fill";
  const label = kind === "global" ? "Global" : "Personal";
  const val = score === null ? "—" : String(score);
  pill.title =
    kind === "global"
      ? count && count > 0
        ? `Promedio global basado en ${count} ${count === 1 ? "calificación" : "calificaciones"}`
        : "Aún sin calificaciones de la comunidad"
      : score === null
        ? "Aún no has calificado platos de este restaurante"
        : "Tu promedio en este restaurante";
  const countHtml =
    kind === "global" && count && count > 0
      ? ` <span class="grp-count">· <i class="bi bi-person-fill"></i> ${count}</span>`
      : "";
  pill.innerHTML = `<i class="bi ${icon}"></i> ${label} <span class="rp-score">${val}</span>${countHtml}`;
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

/** Marca la opción activa del SortBar (campo + dirección) y pone su texto
 *  corto en el botón "Ordenar". */
export function updateSortPills(field: string, dir: "asc" | "desc"): void {
  document.querySelectorAll<HTMLElement>(".sort-bar").forEach((bar) => {
    let activeShort = "";
    bar.querySelectorAll<HTMLButtonElement>(".sort-opt").forEach((btn) => {
      const isActive = btn.dataset.field === field && btn.dataset.dir === dir;
      btn.classList.toggle("active", isActive);
      if (isActive) activeShort = btn.dataset.short ?? "";
    });
    const label = bar.querySelector(".sort-trigger-label");
    if (label && activeShort) label.textContent = activeShort;
  });
}

/** Cablea las opciones del SortBar: al tocar una, avisa `onPick` y cierra la
 *  hoja. Usa `.onclick` → reasignar en cada page-load no acumula handlers. */
export function wireSortBar(onPick: (field: string, dir: "asc" | "desc") => void): void {
  document.querySelectorAll<HTMLButtonElement>(".sort-opt").forEach((btn) => {
    btn.onclick = () => {
      onPick(btn.dataset.field ?? "", btn.dataset.dir === "asc" ? "asc" : "desc");
      btn.closest<HTMLDialogElement>("dialog")?.close();
    };
  });
}

/** Opción de una fila de chips de filtro ("" en `selected` = Todos). */
export interface FilterChipOption {
  value: string;
  label: string;
  count?: number;
}

/** Pinta una fila deslizable de chips: "Todos" + una por opción. Se oculta si
 *  hay menos de 2 opciones (filtrar no serviría de nada). */
export function renderFilterChips(
  el: HTMLElement,
  cfg: {
    options: FilterChipOption[];
    selected: string;
    allLabel?: string;
    onPick: (value: string) => void;
  },
): void {
  el.innerHTML = "";
  el.hidden = cfg.options.length < 2;
  if (el.hidden) return;

  const make = (value: string, label: string, count?: number) => {
    const chip = document.createElement("button");
    const active = value === cfg.selected;
    chip.type = "button";
    chip.className = "filter-chip" + (active ? " active" : "");
    chip.setAttribute("aria-pressed", String(active));
    chip.textContent = label;
    if (count) {
      const c = document.createElement("span");
      c.className = "filter-chip-count";
      c.textContent = String(count);
      chip.appendChild(c);
    }
    chip.onclick = () => cfg.onPick(value);
    el.appendChild(chip);
    return chip;
  };

  make("", cfg.allLabel ?? "Todos");
  cfg.options.forEach((o) => {
    const chip = make(o.value, o.label, o.count);
    // La activa siempre a la vista (p. ej. al volver con un filtro puesto).
    if (o.value === cfg.selected)
      requestAnimationFrame(() => chip.scrollIntoView({ block: "nearest", inline: "center" }));
  });
}

/** Tras filtrar u ordenar con la barra fija ya pegada arriba, sube la página al
 *  inicio de la lista para que se vean los primeros resultados. */
export function keepListInView(listEl: HTMLElement | null, stickyEl: HTMLElement | null): void {
  if (!listEl || !stickyEl) return;
  const stickyBottom = stickyEl.getBoundingClientRect().bottom;
  const listTop = listEl.getBoundingClientRect().top;
  if (listTop < stickyBottom) window.scrollBy({ top: listTop - stickyBottom - 12 });
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

// ─── Opciones de combobox: orden por uso, grupos y búsqueda sin tildes ──────

/** Opción de combobox: valor (MAYÚSCULAS), veces usada y grupo opcional. */
export interface ComboOption {
  value: string;
  count?: number;
  group?: string;
}

/** Texto comparable: MAYÚSCULAS, sin tildes ni espacios extra
 *  ("aromática " → "AROMATICA"). Para buscar y detectar duplicados. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

function byUse(a: [string, number], b: [string, number]): number {
  return b[1] - a[1] || a[0].localeCompare(b[0], "es");
}

/** Arma las opciones en dos grupos: primero las del restaurante (más usadas
 *  arriba) y debajo las de todos los restaurantes (por uso global). Una opción
 *  de `global` que ya está en `local` (sin importar tildes) no se repite. */
export function rankComboOptions(
  local: Map<string, number>,
  global: Map<string, number>,
  labels: { local: string; global: string },
): ComboOption[] {
  const out: ComboOption[] = [...local]
    .sort(byUse)
    .map(([value, count]) => ({ value, count, group: labels.local }));
  const seen = new Set(out.map((o) => normalizeText(o.value)));
  [...global].sort(byUse).forEach(([value, count]) => {
    const key = normalizeText(value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, count, group: labels.global });
  });
  return out;
}

/** Cuenta valores repetidos → Map nombre → veces (ignora vacíos). */
export function countValues(values: Iterable<string | null | undefined>): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of values) {
    const k = v?.trim().toUpperCase();
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

function toComboOption(o: string | ComboOption): ComboOption {
  return typeof o === "string" ? { value: o } : o;
}

/** Si `value` ya existe entre las opciones escrito con/sin tildes, devuelve la
 *  versión existente ("AROMATICA" → "AROMÁTICA"); si no, el mismo `value`. */
export function matchExistingOption(
  options: Array<string | ComboOption>,
  value: string,
): string {
  const key = normalizeText(value);
  if (!key) return value;
  return options.map(toComboOption).find((o) => normalizeText(o.value) === key)?.value ?? value;
}

/** Filtra (sin tildes) y pinta las opciones en `dropdown`, con título de grupo
 *  cuando hay más de uno y el conteo de uso a la derecha. Devuelve si hubo
 *  coincidencia exacta (sin tildes) para no ofrecer "Crear" un duplicado. */
export function renderComboOptions(cfg: {
  dropdown: HTMLElement;
  options: Array<string | ComboOption>;
  query: string;
  optionClass: string;
  selected?: string | null;
  onPick: (value: string) => void;
}): { exact: boolean } {
  const q = normalizeText(cfg.query);
  const opts = cfg.options.map(toComboOption);
  const filtered = q ? opts.filter((o) => normalizeText(o.value).includes(q)) : opts;
  const exact = !!q && opts.some((o) => normalizeText(o.value) === q);
  const groups = new Set(filtered.map((o) => o.group ?? ""));
  let lastGroup: string | undefined;

  filtered.forEach((o) => {
    if (groups.size > 1 && o.group && o.group !== lastGroup) {
      const h = document.createElement("div");
      h.className = "cc-group-label";
      h.textContent = o.group;
      cfg.dropdown.appendChild(h);
    }
    lastGroup = o.group;
    const el = document.createElement("div");
    el.className = cfg.optionClass + (o.value === cfg.selected ? " is-selected" : "");
    el.textContent = o.value;
    if (o.count) {
      const c = document.createElement("span");
      c.className = "cc-count";
      c.textContent = String(o.count);
      el.appendChild(c);
    }
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () => cfg.onPick(o.value));
    cfg.dropdown.appendChild(el);
  });
  return { exact };
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
  getOptions: () => Array<string | ComboOption>;
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
    input.value = matchExistingOption(cfg.getOptions(), value);
    syncClear();
    close();
  }

  function render(query: string): void {
    const q = query.trim().toUpperCase();
    dropdown.innerHTML = "";
    const { exact } = renderComboOptions({
      dropdown,
      options: cfg.getOptions(),
      query,
      optionClass: "cc-option",
      selected: q,
      onPick: select,
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
  getOptions: () => Array<string | ComboOption>;
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
    const v = matchExistingOption(cfg.getOptions(), value.trim().toUpperCase());
    if (!v) return;
    if (!selected.some((c) => normalizeText(c) === normalizeText(v))) selected.push(v);
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
    const taken = new Set(selected.map(normalizeText));
    const pool = cfg
      .getOptions()
      .map(toComboOption)
      .filter((o) => !taken.has(normalizeText(o.value)));
    dropdown.innerHTML = "";
    const res = renderComboOptions({
      dropdown,
      options: pool,
      query,
      optionClass: "cc-option",
      onPick: add,
    });
    const exact = res.exact || taken.has(normalizeText(q));

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
