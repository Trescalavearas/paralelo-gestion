import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, SinPermiso, SinProyecto } from "@/components/app/estados";
import { Panel } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { cerrarMes, reabrirMes } from "@/lib/acciones-contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearMes, hoyArgentina } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Cierres de mes" };

const MESES_A_MOSTRAR = 18;

export default function PaginaCierres() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/movimientos" className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>
      <EncabezadoSeccion
        titulo="Cierres de mes"
        descripcion="En un mes cerrado no se registran asientos ni se anulan con esa fecha. Cerrar y reabrir: solo administradores."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

type Cierre = { mes: string; cerrado_en: string; perfiles: { nombre: string } | null };

async function Contenido() {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  if (!permisos.verMovimientos) return <SinPermiso />;

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cierres")
    .select("mes, cerrado_en, perfiles (nombre)")
    .eq("proyecto_id", proyecto.id)
    .returns<Cierre[]>();
  const cierres = new Map((data ?? []).map((c) => [c.mes, c]));

  // Últimos meses (del actual hacia atrás) y cualquier mes cerrado más viejo.
  const hoy = hoyArgentina();
  const meses = new Set<string>();
  const [anio, mes] = hoy.split("-").map(Number);
  for (let i = 0; i < MESES_A_MOSTRAR; i++) {
    const d = new Date(anio, mes - 1 - i, 1);
    meses.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  for (const m of cierres.keys()) meses.add(m);
  const lista = [...meses].sort().reverse();

  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
            <th className="px-5 py-3 font-medium">Mes</th>
            <th className="px-3 py-3 font-medium">Estado</th>
            <th className="px-3 py-3 font-medium">Cerrado por</th>
            <th className="px-5 py-3 text-right font-medium">{permisos.administrar ? "Acción" : ""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {lista.map((m) => {
            const c = cierres.get(m);
            return (
              <tr key={m}>
                <td className="px-5 py-2.5 first-letter:uppercase">{formatearMes(m.slice(0, 7))}</td>
                <td className="px-3 py-2.5">
                  {c ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Lock className="text-naranja size-3.5" />
                      Cerrado
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Abierto</span>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-xs">
                  {c ? `${c.perfiles?.nombre || "—"} · ${formatearFecha(new Date(c.cerrado_en))}` : ""}
                </td>
                <td className="px-5 py-1.5 text-right">
                  {permisos.administrar ? (
                    <form action={c ? reabrirMes : cerrarMes}>
                      <input type="hidden" name="mes" value={m} />
                      <Button type="submit" variant={c ? "outline" : "default"} size="sm" className={c ? "bg-white" : ""}>
                        {c ? <LockOpen /> : <Lock />}
                        {c ? "Reabrir" : "Cerrar"}
                      </Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
