// Vista previa bonita al compartir /oficial/@handle (o /oficial?id=…).
// WhatsApp, Facebook, X, Telegram… NO ejecutan JS: leen las <meta> del HTML.
// La página es estática, así que este edge function reemplaza las <meta> genéricas
// de la app (Layout1) por las del restaurante, con la imagen generada en
// /og/oficial/<handle> (netlify/functions/og-oficial.mjs).
// Corre ANTES del rewrite de public/_redirects; context.next() sirve /oficial.

// Tipos mínimos del runtime de Netlify Edge (Deno), sin instalar su paquete.
type Context = { next(): Promise<Response> };
type Config = { path: string | string[] };
declare const Netlify: { env: { get(key: string): string | undefined } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Hash corto para versionar la URL de la imagen (los crawlers la cachean). */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export default async (req: Request, context: Context) => {
  const res = await context.next();
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;

  const url = new URL(req.url);
  const seg = decodeURIComponent(url.pathname.replace(/^\/oficial\/?/, "").replace(/\/$/, ""));
  const key = (seg || url.searchParams.get("id") || "").replace(/^@/, "");
  const sbUrl = Netlify.env.get("PUBLIC_SUPABASE_URL");
  const sbKey = Netlify.env.get("PUBLIC_SUPABASE_ANON_KEY");
  if (!key || !sbUrl || !sbKey) return res;

  try {
    const filter = UUID.test(key) ? `id=eq.${key}` : `handle=eq.${encodeURIComponent(key.toLowerCase())}`;
    const r = await fetch(
      `${sbUrl}/rest/v1/official_restaurants?select=id,name,handle,cities,city,notes,logo_url&${filter}&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    const [o] = r.ok ? await r.json() : [];
    if (!o) return res;

    const cities: string[] = (o.cities?.length ? o.cities : o.city ? [o.city] : []).map((c: string) =>
      c.trim().toUpperCase(),
    );
    const title = `${o.name} · STAURANT`;
    const notes = typeof o.notes === "string" ? o.notes.trim() : "";
    const description =
      [cities.join(" · "), notes || "Mira la carta y las calificaciones de la comunidad."]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 200);
    const pageUrl = `${url.origin}/oficial/${o.handle ? `@${o.handle}` : `?id=${o.id}`}`;
    const v = shortHash(`${o.name}|${o.logo_url ?? ""}|${cities.join(",")}`);
    const image = `${url.origin}/og/oficial/${o.handle ?? o.id}?v=${v}`;

    const meta = [
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="STAURANT" />`,
      `<meta property="og:locale" content="es_CO" />`,
      `<meta property="og:title" content="${esc(o.name)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(pageUrl)}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(o.name)} en STAURANT" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(o.name)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`,
    ].join("\n    ");

    const html = (await res.text())
      // Quita las genéricas de la app (Layout1) para no dejar duplicados.
      .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/g, "")
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      .replace("</head>", `    ${meta}\n  </head>`);

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(html, { status: res.status, headers });
  } catch (err) {
    console.error("[oficial-meta]", err);
    return res;
  }
};

export const config: Config = { path: ["/oficial", "/oficial/*"] };
