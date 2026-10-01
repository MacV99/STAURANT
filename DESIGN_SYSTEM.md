# STAURANT — Sistema de Diseño

> Fuente de identidad: app editorial de registro de restaurantes/platos — cuaderno de notas
> gastronómico, no red social ruidosa.
> Objetivo: no replicar un menú impreso, sino su versión ordenada y táctil para web/PWA.
> **Fuente de verdad de valores:** `src/styles/project.css` (`:root`) para color/componente y
> `src/styles/global.css` (`:root`) para tipografía/timing/radius. Este doc explica el
> **porqué**; nunca duplica hex ni px que puedan quedar viejos.

---

## 1. Personalidad de marca
Editorial · minimal · foodie · sobrio · táctil. Sensación objetivo: cuaderno limpio donde
anotar y calificar comida, con mucho blanco y jerarquía tipográfica. Anti-referencia: nada
que se sienta como app bancaria fría ni como red social recargada de color.

## 2. Principios de diseño
1. **Tinta sobre papel.** Neutro por defecto (`--clr-ink` sobre `--clr-white`/`--clr-white2`).
2. **El color se gana su lugar (70/20/10).** El color solo aparece en semántica (rating,
   estado, oficial, verificado). La UI base es acromática.
3. **Fondo punteado = firma.** El `radial-gradient` de puntos (`--dot-texture`) unifica todas
   las pantallas. Si un solo recurso identifica STAURANT, es ese.
4. **Tipografía como estructura.** Montserrat, títulos/labels/botones en UPPERCASE con
   `letter-spacing`; cuerpo en sentence case.
5. **Aire.** Cards con separación generosa; secciones respiran.

## 3. Color — jerarquía de uso (70/20/10)
| Peso | Rol | Token |
| ---- | --- | ----- |
| 70% | Fondo / superficies | `--clr-white`, `--clr-white2` |
| 20% | Texto / bordes / estructura | `--clr-ink` (`--clr-text`, `--clr-border`, `--clr-border2`) |
| 10% | Acento semántico | estados: `--clr-danger` · `--clr-success` · `--clr-warning` · `--clr-gold` (oficial) · `--clr-info` (verificado) |

> Los valores hex viven en `project.css`. Aquí solo roles. El color NUNCA es decorativo:
> cada tono comunica un estado. Excepciones documentadas de hex externos (no de marca):
> logos de Google (`#4285F4`…), botón iOS de InstallBanner (`#007aff`), y la meta
> `theme-color` (`#2e2e2e`, sincronizar a mano con `--clr-ink` — las meta tags no aceptan `var()`).

### Niveles de token (taxonomía)
- **Nivel 1 · Primitivo** — `--clr-ink`, `--rgb-ink`, `--clr-danger`, `--clr-success`,
  `--clr-warning`, `--clr-gold`/`--rgb-gold`, `--clr-info`. Se tocan solo al re-marcar.
- **Nivel 2 · Semántico** — derivados por `color-mix`/`rgba(var(--rgb-*))`: `--clr-primary*`,
  `--clr-text*`, `--clr-border*`, `--clr-*-bg`, `--clr-*-border`, `--clr-danger-strong`,
  `--clr-danger-bg-strong` (hover de superficie danger), `--clr-danger-border-soft` (borde
  danger suave), `--focus-ring`. Nunca repiten un hex.
- **Nivel 3 · Componente** — `--dot-texture`, `--skeleton-shine`, `--crown-shadow`,
  `--official-tint`, `--official-border`.

### Superficies de acción (color de botones/estados)
Regla de identidad para que ningún botón sea un "corte" duro de color sobre blanco: **un botón
de acción lleva un tinte tenue de su propio color semántico en reposo**, no blanco puro. Es el
mismo criterio que ya usan `.boton`/`Guardar` y la ✕ del modal (fondo `--clr-white2` = tinte
neutro), extendido a los estados.

Anatomía de una superficie tintada = **fondo `*-bg`** + **texto/ícono en el color** +
**borde `*-border(-soft)`**, y en hover **solo el fondo** sube al escalón `*-bg-strong` — el
borde no cambia (ver regla de hover en §9).

| Rol | Reposo (fondo · texto · borde) | Hover | Ejemplos |
| --- | --- | --- | --- |
| Neutro | `--clr-white2` · `--clr-primary` · `--clr-border` | `--clr-border` | `.boton`, ✕ (`.btn-icon-close`), `.boton2` (transparente) |
| Marca (zona) | `primary 6%` · `--clr-primary` · `primary 22%` | — | barra de gestión del dueño (`.owner-bar`) |
| Danger suave | `--clr-danger-bg` · `--clr-danger` · `--clr-danger-border-soft` | solo fondo → `--clr-danger-bg-strong` (borde no cambia) | Quitar (`.is-remove`), borrar plato (`.owner-dish-btn.is-delete`), logout (`.btn-danger-outline`) |
| Danger énfasis | `--clr-danger-bg` · `--clr-danger` · `--clr-danger-border-soft` | fondo `--clr-danger-border` | confirmación final destructiva (`.btn-danger` en `ConfirmDialog`); borde suave, se equilibra con el botón Cancelar (gris `--clr-border`); el énfasis lo da el fondo en hover |

> Dos niveles de danger a propósito: **suave** = destructivo *inline* dentro de una tarea de
> edición (reversible en contexto); **énfasis** = el "Eliminar" final de un `ConfirmDialog`
> (punto de no retorno) merece un borde más marcado. Success/warning/gold siguen el mismo molde
> (`*-bg` + color + `*-border`) cuando necesiten superficie propia.

## 4. Tipografía
- Familia única: **Montserrat** (`--font-main`), pesos 100–900 vía un solo `@import`.
- Títulos (`h1..h5`): peso 600, `letter-spacing: 2px`.
- Labels / botones: UPPERCASE, `letter-spacing` 1–2px, peso 600.
- Cuerpo (`p`): sentence case, `line-height` normal, `0.9–1.05rem` responsive.
- Números de rating (`.rating-num`): peso 900, `letter-spacing: -0.5px` (compacto, protagonista).

## 5. Espaciado
Escala objetivo (pasos fijos): `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`. Deuda conocida: los
`px` de gap/padding aún no están tokenizados a `--space-*`; al tocarlos, alinear a la escala.

## 6. Bordes, radius y sombras
- Bordes derivados del ink: `--clr-border` (10% ink), `--clr-border2` (20% ink).
- Radius: escala `--radius-sm 8` · `--radius-md 12` (= `--border-radius`) · `--radius-lg 20` ·
  `--radius-pill 50`. Cards/inputs = md; modales = lg; pills/botones = pill.
- Sombras: neutras `rgba(0,0,0,α)` (α .08–.22). El FAB usa glow de marca
  `rgba(var(--rgb-ink), .32)` — nunca un color ajeno a la marca.

## 7. Firma gráfica — fondo punteado
El `radial-gradient(circle, var(--dot-texture) 1px, transparent 1px)` a `20px 20px`. Vive en
`body` y en la utilidad `.texture-dotted`. Aparece en todas las pantallas: es lo que hace que
STAURANT se vea como STAURANT.

## 8. Contratos de componente
Concepto ↔ clase real ↔ tokens. Mantener sincronizado con el código.

| Componente | Clase | Tokens clave | Regla |
| ---------- | ----- | ------------ | ----- |
| Botón sólido | `button`, `.boton` | `--clr-white2`, `--clr-primary`, `--clr-border` | UPPERCASE, radius pill, hover `--clr-border` |
| Botón fantasma | `.boton2` | `--clr-text`, `--clr-border` | fondo transparente |
| Botón peligro (énfasis) | `.btn-danger` | `--clr-danger`, `--clr-danger-bg`, `--clr-danger-border-soft` | confirmación final destructiva (ConfirmDialog); borde suave para equilibrar con Cancelar, el énfasis lo da el fondo en hover (`--clr-danger-border`) |
| Botón peligro (suave) | `.is-remove`, `.owner-dish-btn.is-delete`, `.btn-danger-outline`, `.ur-btn-danger` | `--clr-danger-bg`, `--clr-danger`, `--clr-danger-border-soft` | destructivo inline; hover `--clr-danger-bg-strong`. Ver §3 "Superficies de acción" |
| Card restaurante | `.restaurant-card` | `--clr-white`, `--clr-border`, `--official-tint` | `.is-official` → tinte dorado |
| Badge rating | `.rating-badge` + `.badge-{empty,low,mid,high}` | `--clr-{danger,warning,success}-*` | color = tramo de nota (≤4 / 5–7 / 8+) |
| Corona top | `.crown-badge` | `--crown-shadow`, `--transition-bounce` | mejor valorado personal |
| Pill conteo | `.dish-count-pill`, `.global-rating-pill` | `--clr-white2`, `--clr-border` | + `.status-dot-*` según estado |
| Verificado | `.verified-badge` | `--clr-info` | perfil oficial |
| Modal | `.overlay` + `.form-box`/`.dialog-box` | `--clr-white`, radius lg, `box-pop-in` | scroll interno, no diálogos nativos |
| Input | `input/textarea/select` | `--clr-border`, `--clr-border2`, `--focus-ring` | foco teclado = anillo |
| Skeleton | `.skeleton-card` | `--skeleton-shine` | shimmer de carga |

## 9. Estados interactivos

**Regla de hover (dura):** el hover **solo cambia el fondo/superficie; jamás toca el borde.**
El hover neutro sube la superficie un escalón: reposo `--clr-white` → hover `--clr-white2`;
reposo `--clr-white2` → hover `--clr-border`. El danger sube solo el fondo `*-bg` → `*-bg-strong`
(§3). Prohibido subir el `border-color` en hover — ni a `--clr-primary` ni a `--clr-danger`
(se ve demasiado color). El borde queda fijo con su valor de reposo. **Todo hover va dentro de `@media (hover: hover)`** — nunca
`:hover` suelto: en móvil (touch) el hover no debe existir (se queda "pegado" tras el tap).

| Elemento | Hover / Focus / Press |
| -------- | --------------------- |
| Botón/control neutro | hover = subir superficie un escalón (white→white2, white2→border), `@media hover:hover`; press `scale(0.95)`. Ej. `.city-chip`, `.owner-dish-btn`, `.cc-option`, `.pt-action` |
| Card | press `scale(0.98)`; oficial = borde dorado |
| Badge clicable | `.badge-btn` press `scale(0.92)`, hover `brightness(.92)` |
| Foco teclado | `:focus-visible` → `--focus-ring` (siempre visible, nunca en click de ratón) |

## 10. Accesibilidad (mínimo AA)
- `:focus-visible` global con `--focus-ring` en todo interactivo (inputs, botones, links).
- `prefers-reduced-motion: reduce` mata animaciones/transiciones.
- Sin diálogos nativos (`alert/confirm/prompt`): usar `ConfirmDialog` / `NoticeDialog`.
- Pendiente de verificar contraste: `--clr-text-soft` (60% ink) sobre `--clr-white2` — validar ≥4.5:1 antes de usarlo en texto de cuerpo.

## 11. Checklist do / don't
**Hacer:** todo color/tamaño = token; derivar niveles 2/3 del primitivo con `var()`/`color-mix`;
color solo para semántica; UPPERCASE en títulos/labels/botones.
**Evitar:** hex/px hardcodeado fuera de `:root`; color decorativo por toda la UI (rompe 70/20/10);
radius/sombra fuera de escala; copiar valores a este doc.

---

## Changelog
Registro fechado de cambios de identidad (fecha absoluta · qué cambió · por qué).

- `2026-08-18` — **Fundación del DS.** Reestructurado `:root` en 3 niveles + `--rgb-*`;
  tokenizados todos los hex de marca dispersos (badges, status-dots, oficial, verificado,
  skeleton, fondo punteado, sombra FAB); añadido `:focus-visible` global y escala de radius;
  creado este documento. Motivo: el DS había driftado (CLAUDE.md decía marca verde `#546b41`,
  el código real era gris/negro; sombra verde vieja sobrevivía en el FAB) y había ~15 hex
  hardcodeados fuera de `:root`.
- `2026-08-18` — **Acento oficial = gris/negro `#2e2e2e` (`--clr-ink`).** Decisión: el código
  manda sobre el doc viejo. Personalidad fijada: editorial · minimal · foodie.
- `2026-08-18` — **Superficies de acción tintadas (regla de color de botones).** Ningún botón
  de acción es blanco puro: lleva un tinte tenue de su color semántico en reposo (igual que
  `.boton`/✕ con el neutro). Nuevos tokens `--clr-danger-bg-strong` (hover) y
  `--clr-danger-border-soft` (borde suave). Aplicado a Quitar (`.is-remove`), borrar plato
  (`.owner-dish-btn.is-delete`) y logout (`.btn-danger-outline`); se documentan dos niveles de
  danger (suave inline vs énfasis en confirm). Motivo: evitar cortes duros blanco/rojo y unificar
  el criterio de acción/estado para escalar consistente. Ver §3 "Superficies de acción".
- `2026-08-19` — **Regla de hover neutro = subir superficie, no borde.** El hover neutro sube
  la superficie un escalón (white→white2, white2→border), como los pills de ciudad; se prohíbe
  el hover que solo cambia `border-color` a `--clr-primary` (chillón). Reafirmado que todo hover
  vive en `@media (hover: hover)` (móvil/touch sin hover). Barrido de los border-only neutros:
  `.owner-dish-btn`, `.owner-act`, `.owner-exit` (oficial) y `.odf-image-add` (white2→border),
  `.odf-image-act` (OfficialManage) → todos a fondo-tono. Ampliado: el hover **jamás toca el
  borde**, tampoco en danger — quitado `border-color` de hover en `.owner-dish-btn.is-delete`,
  `.odf-image-act.is-remove` y `.pt-action`; el hover solo sube el fondo. Motivo: unificar el
  efecto de hover y quitar cortes de color. Ver §9.
- `2026-10-01` — **Modo oscuro.** `:root[data-theme="dark"]` re-define solo primitivos
  (tinta clara, superficies oscuras, estados más claros) + nuevo primitivo `--clr-shade`;
  niveles 2/3 ahora mezclan con `var(--clr-white)`/`var(--clr-shade)` en vez de
  `white`/`black` para derivarse solos. Se elige en /perfil (localStorage `staurant_theme`,
  aplicado en `Layout1` antes de pintar). El logo PNG se invierte con `filter`.
  Rellenos de "seleccionado"/botón principal usan `--clr-accent-bg` / `--clr-accent-bg-hover`
  / `--clr-on-accent` (claro = tinta; oscuro = gris suave) para no encandilar.
