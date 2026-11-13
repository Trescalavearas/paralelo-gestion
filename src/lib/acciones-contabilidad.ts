"use server";

import { revalidatePath } from "next/cache";

import { obtenerContexto } from "@/lib/contexto";
import { mensajeDeError } from "@/lib/contabilidad";
import { parsearImporte } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type Resultado = { ok?: string; error?: string };

function texto(formData: FormData, campo: string) {
  const v = formData.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// -----------------------------------------------------------------------------
// Plan de cuentas
// -----------------------------------------------------------------------------

const TIPOS_CUENTA = ["activo", "pasivo", "patrimonio_neto", "ingreso", "egreso"];

function errorDeCuenta(error: { message?: string; code?: string; details?: string }) {
  const m = `${error.message ?? ""} ${error.details ?? ""}`;
  if (m.includes("cuentas_una_puente_por_proyecto")) return "Ya hay una cuenta puente en este proyecto.";
  if (m.includes("cuentas_una_diferencia_por_proyecto"))
    return "Ya hay una cuenta de diferencia de cambio en este proyecto.";
  if (m.includes("cuentas_proyecto_id_codigo_key")) return "Ya existe una cuenta con ese código.";
  if (m.includes("cuentas_puente_o_diferencia"))
    return "Una cuenta no puede ser puente y de diferencia de cambio a la vez.";
  if (m.includes("nivel between 1 and 4") || m.includes("cuentas_nivel_check"))
    return "El plan de cuentas admite hasta cuatro niveles.";
  return mensajeDeError(error);
}

export async function guardarCuenta(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto || !permisos.administrar) {
    return { error: "Solo un administrador del proyecto puede modificar el plan de cuentas." };
  }

  const id = texto(formData, "id");
  const codigo = texto(formData, "codigo");
  const nombre = texto(formData, "nombre");
  const tipo = texto(formData, "tipo");
  const padre = texto(formData, "cuenta_padre");
  const datos = {
    codigo,
    nombre,
    tipo,
    computa: formData.get("computa") === "on",
    rubro_obra: texto(formData, "rubro_obra") || null,
    es_puente: formData.get("es_puente") === "on",
    es_diferencia_cambio: formData.get("es_diferencia_cambio") === "on",
  };

  if (!codigo || !nombre) return { error: "Completá el código y el nombre." };
  if (!TIPOS_CUENTA.includes(tipo)) return { error: "Elegí el tipo de cuenta." };

  const supabase = await crearClienteServidor();

  if (id) {
    const { error } = await supabase.from("cuentas").update(datos).eq("id", id).eq("proyecto_id", proyecto.id);
    if (error) return { error: errorDeCuenta(error) };
  } else {
    let nivel = 1;
    if (padre) {
      const { data: madre } = await supabase
        .from("cuentas")
        .select("nivel")
        .eq("id", padre)
        .eq("proyecto_id", proyecto.id)
        .maybeSingle();
      if (!madre) return { error: "La cuenta madre no existe." };
      nivel = madre.nivel + 1;
      if (nivel > 4) return { error: "El plan de cuentas admite hasta cuatro niveles." };
    }
    const { error } = await supabase
      .from("cuentas")
      .insert({ ...datos, proyecto_id: proyecto.id, cuenta_padre: padre || null, nivel });
    if (error) return { error: errorDeCuenta(error) };
  }

  revalidatePath("/plan-de-cuentas");
  return { ok: id ? "Cuenta actualizada." : "Cuenta creada." };
}

// -----------------------------------------------------------------------------
// Cotizaciones
// -----------------------------------------------------------------------------

export async function guardarCotizacion(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const fecha = texto(formData, "fecha");
  const tipo = texto(formData, "tipo");
  const compra = parsearImporte(texto(formData, "compra"));
  const venta = parsearImporte(texto(formData, "venta"));

  if (!FECHA.test(fecha)) return { error: "Elegí la fecha." };
  if (!["mep", "blue", "oficial"].includes(tipo)) return { error: "Elegí el tipo de dólar." };
  if (!compra || !venta || Number(compra) <= 0 || Number(venta) <= 0) {
    return { error: "Completá compra y venta con valores mayores que cero (por ejemplo 1.234,50)." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("cotizaciones")
    .upsert({ fecha, tipo, compra, venta }, { onConflict: "fecha,tipo" });
  if (error) {
    if (error.code === "42501") {
      return { error: "Solo un administrador o un contador puede cargar cotizaciones." };
    }
    return { error: mensajeDeError(error) };
  }

  revalidatePath("/tipo-de-cambio");
  return { ok: "Cotización guardada." };
}

// -----------------------------------------------------------------------------
// Asientos
// -----------------------------------------------------------------------------

export type LineaEntrada = {
  cuenta_id: string;
  libro: "A" | "B";
  lado: "debe" | "haber";
  importe: string;
  moneda: "ARS" | "USD";
  tc?: string;
  detalle?: string;
};

export type LineaCalculada = {
  orden: number;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  libro: "A" | "B";
  debe: number;
  haber: number;
  moneda: "ARS" | "USD";
  importe_origen: number;
  tc: number;
  tc_manual: boolean;
  tc_referencia: number | null;
  importe_ars: number;
  importe_usd: number;
  detalle: string | null;
  generada: "puente" | "diferencia" | null;
};

export type TipoAsiento = "pago" | "cobro" | "traspaso_cajas" | "traspaso_libros" | "ajuste" | "manual";

const TIPOS_ASIENTO: TipoAsiento[] = ["pago", "cobro", "traspaso_cajas", "traspaso_libros", "ajuste", "manual"];

function validarEntrada(fecha: string, tipo: string, lineas: LineaEntrada[]): string | null {
  if (!FECHA.test(fecha)) return "Elegí la fecha.";
  if (!TIPOS_ASIENTO.includes(tipo as TipoAsiento)) return "Elegí el tipo de asiento.";
  if (!Array.isArray(lineas) || lineas.length < 2) return "El asiento necesita al menos dos líneas.";
  return null;
}

export async function previsualizarAsiento(
  fecha: string,
  tipo: TipoAsiento,
  lineas: LineaEntrada[],
): Promise<{ lineas?: LineaCalculada[]; error?: string }> {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto || !permisos.registrar) return { error: "No tenés permiso para registrar asientos." };
  const invalido = validarEntrada(fecha, tipo, lineas);
  if (invalido) return { error: invalido };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("previsualizar_asiento", {
    p_proyecto: proyecto.id,
    p_fecha: fecha,
    p_tipo: tipo,
    p_lineas: lineas,
  });
  if (error) return { error: mensajeDeError(error) };
  return { lineas: data as LineaCalculada[] };
}

export async function registrarAsiento(
  fecha: string,
  detalle: string,
  tipo: TipoAsiento,
  lineas: LineaEntrada[],
): Promise<{ numero?: number; error?: string }> {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto || !permisos.registrar) return { error: "No tenés permiso para registrar asientos." };
  const invalido = validarEntrada(fecha, tipo, lineas);
  if (invalido) return { error: invalido };
  if (!detalle.trim()) return { error: "Escribí el detalle del asiento." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_asiento", {
    p_proyecto: proyecto.id,
    p_fecha: fecha,
    p_detalle: detalle.trim(),
    p_tipo: tipo,
    p_lineas: lineas,
  });
  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/movimientos");
  revalidatePath("/informes");
  return { numero: (data as { numero: number }).numero };
}

export async function anularAsiento(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const asiento = texto(formData, "asiento");
  const motivo = texto(formData, "motivo");
  if (!motivo) return { error: "Escribí el motivo de la anulación." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("anular_asiento", { p_asiento: asiento, p_motivo: motivo });
  if (error) return { error: mensajeDeError(error) };

  // Sin revalidatePath: refrescaría la página y cerraría el diálogo antes de
  // mostrar la confirmación. La lista se refresca al cerrarlo (router.refresh).
  return { ok: `Anulado. Se registró el contra-asiento N° ${(data as { numero: number }).numero}.` };
}

// -----------------------------------------------------------------------------
// Cierres de mes
// -----------------------------------------------------------------------------

export async function cerrarMes(formData: FormData): Promise<void> {
  const { proyecto, permisos } = await obtenerContexto();
  const mes = texto(formData, "mes");
  if (!proyecto || !permisos.administrar || !/^\d{4}-\d{2}-01$/.test(mes)) return;
  const supabase = await crearClienteServidor();
  await supabase.from("cierres").insert({ proyecto_id: proyecto.id, mes });
  revalidatePath("/movimientos/cierres");
}

export async function reabrirMes(formData: FormData): Promise<void> {
  const { proyecto, permisos } = await obtenerContexto();
  const mes = texto(formData, "mes");
  if (!proyecto || !permisos.administrar || !/^\d{4}-\d{2}-01$/.test(mes)) return;
  const supabase = await crearClienteServidor();
  await supabase.from("cierres").delete().eq("proyecto_id", proyecto.id).eq("mes", mes);
  revalidatePath("/movimientos/cierres");
}
