/**
 * Formatos de pantalla para Argentina (es-AR).
 * Fechas dd/mm/aaaa y números 1.234,56.
 */

const LOCALE = "es-AR";

/** Fecha en formato dd/mm/aaaa. Acepta Date o cadena ISO (aaaa-mm-dd). */
export function formatearFecha(valor: Date | string): string {
  const fecha =
    typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T00:00:00`)
      : new Date(valor);
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fecha);
}

/**
 * Número con separador de miles "." y decimales ",".
 * Los importes llegan de la base como string (numeric) para no perder precisión.
 */
export function formatearNumero(valor: number | string, decimales = 2): string {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(numero);
}

export type Moneda = "ARS" | "USD";

/** Importe con símbolo de moneda: "$ 1.234,56" o "US$ 1.234,56". */
export function formatearMoneda(valor: number | string, moneda: Moneda): string {
  const simbolo = moneda === "USD" ? "US$" : "$";
  return `${simbolo} ${formatearNumero(valor)}`;
}

/** Tipo de cambio: dos decimales, o hasta cuatro si los tiene (1.234,5678). */
export function formatearTC(valor: number | string): string {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numero);
}

/**
 * Lee un importe escrito a mano: "1.234,56", "1234,56", "50.000" (miles) o
 * "1234.5" (punto decimal, si no son grupos de tres cifras).
 * Devuelve el número como texto con punto decimal (para la base) o null.
 */
export function parsearImporte(texto: string): string | null {
  const limpio = texto.replace(/\s|\$|US\$/g, "");
  if (!limpio) return null;
  let normalizado: string;
  if (limpio.includes(",")) {
    // Formato argentino: el punto separa miles y la coma los decimales.
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) {
    // "50.000" o "1.234.567": en Argentina el punto separa miles.
    normalizado = limpio.replace(/\./g, "");
  } else {
    normalizado = limpio;
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  return normalizado;
}

/** Fecha de hoy en Argentina, en formato aaaa-mm-dd. */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "2026-11" → "noviembre de 2026". */
export function formatearMes(valor: string): string {
  const [anio, mes] = valor.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(
    new Date(anio, mes - 1, 1),
  );
}
