# Plan: mejoras web modernas

Sale de revisar el proyecto con `modern-web-guidance` (escaneo de `src/` + guía `dialog`).
Estado: **planeado, nada hecho todavía.** Marcar cada casilla al terminar.

Orden pensado para que cada etapa se pueda hacer y subir sola.

---

## Etapa 1 · Ventanas emergentes nativas (la que más se nota) — HECHA (2026-11-16)

> Hecho: helper, estilos y las 13 ventanas. `autofocus` solo en confirmación (Cancelar) y
> aviso (Entendido); en formularios NO, para no abrir el teclado del celular al abrir.
> Probado sin sesión: aviso, compartir, login inline (Esc, clic afuera, X, apilado, celular).
> **Falta probar con sesión:** formularios de plato/restaurante, perfil y recomendar.

**Qué gana el usuario:** cerrar con Esc y con el botón "atrás" del celular, el teclado no
se escapa a lo que hay detrás, y al cerrar vuelve al botón donde estaba.

**Hoy:** 13 ventanas son `<div class="overlay">` que se muestran con la clase `is-open`.
Todas pasan por `createOverlay()` en `src/scripts/store.ts:295`.

**Cómo (cambio mínimo, misma apariencia):**

- [ ] `store.ts` → `createOverlay()`: abrir con `showModal()`, cerrar con `close()`.
      Mover `opts.onClose` al evento `close` del diálogo (así también corre al cerrar con Esc).
      El clic afuera se queda como está (`e.target === overlay`): el diálogo ocupa toda la
      pantalla y la caja va adentro, así que sigue funcionando en todos los navegadores.
- [ ] `project.css` (`.overlay`, líneas 96-122 y 1220-1227):
      - quitar los estilos por defecto del `<dialog>` (borde, relleno, tamaño máximo, margen, color);
      - `display: flex` solo en `.overlay[open]` (nunca sin `[open]`: rompería el cerrado);
      - el fondo borroso sigue en el propio `.overlay`; `::backdrop` transparente;
      - cambiar `.overlay.is-open` → `.overlay[open]` en las animaciones;
      - borrar `z-index: 200` (ya no hace falta: el navegador las pone encima).
- [ ] Cambiar `<div class="overlay" role="dialog" aria-modal="true">` por
      `<dialog class="overlay">` (sin `role` ni `aria-modal`, con `aria-labelledby` al título) en:
      - [ ] `ConfirmDialog.astro` y `NoticeDialog.astro` ← **empezar aquí como prueba**
      - [ ] `FormModal.astro` (lo usan DishForm, RestaurantForm y los dos de OfficialManage)
      - [ ] `AuthModal.astro`
      - [ ] `MapsChooser.astro`, `ShareDialog.astro`, `RecommendDialog.astro`
      - [ ] `InstallBanner.astro` (ventana de iOS)
      - [ ] `recomendaciones.astro` (`chat-pick-overlay`)
      - [ ] `perfil.astro` (4: editar, solicitud, bandeja, asignar)
- [ ] Sitios que abren a mano con `classList.add("is-open")` sin pasar por `createOverlay`:
      `AuthModal.astro:399`, `DishForm.astro:1046` y `:1172`, `RestaurantForm.astro:593`,
      `InstallBanner.astro:279` → usar `open()` del helper.
- [ ] `autofocus` en el primer campo de cada formulario; en confirmaciones de borrar,
      en "Cancelar".
- [ ] Quitar manejadores de Esc hechos a mano que queden duplicados (revisar los 18
      usos de `Escape` / `.focus()` en 9 archivos; los de los buscadores desplegables se quedan).

**Cuidado con:**

- Un aviso (`NoticeDialog`) o confirmación que se abre encima de un formulario: debe
  quedar encima. Con nativo sale bien si se abre después; probarlo.
- Lo que esté fuera de la ventana queda bloqueado mientras está abierta (barra de carga,
  banner de instalar). Revisar que nada de eso tenga que tocarse con una ventana abierta.
- Los desplegables de tipo de plato y ciudad dentro de los formularios: comprobar que no
  se cortan.
- Al cambiar de página con una ventana abierta: cerrarla antes (`astro:before-swap`).
- Esc ahora cierra formularios a medio llenar. Hoy el clic afuera ya hace lo mismo, así
  que no empeora; si molesta, se agrega pregunta "¿descartar cambios?" después.

**Probar:** abrir y cerrar cada ventana (botón, Esc, clic afuera, atrás en celular),
modo claro y oscuro, celular y escritorio. **Sin guardar nada**: `pnpm dev` usa datos reales.

---

## Etapa 2 · Íconos seguros (5 minutos) — HECHA (2026-11-16)

> Sello comprobado contra el que publica jsDelivr. Íconos cargan, sin errores.

`Layout1.astro:70-73` carga los íconos (bootstrap-icons 1.13.1) desde un servidor ajeno
sin comprobar que el archivo sea el esperado.

- [x] Agregar `integrity="sha384-…"`, `crossorigin="anonymous"` y
      `referrerpolicy="no-referrer"` al `<link>`. El sello se calcula al momento sobre
      ese archivo exacto.
- [ ] Opcional, más adelante: instalar los íconos dentro del proyecto. Carga más rápido y
      funciona sin depender de terceros.

---

## Etapa 3 · Fotos — HECHA (2026-11-16)

`/oficial` ya carga las fotos de platos solo cuando hacen falta. Falta:

- [x] `store.ts` (logo de restaurante): en tarjetas `loading="lazy"`; en la cabecera de
      `/oficial` (`logo-avatar-lg`) NO, porque es la imagen principal → `fetchpriority="high"`.
      Ambos con `decoding="async"`.
- [x] `DishCard.astro` (miniatura): ya estaba bien; solo se le pone foto en `/oficial`,
      que ya la carga diferida.
- [x] Logo de la app (`navbar.astro`, `login.astro`, `oficial.astro`): `width`/`height`
      reales (1800×542). Tamaño en pantalla igual que antes.

---

## Etapa 4 · Limpieza de código (no se nota al usar) — HECHA (2026-11-16)

> 45 vaciados (incluye 8 de `panel.astro` que el escaneo no contó), 9 ordenamientos
> (incluye 4 de `panel.astro`; los que copian un Set/Map se quedan con `[...x].sort`),
> y Enter con la función `isImeComposing()` en `store.ts`. Los 5 avisos que quedan en el
> escaneo están revisados: no aplican o son a propósito.

- [ ] 37 veces `x.innerHTML = ""` → `x.replaceChildren()` (lista completa: volver a correr
      el escaneo). Cuando justo después se agrega contenido, pasarlo directo:
      `x.replaceChildren(nuevo)`.
- [ ] 5 veces `[...lista].sort(...)` → `lista.toSorted(...)`: `amigos.astro:655`,
      `index.astro:286`, `oficial.astro:1194`, `restaurante.astro:306`, `usuario.astro:732`.
- [ ] 3 avisos de la tecla Enter (`RestaurantForm.astro:569`, `store.ts:526` y `:677`):
      agregar `if (e.isComposing) return;`. Solo afecta teclados chino/japonés; una línea cada uno.

---

## Lo que NO se hace

- **Animación de entrada de tarjetas** (`project.css:1195-1202`): la forma nueva no anda
  en todos los navegadores y habría que dejar igual las 8 reglas de respaldo. Se queda.
- **Formularios de entrada/registro:** ya tienen bien el autocompletado. Nada que cambiar.
- **Abrir ventanas sin código** (`command="show-modal"`): aquí casi todas se abren desde
  código con datos; no aporta.

---

## Al terminar cada etapa

```bash
pnpm astro check
```

```bash
pnpx modern-web-guidance@latest legacy-scan src
```

Y probar en el navegador. Los commits los hace Miguel.
