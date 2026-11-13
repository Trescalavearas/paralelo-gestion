import type { Metadata } from "next";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { FormularioCambiarClave } from "@/components/ingreso/formulario-cambiar-clave";

export const metadata: Metadata = { title: "Cambiar mi contraseña" };

export default function PaginaCambiarClave() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Cambiar mi contraseña"
        descripcion="Elegí una contraseña nueva de al menos 8 caracteres."
      />
      <section className="w-full max-w-md rounded-[22px] border border-black/5 bg-white p-6 sm:p-8">
        <FormularioCambiarClave />
      </section>
    </div>
  );
}
