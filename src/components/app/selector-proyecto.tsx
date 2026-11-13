import { obtenerContexto } from "@/lib/contexto";
import { FIGURAS } from "@/lib/etiquetas";

import { SelectorProyectoCliente } from "./selector-proyecto-cliente";

/** Selector del proyecto activo (lee los proyectos del usuario). */
export async function SelectorProyecto() {
  const { proyectos, proyecto } = await obtenerContexto();
  return (
    <SelectorProyectoCliente
      proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre, figura: FIGURAS[p.figura] }))}
      activoId={proyecto?.id ?? null}
    />
  );
}

export function SelectorProyectoEsqueleto() {
  return <div className="h-[58px] animate-pulse rounded-2xl border border-black/5 bg-black/[0.03]" />;
}
