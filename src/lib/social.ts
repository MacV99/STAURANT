import { supabase } from "./supabase.ts";
import { toRestaurant, toDish, toDishType, roundedAverage } from "./data.ts";
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

// ─── Mappers ──────────────────────────────────────────────────────────────────
// Los mappers de filas → dominio (toRestaurant/toDish/toDishType) se reutilizan
// desde data.ts (fuente única). Aquí solo el de perfil público, propio de social.

function toPublicUser(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    username: (row.username as string | null) ?? null,
    name: (row.name as string | null) ?? "",
  };
}

// Ids que vienen de la URL y se interpolan en filtros `.or(...)`: solo UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Restaurantes OFICIALES de un usuario (los que agregó a su lista y visitó),
 *  mapeados a la MISMA forma Restaurant[]/Dish[] que los personales para que la
 *  UI del perfil los renderice indistintamente. NO clona nada: son el perfil
 *  compartido (official_restaurants/official_dishes) + las calificaciones del
 *  usuario (official_ratings). Se incluye la carta oficial COMPLETA; los platos
 *  sin calificar quedan con rating null (igual que en el perfil oficial).
 *
 *  - restaurant.id  = official_restaurant_id (officialRestaurantId también)
 *  - dish.id        = official_dish_id (officialDishId también)
 *  - dish.rating    = calificación del usuario, o null si no lo calificó */
export async function getUserOfficials(
  userId: string,
): Promise<{ restaurants: Restaurant[]; dishes: Dish[] }> {
  // Membresías visitadas del usuario (las pendientes no se muestran en público,
  // igual que los restaurantes personales pendientes).
  const { data: memRows, error: memErr } = await supabase
    .from("user_official_restaurants")
    .select("official_restaurant_id, status, created_at, updated_at")
    .eq("user_id", userId)
    .eq("status", "visited");
  if (memErr) { console.error("[getUserOfficials] memberships", memErr); return { restaurants: [], dishes: [] }; }

  const officialIds = (memRows ?? []).map((m) => m.official_restaurant_id as string);
  if (officialIds.length === 0) return { restaurants: [], dishes: [] };

  const [profRes, dishRes, ratRes] = await Promise.all([
    supabase.from("official_restaurants").select("*").in("id", officialIds),
    supabase.from("official_dishes").select("*").in("official_restaurant_id", officialIds),
    supabase.from("official_ratings").select("official_dish_id, rating").eq("user_id", userId),
  ]);
  if (profRes.error || dishRes.error || ratRes.error) {
    console.error("[getUserOfficials]", profRes.error ?? dishRes.error ?? ratRes.error);
    return { restaurants: [], dishes: [] };
  }

  const ratingByDish = new Map<string, number>();
  for (const r of (ratRes.data ?? []) as Array<{ official_dish_id: string; rating: number | string }>) {
    ratingByDish.set(r.official_dish_id, Number(r.rating));
  }
  const memByOfficial = new Map<string, Record<string, unknown>>();
  for (const m of memRows ?? []) memByOfficial.set(m.official_restaurant_id as string, m);

  const restaurants: Restaurant[] = (profRes.data ?? []).map((o) => {
    const m = memByOfficial.get(o.id as string);
    const created = (m?.created_at as string) ?? new Date().toISOString();
    return {
      id: o.id as string,
      name: o.name as string,
      status: "visited",
      notes: (o.notes as string | null) ?? "",
      cities: (Array.isArray(o.cities) && (o.cities as string[]).length
        ? (o.cities as string[])
        : o.city
          ? [o.city as string]
          : []
      ).map((c) => c.trim().toUpperCase()),
      address: (o.address as string | null) ?? null,
      createdAt: created,
      updatedAt: (m?.updated_at as string | null) ?? created,
      officialRestaurantId: o.id as string,
    };
  });

  const dishes: Dish[] = (dishRes.data ?? []).map((od) => {
    const rating = ratingByDish.get(od.id as string);
    return {
      id: od.id as string,
      restaurantId: od.official_restaurant_id as string,
      typeId: null,
      name: od.name as string,
      rating: rating === undefined ? null : rating,
      notes: (od.notes as string | null) ?? "",
      createdAt: (od.created_at as string) ?? new Date().toISOString(),
      updatedAt: (od.created_at as string) ?? new Date().toISOString(),
      officialDishId: od.id as string,
    };
  });

  return { restaurants, dishes };
}

/** Promedio de un restaurante calculado desde un array de platos ya cargado.
 *  Equivalente a getRestaurantAverage() de data.ts pero sin tocar el caché. */
export function restaurantAverage(dishes: Dish[], restaurantId: string): number | null {
  return roundedAverage(
    dishes
      .filter((d) => d.restaurantId === restaurantId && d.rating !== null)
      .map((d) => d.rating as number),
  );
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
  if (!me || me === otherId || !UUID_RE.test(otherId)) return { status: "none" };
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

// ─── Recomendaciones (chat sin texto: solo platos / restaurantes) ─────────────
//
// La tabla guarda SOLO qué se recomienda (tipo + id), nunca texto: nombre, nota
// y enlace se resuelven al leer. La RLS garantiza que solo se envía a amigos y
// que los restaurantes/platos personales sean de quien recomienda.

export type RecTargetType =
  | "restaurant"
  | "dish"
  | "official_restaurant"
  | "official_dish";

export interface Recommendation {
  id: string;
  senderId: string;
  recipientId: string;
  targetType: RecTargetType;
  targetId: string;
  createdAt: string;
  seenAt: string | null;
  /** Nombre del restaurante o plato. null = ya no existe (lo borraron). */
  title: string | null;
  /** Para platos: restaurante al que pertenece. */
  subtitle: string | null;
  /** Nota de quien recomienda (plato) o su promedio (restaurante). */
  rating: number | null;
  /** A dónde lleva tocar la recomendación. null si ya no existe. */
  href: string | null;
  isOfficial: boolean;
}

type RecRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  target_type: RecTargetType;
  target_id: string;
  created_at: string;
  seen_at: string | null;
};

const REC_COLUMNS = "id, sender_id, recipient_id, target_type, target_id, created_at, seen_at";

/** Envía una recomendación a un amigo. false si la base la rechaza. */
export async function sendRecommendation(
  recipientId: string,
  targetType: RecTargetType,
  targetId: string,
): Promise<boolean> {
  const me = await currentUserId();
  if (!me || me === recipientId) return false;
  const { error } = await supabase.from("recommendations").insert({
    sender_id: me,
    recipient_id: recipientId,
    target_type: targetType,
    target_id: targetId,
  });
  if (error) { console.error("[sendRecommendation]", error); return false; }
  return true;
}

/** Conversación con un amigo (enviadas + recibidas), de la más vieja a la más nueva. */
export async function getRecommendationThread(friendId: string): Promise<Recommendation[]> {
  const me = await currentUserId();
  if (!me || !UUID_RE.test(friendId)) return [];
  const { data, error } = await supabase
    .from("recommendations")
    .select(REC_COLUMNS)
    .or(
      `and(sender_id.eq.${me},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${me})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { console.error("[getRecommendationThread]", error); return []; }
  return resolveRecommendations(me, (data ?? []) as RecRow[]);
}

/** Marca como vistas las recomendaciones que me envió este amigo. */
export async function markRecommendationsSeen(friendId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) return;
  const { error } = await supabase
    .from("recommendations")
    .update({ seen_at: new Date().toISOString() })
    .eq("recipient_id", me)
    .eq("sender_id", friendId)
    .is("seen_at", null);
  if (error) console.error("[markRecommendationsSeen]", error);
}

/** Recomendaciones sin ver, agrupadas por quien las envió (id → cantidad). */
export async function getUnreadRecommendationCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const me = await currentUserId();
  if (!me) return counts;
  const { data, error } = await supabase
    .from("recommendations")
    .select("sender_id")
    .eq("recipient_id", me)
    .is("seen_at", null);
  if (error) { console.error("[getUnreadRecommendationCounts]", error); return counts; }
  for (const row of data ?? []) {
    const id = row.sender_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Pendientes en "Amigos" para el globito del menú: recomendaciones sin ver +
 *  solicitudes de amistad recibidas. */
export async function getFriendsBadgeCount(): Promise<number> {
  const me = await currentUserId();
  if (!me) return 0;
  const [recRes, reqRes] = await Promise.all([
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", me)
      .is("seen_at", null),
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("addressee_id", me)
      .eq("status", "pending"),
  ]);
  return (recRes.count ?? 0) + (reqRes.count ?? 0);
}

/** Completa cada fila con nombre, nota de quien recomienda y enlace. Pocas
 *  consultas agrupadas por tipo (no una por recomendación). */
async function resolveRecommendations(me: string, rows: RecRow[]): Promise<Recommendation[]> {
  if (rows.length === 0) return [];
  const idsOf = (t: RecTargetType) => [
    ...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id)),
  ];
  const restIds = idsOf("restaurant");
  const dishIds = idsOf("dish");
  const offRestIds = idsOf("official_restaurant");
  const offDishIds = idsOf("official_dish");
  const people = [...new Set(rows.flatMap((r) => [r.sender_id, r.recipient_id]))];

  type Row = Record<string, unknown>;
  const none = Promise.resolve({ data: [] as Row[] });

  const [restRes, dishRes, offDishRes] = await Promise.all([
    restIds.length
      ? supabase.from("restaurants").select("id, name, user_id").in("id", restIds)
      : none,
    dishIds.length
      ? supabase.from("dishes").select("id, name, rating, restaurant_id, user_id").in("id", dishIds)
      : none,
    offDishIds.length
      ? supabase.from("official_dishes").select("id, name, official_restaurant_id").in("id", offDishIds)
      : none,
  ]);
  const rests = (restRes.data ?? []) as Row[];
  const dishRows = (dishRes.data ?? []) as Row[];
  const offDishes = (offDishRes.data ?? []) as Row[];

  const dishRestIds = [...new Set(dishRows.map((d) => d.restaurant_id as string))];
  const allOffRestIds = [
    ...new Set([...offRestIds, ...offDishes.map((d) => d.official_restaurant_id as string)]),
  ];

  const [dishRestRes, restDishesRes, offRestRes, offRestDishesRes, offRatingsRes] =
    await Promise.all([
      dishRestIds.length
        ? supabase.from("restaurants").select("id, name").in("id", dishRestIds)
        : none,
      // Platos de los restaurantes recomendados → promedio de quien recomienda.
      restIds.length
        ? supabase.from("dishes").select("restaurant_id, rating").in("restaurant_id", restIds)
        : none,
      allOffRestIds.length
        ? supabase.from("official_restaurants").select("id, name").in("id", allOffRestIds)
        : none,
      offRestIds.length
        ? supabase
            .from("official_dishes")
            .select("id, official_restaurant_id")
            .in("official_restaurant_id", offRestIds)
        : none,
      offDishIds.length || offRestIds.length
        ? supabase
            .from("official_ratings")
            .select("official_dish_id, user_id, rating")
            .in("user_id", people)
        : none,
    ]);

  const restById = new Map(rests.map((r) => [r.id as string, r]));
  const dishById = new Map(dishRows.map((d) => [d.id as string, d]));
  const offDishById = new Map(offDishes.map((d) => [d.id as string, d]));
  const nameById = new Map<string, string>();
  for (const r of [
    ...((dishRestRes.data ?? []) as Row[]),
    ...((offRestRes.data ?? []) as Row[]),
  ])
    nameById.set(r.id as string, r.name as string);

  const ratingsByRest = new Map<string, number[]>();
  for (const d of (restDishesRes.data ?? []) as Row[]) {
    if (d.rating === null || d.rating === undefined) continue;
    const list = ratingsByRest.get(d.restaurant_id as string) ?? [];
    list.push(Number(d.rating));
    ratingsByRest.set(d.restaurant_id as string, list);
  }
  const offRestOfDish = new Map<string, string>();
  for (const d of (offRestDishesRes.data ?? []) as Row[])
    offRestOfDish.set(d.id as string, d.official_restaurant_id as string);
  const offRating = new Map<string, number>(); // `${userId}:${dishId}` → nota
  for (const r of (offRatingsRes.data ?? []) as Row[])
    offRating.set(`${r.user_id as string}:${r.official_dish_id as string}`, Number(r.rating));

  // Restaurante personal: el mío → mi página; el de un amigo → su perfil.
  const personalHref = (ownerId: string, restaurantId: string) =>
    ownerId === me
      ? `/restaurante?id=${restaurantId}`
      : `/usuario?id=${ownerId}&r=${restaurantId}`;

  return rows.map((row): Recommendation => {
    const base = {
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      targetType: row.target_type,
      targetId: row.target_id,
      createdAt: row.created_at,
      seenAt: row.seen_at,
    };
    const gone: Recommendation = {
      ...base,
      title: null,
      subtitle: null,
      rating: null,
      href: null,
      isOfficial: row.target_type.startsWith("official"),
    };

    switch (row.target_type) {
      case "restaurant": {
        const r = restById.get(row.target_id);
        if (!r) return gone;
        return {
          ...base,
          title: r.name as string,
          subtitle: null,
          rating: roundedAverage(ratingsByRest.get(row.target_id) ?? []),
          href: personalHref(r.user_id as string, row.target_id),
          isOfficial: false,
        };
      }
      case "dish": {
        const d = dishById.get(row.target_id);
        if (!d) return gone;
        return {
          ...base,
          title: d.name as string,
          subtitle: nameById.get(d.restaurant_id as string) ?? null,
          rating: d.rating === null || d.rating === undefined ? null : Number(d.rating),
          href: personalHref(d.user_id as string, d.restaurant_id as string),
          isOfficial: false,
        };
      }
      case "official_restaurant": {
        const name = nameById.get(row.target_id);
        if (!name) return gone;
        const mine: number[] = [];
        for (const [dishId, restId] of offRestOfDish) {
          if (restId !== row.target_id) continue;
          const v = offRating.get(`${row.sender_id}:${dishId}`);
          if (v !== undefined) mine.push(v);
        }
        return {
          ...base,
          title: name,
          subtitle: null,
          rating: roundedAverage(mine),
          href: `/oficial?id=${row.target_id}`,
          isOfficial: true,
        };
      }
      case "official_dish": {
        const d = offDishById.get(row.target_id);
        if (!d) return gone;
        const restId = d.official_restaurant_id as string;
        return {
          ...base,
          title: d.name as string,
          subtitle: nameById.get(restId) ?? null,
          rating: offRating.get(`${row.sender_id}:${row.target_id}`) ?? null,
          href: `/oficial?id=${restId}&plato=${row.target_id}`,
          isOfficial: true,
        };
      }
      default:
        return gone;
    }
  });
}
