// Genera los recursos de vista previa al compartir (Open Graph):
//   public/og/logo-white.png  ← logo de la marca en blanco (lo usa la function)
//   public/img/og-app.png     ← imagen fija de la app
// Uso: node scripts/og-app.mjs  (re-ejecutar si cambia el diseño o el logo)
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { initRenderer, renderAppCard, FONT_WEIGHTS } from "../netlify/lib/og-render.mjs";

const brandPng = await sharp(await readFile("public/img/logo2.png"))
  .negate({ alpha: false })
  .png()
  .toBuffer();
await writeFile("public/og/logo-white.png", brandPng);

await initRenderer(await readFile("public/og/resvg.wasm"));
const fonts = await Promise.all(
  FONT_WEIGHTS.map(async (weight) => ({
    name: "Montserrat",
    weight,
    style: "normal",
    data: await readFile(`public/og/montserrat-latin-${weight}-normal.woff`),
  })),
);
await writeFile("public/img/og-app.png", await renderAppCard({ brandPng, fonts }));
console.log("public/og/logo-white.png y public/img/og-app.png listos");
