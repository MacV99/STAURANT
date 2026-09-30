-- ============================================================================
-- 1) Amistades: cerrar dos trucos
--    · Insertar una amistad ya "accepted" (sin que la otra persona acepte).
--    · Que quien recibe una solicitud reescriba requester_id / addressee_id y
--      quede "amigo" de un tercero sin su permiso.
--    Solo se puede crear en 'pending' y solo se pueden actualizar status/updated_at.
-- ============================================================================

drop policy if exists "friendships insert" on public.friendships;
create policy "friendships insert" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists "friendships update" on public.friendships;
create policy "friendships update" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

revoke update on public.friendships from anon, authenticated;
grant update (status, updated_at) on public.friendships to authenticated;

-- ¿a y b son amigos (amistad aceptada)? SECURITY INVOKER: la RLS de friendships
-- ya deja ver las filas propias, que es justo el caso (a = auth.uid()).
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ============================================================================
-- 2) Recomendaciones entre amigos ("chat" sin texto: solo platos/restaurantes)
--    No se guarda texto libre: solo QUÉ se recomienda (tipo + id). El nombre,
--    la nota y el enlace se resuelven al leer, así nadie puede "escribir".
-- ============================================================================

create table if not exists public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  target_type  text not null check (target_type in ('restaurant', 'dish', 'official_restaurant', 'official_dish')),
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,
  constraint recommendations_not_self check (sender_id <> recipient_id)
);

create index if not exists recommendations_recipient_idx
  on public.recommendations (recipient_id, created_at desc);
create index if not exists recommendations_sender_idx
  on public.recommendations (sender_id, created_at desc);

alter table public.recommendations enable row level security;

-- Solo las dos personas de la conversación la ven.
create policy "recommendations select" on public.recommendations
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Enviar: a un amigo, y algo que existe. Restaurantes/platos personales: solo
-- los propios (recomiendas lo que tú probaste). Genéricos (Coca-Cola…) no.
create policy "recommendations insert" on public.recommendations
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and seen_at is null
    and public.are_friends(sender_id, recipient_id)
    and case target_type
      when 'restaurant' then exists (
        select 1 from public.restaurants r
        where r.id = target_id and r.user_id = sender_id)
      when 'dish' then exists (
        select 1 from public.dishes d
        where d.id = target_id and d.user_id = sender_id)
      when 'official_restaurant' then exists (
        select 1 from public.official_restaurants o where o.id = target_id)
      when 'official_dish' then exists (
        select 1 from public.official_dishes o
        where o.id = target_id and not o.is_generic)
      else false
    end
  );

-- Quien recibe solo puede marcar como vista (columna seen_at).
create policy "recommendations mark seen" on public.recommendations
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

revoke all on public.recommendations from anon;
revoke update on public.recommendations from authenticated;
grant select, insert on public.recommendations to authenticated;
grant update (seen_at) on public.recommendations to authenticated;
