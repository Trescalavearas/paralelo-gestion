import { Suspense } from "react";
import type { Metadata } from "next";

import { FormularioIngreso } from "@/components/ingreso/formulario-ingreso";
import { TarjetaAuth } from "@/components/ingreso/tarjeta-auth";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function PaginaIngreso() {
  return (
    <TarjetaAuth>
      <Suspense>
        <FormularioIngreso />
      </Suspense>
    </TarjetaAuth>
  );
}
