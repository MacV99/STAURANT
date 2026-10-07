-- Enlace de mapa opcional del oficial: si existe, la dirección abre este
-- enlace (pin exacto) en vez de buscar el texto de la dirección.
alter table public.official_restaurants add column if not exists maps_url text;
