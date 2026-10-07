// ─── Imágenes de vista previa (Open Graph) 1200×630 ───────────────────────────
// Lo que muestran WhatsApp / Facebook / X / Telegram al pegar un enlace.
// satori dibuja el diseño a SVG (el texto queda como trazos: no depende de las
// fuentes del servidor) y sharp lo pasa a PNG. sharp también convierte el logo
// del restaurante (puede ser AVIF/WebP, que satori y WhatsApp no leen) a PNG.
//
// Lo usan: netlify/functions/og-oficial.mjs (una por restaurante, al vuelo) y
// scripts/og-app.mjs (la imagen fija de la app → public/img/og-app.png).

import satori from "satori";
import sharp from "sharp";

export const OG_W = 1200;
export const OG_H = 630;

const C = {
  bg: "#0f0f0f",
  dot: "#2a2a2a",
  panel: "#1b1b1b",
  border: "#2c2c2c",
  text: "#f2f2f2",
  muted: "#a3a3a3",
  gold: "#d9ac3c",
  goldSoft: "rgba(217, 172, 60, 0.16)",
  success: "#4cbf6c",
  warning: "#e0a24a",
  danger: "#ef6b7a",
  info: "#3b9cf0",
};

/** Mini-JSX: h("div", { style }, ...hijos). */
function h(type, props, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: kids.length <= 1 ? kids[0] : kids } };
}

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const pngUri = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

const CHECK_BADGE = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${C.info}" d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01z"/><path fill="#fff" d="M10.354 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708 0"/></svg>`,
);

const STAR = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" style="color:#fff" d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/></svg>`,
);

const ARROW = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#141414" fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8"/></svg>`,
);

/** Fondo punteado de la app + panel con borde. */
function frame(children, { border = C.border, glow = false } = {}) {
  return h(
    "div",
    {
      style: {
        width: OG_W,
        height: OG_H,
        display: "flex",
        padding: 36,
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 2px 2px, ${C.dot} 2px, transparent 0)`,
        backgroundSize: "28px 28px",
        fontFamily: "Montserrat",
      },
    },
    h(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "44px 60px",
          borderRadius: 40,
          border: `4px solid ${border}`,
          backgroundColor: C.panel,
          boxShadow: glow ? `0 0 60px ${C.goldSoft}` : "none",
        },
      },
      children,
    ),
  );
}

function ratingColor(v) {
  if (v >= 8) return C.success;
  if (v >= 5) return C.warning;
  return C.danger;
}

function pill(content, { bg = "#262626", color = C.text, border = "#333" } = {}) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        borderRadius: 999,
        backgroundColor: bg,
        border: `2px solid ${border}`,
        color,
        fontSize: 28,
        fontWeight: 700,
      },
    },
    content,
  );
}

function nameSize(name) {
  const n = name.length;
  if (n <= 12) return 76;
  if (n <= 18) return 66;
  if (n <= 26) return 56;
  return 48;
}

/**
 * Tarjeta de un restaurante oficial.
 * @param {{ name: string; cities: string[]; dishCount: number; avg: number | null;
 *   ratingsCount: number; logoPng: Buffer | null; brandPng: Buffer;
 *   fonts: import("satori").SatoriOptions["fonts"] }} d
 */
export async function renderOfficialCard(d) {
  const initial = (d.name.trim()[0] ?? "?").toUpperCase();
  const logo = d.logoPng
    ? h("img", {
        src: pngUri(d.logoPng),
        width: 236,
        height: 236,
        style: { borderRadius: 36, border: `3px solid ${C.border}`, objectFit: "cover" },
      })
    : h(
        "div",
        {
          style: {
            width: 236,
            height: 236,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 36,
            border: `3px solid ${C.border}`,
            backgroundColor: "#262626",
            color: C.text,
            fontSize: 120,
            fontWeight: 900,
          },
        },
        initial,
      );

  const meta = [d.cities.join(" · "), `${d.dishCount} ${d.dishCount === 1 ? "plato" : "platos"}`]
    .filter(Boolean)
    .join("  ·  ");

  const rating =
    d.avg !== null && d.ratingsCount > 0
      ? pill(
          [
            h("img", { src: STAR, width: 26, height: 26 }),
            h("span", {}, d.avg.toFixed(1)),
            h(
              "span",
              { style: { fontWeight: 600, opacity: 0.85, fontSize: 24 } },
              `· ${d.ratingsCount} ${d.ratingsCount === 1 ? "opinión" : "opiniones"}`,
            ),
          ],
          { bg: ratingColor(d.avg), color: "#fff", border: ratingColor(d.avg) },
        )
      : pill("Califica sus platos", { color: C.muted });

  const tree = frame(
    [
      h(
        "div",
        { style: { flex: 1, display: "flex", alignItems: "center", gap: 52 } },
        logo,
        h(
          "div",
          { style: { flex: 1, display: "flex", flexDirection: "column", gap: 14 } },
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: C.gold,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 4,
              },
            },
            h("img", { src: CHECK_BADGE, width: 30, height: 30 }),
            "RESTAURANTE VERIFICADO",
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                color: C.text,
                fontSize: nameSize(d.name),
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: 1,
                textTransform: "uppercase",
                lineClamp: 2,
              },
            },
            d.name,
          ),
          meta ? h("div", { style: { display: "flex", color: C.muted, fontSize: 30, fontWeight: 600 } }, meta) : null,
          h("div", { style: { display: "flex", marginTop: 6 } }, rating),
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 24,
            borderTop: `2px solid ${C.border}`,
          },
        },
        h("img", { src: pngUri(d.brandPng), height: 72, width: Math.round((72 * 1800) / 542) }),
        pill([h("span", {}, "Ver la carta"), h("img", { src: ARROW, width: 28, height: 28 })], {
          bg: C.text,
          color: "#141414",
          border: C.text,
        }),
      ),
    ],
    { border: C.gold, glow: true },
  );

  return toPng(tree, d.fonts);
}

/**
 * Tarjeta genérica de la app (inicio, login, perfil…).
 * @param {{ brandPng: Buffer; fonts: import("satori").SatoriOptions["fonts"] }} d
 */
export async function renderAppCard(d) {
  const sample = (score, label) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 26px 14px 14px",
          borderRadius: 24,
          backgroundColor: "#242424",
          border: `2px solid ${C.border}`,
        },
      },
      h(
        "div",
        {
          style: {
            width: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            backgroundColor: ratingColor(score),
            color: "#fff",
            fontSize: 28,
            fontWeight: 900,
          },
        },
        String(score),
      ),
      h("span", { style: { color: C.text, fontSize: 26, fontWeight: 700 } }, label),
    );

  const tree = frame(
    h(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      h("img", { src: pngUri(d.brandPng), width: 600, height: Math.round((600 * 542) / 1800) }),
      h(
        "div",
        {
          style: {
            display: "flex",
            color: C.muted,
            fontSize: 30,
            fontWeight: 600,
            textAlign: "center",
            justifyContent: "center",
            maxWidth: 860,
            lineHeight: 1.35,
            marginTop: 28,
          },
        },
        "Califica cada plato, guarda tus restaurantes y compártelos con tus amigos.",
      ),
      h(
        "div",
        { style: { display: "flex", gap: 20, marginTop: 36 } },
        sample(9, "Bandeja paisa"),
        sample(7, "Hamburguesa"),
        sample(10, "Tiramisú"),
      ),
    ),
    { border: C.gold, glow: true },
  );

  return toPng(tree, d.fonts);
}

async function toPng(tree, fonts) {
  const svg = await satori(tree, { width: OG_W, height: OG_H, fonts });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/** Logo oscuro de la marca → blanco (para fondo oscuro), conservando la transparencia. */
export function whiteBrand(logoBuf) {
  return sharp(logoBuf).negate({ alpha: false }).png().toBuffer();
}

/** Cualquier imagen (AVIF/WebP/JPG/PNG) → PNG cuadrado 472px (2× del tamaño dibujado). */
export function squarePng(buf) {
  return sharp(buf).resize(472, 472, { fit: "cover" }).png().toBuffer();
}

/** Pesos de Montserrat que usa el diseño (archivos .woff de @fontsource). */
export const FONT_WEIGHTS = [600, 700, 800, 900];
