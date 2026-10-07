import { supabase } from "./supabase.ts";

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Restaurant {
  id: string;
  name: string;
  status: "visited" | "pending";
  notes: string;
  cities: string[]; // MAYÚSCULAS; puede tener varias (cadenas / multi-sede)
  address: string | null; // dirección/ubicación libre; alimenta el enlace a Google Maps
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
  /** Slug único para URL personalizada: `/oficial/@handle`. Derivado del nombre
   *  (minúsculas, sin acentos ni símbolos). null solo en filas legacy sin migrar. */
  handle: string | null;
  /** Ciudades del oficial (multi, MAYÚSCULAS). Vacío = sin ciudad. */
  cities: string[];
  /** Ciudad principal (= `cities[0]`), derivada. Mantiene compatibilidad con los
   *  displays que muestran una sola ciudad; la columna legacy `city` en la BD se
   *  sigue escribiendo con este valor. */
  city: string | null;
  address: string | null;
  /** Enlace opcional de Google Maps/Waze con el pin exacto. Si existe, tocar la
   *  dirección abre este enlace en vez de buscar el texto de `address`. */
  mapsUrl: string | null;
  notes: string | null;
  phone: string | null; // para pedidos (se muestra como enlace WhatsApp)
  instagram: string | null; // handle o URL; vacío = sin ícono
  facebook: string | null;
  tiktok: string | null;
  /** Logo del restaurante (bucket 'official-dishes', misma carpeta = officialId).
   *  null = sin logo; el header cae a un placeholder con la inicial del nombre. */
  logoUrl: string | null;
}

export interface OfficialDish {
  id: string;
  officialRestaurantId: string;
  typeName: string | null;
  name: string;
  notes: string | null; // descripción del plato en la carta
  price: number | null; // solo platos oficiales; null = sin precio
  imageUrl: string | null; // foto del plato (carta oficial)
  isGeneric: boolean; // producto genérico (Coca-Cola, agua…): sin foto ni calificación, solo nombre + precio
}

export interface OfficialStat {
  avgRating: number;
  ratingsCount: number;
}

/** Membresía per-user de un restaurante oficial: lo hace aparecer en "Mi inicio"
 *  y guarda su estado visitado/pendiente. NO clona el perfil — el perfil vive en
 *  official_restaurants/official_dishes, compartido por todos. */
export interface OfficialMembership {
  officialRestaurantId: string;
  status: "visited" | "pending";
  createdAt: string;
  updatedAt: string;
}

/** Fila unificada para "Mi inicio": mezcla restaurantes personales y oficiales
 *  bajo la misma forma, para que la lista los renderice indistintamente. */
export interface HomeEntry {
  kind: "personal" | "official";
  id: string; // personal → restaurant.id; official → official_restaurant_id
  href: string;
  name: string;
  status: "visited" | "pending";
  notes: string;
  cities: string[];
  createdAt: string;
  updatedAt: string;
  isOfficial: boolean;
  officialRestaurantId: string | null;
  logoUrl: string | null; // solo oficiales; null = sin logo → placeholder inicial
  avg: number | null; // MI promedio
  dishCount: number;
  hasUnrated: boolean;
  searchText: string; // nombre + notas + platos, minúsculas (buscador del inicio)
}

export interface DishType {
  id: string;
  name: string;
  createdAt: string;
}

// ─── Cache local ───────────────────────────────────────────────────────────────

interface AppCache {
  userId: string;
  restaurants: Restaurant[]; // solo personales (no oficiales)
  dishes: Dish[]; // solo platos personales
  dishTypes: DishType[];
  // Overlay de oficiales (modelo IMDb: perfil compartido + capa per-user)
  memberships: OfficialMembership[]; // oficiales en "mi lista" + estado
  ratings: Record<string, number>; // officialDishId → mi calificación
  officialRestaurants: OfficialRestaurant[]; // perfiles de mis membresías (para el inicio)
  officialDishes: OfficialDish[]; // platos de mis membresías (conteo / sin calificar)
}

const CACHE_KEY = "staurant_cache_v5";
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
  return emptyCache();
}

function emptyCache(): AppCache {
  return {
    userId: _userId!,
    restaurants: [],
    dishes: [],
    dishTypes: [],
    memberships: [],
    ratings: {},
    officialRestaurants: [],
    officialDishes: [],
  };
}

async function fetchFromSupabase(): Promise<AppCache> {
  const [rRes, dRes, dtRes, mRes, ratRes] = await Promise.all([
    supabase.from("restaurants").select("*").eq("user_id", _userId).order("created_at", { ascending: false }),
    supabase.from("dishes").select("*").eq("user_id", _userId).order("created_at", { ascending: false }),
    supabase.from("dish_types").select("*").eq("user_id", _userId).order("name", { ascending: true }),
    supabase.from("user_official_restaurants").select("*").eq("user_id", _userId),
    supabase.from("official_ratings").select("*").eq("user_id", _userId),
  ]);

  const memberships = (mRes.data ?? []).map(toMembership);
  const ratings: Record<string, number> = {};
  for (const row of (ratRes.data ?? []) as Array<{ official_dish_id: string; rating: number | string }>) {
    ratings[row.official_dish_id] = Number(row.rating);
  }

  // Perfiles + cartas de mis oficiales, para renderizar sus cards en el inicio.
  const { officialRestaurants, officialDishes } = await fetchOfficialProfilesFor(
    memberships.map((m) => m.officialRestaurantId),
  );

  return {
    userId: _userId!,
    restaurants: (rRes.data ?? []).map(toRestaurant),
    dishes: (dRes.data ?? []).map(toDish),
    dishTypes: (dtRes.data ?? []).map(toDishType),
    memberships,
    ratings,
    officialRestaurants,
    officialDishes,
  };
}

/** Trae perfiles oficiales + sus platos para un conjunto de ids (mis membresías). */
async function fetchOfficialProfilesFor(
  officialIds: string[],
): Promise<{ officialRestaurants: OfficialRestaurant[]; officialDishes: OfficialDish[] }> {
  const ids = [...new Set(officialIds)];
  if (ids.length === 0) return { officialRestaurants: [], officialDishes: [] };
  const [orRes, odRes] = await Promise.all([
    supabase.from("official_restaurants").select("*").in("id", ids),
    supabase.from("official_dishes").select("*").in("official_restaurant_id", ids),
  ]);
  return {
    officialRestaurants: (orRes.data ?? []).map(toOfficialRestaurant),
    officialDishes: (odRes.data ?? []).map(toOfficialDish),
  };
}

const MIGRATION_KEY = "staurant_migrated_v1";

/** Mínimo entre refrescos completos al navegar (ms). */
const REFRESH_MIN_INTERVAL_MS = 30_000;
let _lastRefreshAt = 0;

async function refreshCacheInBackground(): Promise<void> {
  _lastRefreshAt = Date.now();
  const seqAtStart = _writeSeq;
  const remote = await fetchFromSupabase();
  const local = getCache();

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

  // Si hubo cambios locales mientras se consultaba (o aún se están guardando),
  // la foto del servidor puede no incluirlos: no pisar el caché (el cambio
  // "desaparecía" de la pantalla). El próximo refresh sincroniza.
  if (_pendingWrites > 0 || _writeSeq !== seqAtStart) return;

  if (JSON.stringify(local) !== JSON.stringify(remote)) {
    writeCache(remote);
    document.dispatchEvent(new CustomEvent("cache:synced"));
  }
  // Las stats globales ya las refresca initCache() en cada carga.
}

/** Llama esto al inicio de cada página protegida, pasando el userId de la sesión.
 *  - Si hay caché válido (memoria o localStorage) → instantáneo, sin red.
 *  - Siempre lanza un refresh en background para sincronizar cambios de otros dispositivos. */
export async function initCache(userId: string): Promise<void> {
  _userId = userId;
  loadStatsFromLocalStorage();
  const stale = Date.now() - _lastRefreshAt > REFRESH_MIN_INTERVAL_MS;
  if (stale) bgSync(fetchOfficialStats);

  // Si ya tenemos datos en memoria para este usuario → fast path, refresh en background.
  // Throttle: navegar entre páginas no re-descarga todo si se sincronizó hace poco
  // (los cambios propios ya están en el caché; esto solo trae cambios de otro equipo).
  if (_mem?.userId === _userId) {
    if (stale) bgSync(refreshCacheInBackground);
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
  _lastRefreshAt = Date.now();
  const fresh = await fetchFromSupabase();
  writeCache(fresh);

  // Tipos por defecto para usuarios nuevos (sin tipos todavía)
  if (fresh.dishTypes.length === 0) {
    ["HAMBURGUESAS", "PERROS CALIENTES", "PIZZAS"].forEach(name => createDishType(name));
  }
}

/** Borra el caché local (llamar en logout). */
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
  _userId = null;
  _mem = null;
  _isSuperAdmin = null;
  _lastRefreshAt = 0;
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

export function toRestaurant(row: Record<string, unknown>): Restaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as "visited" | "pending",
    notes: row.notes as string,
    cities: (row.cities as string[] | null) ?? [],
    address: (row.address as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
    officialRestaurantId: (row.official_restaurant_id as string | null) ?? null,
  };
}

export function toDish(row: Record<string, unknown>): Dish {
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

export function toDishType(row: Record<string, unknown>): DishType {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

function toMembership(row: Record<string, unknown>): OfficialMembership {
  return {
    officialRestaurantId: row.official_restaurant_id as string,
    status: (row.status as "visited" | "pending") ?? "pending",
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
  };
}

/** Dispara una operación Supabase en segundo plano sin bloquear la UI. */
function bgSync(fn: () => unknown): void {
  Promise.resolve(fn()).catch((err) => console.error("[staurant sync]", err));
}

// Escrituras en vuelo + contador de escrituras. El refresh en background los usa
// para no pisar el caché con datos del servidor más viejos que un cambio local.
let _pendingWrites = 0;
let _writeSeq = 0;

/** Como bgSync, pero para ESCRITURAS. Supabase no lanza excepción cuando la
 *  base rechaza la operación (permisos, red, validación): devuelve `{ error }`.
 *  Sin revisarlo, el cambio quedaba solo en el celular y se perdía en silencio
 *  al siguiente refresh. Si falla, avisa a la UI con el evento "sync:error". */
function bgWrite(fn: () => unknown): void {
  _pendingWrites++;
  _writeSeq++;
  Promise.resolve(fn())
    .then((res) => {
      const error = (res as { error?: unknown } | null | undefined)?.error;
      if (error) throw error;
    })
    .catch((err) => {
      console.error("[staurant sync]", err);
      document.dispatchEvent(new CustomEvent("sync:error"));
    })
    .finally(() => {
      _pendingWrites--;
    });
}

// ─── Restaurants (síncronos — leen del caché) ──────────────────────────────────

/** Id del usuario con sesión (null antes de initCache o tras logout). */
export function getCurrentUserId(): string | null {
  return _userId;
}

/** Perfil oficial ya cacheado (mis membresías), sin ir a la red. */
export function getCachedOfficialRestaurant(id: string): OfficialRestaurant | null {
  return getCache().officialRestaurants.find((o) => o.id === id) ?? null;
}

export function getRestaurants(): Restaurant[] {
  return getCache().restaurants;
}

export function getDishes(): Dish[] {
  return getCache().dishes;
}

/** Ciudades distintas ya usadas por el usuario (MAYÚSCULAS, ordenadas alfabéticamente).
 *  Alimenta el autocomplete del formulario y el filtro por ciudad del Inicio. */
export function getCities(): string[] {
  const cache = getCache();
  const set = new Set<string>();
  for (const r of cache.restaurants) {
    for (const c of r.cities) set.add(c);
  }
  // Ciudades de mis oficiales (mismo criterio MAYÚSCULAS que las personales).
  for (const o of cache.officialRestaurants) {
    for (const c of o.cities) set.add(c.trim().toUpperCase());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function createRestaurant(
  input: Pick<Restaurant, "name" | "notes"> & {
    officialRestaurantId?: string | null;
    cities?: string[];
    address?: string | null;
  },
): Restaurant {
  const now = new Date().toISOString();
  const r: Restaurant = {
    id: crypto.randomUUID(),
    name: input.name,
    notes: input.notes,
    cities: input.cities ?? [],
    address: input.address ?? null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    officialRestaurantId: input.officialRestaurantId ?? null,
  };
  const cache = getCache();
  cache.restaurants.unshift(r);
  writeCache(cache);

  bgWrite(() =>
    supabase.from("restaurants").insert({
      id: r.id, user_id: _userId,
      name: r.name, notes: r.notes, cities: r.cities, address: r.address,
      status: r.status, created_at: r.createdAt, updated_at: r.updatedAt,
      official_restaurant_id: r.officialRestaurantId,
    })
  );
  return r;
}

export function updateRestaurant(
  id: string,
  input: Partial<Pick<Restaurant, "name" | "notes" | "status" | "cities" | "address">>
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
  if (input.cities !== undefined) patch.cities = input.cities;
  if (input.address !== undefined) patch.address = input.address;
  bgWrite(() => supabase.from("restaurants").update(patch).eq("id", id));

  return cache.restaurants[idx];
}

export function deleteRestaurant(id: string): void {
  const cache = getCache();
  cache.restaurants = cache.restaurants.filter((r) => r.id !== id);
  cache.dishes = cache.dishes.filter((d) => d.restaurantId !== id);
  writeCache(cache);
  bgWrite(() => supabase.from("restaurants").delete().eq("id", id));
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
  bgWrite(() =>
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

  bgWrite(() =>
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

  // Platos de restaurantes oficiales: su ficha (nombre, tipo, notas) la administra
  // el sistema y NO puede modificarse. Lo único que el usuario puede cambiar es la
  // calificación. Se descarta cualquier otro campo aunque llegue en `input`.
  const effectiveInput: Partial<Pick<Dish, "typeId" | "name" | "rating" | "notes">> =
    cache.dishes[idx].officialDishId
      ? input.rating !== undefined
        ? { rating: input.rating }
        : {}
      : input;

  const updatedAt = new Date().toISOString();
  cache.dishes[idx] = { ...cache.dishes[idx], ...effectiveInput, updatedAt };
  writeCache(cache);

  const patch: Record<string, unknown> = { updated_at: updatedAt };
  if (effectiveInput.typeId !== undefined) patch.type_id = effectiveInput.typeId;
  if (effectiveInput.name !== undefined) patch.name = effectiveInput.name;
  if (effectiveInput.rating !== undefined) patch.rating = effectiveInput.rating;
  if (effectiveInput.notes !== undefined) patch.notes = effectiveInput.notes;
  bgWrite(() => supabase.from("dishes").update(patch).eq("id", id));

  bumpRestaurantUpdatedAt(cache.dishes[idx].restaurantId, updatedAt);
  return cache.dishes[idx];
}

export function deleteDish(id: string): void {
  const cache = getCache();
  const dish = cache.dishes.find((d) => d.id === id);
  // Los platos oficiales no pueden eliminarse individualmente: forman parte de la
  // carta administrada por el sistema. (Sí se eliminan al borrar el restaurante.)
  if (dish?.officialDishId) {
    console.warn("[deleteDish] no se puede eliminar un plato oficial");
    return;
  }
  cache.dishes = cache.dishes.filter((d) => d.id !== id);
  writeCache(cache);
  bgWrite(() => supabase.from("dishes").delete().eq("id", id));
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
  const normalized = name.trim().toUpperCase();
  // Idempotente: si ya existe un tipo con ese nombre, reutilizarlo en vez de
  // crear un duplicado (centraliza/unifica categorías; evita "HAMBURGUESA" x2).
  const cache = getCache();
  const existing = cache.dishTypes.find((t) => t.name === normalized);
  if (existing) return existing;

  const dt: DishType = {
    id: crypto.randomUUID(),
    name: normalized,
    createdAt: new Date().toISOString(),
  };
  // Insertar en orden alfabético para mantener el mismo invariante que Supabase
  const idx = cache.dishTypes.findIndex(t => t.name.localeCompare(dt.name) > 0);
  if (idx === -1) cache.dishTypes.push(dt);
  else cache.dishTypes.splice(idx, 0, dt);
  writeCache(cache);

  bgWrite(() =>
    supabase.from("dish_types").insert({
      id: dt.id, user_id: _userId,
      name: dt.name, created_at: dt.createdAt,
    })
  );
  return dt;
}

// ─── Derived (síncronos) ───────────────────────────────────────────────────────

/** Promedio redondeado a 1 decimal de un conjunto de calificaciones (null si vacío).
 *  Fuente única del redondeo de promedios (personales y oficiales, aquí y en social.ts). */
export function roundedAverage(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

export function getRestaurantAverage(restaurantId: string): number | null {
  return roundedAverage(
    getDishesByRestaurant(restaurantId)
      .filter((d) => d.rating !== null)
      .map((d) => d.rating!),
  );
}

/** IDs de los platos con la mejor calificación PERSONAL dentro de un restaurante (corona 👑).
 *  - Requiere ≥2 platos calificados.
 *  - Empate → varios platos estrella. */
export function getTopRatedDishIds(restaurantId: string): Set<string> {
  const rated = getDishesByRestaurant(restaurantId).filter((d) => d.rating !== null);
  if (rated.length < 2) return new Set();
  const max = Math.max(...rated.map((d) => d.rating!));
  return new Set(rated.filter((d) => d.rating === max).map((d) => d.id));
}

// ─── Official (global) ────────────────────────────────────────────────────────

function toOfficialRestaurant(row: Record<string, unknown>): OfficialRestaurant {
  // `cities` (array nuevo) es la fuente de verdad; si viniera vacío pero existe la
  // columna legacy `city`, se usa como fallback para filas aún no migradas.
  const rawCities = Array.isArray(row.cities) ? (row.cities as string[]) : [];
  const legacyCity = (row.city as string | null) ?? null;
  const cities = (rawCities.length ? rawCities : legacyCity ? [legacyCity] : [])
    .map((c) => c.trim())
    .filter(Boolean);
  return {
    id: row.id as string,
    name: row.name as string,
    handle: (row.handle as string | null) ?? null,
    cities,
    city: cities[0] ?? null,
    address: (row.address as string | null) ?? null,
    mapsUrl: (row.maps_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    instagram: (row.instagram as string | null) ?? null,
    facebook: (row.facebook as string | null) ?? null,
    tiktok: (row.tiktok as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
  };
}

function toOfficialDish(row: Record<string, unknown>): OfficialDish {
  return {
    id: row.id as string,
    officialRestaurantId: row.official_restaurant_id as string,
    typeName: (row.type_name as string | null) ?? null,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    price: (row.price as number | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    isGeneric: (row.is_generic as boolean | null) ?? false,
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

/** Trae TODOS los restaurantes oficiales de la plataforma (para la sección Explorar).
 *  No se cachea: la lista de oficiales es pequeña y cambia poco. */
export async function getAllOfficialRestaurants(): Promise<OfficialRestaurant[]> {
  const { data, error } = await supabase
    .from("official_restaurants")
    .select("*")
    .order("name", { ascending: true });
  if (error) { console.error("[getAllOfficialRestaurants]", error); return []; }
  return (data ?? []).map(toOfficialRestaurant);
}

/** Lista de ciudades ya usadas por algún oficial (para el combobox creable de
 *  ciudad en el editor de perfil). Distintas, ordenadas, sin nulos. */
export async function getOfficialCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from("official_restaurants")
    .select("cities, city");
  if (error) { console.error("[getOfficialCities]", error); return []; }
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ cities: string[] | null; city: string | null }>) {
    const list = r.cities?.length ? r.cities : r.city ? [r.city] : [];
    for (const c of list) {
      const v = c.trim();
      if (v) set.add(v);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/** Trae un restaurante oficial por id (detalle Explorar). */
export async function getOfficialRestaurant(id: string): Promise<OfficialRestaurant | null> {
  const { data, error } = await supabase
    .from("official_restaurants")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) { console.error("[getOfficialRestaurant]", error); return null; }
  return toOfficialRestaurant(data);
}

/** Trae un restaurante oficial por su handle (URL personalizada `/oficial/@x`).
 *  Acepta el handle con o sin `@` inicial y sin distinguir mayúsculas. */
export async function getOfficialByHandle(handle: string): Promise<OfficialRestaurant | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!h) return null;
  const { data, error } = await supabase
    .from("official_restaurants")
    .select("*")
    .eq("handle", h)
    .single();
  if (error || !data) { console.error("[getOfficialByHandle]", error); return null; }
  return toOfficialRestaurant(data);
}

/** URL canónica del perfil oficial: `/oficial/@handle` si hay handle; si no, el
 *  fallback legacy `/oficial?id=…`. Única fuente de verdad para enlaces internos. */
export function officialUrl(o: { handle: string | null; id: string }): string {
  return o.handle ? `/oficial/@${o.handle}` : `/oficial?id=${o.id}`;
}

/** Trae la carta oficial (platos) de un restaurante oficial. */
export async function getOfficialDishes(officialRestaurantId: string): Promise<OfficialDish[]> {
  const { data, error } = await supabase
    .from("official_dishes")
    .select("*")
    .eq("official_restaurant_id", officialRestaurantId)
    .order("name", { ascending: true });
  if (error) { console.error("[getOfficialDishes]", error); return []; }
  return (data ?? []).map(toOfficialDish);
}

// ─── Gestión por el DUEÑO del perfil oficial (modelo IMDb + dueño verificado) ──
// Un usuario con fila en official_owners puede editar la carta de ESE perfil y ver
// sus estadísticas agregadas. La seguridad real vive en RLS (Postgres): estas
// funciones fallan silenciosas si el usuario no es dueño. NO se cachean (el perfil
// oficial es compartido; /oficial re-lee con getOfficialDishes tras cada cambio).

/** Estadística agregada de UN plato para el panel del dueño. */
export interface OfficialOwnerDishStat {
  dishId: string;
  name: string;
  avgRating: number | null;
  votes: number;
}

/** Payload del panel de estadísticas del dueño (RPC get_official_owner_stats). */
export interface OfficialOwnerStats {
  members: number; // usuarios que agregaron el restaurante a su lista (alcance)
  raters: number; // usuarios distintos que han calificado (participación)
  totalRatings: number; // total de calificaciones recibidas
  avgOverall: number | null; // promedio general ponderado de todas las notas
  distribution: { bucket: number; count: number }[]; // histograma nota 1-10
  timeline: { day: string; count: number }[]; // calificaciones/día, últimos 30 días
  dishes: OfficialOwnerDishStat[]; // agregado por plato, mejor → peor
}

/** ¿El usuario actual es dueño de este perfil oficial? RLS permite leer solo las
 *  filas propias de official_owners, así que un select basta para saberlo.
 *  El superadmin es dueño de todos (gestiona cualquier oficial para dar soporte). */
export async function checkOfficialOwnership(
  officialRestaurantId: string,
): Promise<boolean> {
  if (!_userId) return false;
  if (await isSuperAdmin()) return true;
  const { data, error } = await supabase
    .from("official_owners")
    .select("official_restaurant_id")
    .eq("official_restaurant_id", officialRestaurantId)
    .eq("user_id", _userId)
    .maybeSingle();
  if (error) { console.error("[checkOfficialOwnership]", error); return false; }
  return !!data;
}

/** Perfiles oficiales que gestiona el usuario actual (para el acceso desde /perfil).
 *  RLS solo deja leer las filas propias de official_owners; el embed trae el perfil. */
export async function getMyOwnedOfficials(): Promise<OfficialRestaurant[]> {
  if (!_userId) return [];
  const { data, error } = await supabase
    .from("official_owners")
    .select("official_restaurants(*)")
    .eq("user_id", _userId);
  if (error) { console.error("[getMyOwnedOfficials]", error); return []; }
  // El embed puede venir como objeto (to-one) o array según la inferencia de tipos
  // de supabase-js; normalizamos a lista antes de mapear.
  return (data ?? []).flatMap((row) => {
    const embed = (row as { official_restaurants: unknown }).official_restaurants;
    const arr = Array.isArray(embed) ? embed : embed ? [embed] : [];
    return (arr as Record<string, unknown>[]).map(toOfficialRestaurant);
  });
}

// ─── Superadmin y solicitudes de restaurante oficial ────────────────────────
// El superadmin (fila en super_admins) es owner de TODOS los oficiales vía RLS
// (is_official_owner OR is_super_admin) y gestiona la bandeja de solicitudes.

let _isSuperAdmin: boolean | null = null;

/** ¿El usuario actual es superadmin? RLS deja leer solo la fila propia de
 *  super_admins, así que un select basta. Cacheado por sesión. */
export async function isSuperAdmin(): Promise<boolean> {
  if (!_userId) return false;
  if (_isSuperAdmin !== null) return _isSuperAdmin;
  const { data, error } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", _userId)
    .maybeSingle();
  if (error) { console.error("[isSuperAdmin]", error); return false; }
  _isSuperAdmin = !!data;
  return _isSuperAdmin;
}

/** Estado de la solicitud de oficial del usuario actual (la más reciente).
 *  null = nunca solicitó. Sirve para decidir qué mostrar en /perfil. */
export interface OfficialRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  proposedName: string;
  officialRestaurantId: string | null;
}

export async function getMyOfficialRequest(): Promise<OfficialRequest | null> {
  if (!_userId) return null;
  const { data, error } = await supabase
    .from("official_requests")
    .select("id, status, proposed_name, official_restaurant_id")
    .eq("user_id", _userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error("[getMyOfficialRequest]", error); return null; }
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as OfficialRequest["status"],
    proposedName: data.proposed_name as string,
    officialRestaurantId: (data.official_restaurant_id as string | null) ?? null,
  };
}

/** El usuario solicita permiso para crear un restaurante oficial. El índice
 *  parcial en Postgres impide más de una solicitud pendiente por usuario. */
export async function requestOfficial(proposedName: string): Promise<boolean> {
  if (!_userId) return false;
  const { error } = await supabase
    .from("official_requests")
    .insert({ user_id: _userId, proposed_name: proposedName });
  if (error) { console.error("[requestOfficial]", error); return false; }
  return true;
}

/** Solicitud pendiente en la bandeja del superadmin (RPC con datos del solicitante). */
export interface PendingRequest {
  id: string;
  userId: string;
  proposedName: string;
  createdAt: string;
  requesterName: string | null;
  requesterUsername: string | null;
}

export async function getPendingOfficialRequests(): Promise<PendingRequest[]> {
  const { data, error } = await supabase.rpc("get_pending_official_requests");
  if (error || !data) { console.error("[getPendingOfficialRequests]", error); return []; }
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    proposedName: r.proposed_name as string,
    createdAt: r.created_at as string,
    requesterName: (r.requester_name as string | null) ?? null,
    requesterUsername: (r.requester_username as string | null) ?? null,
  }));
}

/** Superadmin acepta (true) o rechaza (false) una solicitud pendiente. */
export async function resolveOfficialRequest(id: string, approve: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("resolve_official_request", {
    p_id: id, p_approve: approve,
  });
  if (error) { console.error("[resolveOfficialRequest]", error); return false; }
  return true;
}

/** El superadmin crea un oficial y lo asigna a un usuario, sin solicitud previa.
 *  Devuelve el id del nuevo oficial o null si falla. */
export async function adminCreateOfficialFor(
  userId: string, name: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_create_official_for", {
    p_user_id: userId, p_name: name,
  });
  if (error || !data) { console.error("[adminCreateOfficialFor]", error); return null; }
  return data as string;
}

/** Estadísticas agregadas del perfil (solo dueño). El RPC valida propiedad y nunca
 *  devuelve filas crudas ni quién votó — solo números. */
export async function getOfficialOwnerStats(
  officialRestaurantId: string,
): Promise<OfficialOwnerStats | null> {
  const { data, error } = await supabase.rpc("get_official_owner_stats", {
    rest_id: officialRestaurantId,
  });
  if (error || !data) { console.error("[getOfficialOwnerStats]", error); return null; }
  const d = data as {
    members: number;
    raters: number;
    total_ratings: number;
    avg_overall: number | string | null;
    distribution: Array<{ bucket: number; count: number }>;
    timeline: Array<{ day: string; count: number }>;
    dishes: Array<{ dish_id: string; name: string; avg_rating: number | string | null; votes: number }>;
  };
  return {
    members: d.members ?? 0,
    raters: d.raters ?? 0,
    totalRatings: d.total_ratings ?? 0,
    avgOverall: d.avg_overall === null || d.avg_overall === undefined ? null : Number(d.avg_overall),
    distribution: (d.distribution ?? []).map((x) => ({ bucket: x.bucket, count: x.count ?? 0 })),
    timeline: (d.timeline ?? []).map((x) => ({ day: x.day, count: x.count ?? 0 })),
    dishes: (d.dishes ?? []).map((x) => ({
      dishId: x.dish_id,
      name: x.name,
      avgRating: x.avg_rating === null ? null : Number(x.avg_rating),
      votes: x.votes ?? 0,
    })),
  };
}

/** Crea un plato en la carta oficial (solo dueño; RLS lo verifica). */
export async function createOfficialDish(input: {
  officialRestaurantId: string;
  name: string;
  typeName?: string | null;
  price?: number | null;
  notes?: string | null;
  imageUrl?: string | null;
  isGeneric?: boolean;
}): Promise<OfficialDish | null> {
  const { data, error } = await supabase
    .from("official_dishes")
    .insert({
      official_restaurant_id: input.officialRestaurantId,
      name: input.name,
      type_name: input.typeName ?? null,
      price: input.price ?? null,
      notes: input.notes ?? null,
      image_url: input.imageUrl ?? null,
      is_generic: input.isGeneric ?? false,
    })
    .select()
    .single();
  if (error || !data) { console.error("[createOfficialDish]", error); return null; }
  return toOfficialDish(data);
}

/** Edita un plato de la carta oficial (solo dueño). */
export async function updateOfficialDish(
  id: string,
  patch: Partial<{ name: string; typeName: string | null; price: number | null; notes: string | null; imageUrl: string | null; isGeneric: boolean }>,
): Promise<OfficialDish | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.typeName !== undefined) row.type_name = patch.typeName;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
  if (patch.isGeneric !== undefined) row.is_generic = patch.isGeneric;
  const { data, error } = await supabase
    .from("official_dishes")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) { console.error("[updateOfficialDish]", error); return null; }
  return toOfficialDish(data);
}

/** Borra un plato de la carta oficial (solo dueño). */
export async function deleteOfficialDish(id: string): Promise<boolean> {
  const { error } = await supabase.from("official_dishes").delete().eq("id", id);
  if (error) { console.error("[deleteOfficialDish]", error); return false; }
  return true;
}

/** Elimina un perfil oficial completo (solo dueño o superadmin; RLS lo verifica).
 *  Las FK en cascada borran platos, calificaciones, dueños y overlay per-user; pero
 *  las fotos viven en Storage, no en la DB, así que se limpian aparte para no dejar
 *  archivos huérfanos. Se recogen ANTES del delete (después ya no hay filas). */
export async function deleteOfficial(id: string): Promise<boolean> {
  const { data: dishes } = await supabase
    .from("official_dishes")
    .select("image_url")
    .eq("official_restaurant_id", id);

  const marker = `/${OFFICIAL_DISH_BUCKET}/`;
  const paths = (dishes ?? [])
    .map((d) => (d as { image_url: string | null }).image_url)
    .filter((u): u is string => !!u)
    .map((u) => {
      const i = u.indexOf(marker);
      return i === -1 ? null : u.slice(i + marker.length);
    })
    .filter((p): p is string => !!p);

  const { error } = await supabase.from("official_restaurants").delete().eq("id", id);
  if (error) { console.error("[deleteOfficial]", error); return false; }

  // Delete OK → limpiar Storage en segundo plano (best-effort; no bloquea la UI).
  if (paths.length > 0) {
    bgSync(() => supabase.storage.from(OFFICIAL_DISH_BUCKET).remove(paths));
  }
  return true;
}

const OFFICIAL_DISH_BUCKET = "official-dishes";

/** Peso máximo de la foto YA comprimida (lo que realmente se sube). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Comprime en el navegador antes de subir: resize a máx 1600px, WebP,
 *  apunta a ~0.3 MB. Devuelve un File nuevo y ligero. Si algo falla
 *  (p. ej. HEIC en un navegador que no lo decodifica), cae al original:
 *  el límite de peso se valida DESPUÉS, sobre lo que de verdad se sube. */
async function optimizeImage(file: File): Promise<File> {
  try {
    // Carga perezosa: la librería (~50 KB) solo se baja al subir una foto,
    // no en cada página que importa data.ts.
    const { default: imageCompression } = await import("browser-image-compression");
    return await imageCompression(file, {
      maxSizeMB: 0.3,          // objetivo de peso
      maxWidthOrHeight: 1600,  // resize si más grande
      fileType: "image/webp",  // formato eficiente
      initialQuality: 0.8,     // calidad visual
      useWebWorker: true,      // no congela UI
    });
  } catch (e) {
    console.error("[optimizeImage] falló, uso original:", e);
    return file;
  }
}

/** Motivo de fallo al subir una foto de plato oficial. Sirve para dar un
 *  mensaje honesto: antes CUALQUIER fallo (formato, tamaño, permiso o red)
 *  se mostraba como "tamaño ≤ 5 MB", lo que confundía al usuario. */
export type UploadDishImageError = "type" | "size" | "permission" | "upload";

export type UploadDishImageResult =
  | { url: string }
  | { error: UploadDishImageError };

/** Sube la foto de un plato oficial al bucket 'official-dishes' y devuelve su URL
 *  pública. El path SIEMPRE empieza por el officialRestaurantId: la RLS del bucket
 *  exige que la primera carpeta sea un perfil del que el usuario sea dueño (o
 *  superadmin). Solo imágenes; se comprime y luego se exige máx 5 MB. Devuelve { error } con el motivo real. */
export async function uploadOfficialDishImage(
  officialRestaurantId: string,
  file: File,
): Promise<UploadDishImageResult> {
  if (!file.type.startsWith("image/")) {
    console.error("[uploadOfficialDishImage] no es imagen:", file.type);
    return { error: "type" };
  }
  // Primero comprimir, luego validar: una foto de 12 MB del celular suele
  // quedar en ~0.3 MB y debe aceptarse. Solo se rechaza si, ya procesada,
  // sigue pasando el límite.
  const optimized = await optimizeImage(file); // resize + WebP en el cliente
  if (optimized.size > MAX_UPLOAD_BYTES) {
    console.error("[uploadOfficialDishImage] imagen procesada > 5 MB:", optimized.size);
    return { error: "size" };
  }
  // Si la compresión falló se sube el original: extensión y tipo según el archivo real.
  const isWebp = optimized.type === "image/webp";
  const ext = isWebp ? "webp" : (optimized.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${officialRestaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(OFFICIAL_DISH_BUCKET)
    .upload(path, optimized, {
      cacheControl: "3600",
      upsert: false,
      contentType: optimized.type || "image/webp",
    });
  if (error) {
    console.error("[uploadOfficialDishImage]", error);
    // RLS del bucket → status 403 / "row-level security". No es un problema de
    // tamaño ni formato: el usuario no tiene permiso sobre ese perfil oficial.
    const status = (error as { statusCode?: string | number }).statusCode;
    const isPermission =
      status === 403 || status === "403" ||
      /row-level security|unauthorized|permission/i.test(error.message);
    return { error: isPermission ? "permission" : "upload" };
  }
  const { data } = supabase.storage.from(OFFICIAL_DISH_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Borra una imagen previa del bucket a partir de su URL pública (best-effort).
 *  Se usa al reemplazar/quitar la foto de un plato para no dejar huérfanos. */
export function deleteOfficialDishImage(imageUrl: string | null | undefined): void {
  if (!imageUrl) return;
  const marker = `/${OFFICIAL_DISH_BUCKET}/`;
  const i = imageUrl.indexOf(marker);
  if (i === -1) return;
  const path = imageUrl.slice(i + marker.length);
  bgSync(() => supabase.storage.from(OFFICIAL_DISH_BUCKET).remove([path]));
}

/** Edita los datos del perfil oficial: nombre / ciudad / dirección / notas (solo dueño). */
export async function updateOfficialRestaurant(
  id: string,
  patch: Partial<{
    name: string;
    cities: string[];
    address: string | null;
    mapsUrl: string | null;
    notes: string | null;
    phone: string | null;
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
    logoUrl: string | null;
  }>,
): Promise<OfficialRestaurant | null> {
  // `cities` es la fuente de verdad; se sincroniza la columna legacy `city` con la
  // primera ciudad para no romper lecturas antiguas.
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.cities !== undefined) {
    dbPatch.cities = patch.cities;
    dbPatch.city = patch.cities[0] ?? null;
  }
  // camelCase → columnas snake_case (`logo_url`, `maps_url`).
  if (patch.logoUrl !== undefined) {
    dbPatch.logo_url = patch.logoUrl;
    delete dbPatch.logoUrl;
  }
  if (patch.mapsUrl !== undefined) {
    dbPatch.maps_url = patch.mapsUrl;
    delete dbPatch.mapsUrl;
  }
  const { data, error } = await supabase
    .from("official_restaurants")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) { console.error("[updateOfficialRestaurant]", error); return null; }
  return toOfficialRestaurant(data);
}

// ─── Membresías + calificaciones de oficiales (overlay per-user, sin clon) ─────

/** ¿El usuario tiene este oficial en su lista? */
export function isOfficialInMyList(officialRestaurantId: string): boolean {
  return getCache().memberships.some((m) => m.officialRestaurantId === officialRestaurantId);
}

/** Estado (visitado/pendiente) de un oficial en mi lista, o null si no pertenece.
 *  Usado por /oficial para apuntar el ← Volver a la pestaña correcta del inicio. */
export function getMyOfficialStatus(
  officialRestaurantId: string,
): "visited" | "pending" | null {
  const m = getCache().memberships.find(
    (x) => x.officialRestaurantId === officialRestaurantId,
  );
  return m ? m.status : null;
}

/** Mi calificación de un plato oficial (null si no lo he calificado). */
export function getMyOfficialRating(officialDishId: string): number | null {
  const r = getCache().ratings[officialDishId];
  return r === undefined ? null : r;
}

/** Inserta/actualiza en el cache el perfil oficial y su carta (para el inicio). */
function upsertOfficialProfile(
  cache: AppCache,
  official: OfficialRestaurant,
  dishes: OfficialDish[],
): void {
  const oi = cache.officialRestaurants.findIndex((o) => o.id === official.id);
  if (oi === -1) cache.officialRestaurants.push(official);
  else cache.officialRestaurants[oi] = official;
  cache.officialDishes = cache.officialDishes.filter(
    (d) => d.officialRestaurantId !== official.id,
  );
  cache.officialDishes.push(...dishes);
}

/** Agrega un oficial a "mi lista" (membresía, estado pendiente). NO clona el perfil:
 *  solo registra la pertenencia y cachea el perfil + carta para el inicio. Idempotente:
 *  si ya está, devuelve la membresía existente. Persiste en Supabase en background. */
export function addOfficialToMyList(
  official: OfficialRestaurant,
  dishes: OfficialDish[],
): OfficialMembership {
  const cache = getCache();
  const existing = cache.memberships.find((m) => m.officialRestaurantId === official.id);
  if (existing) {
    upsertOfficialProfile(cache, official, dishes);
    writeCache(cache);
    return existing;
  }

  const now = new Date().toISOString();
  const membership: OfficialMembership = {
    officialRestaurantId: official.id,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  cache.memberships.unshift(membership);
  upsertOfficialProfile(cache, official, dishes);
  writeCache(cache);

  bgWrite(() =>
    supabase.from("user_official_restaurants").insert({
      user_id: _userId,
      official_restaurant_id: official.id,
      status: membership.status,
      created_at: membership.createdAt,
      updated_at: membership.updatedAt,
    }),
  );
  return membership;
}

/** Cambia el estado (visitado/pendiente) de un oficial en mi lista. */
export function setOfficialStatus(
  officialRestaurantId: string,
  status: "visited" | "pending",
): void {
  const cache = getCache();
  const idx = cache.memberships.findIndex(
    (m) => m.officialRestaurantId === officialRestaurantId,
  );
  if (idx === -1 || cache.memberships[idx].status === status) return;
  const updatedAt = new Date().toISOString();
  cache.memberships[idx] = { ...cache.memberships[idx], status, updatedAt };
  writeCache(cache);
  bgWrite(() =>
    supabase
      .from("user_official_restaurants")
      .update({ status, updated_at: updatedAt })
      .eq("user_id", _userId)
      .eq("official_restaurant_id", officialRestaurantId),
  );
}

/** Califica (o re-califica) un plato oficial. `rating=null` elimina mi calificación.
 *  Marca la membresía como visitada al calificar. Optimista + bgSync. */
export function rateOfficialDish(officialDishId: string, rating: number | null): void {
  const cache = getCache();

  if (rating === null) {
    delete cache.ratings[officialDishId];
    writeCache(cache);
    bgWrite(() =>
      supabase
        .from("official_ratings")
        .delete()
        .eq("user_id", _userId)
        .eq("official_dish_id", officialDishId),
    );
    return;
  }

  const now = new Date().toISOString();
  cache.ratings[officialDishId] = rating;
  writeCache(cache);
  bgWrite(() =>
    supabase.from("official_ratings").upsert(
      { user_id: _userId, official_dish_id: officialDishId, rating, updated_at: now },
      { onConflict: "user_id,official_dish_id" },
    ),
  );

  // Calificar implica que visité el restaurante del plato.
  const od = cache.officialDishes.find((d) => d.id === officialDishId);
  if (od) setOfficialStatus(od.officialRestaurantId, "visited");
}

/** Platos oficiales que califiqué (de los oficiales en mi lista), con el nombre
 *  de su restaurante. Alimenta el selector de "recomendar" del chat. */
export function getMyRatedOfficialDishes(): {
  dish: OfficialDish;
  restaurantName: string;
  rating: number;
}[] {
  const cache = getCache();
  const names = new Map(cache.officialRestaurants.map((o) => [o.id, o.name]));
  return cache.officialDishes
    .filter((d) => cache.ratings[d.id] !== undefined)
    .map((d) => ({
      dish: d,
      restaurantName: names.get(d.officialRestaurantId) ?? "",
      rating: cache.ratings[d.id],
    }));
}

/** Promedio MÍO de un restaurante oficial (avg de mis ratings de su carta). */
export function getMyOfficialAverage(officialRestaurantId: string): number | null {
  const cache = getCache();
  const rated = cache.officialDishes
    .filter((d) => d.officialRestaurantId === officialRestaurantId)
    .map((d) => cache.ratings[d.id])
    .filter((v): v is number => v !== undefined);
  return roundedAverage(rated);
}

/** Lista unificada para "Mi inicio": restaurantes personales + oficiales de mi lista.
 *  Ambos bajo la misma forma para renderizarlos indistintamente. */
export function getHomeEntries(): HomeEntry[] {
  const cache = getCache();

  const personal: HomeEntry[] = cache.restaurants.map((r) => {
    const ds = getDishesByRestaurant(r.id);
    return {
      kind: "personal",
      id: r.id,
      href: `/restaurante?id=${r.id}`,
      name: r.name,
      status: r.status,
      notes: r.notes,
      cities: r.cities,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isOfficial: false,
      officialRestaurantId: null,
      logoUrl: null,
      avg: getRestaurantAverage(r.id),
      dishCount: ds.length,
      hasUnrated: ds.some((d) => d.rating === null),
      searchText: [r.name, r.notes, ...ds.map((d) => d.name), ...ds.map((d) => d.notes)]
        .join(" ")
        .toLowerCase(),
    };
  });

  const official: HomeEntry[] = cache.memberships
    .map((m) => cache.officialRestaurants.find((o) => o.id === m.officialRestaurantId) ? m : null)
    .filter((m): m is OfficialMembership => m !== null)
    .map((m) => {
      const off = cache.officialRestaurants.find((o) => o.id === m.officialRestaurantId)!;
      const dishes = cache.officialDishes.filter(
        (d) => d.officialRestaurantId === m.officialRestaurantId,
      );
      return {
        kind: "official",
        id: m.officialRestaurantId,
        // Enlace interno por ?id= (página real, funciona en dev y sin depender del
        // rewrite). Al cargar, /oficial canonicaliza la barra a /oficial/@handle.
        href: `/oficial?id=${m.officialRestaurantId}`,
        name: off.name,
        status: m.status,
        notes: off.notes ?? "",
        cities: off.cities.map((c) => c.trim().toUpperCase()),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        isOfficial: true,
        officialRestaurantId: m.officialRestaurantId,
        logoUrl: off.logoUrl ?? null,
        avg: getMyOfficialAverage(m.officialRestaurantId),
        dishCount: dishes.length,
        hasUnrated: dishes.some((d) => cache.ratings[d.id] === undefined),
        searchText: [off.name, off.notes ?? "", ...dishes.map((d) => d.name), ...dishes.map((d) => d.notes ?? "")]
          .join(" ")
          .toLowerCase(),
      };
    });

  return [...personal, ...official];
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
