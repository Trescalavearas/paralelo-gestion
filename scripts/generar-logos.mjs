/**
 * Genera los logos que usa la app a partir de los originales de public/marca/.
 *
 *   npm run logos
 *
 * Para cada original (negro sobre blanco):
 *   1. Lo apoya sobre blanco (por si ya trae transparencia).
 *   2. Convierte el blanco en transparencia: cada píxel queda NEGRO PURO y su
 *      opacidad sale de qué tan oscuro era (blanco = 0, negro = 255). Así los
 *      bordes suavizados quedan como negro semitransparente, sin halos grises.
 *   3. Recorta al contenido, deja un margen chico y reduce el tamaño.
 *
 * Los originales no se tocan.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");

const LOGOS = [
  {
    origen: "public/marca/logotipo/image.png",
    destino: "public/paralelo-logotipo.png",
    margen: 0.03, // proporción del lado mayor del contenido
    anchoMaximo: 1200,
    altoMaximo: 1200,
  },
  {
    origen: "public/marca/isotipo/image.png",
    destino: "public/paralelo-isotipo.png",
    margen: 0.03,
    anchoMaximo: 512,
    altoMaximo: 512,
  },
];

/** Umbral de opacidad para decidir qué es contenido al recortar (0-255). */
const UMBRAL_CONTENIDO = 8;

async function generar({ origen, destino, margen, anchoMaximo, altoMaximo }) {
  // 1 y 2: gris sobre blanco → opacidad (255 - gris).
  const { data: gris, info } = await sharp(path.join(RAIZ, origen))
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: ancho, height: alto } = info;
  const rgba = Buffer.alloc(ancho * alto * 4); // RGB en 0 = negro puro
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      const opacidad = 255 - gris[i];
      rgba[i * 4 + 3] = opacidad;
      if (opacidad > UMBRAL_CONTENIDO) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(`${origen}: no se encontró contenido oscuro.`);

  // 3: recorte con margen chico.
  const m = Math.round(Math.max(x1 - x0 + 1, y1 - y0 + 1) * margen);
  const left = Math.max(0, x0 - m);
  const top = Math.max(0, y0 - m);
  const width = Math.min(ancho, x1 + m + 1) - left;
  const height = Math.min(alto, y1 + m + 1) - top;

  const destinoAbs = path.join(RAIZ, destino);
  await mkdir(path.dirname(destinoAbs), { recursive: true });

  const salida = await sharp(rgba, { raw: { width: ancho, height: alto, channels: 4 } })
    .extract({ left, top, width, height })
    .resize({ width: anchoMaximo, height: altoMaximo, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toFile(destinoAbs);

  console.log(`${destino}: ${salida.width}×${salida.height} px, ${(salida.size / 1024).toFixed(1)} KB`);
}

for (const logo of LOGOS) {
  await generar(logo);
}
