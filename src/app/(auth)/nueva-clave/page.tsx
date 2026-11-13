import type { Metadata } from "next";

import { FormularioNuevaClave } from "@/components/ingreso/formulario-nueva-clave";
import { TarjetaAuth } from "@/components/ingreso/tarjeta-auth";

export const metadata: Metadata = {
  title: "Contraseña nueva",
};

/** Protegida por el proxy: se llega con la sesión que abre el enlace del correo. */
export default function PaginaNuevaClave() {
  return (
    <TarjetaAuth>
      <FormularioNuevaClave />
    </TarjetaAuth>
  );
}
