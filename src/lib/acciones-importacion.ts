"use server";

import { revalidatePath } from "next/cache";

import { mensajeDeError } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import type { CuentaExistente, FilaPlan, Salteadas } from "@/lib/importacion/planilla";
import { crearClienteServidor } from "@/lib/supabase/servidor";

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function soloAdministrador() {
  const ctx = await obtenerContexto();
  if (!ctx.proyecto || !ctx.permisos.administrar) {
    throw new Error("Solo un administrador del proyecto puede importar.");
  }
  return ctx;
}

async function envolver<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DatosImportacion = {
  proyecto: { id: string; nombre: string };
  verLibroB: boolean;
  cuentas: CuentaExistente[];
  idsExistentes: string[];
  mesesCerrados: string[]; // "aaaa-mm"
};

/** Plan de cuentas actual, IDs ya importados y meses cerrados del proyecto activo. */
export async function datosParaImportar(): Promise<Resultado<DatosImportacion>> {
  return envolver(async () => {
    const { proyecto, permisos } = await soloAdministrador();
    const supabase = await crearClienteServidor();

    const { data: cuentas, error: e1 } = await supabase
      .from("cuentas")
      .select("id, codigo, nombre, cuenta_padre, es_puente, es_diferencia_cambio")
      .eq("proyecto_id", proyecto!.id)
      .range(0, 4999)
      .returns<CuentaExistente[]>();
    if (e1) throw new Error(mensajeDeError(e1));

    // IDs ya importados (de a 1.000, que es el máximo por consulta).
    const ids: string[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("asientos")
        .select("origen_id")
        .eq("proyecto_id", proyecto!.id)
        .not("origen_id", "is", null)
        .order("origen_id")
        .range(desde, desde + 999)
        .returns<{ origen_id: string }[]>();
      if (error) throw new Error(mensajeDeError(error));
      ids.push(...(data ?? []).map((a) => a.origen_id));
      if (!data || data.length < 1000) break;
    }

    const { data: cierres } = await supabase
      .from("cierres")
      .select("mes")
      .eq("proyecto_id", proyecto!.id)
      .returns<{ mes: string }[]>();

    return {
      proyecto: { id: proyecto!.id, nombre: proyecto!.nombre },
      verLibroB: permisos.verLibroB,
      cuentas: cuentas ?? [],
      idsExistentes: ids,
      mesesCerrados: (cierres ?? []).map((c) => c.mes.slice(0, 7)),
    };
  });
}

export async function importarPlan(filas: FilaPlan[]) {
  return envolver(async () => {
    const { proyecto } = await soloAdministrador();
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("importar_plan_cuentas", { p_proyecto: proyecto!.id, p_filas: filas });
    if (error) throw new Error(mensajeDeError(error));
    revalidatePath("/plan-de-cuentas");
    return data as { creadas: number; existian: number };
  });
}

export async function iniciarLote(archivo: string, salteadas: Salteadas & { ya_importadas: number }) {
  return envolver(async () => {
    const { proyecto } = await soloAdministrador();
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("iniciar_importacion", {
      p_proyecto: proyecto!.id,
      p_archivo: archivo,
      p_salteadas: salteadas,
    });
    if (error) throw new Error(mensajeDeError(error));
    return data as string;
  });
}

export type FilaParaImportar = {
  id: string;
  origen: string;
  fecha: string;
  detalle: string;
  libro: "A" | "B";
  cuenta_id: string;
  contracuenta_id: string;
  neto: string;
  usd: string;
  tc: string;
  tc_manual: boolean;
  moneda_cuenta: "ARS" | "USD";
  moneda_contracuenta: "ARS" | "USD";
};

export async function importarTanda(loteId: string, filas: FilaParaImportar[]) {
  return envolver(async () => {
    const { proyecto } = await soloAdministrador();
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("importar_movimientos", {
      p_proyecto: proyecto!.id,
      p_lote: { lote_id: loteId, filas },
    });
    if (error) throw new Error(mensajeDeError(error));
    return data as { importadas: number; existentes: number };
  });
}

export type LoteFinalizado = {
  id: string;
  archivo: string;
  filas_importadas: number;
  filas_existentes: number;
  filas_salteadas: Salteadas;
  total_ars: Record<string, number> | null;
  total_usd: Record<string, number> | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
};

export async function finalizarLote(loteId: string) {
  return envolver(async () => {
    await soloAdministrador();
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("finalizar_importacion", { p_lote: loteId });
    if (error) throw new Error(mensajeDeError(error));
    revalidatePath("/movimientos");
    return data as LoteFinalizado;
  });
}

export async function deshacerLote(loteId: string) {
  return envolver(async () => {
    await soloAdministrador();
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("deshacer_lote", { p_lote: loteId });
    if (error) throw new Error(mensajeDeError(error));
    return data as { asientos_borrados: number };
  });
}

// -----------------------------------------------------------------------------
// Control de totales: saldos por NIVEL 1 y NIVEL 2, por libro A, B y A+B
// -----------------------------------------------------------------------------

export type FilaControl = {
  codigo: string;
  nombre: string;
  nivel: number;
  a_ars: number;
  a_usd: number;
  b_ars: number;
  b_usd: number;
  ab_ars: number;
  ab_usd: number;
};

export async function controlDeTotales(hasta: string | null) {
  return envolver(async () => {
    const { proyecto, permisos } = await obtenerContexto();
    if (!proyecto || !permisos.verMovimientos) throw new Error("No tenés acceso a los movimientos de este proyecto.");
    const supabase = await crearClienteServidor();

    const combinaciones = [
      ["A", "ARS", "a_ars"],
      ["A", "USD", "a_usd"],
      ["B", "ARS", "b_ars"],
      ["B", "USD", "b_usd"],
      ["AB", "ARS", "ab_ars"],
      ["AB", "USD", "ab_usd"],
    ] as const;

    const resultados = await Promise.all(
      combinaciones.map(([libros, moneda]) =>
        supabase.rpc("balance_sumas_saldos", {
          p_proyecto: proyecto.id,
          p_libros: libros,
          p_moneda: moneda,
          p_desde: null,
          p_hasta: hasta,
        }),
      ),
    );

    const filas = new Map<string, FilaControl>();
    resultados.forEach((r, i) => {
      if (r.error) throw new Error(mensajeDeError(r.error));
      const campo = combinaciones[i][2];
      for (const c of (r.data ?? []) as { codigo: string; nombre: string; nivel: number; saldo: string }[]) {
        if (c.nivel > 2) continue;
        const fila =
          filas.get(c.codigo) ??
          { codigo: c.codigo, nombre: c.nombre, nivel: c.nivel, a_ars: 0, a_usd: 0, b_ars: 0, b_usd: 0, ab_ars: 0, ab_usd: 0 };
        fila[campo] = Number(c.saldo);
        filas.set(c.codigo, fila);
      }
    });

    return {
      hasta,
      proyecto: proyecto.nombre,
      verLibroB: permisos.verLibroB,
      filas: [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })),
    };
  });
}
