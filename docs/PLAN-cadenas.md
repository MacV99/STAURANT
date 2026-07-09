# Plan — Restaurantes de cadena (NO implementado)

Problema: una cadena (Frisby, McDonald's, KFC) es **1 marca con N sedes en N ciudades**.
El modelo actual `official_restaurants` es **1 fila = 1 local con 1 `city`**. No encaja
para cadenas.

> Prioridad **baja**: las cadenas son los últimos clientes que comprarían el servicio.
> Esto es solo la idea para cuando haga falta.

## Ahora (interino, cero cambios de schema)

Cada sede = su propio restaurante oficial independiente:

- `FRISBY PEREIRA CENTRO`, `FRISBY BOGOTÁ 93`, `MCDONALD'S UNICENTRO`…
- Cada uno con su `city`, su carta (`official_dishes`) y su rating global.
- Funciona con lo que ya existe. El buscador de oficiales
  ([RestaurantForm](../src/components/RestaurantForm.astro)) los encuentra por nombre.

Contras: se repite el nombre/carta por sede y el rating queda fragmentado por local.
Aceptable mientras no haya cadenas reales.

## Futuro (cuando una cadena firme) — modelo marca + sedes

Modelo correcto (igual que Google Maps: 1 marca, N locales, reseñas por local):

```sql
-- Marca / franquicia
create table public.official_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,           -- "Frisby"
  logo_url text,
  created_at timestamptz default now()
);

-- Cada official_restaurants es una SEDE que puede pertenecer a una marca
alter table public.official_restaurants
  add column brand_id uuid references public.official_brands(id);
```

Decisiones a definir en ese momento:

1. **Carta:** ¿compartida a nivel marca (una sola carta Frisby) o por sede?
   - Recomendado: carta base en la marca + posibilidad de override por sede.
2. **Rating:** ¿se agrega por sede o por marca?
   - Recomendado: rating por sede (un local malo no arrastra a toda la marca),
     con opción de mostrar promedio de marca como dato secundario.
3. **UI Explorar:** agrupar sedes bajo la marca; al abrir la marca, elegir ciudad/sede.

## Relación con el filtro por ciudad

- El filtro por ciudad de restaurantes **personales** ya está implementado
  (`restaurants.city` + chips en [index.astro](../src/pages/index.astro)).
- Con el modelo marca+sedes, filtrar por ciudad en Explorar sale gratis: cada sede
  ya tiene su `city`.
