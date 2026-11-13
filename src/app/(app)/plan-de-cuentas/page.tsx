import { Suspense } from "react";
import type { Metadata } from "next";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, SinProyecto } from "@/components/app/estados";
import { ArbolCuentas } from "@/components/contabilidad/arbol-cuentas";
import { cargarCuentas } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";

export const metadata: Metadata = { title: "Plan de cuentas" };

export default function PaginaPlanDeCuentas() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Plan de cuentas"
        descripcion="Cuentas del proyecto en hasta cuatro niveles. Los movimientos van en cuentas sin subcuentas."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  const cuentas = await cargarCuentas(proyecto.id);
  return <ArbolCuentas cuentas={cuentas} puedeEditar={permisos.administrar} />;
}
