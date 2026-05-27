-- Tablas oficiales globales (no por usuario). Onboarding manual via service role.

create table if not exists public.official_restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  notes text,
  verified boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists official_restaurants_name_lower_idx
  on public.official_restaurants (lower(name));

create table if not exists public.official_dishes (
  id uuid primary key default gen_random_uuid(),
  official_restaurant_id uuid not null references public.official_restaurants(id) on delete cascade,
  type_name text,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists official_dishes_restaurant_idx
  on public.official_dishes (official_restaurant_id);

-- Link débil desde el espacio personal hacia el oficial (para agregaciones futuras)
alter table public.restaurants
  add column if not exists official_restaurant_id uuid references public.official_restaurants(id) on delete set null;

alter table public.dishes
  add column if not exists official_dish_id uuid references public.official_dishes(id) on delete set null;

-- RLS: lectura para cualquier usuario autenticado; escritura solo service role.

alter table public.official_restaurants enable row level security;
alter table public.official_dishes enable row level security;

drop policy if exists "official_restaurants_select" on public.official_restaurants;
create policy "official_restaurants_select" on public.official_restaurants
  for select to authenticated using (true);

drop policy if exists "official_dishes_select" on public.official_dishes;
create policy "official_dishes_select" on public.official_dishes
  for select to authenticated using (true);
