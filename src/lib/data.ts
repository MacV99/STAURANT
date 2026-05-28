import { supabase } from "./supabase.ts";

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Restaurant {
  id: string;
  name: string;
  status: "visited" | "pending";
  notes: string;
  createdAt: string;
  updatedAt: string;
  officialRestaurantId: string | null;
}

export interface Dish {
  id: string;
  restaurantId: string;
  typeId: string | null;
  name: string;
  rating: number | null; // 1–10, soporta decimales (ej: 7.5); null = sin calificar
  notes: string;
  createdAt: string;
  updatedAt: string;
  officialDishId: string | null;
}

export interface OfficialRestaurant {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  notes: string | null;
}

export interface OfficialDish {
  id: string;
  officialRestaurantId: string;
  typeName: string | null;
  name: string;
  notes: string | null;
}

export interface OfficialStat {
  avgRating: number;
  ratingsCount: number;
}

export interface DishType {
  id: string;
  name: string;
  createdAt: string;
}

// ─── Cache local ───────────────────────────────────────────────────────────────

interface AppCache {
  userId: string;
  restaurants: Restaurant[];
  dishes: Dish[];
  dishTypes: DishType[];
}

const CACHE_KEY = "staurant_cache_v4";
const STATS_CACHE_KEY = "staurant_official_stats_v1";
let _userId: string | null = null;

// Cache de stats globales (compartido entre usuarios, sin user_id)
interface OfficialStatsCache {
  dishes: Record<string, OfficialStat>;
  restaurants: Record<string, OfficialStat>;
}
let _statsMem: OfficialStatsCache = { dishes: {}, restaurants: {} };

function loadStatsFromLocalStorage(): void {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (raw) _statsMem = JSON.parse(raw) as OfficialStatsCache;
  } catch {
    /* ignore */
  }
}
// Caché en memoria: evita JSON.parse de localStorage en cada lectura.
// Se sincroniza con localStorage solo en escritura y en el primer initCache.
let _mem: AppCache | null = null;

function readLocalStorage(): AppCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppCache) : null;
  } catch {
    return null;
  }
}

function writeCache(c: AppCache): void {
  _mem = c;
  localStorage.setItem(CACHE_KEY, JSON.stringify(c));
}

function getCache(): AppCache {
  // 1. Memoria → lectura directa sin JSON.parse (ruta habitual)
  if (_mem && _mem.userId === _userId) return _mem;
  // 2. Primer acceso en esta pestaña → hidratar desde localStorage
  const persisted = readLocalStorage();
  if (persisted && persisted.userId === _userId) { _mem = persisted; return _mem; }
  // 3. Sin datos válidos → vacío
  return { userId: _userId!, restaurants: [], dishes: [], dishTypes: [] };
}

async function fetchFromSupabase(): Promise<AppCache> {
  const [rRes, dRes, dtRes] = await Promise.all([
    supabase.from("restaurants").select("*").eq("user_id", _userId).order("created_at", { ascending: false }),
    supabase.from("dishes").select("*").eq("user_id", _userId).order("created_at", { ascending: false }),
    supabase.from("dish_types").select("*").eq("user_id", _userId).order("name", { ascending: true }),
  ]);
  return {
    userId: _userId!,
    restaurants: (rRes.data ?? []).map(toRestaurant),
    dishes: (dRes.data ?? []).map(toDish),
    dishTypes: (dtRes.data ?? []).map(toDishType),
  };
}

const MIGRATION_KEY = "staurant_migrated_v1";

async function refreshCacheInBackground(): Promise<void> {
  const local = getCache();
  const remote = await fetchFromSupabase();

  // Migración única: subir a Supabase lo que está en local pero no llegó.
  // Solo corre una vez por dispositivo; después de eso las eliminaciones
  // en otros dispositivos no se revivirían accidentalmente.
  if (!localStorage.getItem(MIGRATION_KEY)) {
    const remoteTypeIds = new Set(remote.dishTypes.map((dt) => dt.id));
    const remoteDishIds = new Set(remote.dishes.map((d) => d.id));

    const remoteTypeNames = new Set(remote.dishTypes.map((dt) => dt.name));
    const missingTypes = local.dishTypes.filter(
      (dt) => !remoteTypeIds.has(dt.id) && !remoteTypeNames.has(dt.name),
    );
    const missingDishes = local.dishes.filter((d) => !remoteDishIds.has(d.id));

    if (missingTypes.length > 0) {
      await supabase.from("dish_types").upsert(
        missingTypes.map((dt) => ({
          id: dt.id, user_id: _userId,
          name: dt.name, created_at: dt.createdAt,
        }))
      );
      remote.dishTypes.push(...missingTypes);
    }

    if (missingDishes.length > 0) {
      await supabase.from("dishes").upsert(
        missingDishes.map((d) => ({
          id: d.id, user_id: _userId,
          restaurant_id: d.restaurantId, type_id: d.typeId,
          name: d.name, rating: d.rating,
          notes: d.notes, created_at: d.createdAt,
        }))
      );
      remote.dishes.push(...missingDishes);
    }

    localStorage.setItem(MIGRATION_KEY, "1");
  }

  if (JSON.stringify(local) !== JSON.stringify(remote)) {
    writeCache(remote);
    document.dispatchEvent(new CustomEvent("cache:synced"));
  }

  // Sincronizar carta de oficiales después de tener el estado fresco
  await syncOfficialMenus();
  // Refrescar stats globales (cambian cuando otros users califican)
  bgSync(fetchOfficialStats);
}

/** Llama esto al inicio de cada página protegida, pasando el userId de la sesión.
 *  - Si hay caché válido (memoria o localStorage) → instantáneo, sin red.
 *  - Siempre lanza un refresh en background para sincronizar cambios de otros dispositivos. */
export async function initCache(userId: string): Promise<void> {
  _userId = userId;
  loadStatsFromLocalStorage();
  bgSync(fetchOfficialStats);

  // Si ya tenemos datos en memoria para este usuario → fast path, refresh en background.
  if (_mem?.userId === _userId) {
    bgSync(refreshCacheInBackground);
    return;
  }

  // Intentar hidratar desde localStorage antes de ir a la red.
  const persisted = readLocalStorage();
  if (persisted?.userId === _userId) {
    _mem = persisted;
    bgSync(refreshCacheInBackground);
    return;
  }

  // Primera vez: cargar desde Supabase de forma bloqueante.
  const fresh = await fetchFromSupabase();
  writeCache(fresh);

  // Tipos por defecto para usuarios nuevos (sin tipos todavía)
  if (fresh.dishTypes.length === 0) {
    ["HAMBURGUESA", "PERRO CALIENTE", "PIZZA"].forEach(name => createDishType(name));
  }

  // Pull de la carta oficial en background tras la carga inicial
  bgSync(syncOfficialMenus);
}

/** Borra el caché local (llamar en logout). */
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
  _userId = null;
  _mem = null;
}

/** true si initCache() ya fue llamado en esta sesión de módulo.
 *  Útil en astro:after-swap para saber si podemos leer datos del caché. */
export function isCacheLoaded(): boolean {
  return _userId !== null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/** Dispara una operación Supabase en segundo plano sin bloquear la UI. */
function bgSync(fn: () => unknown): void {
  Promise.resolve(fn()).catch((err) => console.error("[staurant sync]", err));
}

// ─── Restaurants (síncronos — leen del caché) ──────────────────────────────────

export function getRestaurants(): Restaurant[] {
  return getCache().restaurants;
}

export function getDishes(): Dish[] {
  return getCache().dishes;
}

export function createRestaurant(
  input: Pick<Restaurant, "name" | "notes"> & { officialRestaurantId?: string | null },
): Restaurant {
  const now = new Date().toISOString();
  const r: Restaurant = {
    id: crypto.randomUUID(),
    name: input.name,
    notes: input.notes,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    officialRestaurantId: input.officialRestaurantId ?? null,
  };
  const cache = getCache();
  cache.restaurants.unshift(r);
  writeCache(cache);

  bgSync(() =>
    supabase.from("restaurants").insert({
      id: r.id, user_id: _userId,
      name: r.name, notes: r.notes,
      status: r.status, created_at: r.createdAt, updated_at: r.updatedAt,
      official_restaurant_id: r.officialRestaurantId,
    })
  );
  return r;
}

export function updateRestaurant(
  id: string,
  input: Partial<Pick<Restaurant, "name" | "notes" | "status">>
): Restaurant | null {
  const cache = getCache();
  const idx = cache.restaurants.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updatedAt = new Date().toISOString();
  cache.restaurants[idx] = { ...cache.restaurants[idx], ...input, updatedAt };
  writeCache(cache);

  const patch: Record<string, unknown> = { updated_at: updatedAt };
  if (input.name !== undefined) patch.name = input.name;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) patch.status = input.status;
  bgSync(() => supabase.from("restaurants").update(patch).eq("id", id));

  return cache.restaurants[idx];
}

export function deleteRestaurant(id: string): void {
  const cache = getCache();
  cache.restaurants = cache.restaurants.filter((r) => r.id !== id);
  cache.dishes = cache.dishes.filter((d) => d.restaurantId !== id);
  writeCache(cache);
  bgSync(() => supabase.from("restaurants").delete().eq("id", id));
}

export function markAsVisited(id: string): Restaurant | null {
  return updateRestaurant(id, { status: "visited" });
}

export function markAsPending(id: string): Restaurant | null {
  return updateRestaurant(id, { status: "pending" });
}

// ─── Dishes (síncronos — leen del caché) ──────────────────────────────────────

export function getDishesByRestaurant(restaurantId: string): Dish[] {
  return getCache().dishes.filter((d) => d.restaurantId === restaurantId);
}

/** Actualiza updatedAt del restaurante en caché y Supabase (sin emitir eventos). */
function bumpRestaurantUpdatedAt(restaurantId: string, updatedAt: string): void {
  const cache = getCache();
  const idx = cache.restaurants.findIndex((r) => r.id === restaurantId);
  if (idx === -1) return;
  cache.restaurants[idx] = { ...cache.restaurants[idx], updatedAt };
  writeCache(cache);
  bgSync(() =>
    supabase.from("restaurants").update({ updated_at: updatedAt }).eq("id", restaurantId)
  );
}

export function createDish(
  input: Pick<Dish, "restaurantId" | "typeId" | "name" | "rating" | "notes"> & {
    officialDishId?: string | null;
  },
  options?: { skipBump?: boolean },
): Dish {
  const now = new Date().toISOString();
  const d: Dish = {
    id: crypto.randomUUID(),
    restaurantId: input.restaurantId,
    typeId: input.typeId,
    name: input.name,
    rating: input.rating,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    officialDishId: input.officialDishId ?? null,
  };
  const cache = getCache();
  cache.dishes.unshift(d);
  writeCache(cache);

  bgSync(() =>
    supabase.from("dishes").insert({
      id: d.id, user_id: _userId,
      restaurant_id: d.restaurantId,
      type_id: d.typeId,
      name: d.name, rating: d.rating,
      notes: d.notes, created_at: d.createdAt, updated_at: d.updatedAt,
      official_dish_id: d.officialDishId,
    })
  );
  // skipBump evita que la sincronización automática de cartas oficiales
  // emita N UPDATEs y altere updated_at del restaurante sin acción del usuario.
  if (!options?.skipBump) bumpRestaurantUpdatedAt(d.restaurantId, now);
  return d;
}

export function updateDish(
  id: string,
  input: Partial<Pick<Dish, "typeId" | "name" | "rating" | "notes">>
): Dish | null {
  const cache = getCache();
  const idx = cache.dishes.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updatedAt = new Date().toISOString();
  cache.dishes[idx] = { ...cache.dishes[idx], ...input, updatedAt };
  writeCache(cache);

  const patch: Record<string, unknown> = { updated_at: updatedAt };
  if (input.typeId !== undefined) patch.type_id = input.typeId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.rating !== undefined) patch.rating = input.rating;
  if (input.notes !== undefined) patch.notes = input.notes;
  bgSync(() => supabase.from("dishes").update(patch).eq("id", id));

  bumpRestaurantUpdatedAt(cache.dishes[idx].restaurantId, updatedAt);
  return cache.dishes[idx];
}

export function deleteDish(id: string): void {
  const cache = getCache();
  const dish = cache.dishes.find((d) => d.id === id);
  cache.dishes = cache.dishes.filter((d) => d.id !== id);
  writeCache(cache);
  bgSync(() => supabase.from("dishes").delete().eq("id", id));
  if (dish) bumpRestaurantUpdatedAt(dish.restaurantId, new Date().toISOString());
}

// ─── DishTypes (síncronos — leen del caché) ───────────────────────────────────

export function getDishTypes(): DishType[] {
  const types = getCache().dishTypes ?? [];
  const seen = new Set<string>();
  return types.filter((t) => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });
}

export function createDishType(name: string): DishType {
  const dt: DishType = {
    id: crypto.randomUUID(),
    name: name.trim().toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  const cache = getCache();
  // Insertar en orden alfabético para mantener el mismo invariante que Supabase
  const idx = cache.dishTypes.findIndex(t => t.name.localeCompare(dt.name) > 0);
  if (idx === -1) cache.dishTypes.push(dt);
  else cache.dishTypes.splice(idx, 0, dt);
  writeCache(cache);

  bgSync(() =>
    supabase.from("dish_types").insert({
      id: dt.id, user_id: _userId,
      name: dt.name, created_at: dt.createdAt,
    })
  );
  return dt;
}

export function deleteDishType(id: string): void {
  const cache = getCache();
  cache.dishTypes = cache.dishTypes.filter(t => t.id !== id);
  // Nullificar typeId en platos que usaban este tipo (consistencia local)
  cache.dishes = cache.dishes.map(d => d.typeId === id ? { ...d, typeId: null } : d);
  writeCache(cache);
  bgSync(() => supabase.from("dish_types").delete().eq("id", id));
}

// ─── Derived (síncronos) ───────────────────────────────────────────────────────

export function getRestaurantAverage(restaurantId: string): number | null {
  const rated = getDishesByRestaurant(restaurantId).filter((d) => d.rating !== null);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, d) => acc + d.rating!, 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

export function hasUnratedDishes(restaurantId: string): boolean {
  return getDishesByRestaurant(restaurantId).some((d) => d.rating === null);
}

// ─── Official (global) ────────────────────────────────────────────────────────

function toOfficialRestaurant(row: Record<string, unknown>): OfficialRestaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

function toOfficialDish(row: Record<string, unknown>): OfficialDish {
  return {
    id: row.id as string,
    officialRestaurantId: row.official_restaurant_id as string,
    typeName: (row.type_name as string | null) ?? null,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
  };
}

/** Búsqueda async (no cacheada) en la tabla global de restaurantes oficiales.
 *  Los wildcards SQL del usuario (%, _) y el escape \\ se neutralizan para que
 *  el patrón ilike solo busque la subcadena literal. */
export async function searchOfficialRestaurants(query: string): Promise<OfficialRestaurant[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const escaped = q.replace(/([\\%_])/g, "\\$1");
  const { data, error } = await supabase
    .from("official_restaurants")
    .select("*")
    .ilike("name", `%${escaped}%`)
    .order("name", { ascending: true })
    .limit(8);
  if (error) { console.error("[searchOfficialRestaurants]", error); return []; }
  return (data ?? []).map(toOfficialRestaurant);
}

/** Crea un Restaurant personal a partir de un oficial, clonando todos sus platos
 *  como dishes sin calificar en el espacio del usuario.
 *
 *  La persistencia en Supabase es ATÓMICA y AWAITED:
 *  - se inserta el restaurante primero (respetando FK)
 *  - luego todos los dishes en un solo batch insert
 *  - si algo falla se hace rollback del cache local
 *
 *  Esto evita que un refresh en segundo plano sobreescriba la adopción antes
 *  de que se persista (race contra refreshCacheInBackground). */
export async function adoptOfficialRestaurant(officialId: string): Promise<Restaurant | null> {
  const [officialRes, dishesRes] = await Promise.all([
    supabase.from("official_restaurants").select("*").eq("id", officialId).single(),
    supabase.from("official_dishes").select("*").eq("official_restaurant_id", officialId),
  ]);
  if (officialRes.error || !officialRes.data) {
    console.error("[adoptOfficialRestaurant] official fetch failed", officialRes.error);
    return null;
  }
  if (dishesRes.error) {
    console.error("[adoptOfficialRestaurant] dishes fetch failed", dishesRes.error);
    return null;
  }
  const official = toOfficialRestaurant(officialRes.data);
  const officialDishes = (dishesRes.data ?? []).map(toOfficialDish);

  // Mapeo de typeName → DishType personal (creando si no existe).
  // createDishType escribe al cache + bgSync, ok que sea fire-and-forget para tipos.
  const typeCache = new Map<string, string | null>();
  function resolveType(typeName: string | null): string | null {
    if (!typeName) return null;
    const upper = typeName.trim().toUpperCase();
    if (!upper) return null;
    if (typeCache.has(upper)) return typeCache.get(upper)!;
    const existing = getDishTypes().find((t) => t.name === upper);
    const id = existing ? existing.id : createDishType(upper).id;
    typeCache.set(upper, id);
    return id;
  }

  // Construir restaurante + dishes en memoria
  const now = new Date().toISOString();
  const restaurant: Restaurant = {
    id: crypto.randomUUID(),
    name: official.name,
    notes: official.notes ?? "",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    officialRestaurantId: official.id,
  };
  const dishes: Dish[] = officialDishes.map((od) => ({
    id: crypto.randomUUID(),
    restaurantId: restaurant.id,
    typeId: resolveType(od.typeName),
    name: od.name,
    rating: null,
    notes: od.notes ?? "",
    createdAt: now,
    updatedAt: now,
    officialDishId: od.id,
  }));

  // Aplicar al cache local (optimistic)
  const cache = getCache();
  cache.restaurants.unshift(restaurant);
  cache.dishes.unshift(...dishes);
  writeCache(cache);

  // Persistir en Supabase: restaurante PRIMERO (FK), luego dishes en batch.
  try {
    const rRes = await supabase.from("restaurants").insert({
      id: restaurant.id, user_id: _userId,
      name: restaurant.name, notes: restaurant.notes,
      status: restaurant.status,
      created_at: restaurant.createdAt, updated_at: restaurant.updatedAt,
      official_restaurant_id: restaurant.officialRestaurantId,
    });
    if (rRes.error) throw rRes.error;

    if (dishes.length > 0) {
      const dRes = await supabase.from("dishes").insert(
        dishes.map((d) => ({
          id: d.id, user_id: _userId,
          restaurant_id: d.restaurantId, type_id: d.typeId,
          name: d.name, rating: d.rating, notes: d.notes,
          created_at: d.createdAt, updated_at: d.updatedAt,
          official_dish_id: d.officialDishId,
        })),
      );
      if (dRes.error) throw dRes.error;
    }
  } catch (err) {
    console.error("[adoptOfficialRestaurant] persist error — rolling back local cache", err);
    const cur = getCache();
    cur.restaurants = cur.restaurants.filter((r) => r.id !== restaurant.id);
    cur.dishes = cur.dishes.filter((d) => d.restaurantId !== restaurant.id);
    writeCache(cur);
    return null;
  }

  return restaurant;
}

/** Para cada restaurante personal vinculado a uno oficial, agrega los platos
 *  que existan en la carta oficial pero no en la copia local del usuario.
 *  Solo AÑADE — nunca borra ni renombra para no destruir calificaciones.
 *  Dispara "cache:synced" si se crearon platos. */
export async function syncOfficialMenus(): Promise<void> {
  const cache = getCache();
  const linked = cache.restaurants.filter((r) => r.officialRestaurantId);
  if (linked.length === 0) return;

  const officialIds = [...new Set(linked.map((r) => r.officialRestaurantId!))];
  const { data, error } = await supabase
    .from("official_dishes")
    .select("*")
    .in("official_restaurant_id", officialIds);
  if (error || !data) { console.error("[syncOfficialMenus]", error); return; }

  const officialDishes = data.map(toOfficialDish);
  const byOfficial = new Map<string, OfficialDish[]>();
  for (const od of officialDishes) {
    const list = byOfficial.get(od.officialRestaurantId) ?? [];
    list.push(od);
    byOfficial.set(od.officialRestaurantId, list);
  }

  let didCreate = false;
  for (const r of linked) {
    const personalDishes = cache.dishes.filter((d) => d.restaurantId === r.id);
    const haveOfficialIds = new Set(
      personalDishes.map((d) => d.officialDishId).filter((id): id is string => !!id),
    );
    const officialList = byOfficial.get(r.officialRestaurantId!) ?? [];
    const missing = officialList.filter((od) => !haveOfficialIds.has(od.id));
    if (missing.length === 0) continue;

    for (const od of missing) {
      let typeId: string | null = null;
      const upper = od.typeName?.trim().toUpperCase();
      if (upper) {
        const existing = getDishTypes().find((t) => t.name === upper);
        typeId = existing ? existing.id : createDishType(upper).id;
      }
      createDish(
        {
          restaurantId: r.id,
          typeId,
          name: od.name,
          rating: null,
          notes: od.notes ?? "",
          officialDishId: od.id,
        },
        { skipBump: true },
      );
      didCreate = true;
    }
  }

  if (didCreate) document.dispatchEvent(new CustomEvent("cache:synced"));
}

/** Fetch agregaciones globales (RPCs Supabase) y guarda en cache local.
 *  Dispara "stats:synced" si cambia algo. */
export async function fetchOfficialStats(): Promise<void> {
  const [dishRes, restRes] = await Promise.all([
    supabase.rpc("get_official_dish_stats"),
    supabase.rpc("get_official_restaurant_stats"),
  ]);
  if (dishRes.error || restRes.error) {
    console.error("[fetchOfficialStats]", dishRes.error ?? restRes.error);
    return;
  }
  const next: OfficialStatsCache = { dishes: {}, restaurants: {} };
  for (const row of (dishRes.data ?? []) as Array<{ official_dish_id: string; avg_rating: number | string; ratings_count: number | string }>) {
    next.dishes[row.official_dish_id] = {
      avgRating: Number(row.avg_rating),
      ratingsCount: Number(row.ratings_count),
    };
  }
  for (const row of (restRes.data ?? []) as Array<{ official_restaurant_id: string; avg_rating: number | string; ratings_count: number | string }>) {
    next.restaurants[row.official_restaurant_id] = {
      avgRating: Number(row.avg_rating),
      ratingsCount: Number(row.ratings_count),
    };
  }
  const changed = !sameStats(_statsMem, next);
  _statsMem = next;
  localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(next));
  if (changed) document.dispatchEvent(new CustomEvent("stats:synced"));
}

/** Compara por valor — JSON.stringify es sensible al orden de inserción de claves,
 *  y los RPCs de Postgres no garantizan orden estable sin ORDER BY. */
function sameStats(a: OfficialStatsCache, b: OfficialStatsCache): boolean {
  return sameStatMap(a.dishes, b.dishes) && sameStatMap(a.restaurants, b.restaurants);
}
function sameStatMap(a: Record<string, OfficialStat>, b: Record<string, OfficialStat>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const k of aKeys) {
    const av = a[k], bv = b[k];
    if (!bv) return false;
    if (av.avgRating !== bv.avgRating || av.ratingsCount !== bv.ratingsCount) return false;
  }
  return true;
}

export function getOfficialDishStat(officialDishId: string): OfficialStat | null {
  return _statsMem.dishes[officialDishId] ?? null;
}

export function getOfficialRestaurantStat(officialRestaurantId: string): OfficialStat | null {
  return _statsMem.restaurants[officialRestaurantId] ?? null;
}
