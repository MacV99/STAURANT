// Imagen de vista previa (1200×630 PNG) de un restaurante oficial, generada al
// vuelo: /og/oficial/<handle o id>. La referencia el <meta og:image> que inyecta
// netlify/edge-functions/oficial-meta.ts. Diseño en netlify/lib/og-render.mjs.

// Import dinámico: si el renderer no carga, se responde con la imagen genérica
// (y el error queda en el log) en vez de un 502 sin detalle.
let renderer = null;
const loadRenderer = () => (renderer ??= import("../lib/og-render.mjs"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recursos estáticos (public/og/: fuentes, logo blanco, resvg.wasm): se piden al
// propio sitio una vez por instancia y quedan en memoria. Sin binarios nativos.
let assets = null;
async function loadAssets(origin) {
  if (assets) return assets;
  const get = async (path) => {
    const res = await fetch(new URL(path, origin));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const { FONT_WEIGHTS } = await loadRenderer();
  const [wasm, brandPng, ...fontBufs] = await Promise.all([
    get("/og/resvg.wasm"),
    get("/og/logo-white.png"),
    ...FONT_WEIGHTS.map((w) => get(`/og/montserrat-latin-${w}-normal.woff`)),
  ]);
  await (await loadRenderer()).initRenderer(wasm);
  assets = {
    brandPng,
    fonts: FONT_WEIGHTS.map((weight, i) => ({
      name: "Montserrat",
      weight,
      style: "normal",
      data: fontBufs[i],
    })),
  };
  return assets;
}

/** Logo (suele ser AVIF, que satori no lee) → JPEG cuadrado vía la transformación
 *  de imágenes de Supabase Storage. Si falla, null → placeholder con la inicial. */
async function fetchLogo(logoUrl) {
  try {
    const u = new URL(logoUrl.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/"));
    u.searchParams.set("width", "472");
    u.searchParams.set("height", "472");
    u.searchParams.set("resize", "cover");
    const res = await fetch(u, { headers: { Accept: "image/png,image/jpeg" } });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!res.ok || !/^image\/(png|jpeg)$/.test(mime)) return null;
    return { data: Buffer.from(await res.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

export default async (req, context) => {
  if (new URL(req.url).searchParams.has("ping")) return new Response("pong");
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  const raw = decodeURIComponent(context.params.key ?? "").replace(/^@/, "").replace(/\.png$/i, "");
  if (!url || !key || !raw) return new Response("Not found", { status: 404 });

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const filter = UUID.test(raw) ? `id=eq.${raw}` : `handle=eq.${encodeURIComponent(raw.toLowerCase())}`;

  try {
    const restRes = await fetch(
      `${url}/rest/v1/official_restaurants?select=id,name,cities,city,logo_url&${filter}&limit=1`,
      { headers },
    );
    const [o] = restRes.ok ? await restRes.json() : [];
    if (!o) return new Response("Not found", { status: 404 });

    const [countRes, statsRes, logoRes, a] = await Promise.all([
      fetch(`${url}/rest/v1/official_dishes?select=id&official_restaurant_id=eq.${o.id}`, {
        method: "HEAD",
        headers: { ...headers, Prefer: "count=exact" },
      }),
      fetch(`${url}/rest/v1/rpc/get_official_restaurant_stats`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      }),
      o.logo_url ? fetchLogo(o.logo_url) : Promise.resolve(null),
      loadAssets(new URL(req.url).origin),
    ]);

    const dishCount = Number(countRes.headers.get("content-range")?.split("/")[1] ?? 0) || 0;
    const stats = statsRes.ok ? await statsRes.json() : [];
    const stat = Array.isArray(stats) ? stats.find((s) => s.official_restaurant_id === o.id) : null;

    const cities = Array.isArray(o.cities) && o.cities.length ? o.cities : o.city ? [o.city] : [];
    const { renderOfficialCard } = await loadRenderer();
    const png = await renderOfficialCard({
      name: o.name,
      cities: cities.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      dishCount,
      avg: stat ? Number(stat.avg_rating) : null,
      ratingsCount: stat ? Number(stat.ratings_count) : 0,
      logo: logoRes,
      ...a,
    });

    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[og-oficial]", err);
    if (new URL(req.url).searchParams.has("debug"))
      return new Response(String(err?.stack ?? err), { status: 500 });
    return Response.redirect(new URL("/img/og-app.png", req.url), 302);
  }
};

export const config = { path: "/og/oficial/:key" };
