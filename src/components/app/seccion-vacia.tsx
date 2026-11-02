import { Construction } from "lucide-react";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { NAVEGACION } from "@/config/navegacion";

/** Página placeholder para secciones que todavía no están construidas. */
export function SeccionVacia({ ruta }: { ruta: string }) {
  const item = NAVEGACION.find((i) => i.ruta === ruta);
  const titulo = item?.etiqueta ?? "Sección";

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion titulo={titulo} descripcion={item?.descripcion} />
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[22px] border border-black/5 bg-white p-10 text-center">
        <span className="bg-nav-activo text-naranja flex size-12 items-center justify-center rounded-2xl">
          <Construction className="size-5" />
        </span>
        <p className="font-medium">Sección en construcción</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Esta pantalla se va a habilitar en las próximas fases.
        </p>
      </div>
    </div>
  );
}
