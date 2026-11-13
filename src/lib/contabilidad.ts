import "server-only";

import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyArgentina } from "@/lib/formato";

export type TipoCuenta = "activo" | "pasivo" | "patrimonio_neto" | "ingreso" | "egreso";
export type Libro = "A" | "B";
export type Moneda = "ARS" | "USD";
export type FiltroLibro = "A" | "B" | "AB";

export type Cuenta = {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  cuenta_padre: string | null;
  tipo: TipoCuenta;
  computa: boolean;
  rubro_obra: string | null;
  es_puente: boolean;
  es_diferencia_cambio: boolean;
};

export type CuentaConHijos = Cuenta & { tieneHijos: boolean };

/** Plan de cuentas del proyecto, ordenado por código. */
export async function cargarCuentas(proyectoId: string): Promise<CuentaConHijos[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre, nivel, cuenta_padre, tipo, computa, rubro_obra, es_puente, es_diferencia_cambio")
    .eq("proyecto_id", proyectoId)
    .returns<Cuenta[]>();
  if (error) throw new Error(`No se pudo leer el plan de cuentas: ${error.message}`);
  const padres = new Set((data ?? []).map((c) => c.cuenta_padre).filter(Boolean));
  return (data ?? [])
    .map((c) => ({ ...c, tieneHijos: padres.has(c.id) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

/** Cuenta y todas sus subcuentas. */
export function conDescendientes(cuentas: Cuenta[], id: string): string[] {
  const resultado = [id];
  for (let i = 0; i < resultado.length; i++) {
    for (const c of cuentas) if (c.cuenta_padre === resultado[i]) resultado.push(c.id);
  }
  return resultado;
}

// -----------------------------------------------------------------------------
// Filtros de la pantalla Movimientos (también los usa la exportación a Excel)
// -----------------------------------------------------------------------------

export type FiltrosMovimientos = {
  desde: string;
  hasta: string;
  libro: FiltroLibro;
  cuenta: string;
  q: string;
  moneda: Moneda;
};

type Params = Record<string, string | string[] | undefined>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function primero(valor: string | string[] | undefined) {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

export function leerFiltros(params: Params, verLibroB: boolean): FiltrosMovimientos {
  const hoy = hoyArgentina();
  const desdeDefecto = `${hoy.slice(0, 7)}-01`;
  const desde = FECHA.test(primero(params.desde)) ? primero(params.desde) : desdeDefecto;
  const hasta = FECHA.test(primero(params.hasta)) ? primero(params.hasta) : hoy;
  const libroPedido = primero(params.libro);
  const libro: FiltroLibro = !verLibroB
    ? "A"
    : libroPedido === "A" || libroPedido === "B"
      ? libroPedido
      : "AB";
  return {
    desde,
    hasta,
    libro,
    cuenta: /^[0-9a-f-]{36}$/.test(primero(params.cuenta)) ? primero(params.cuenta) : "",
    q: primero(params.q).slice(0, 80),
    moneda: primero(params.moneda) === "ARS" ? "ARS" : "USD",
  };
}

export function filtrosAQuery(f: Partial<FiltrosMovimientos>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  return p.toString();
}

export type FilaMovimiento = {
  linea_id: string;
  asiento_id: string;
  numero: number;
  fecha: string;
  asiento_detalle: string;
  tipo: string;
  estado: "registrado" | "anulado";
  anula_a: string | null;
  orden: number;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  libro: Libro;
  debe: string;
  haber: string;
  moneda: Moneda;
  importe_origen: string;
  tc: string;
  tc_manual: boolean;
  tc_referencia: string | null;
  importe_ars: string;
  importe_usd: string;
  neto_ars: string;
  neto_usd: string;
  linea_detalle: string | null;
  contracuenta: string | null;
};

/** Supabase devuelve como máximo 1.000 filas por consulta (max_rows). */
export const LIMITE_MOVIMIENTOS = 1000;

/**
 * Líneas visibles según los filtros. La RLS de la base decide qué se ve.
 * Con `todo` recorre todas las páginas (para exportar).
 */
export async function buscarMovimientos(
  proyectoId: string,
  f: FiltrosMovimientos,
  cuentas: Cuenta[],
  opciones: { todo?: boolean } = {},
): Promise<{ filas: FilaMovimiento[]; total: number; error?: string }> {
  const supabase = await crearClienteServidor();

  const consultar = (desde: number) => {
    let consulta = supabase
      .from("movimientos")
      .select("*", { count: desde === 0 ? "exact" : undefined })
      .eq("proyecto_id", proyectoId)
      .gte("fecha", f.desde)
      .lte("fecha", f.hasta);
    if (f.libro !== "AB") consulta = consulta.eq("libro", f.libro);
    if (f.cuenta) consulta = consulta.in("cuenta_id", conDescendientes(cuentas, f.cuenta));
    if (f.q) {
      const q = f.q.replace(/[,()*%"\\]/g, " ").trim();
      if (q) consulta = consulta.or(`asiento_detalle.ilike."*${q}*",linea_detalle.ilike."*${q}*"`);
    }
    return consulta
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .order("libro")
      .order("orden")
      .range(desde, desde + LIMITE_MOVIMIENTOS - 1)
      .returns<FilaMovimiento[]>();
  };

  const primera = await consultar(0);
  if (primera.error) return { filas: [], total: 0, error: primera.error.message };
  const filas = [...(primera.data ?? [])];
  const total = primera.count ?? filas.length;

  while (opciones.todo && filas.length < total) {
    const pagina = await consultar(filas.length);
    if (pagina.error) return { filas: [], total: 0, error: pagina.error.message };
    if (!pagina.data?.length) break;
    filas.push(...pagina.data);
  }
  return { filas, total };
}

/** Traduce los errores de la base (RAISE EXCEPTION) a un mensaje para la pantalla. */
export function mensajeDeError(error: { message?: string; code?: string } | null): string {
  if (!error) return "";
  if (error.code === "42501" && !/[áéíóúñ]/i.test(error.message ?? "")) {
    return "No tenés permiso para hacer esto.";
  }
  if (error.code === "23505") return "Ya existe un registro con esos datos.";
  return error.message ?? "No se pudo completar la operación.";
}
