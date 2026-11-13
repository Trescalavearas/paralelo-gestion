import { Logo } from "@/components/app/logo";
import { PROYECTO_ACTUAL } from "@/config/navegacion";

/** Tarjeta de las pantallas de acceso: panel de marca + formulario. */
export function TarjetaAuth({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-[1000px] overflow-hidden rounded-[22px] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.12)] md:grid-cols-2">
        <section className="bg-durazno relative flex min-h-[220px] flex-col justify-between rounded-[18px] p-7 md:min-h-[560px] md:p-9">
          <Logo variante="logotipo" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#151515]/70">{PROYECTO_ACTUAL.tipo}</p>
            <p className="text-xl font-semibold tracking-tight text-[#151515]">
              {PROYECTO_ACTUAL.nombre}
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 md:px-10">
          {children}
        </section>
      </div>
    </main>
  );
}
