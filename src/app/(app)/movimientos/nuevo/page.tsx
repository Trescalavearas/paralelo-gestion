import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, SinPermiso, SinProyecto, Vacio } from "@/components/app/estados";
import { FormularioAsiento } from "@/components/contabilidad/formulario-asiento";
import { cargarCuentas } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import { hoyArgentina } from "@/lib/formato";

export const metadata: Metadata = { title: "Nuevo asiento" };

export default function PaginaNuevoAsiento() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/movimientos" className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>
      <EncabezadoSeccion
        titulo="Nuevo asiento"
        descripcion="Si no indicás el tipo de cambio, se usa el MEP del día (o el último anterior)."
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
  if (!permisos.registrar) {
    return <SinPermiso texto="Solo un administrador o un contador del proyecto puede registrar asientos." />;
  }
  const cuentas = (await cargarCuentas(proyecto.id))
    .filter((c) => !c.tieneHijos && !c.es_puente)
    .map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }));

  if (cuentas.length < 2) {
    return (
      <Vacio titulo="Falta el plan de cuentas" texto="Hacen falta al menos dos cuentas sin subcuentas para registrar un asiento.">
        <Link href="/plan-de-cuentas" className="text-sm underline underline-offset-4">
          Ir al plan de cuentas
        </Link>
      </Vacio>
    );
  }

  return <FormularioAsiento cuentas={cuentas} verLibroB={permisos.verLibroB} hoy={hoyArgentina()} />;
}
