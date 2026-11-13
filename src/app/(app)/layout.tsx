import { Suspense } from "react";

import { BarraLateral } from "@/components/app/barra-lateral";
import { Logo } from "@/components/app/logo";
import { MenuMovil } from "@/components/app/menu-movil";
import { SelectorProyecto, SelectorProyectoEsqueleto } from "@/components/app/selector-proyecto";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  const selector = (
    <Suspense fallback={<SelectorProyectoEsqueleto />}>
      <SelectorProyecto />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh gap-4 p-3 sm:p-4">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-[264px] shrink-0 rounded-[22px] border border-black/5 bg-white p-4 lg:block">
        <BarraLateral selector={selector} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Barra superior (móvil) */}
        <div className="flex items-center gap-3 rounded-[20px] border border-black/5 bg-white p-2.5 lg:hidden">
          <MenuMovil selector={selector} />
          <Logo variante="isotipo" ancho={32} alto={32} />
          <span className="text-sm font-semibold">Paralelo</span>
        </div>

        <main className="flex-1 px-1 py-2 sm:px-3 lg:py-4">{children}</main>
      </div>
    </div>
  );
}
