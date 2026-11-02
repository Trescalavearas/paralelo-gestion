import type { Metadata } from "next";

import { Logo } from "@/components/app/logo";
import { FormularioIngreso } from "@/components/ingreso/formulario-ingreso";
import { PROYECTO_ACTUAL } from "@/config/navegacion";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function PaginaIngreso() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-[1000px] overflow-hidden rounded-[22px] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.12)] md:grid-cols-2">
        {/* Panel de marca */}
        <section className="bg-durazno relative flex min-h-[220px] flex-col justify-between rounded-[18px] p-7 md:min-h-[560px] md:p-9">
          <Logo variante="logotipo" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#151515]/70">{PROYECTO_ACTUAL.tipo}</p>
            <p className="text-xl font-semibold tracking-tight text-[#151515]">
              {PROYECTO_ACTUAL.nombre}
            </p>
          </div>
        </section>

        {/* Formulario */}
        <section className="flex items-center justify-center px-5 py-10 md:px-10">
          <FormularioIngreso />
        </section>
      </div>
    </main>
  );
}
