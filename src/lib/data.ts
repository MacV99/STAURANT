import { supabase } from "./supabase.ts";

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Restaurant {
  id: string;
  name: string;
  status: "visited" | "pending";
  notes: string;
  createdAt: string;
}

export interface Dish {
  id: string;
  restaurantId: string;
  typeId: string | null;
  name: string;
  rating: number; // 1–10, soporta decimales (ej: 7.5)
  notes: string;
  createdAt: string;
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
let _userId: string | null = null;
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
}

/** Llama esto al inicio de cada página protegida, pasando el userId de la sesión.
 *  - Si hay caché válido (memoria o localStorage) → instantáneo, sin red.
 *  - Siempre lanza un refresh en background para sincronizar cambios de otros dispositivos. */
export async function initCache(userId: string): Promise<void> {
  _userId = userId;

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
  };
}

function toDish(row: Record<string, unknown>): Dish {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    typeId: (row.type_id as string | null) ?? null,
    name: row.name as string,
    rating: Number(row.rating),
    notes: row.notes as string,
    createdAt: row.created_at as string,
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

export function createRestaurant(input: Pick<Restaurant, "name" | "notes">): Restaurant {
  const r: Restaurant = {
    id: crypto.randomUUID(),
    name: input.name,
    notes: input.notes,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const cache = getCache();
  cache.restaurants.unshift(r);
  writeCache(cache);

  bgSync(() =>
    supabase.from("restaurants").insert({
      id: r.id, user_id: _userId,
      name: r.name, notes: r.notes,
      status: r.status, created_at: r.createdAt,
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
  cache.restaurants[idx] = { ...cache.restaurants[idx], ...input };
  writeCache(cache);

  const patch: Record<string, unknown> = {};
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

export function createDish(input: Pick<Dish, "restaurantId" | "typeId" | "name" | "rating" | "notes">): Dish {
  const d: Dish = {
    id: crypto.randomUUID(),
    restaurantId: input.restaurantId,
    typeId: input.typeId,
    name: input.name,
    rating: input.rating,
    notes: input.notes,
    createdAt: new Date().toISOString(),
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
      notes: d.notes, created_at: d.createdAt,
    })
  );
  return d;
}

export function updateDish(
  id: string,
  input: Partial<Pick<Dish, "typeId" | "name" | "rating" | "notes">>
): Dish | null {
  const cache = getCache();
  const idx = cache.dishes.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  cache.dishes[idx] = { ...cache.dishes[idx], ...input };
  writeCache(cache);

  const patch: Record<string, unknown> = {};
  if (input.typeId !== undefined) patch.type_id = input.typeId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.rating !== undefined) patch.rating = input.rating;
  if (input.notes !== undefined) patch.notes = input.notes;
  bgSync(() => supabase.from("dishes").update(patch).eq("id", id));

  return cache.dishes[idx];
}

export function deleteDish(id: string): void {
  const cache = getCache();
  cache.dishes = cache.dishes.filter((d) => d.id !== id);
  writeCache(cache);
  bgSync(() => supabase.from("dishes").delete().eq("id", id));
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
  const dishes = getDishesByRestaurant(restaurantId);
  if (dishes.length === 0) return null;
  const sum = dishes.reduce((acc, d) => acc + d.rating, 0);
  return Math.round((sum / dishes.length) * 10) / 10;
}
