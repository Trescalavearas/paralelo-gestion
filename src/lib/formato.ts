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
