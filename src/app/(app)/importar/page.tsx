import { Suspense } from "react";
import type { Metadata } from "next";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, SinPermiso, SinProyecto } from "@/components/app/estados";
import { Panel } from "@/components/contabilidad/campos";
import { BotonDeshacer } from "@/components/importacion/boton-deshacer";
import { Importador } from "@/components/importacion/importador";
import { TablaControl } from "@/components/importacion/tabla-control";
import { controlDeTotales } from "@/lib/acciones-importacion";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearNumero } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Importar" };

export default function PaginaImportar() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Importar"
        descripcion="Plan de cuentas y movimientos desde la planilla. Reimportar el mismo archivo solo agrega las filas nuevas."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

type Lote = {
  id: string;
  archivo: string;
  estado: "en_curso" | "completo" | "deshecho";
  creado_en: string;
  filas_importadas: number;
  filas_existentes: number;
  filas_salteadas: Record<string, number>;
  total_ars: Record<string, number> | null;
  total_usd: Record<string, number> | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  creador: { nombre: string } | null;
};

const ESTADOS = { en_curso: "Incompleto", completo: "Completo", deshecho: "Deshecho" };

async function Contenido() {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  if (!permisos.administrar) return <SinPermiso texto="Solo un administrador del proyecto puede importar." />;

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes_importacion")
    .select("id, archivo, estado, creado_en, filas_importadas, filas_existentes, filas_salteadas, total_ars, total_usd, fecha_desde, fecha_hasta, creador:perfiles!creado_por (nombre)")
    .eq("proyecto_id", proyecto.id)
    .order("creado_en", { ascending: false })
    .limit(50)
    .returns<Lote[]>();
  const lotes = data ?? [];
  const ultimo = lotes.find((l) => l.estado !== "deshecho" && l.fecha_hasta);
  const control = ultimo ? await controlDeTotales(ultimo.fecha_hasta) : null;

  return (
    <div className="flex flex-col gap-6">
      <Importador />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Historial de importaciones</h2>
        <Panel className="overflow-x-auto">
          {lotes.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">Todavía no se importó nada en este proyecto.</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
                  <th className="px-5 py-2.5 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">Archivo</th>
                  <th className="px-3 py-2.5 text-right font-medium">Importadas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ya estaban</th>
                  <th className="px-3 py-2.5 text-right font-medium">Salteadas</th>
                  <th className="px-3 py-2.5 text-right font-medium">ARS (A + B)</th>
                  <th className="px-3 py-2.5 text-right font-medium">USD (A + B)</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {lotes.map((l) => {
                  const suma = (t: Record<string, number> | null) => Object.values(t ?? {}).reduce((s, v) => s + Number(v), 0);
                  const { ya_importadas: ya = 0, ...motivos } = l.filas_salteadas ?? {};
                  const salteadas = Object.values(motivos).reduce((s, v) => s + Number(v), 0);
                  const yaEstaban = l.filas_existentes + Number(ya);
                  return (
                    <tr key={l.id} className={cn(l.estado === "deshecho" && "text-muted-foreground")}>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <span className="font-mono tabular-nums">{formatearFecha(new Date(l.creado_en))}</span>
                        <span className="text-muted-foreground block text-xs">{l.creador?.nombre ?? ""}</span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5" title={l.archivo}>
                        {l.archivo}
                        {l.fecha_desde ? (
                          <span className="text-muted-foreground block text-xs">
                            {formatearFecha(l.fecha_desde)} – {formatearFecha(l.fecha_hasta!)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatearNumero(l.filas_importadas, 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatearNumero(yaEstaban, 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatearNumero(salteadas, 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{l.total_ars ? formatearNumero(suma(l.total_ars)) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{l.total_usd ? formatearNumero(suma(l.total_usd)) : "—"}</td>
                      <td className="px-3 py-2.5">{ESTADOS[l.estado]}</td>
                      <td className="px-5 py-1.5 text-right">
                        {l.estado !== "deshecho" && l.filas_importadas > 0 ? (
                          <BotonDeshacer loteId={l.id} archivo={l.archivo} filas={l.filas_importadas} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </section>

      {control?.ok ? (
        <section id="control-de-totales" className="flex scroll-mt-4 flex-col gap-3">
          <h2 className="text-sm font-medium">Control de totales (a la fecha del último movimiento importado)</h2>
          <TablaControl {...control.datos} />
        </section>
      ) : null}
    </div>
  );
}
