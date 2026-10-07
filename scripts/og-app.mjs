// Genera la imagen fija de vista previa de la app → public/img/og-app.png
// Uso: node scripts/og-app.mjs  (re-ejecutar si cambia el diseño o el logo)
import { readFile, writeFile } from "node:fs/promises";
import { renderAppCard, whiteBrand, FONT_WEIGHTS } from "../netlify/lib/og-render.mjs";

const fonts = await Promise.all(
  FONT_WEIGHTS.map(async (weight) => ({
    name: "Montserrat",
    weight,
    style: "normal",
    data: await readFile(`public/fonts/montserrat-latin-${weight}-normal.woff`),
  })),
);
const brandPng = await whiteBrand(await readFile("public/img/logo2.png"));
await writeFile("public/img/og-app.png", await renderAppCard({ brandPng, fonts }));
console.log("public/img/og-app.png listo");
