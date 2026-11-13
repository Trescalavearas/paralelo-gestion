import { Suspense } from "react";
import type { Metadata } from "next";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando } from "@/components/app/estados";
import { Panel } from "@/components/contabilidad/campos";
import { FormularioCotizacion } from "@/components/contabilidad/formulario-cotizacion";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearTC, hoyArgentina } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Tipo de cambio" };

type Cotizacion = {
  fecha: string;
  tipo: "mep" | "blue" | "oficial";
  compra: string;
  venta: string;
  fuente: string;
  cargada_por: string | null;
};

const TIPOS = ["mep", "blue", "oficial"] as const;
const NOMBRES = { mep: "MEP", blue: "Blue", oficial: "Oficial" };
const DIAS = 45;

export default function PaginaTipoDeCambio() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Tipo de cambio"
        descripcion="Los asientos usan el MEP (venta) del día, o el del último día con cotización si fue feriado o fin de semana."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const { usuarioId, proyectos } = await obtenerContexto();
  const puedeCargar = proyectos.some((p) => p.rol === "administrador" || p.rol === "contador");
  const hoy = hoyArgentina();
  const desde = new Date(`${hoy}T12:00:00`);
  desde.setDate(desde.getDate() - DIAS);

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("fecha, tipo, compra, venta, fuente, cargada_por")
    .gte("fecha", desde.toISOString().slice(0, 10))
    .order("fecha", { ascending: false })
    .returns<Cotizacion[]>();

  const porFecha = new Map<string, Partial<Record<Cotizacion["tipo"], Cotizacion>>>();
  for (const c of data ?? []) porFecha.set(c.fecha, { ...porFecha.get(c.fecha), [c.tipo]: c });
  const fechas = [...porFecha.keys()];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Panel className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-800">No se pudieron leer las cotizaciones.</p>
        ) : fechas.length === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">
            No hay cotizaciones de los últimos {DIAS} días. Revisá la carga automática (README) o cargalas a mano.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
                <th className="px-5 py-3 font-medium" rowSpan={2}>
                  Fecha
                </th>
                {TIPOS.map((t) => (
                  <th key={t} colSpan={2} className="px-3 pt-3 pb-1 text-center font-medium">
                    {NOMBRES[t]}
                  </th>
                ))}
                <th className="px-5 py-3 font-medium" rowSpan={2}>
                  Origen
                </th>
              </tr>
              <tr className="text-muted-foreground border-b border-black/5 text-xs">
                {TIPOS.map((t) => [
                  <th key={`${t}c`} className="px-3 pb-2 text-right font-normal">
                    compra
                  </th>,
                  <th key={`${t}v`} className="px-3 pb-2 text-right font-normal">
                    venta
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {fechas.map((f) => {
                const fila = porFecha.get(f)!;
                const fuentes = new Set(
                  TIPOS.map((t) => fila[t]).filter(Boolean).map((c) => (c!.cargada_por ? (c!.cargada_por === usuarioId ? "manual (vos)" : "manual") : c!.fuente)),
                );
                return (
                  <tr key={f}>
                    <td className="px-5 py-2.5 font-mono tabular-nums">{formatearFecha(f)}</td>
                    {TIPOS.map((t) => [
                      <td key={`${t}c`} className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {fila[t] ? formatearTC(fila[t]!.compra) : "—"}
                      </td>,
                      <td key={`${t}v`} className={`px-3 py-2.5 text-right font-mono tabular-nums ${t === "mep" ? "font-semibold" : ""}`}>
                        {fila[t] ? formatearTC(fila[t]!.venta) : "—"}
                      </td>,
                    ])}
                    <td className="text-muted-foreground px-5 py-2.5 text-xs">{[...fuentes].join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="h-fit p-6">
        <h2 className="mb-4 text-sm font-medium">Carga manual</h2>
        {puedeCargar ? (
          <FormularioCotizacion hoy={hoy} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Solo un administrador o un contador puede cargar cotizaciones.
          </p>
        )}
      </Panel>
    </div>
  );
}
