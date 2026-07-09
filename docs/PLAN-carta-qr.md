# Plan — Carta pública por QR (NO implementado aún)

Idea: un comensal escanea un QR en la mesa → abre la **carta del restaurante oficial**
sin necesidad de cuenta. Puede ver los platos (foto, precio, descripción). Si quiere
**calificar** un plato, se le pide crear cuenta o iniciar sesión.

> Estado: **solo diseño**. No arrancar hasta tener restaurantes reales.
> Base ya lista: `official_dishes` tiene `price` e `image_url`; `notes` = descripción.

## 1. Ruta pública

- Nueva página `src/pages/carta.astro`, URL `=/carta?r=<officialRestaurantId>`.
- **Read-only y sin sesión.** No llama a `initCache()` (eso exige `session.user.id`).
- Reutiliza el estilo de tarjeta de [oficial.astro](../src/pages/oficial.astro)
  (`.oficial-dish`, `.od-price`, `.od-thumb`, `.od-notes`).
- Agrupar platos por `type_name` → secciones de carta (Entradas, Platos, Bebidas…).

## 2. RLS en Supabase (lo crítico)

Hoy `official_restaurants` y `official_dishes` tienen RLS y se leen **autenticado**.
Para el QR público hace falta permitir lectura anónima (rol `anon`):

```sql
-- Lectura pública de la carta oficial
create policy "anon read official_restaurants"
  on public.official_restaurants for select
  to anon using (true);

create policy "anon read official_dishes"
  on public.official_dishes for select
  to anon using (true);
```

- Solo `SELECT`. Nunca `insert/update/delete` para `anon`.
- Las tablas personales (`restaurants`, `dishes`, `profiles`, `friendships`) **NO**
  se tocan: siguen privadas por usuario.
- El rating global (stats) que hoy carga `initCache` habría que traerlo aparte con
  el cliente anónimo (requiere `SELECT` anon en la fuente de stats). Opcional en v1:
  la carta pública puede ir **sin** el promedio global.

## 3. Flujo "Calificar" → login

- Botón `Calificar` en cada plato.
- Sin sesión → `navigate("/login?returnTo=" + encodeURIComponent(location.href))`.
- [login.astro](../src/pages/login.astro) debe respetar `returnTo` tras autenticar
  (hoy redirige fijo a `/`). Único cambio en auth.
- Tras iniciar sesión y volver: adoptar el restaurante oficial con el
  `adoptOfficialRestaurant()` que **ya existe**, y abrir la calificación del plato.

## 4. QR

- Un QR por restaurante oficial, apuntando a `https://<dominio>/carta?r=<id>`.
- Generación puntual (no en runtime de la app): cualquier generador de QR sirve.

## Orden sugerido de implementación

1. Policies RLS `anon SELECT` (paso 2).
2. `carta.astro` read-only (paso 1).
3. `returnTo` en `login.astro` + botón Calificar (paso 3).
4. Generar QRs (paso 4).

## Dependencias ya resueltas

- [x] `official_dishes.price`, `official_dishes.image_url` (migración `official_dishes_add_price_image`).
- [x] Render de precio/foto/descripción en la carta oficial autenticada (`oficial.astro`).
- [x] `adoptOfficialRestaurant()` para convertir oficial → lista personal.
