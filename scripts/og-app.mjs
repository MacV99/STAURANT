// Genera los recursos de la vista previa al compartir (Open Graph):
//   netlify/lib/og-assets.mjs ← fuentes, logo blanco y resvg.wasm en base64.
//     Van DENTRO de la función: en Netlify no puede leer archivos ni pedirse
//     recursos a sí misma.
//   public/img/og-app.png     ← imagen fija de la app.
// Uso: node scripts/og-app.mjs  (re-ejecutar si cambia el diseño o el logo)
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import sharp from "sharp";
import { initRenderer, renderAppCard, FONT_WEIGHTS } from "../netlify/lib/og-render.mjs";

const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
const brandPng = await sharp(await readFile("public/img/logo2.png"))
  .negate({ alpha: false })
  .png()
  .toBuffer();
const fontFiles = await Promise.all(
  FONT_WEIGHTS.map((w) =>
    readFile(require.resolve(`@fontsource/montserrat/files/montserrat-latin-${w}-normal.woff`)),
  ),
);

const b64 = (buf) => JSON.stringify(buf.toString("base64"));
await writeFile(
  "netlify/lib/og-assets.mjs",
  `// GENERADO por scripts/og-app.mjs — no editar a mano.\n` +
    `export const BRAND_PNG = ${b64(brandPng)};\n` +
    `export const FONTS = {\n${FONT_WEIGHTS.map((w, i) => `  ${w}: ${b64(fontFiles[i])},`).join("\n")}\n};\n` +
    `export const RESVG_WASM = ${b64(wasm)};\n`,
);

await initRenderer(wasm);
const fonts = FONT_WEIGHTS.map((weight, i) => ({
  name: "Montserrat",
  weight,
  style: "normal",
  data: fontFiles[i],
}));
await writeFile("public/img/og-app.png", await renderAppCard({ brandPng, fonts }));
console.log("netlify/lib/og-assets.mjs y public/img/og-app.png listos");
