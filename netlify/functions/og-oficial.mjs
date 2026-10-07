// Imagen de vista previa (1200×630 PNG) de un restaurante oficial, generada al
// vuelo: /og/oficial/<handle o id>. La referencia el <meta og:image> que inyecta
// netlify/edge-functions/oficial-meta.ts. Diseño en netlify/lib/og-render.mjs.

import {
  renderOfficialCard,
  whiteBrand,
  squarePng,
  FONT_WEIGHTS,
} from "../lib/og-render.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recursos estáticos (fuentes + logo de la marca): se piden al propio sitio una
// vez por instancia y quedan en memoria.
let assets = null;
async function loadAssets(origin) {
  if (assets) return assets;
  const get = async (path) => {
    const res = await fetch(new URL(path, origin));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const [brand, ...fontBufs] = await Promise.all([
    get("/img/logo2.png"),
    ...FONT_WEIGHTS.map((w) => get(`/fonts/montserrat-latin-${w}-normal.woff`)),
  ]);
  assets = {
    brandPng: await whiteBrand(brand),
    fonts: FONT_WEIGHTS.map((weight, i) => ({
      name: "Montserrat",
      weight,
      style: "normal",
      data: fontBufs[i],
    })),
  };
  return assets;
}

export default async (req, context) => {
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
      o.logo_url ? fetch(o.logo_url).catch(() => null) : Promise.resolve(null),
      loadAssets(new URL(req.url).origin),
    ]);

    const dishCount = Number(countRes.headers.get("content-range")?.split("/")[1] ?? 0) || 0;
    const stats = statsRes.ok ? await statsRes.json() : [];
    const stat = Array.isArray(stats) ? stats.find((s) => s.official_restaurant_id === o.id) : null;

    let logoPng = null;
    if (logoRes && logoRes.ok) {
      try {
        logoPng = await squarePng(Buffer.from(await logoRes.arrayBuffer()));
      } catch {
        logoPng = null; // formato ilegible → placeholder con la inicial
      }
    }

    const cities = Array.isArray(o.cities) && o.cities.length ? o.cities : o.city ? [o.city] : [];
    const png = await renderOfficialCard({
      name: o.name,
      cities: cities.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      dishCount,
      avg: stat ? Number(stat.avg_rating) : null,
      ratingsCount: stat ? Number(stat.ratings_count) : 0,
      logoPng,
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
    return Response.redirect(new URL("/img/og-app.png", req.url), 302);
  }
};

export const config = { path: "/og/oficial/:key" };
