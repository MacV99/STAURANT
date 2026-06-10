import { supabase } from "./supabase.ts";
import type { Restaurant, Dish, DishType } from "./data.ts";

// ─── Tipos ───────────────────────────────────────────────────────────────────
//
// Datos SOCIALES: pertenecen a OTROS usuarios y están protegidos por RLS, por lo
// que NO pasan por el caché local (`staurant_cache_v*`, que es solo del usuario
// actual). Todo aquí consulta Supabase de forma directa y asíncrona, igual que el
// patrón de restaurantes oficiales en `data.ts`.

export interface PublicUser {
  id: string;
  username: string | null;
  name: string;
}

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export interface FriendRequest extends PublicUser {
  friendshipId: string;
}

// ─── Mappers (réplica ligera de los de data.ts, que no se exportan) ───────────

function toPublicUser(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    username: (row.username as string | null) ?? null,
    name: (row.name as string | null) ?? "",
  };
}

function toRestaurant(row: Record<string, unknown>): Restaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as "visited" | "pending",
    notes: row.notes as string,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
    officialRestaurantId: (row.official_restaurant_id as string | null) ?? null,
  };
}

function toDish(row: Record<string, unknown>): Dish {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    typeId: (row.type_id as string | null) ?? null,
    name: row.name as string,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
    notes: row.notes as string,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
    officialDishId: (row.official_dish_id as string | null) ?? null,
  };
}

function toDishType(row: Record<string, unknown>): DishType {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

// ─── Búsqueda y perfil público ────────────────────────────────────────────────

/** Busca usuarios por username o nombre (mín. 2 caracteres), excluyendo al actual.
 *  Neutraliza wildcards SQL (% _ \) y caracteres que romperían el filtro `.or`. */
export async function searchUsers(query: string): Promise<PublicUser[]> {
  const raw = query.trim();
  if (raw.length < 2) return [];
  const me = await currentUserId();
  // Sanitizar: quitar caracteres que rompen la sintaxis de `.or` y escapar
  // los wildcards de ilike para que solo busque la subcadena literal.
  const safe = raw.replace(/[(),*]/g, " ").trim();
  if (safe.length < 2) return [];
  const escaped = safe.replace(/([\\%_])/g, "\\$1");

  let q = supabase
    .from("profiles")
    .select("id, username, name")
    .or(`username.ilike.%${escaped}%,name.ilike.%${escaped}%`)
    .limit(20);
  if (me) q = q.neq("id", me);

  const { data, error } = await q;
  if (error) { console.error("[searchUsers]", error); return []; }
  return (data ?? []).map(toPublicUser);
}

export async function getPublicProfile(userId: string): Promise<PublicUser | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) { if (error) console.error("[getPublicProfile]", error); return null; }
  return toPublicUser(data);
}

/** Restaurantes públicos (visitados) de un usuario. */
export async function getUserRestaurants(userId: string): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "visited")
    .order("created_at", { ascending: false });
  if (error) { console.error("[getUserRestaurants]", error); return []; }
  return (data ?? []).map(toRestaurant);
}

/** Todos los platos de un usuario (para promedios, conteos y la vista de detalle). */
export async function getUserDishes(userId: string): Promise<Dish[]> {
  const { data, error } = await supabase
    .from("dishes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) { console.error("[getUserDishes]", error); return []; }
  return (data ?? []).map(toDish);
}

/** Tipos de plato de un usuario (para mostrar el tag de tipo en el detalle). */
export async function getUserDishTypes(userId: string): Promise<DishType[]> {
  const { data, error } = await supabase
    .from("dish_types")
    .select("*")
    .eq("user_id", userId);
  if (error) { console.error("[getUserDishTypes]", error); return []; }
  return (data ?? []).map(toDishType);
}

/** Promedio de un restaurante calculado desde un array de platos ya cargado.
 *  Equivalente a getRestaurantAverage() de data.ts pero sin tocar el caché. */
export function restaurantAverage(dishes: Dish[], restaurantId: string): number | null {
  const rated = dishes.filter((d) => d.restaurantId === restaurantId && d.rating !== null);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, d) => acc + (d.rating as number), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

// ─── Amistad ──────────────────────────────────────────────────────────────────

async function fetchProfiles(ids: string[]): Promise<Map<string, PublicUser>> {
  const map = new Map<string, PublicUser>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, name")
    .in("id", ids);
  if (error) { console.error("[fetchProfiles]", error); return map; }
  for (const row of data ?? []) {
    const u = toPublicUser(row);
    map.set(u.id, u);
  }
  return map;
}

/** Lista de amigos aceptados (RLS limita a las amistades donde participo). */
export async function getFriends(): Promise<PublicUser[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted");
  if (error || !data) { if (error) console.error("[getFriends]", error); return []; }
  const otherIds = data.map((f) =>
    f.requester_id === me ? f.addressee_id : f.requester_id,
  );
  const profs = await fetchProfiles(otherIds);
  return otherIds
    .map((id) => profs.get(id))
    .filter((u): u is PublicUser => !!u)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Solicitudes recibidas pendientes (yo soy el destinatario). */
export async function getIncomingRequests(): Promise<FriendRequest[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id")
    .eq("status", "pending")
    .eq("addressee_id", me)
    .order("created_at", { ascending: false });
  if (error || !data) { if (error) console.error("[getIncomingRequests]", error); return []; }
  const profs = await fetchProfiles(data.map((r) => r.requester_id));
  return data.map((r) => ({
    friendshipId: r.id,
    ...(profs.get(r.requester_id) ?? { id: r.requester_id, username: null, name: "" }),
  }));
}

/** Solicitudes enviadas pendientes (yo soy el solicitante). */
export async function getOutgoingRequests(): Promise<FriendRequest[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("id, addressee_id")
    .eq("status", "pending")
    .eq("requester_id", me)
    .order("created_at", { ascending: false });
  if (error || !data) { if (error) console.error("[getOutgoingRequests]", error); return []; }
  const profs = await fetchProfiles(data.map((r) => r.addressee_id));
  return data.map((r) => ({
    friendshipId: r.id,
    ...(profs.get(r.addressee_id) ?? { id: r.addressee_id, username: null, name: "" }),
  }));
}

/** Estado de la relación con otro usuario, para decidir qué botón mostrar. */
export async function getFriendStatus(
  otherId: string,
): Promise<{ status: FriendStatus; friendshipId?: string }> {
  const me = await currentUserId();
  if (!me || me === otherId) return { status: "none" };
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`,
    );
  if (error) { console.error("[getFriendStatus]", error); return { status: "none" }; }
  const rows = data ?? [];
  if (rows.length === 0) return { status: "none" };
  // Una amistad aceptada tiene prioridad sobre cualquier pendiente.
  const accepted = rows.find((r) => r.status === "accepted");
  if (accepted) return { status: "friends", friendshipId: accepted.id };
  // Solicitud entrante (yo soy el destinatario) tiene prioridad: muestra "Aceptar".
  const incomingRow = rows.find((r) => r.addressee_id === me);
  if (incomingRow) return { status: "incoming", friendshipId: incomingRow.id };
  const outgoingRow = rows.find((r) => r.requester_id === me);
  if (outgoingRow) return { status: "outgoing", friendshipId: outgoingRow.id };
  return { status: "none" };
}

export async function sendFriendRequest(addresseeId: string): Promise<boolean> {
  const me = await currentUserId();
  if (!me || me === addresseeId) return false;
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: me, addressee_id: addresseeId });
  if (error) { console.error("[sendFriendRequest]", error); return false; }
  return true;
}

export async function acceptRequest(friendshipId: string): Promise<boolean> {
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) { console.error("[acceptRequest]", error); return false; }
  return true;
}

/** Rechazar solicitud / cancelar solicitud enviada / eliminar amigo: todas borran
 *  la fila (la policy de delete permite a cualquiera de las dos partes). */
export async function deleteFriendship(friendshipId: string): Promise<boolean> {
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) { console.error("[deleteFriendship]", error); return false; }
  return true;
}
