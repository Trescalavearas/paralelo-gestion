import type { Metadata } from "next";

import { FormularioRecuperar } from "@/components/ingreso/formulario-recuperar";
import { TarjetaAuth } from "@/components/ingreso/tarjeta-auth";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
};

export default function PaginaRecuperar() {
  return (
    <TarjetaAuth>
      <FormularioRecuperar />
    </TarjetaAuth>
  );
}
