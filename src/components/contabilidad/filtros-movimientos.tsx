import { Selector } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cuenta, FiltrosMovimientos } from "@/lib/contabilidad";

/** Filtros por GET: funcionan sin JavaScript y quedan en la dirección (se pueden compartir). */
export function FiltrosDeMovimientos({
  filtros: f,
  cuentas,
  verLibroB,
}: {
  filtros: FiltrosMovimientos;
  cuentas: Cuenta[];
  verLibroB: boolean;
}) {
  return (
    <form method="get" className="grid gap-3 rounded-[22px] border border-black/5 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)_minmax(0,1.4fr)_auto_auto] lg:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="desde" className="text-xs">Desde</Label>
        <Input id="desde" name="desde" type="date" defaultValue={f.desde} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hasta" className="text-xs">Hasta</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={f.hasta} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="libro" className="text-xs">Libro</Label>
        <Selector id="libro" name="libro" defaultValue={f.libro} disabled={!verLibroB}>
          {verLibroB ? <option value="AB">A + B</option> : null}
          <option value="A">A</option>
          {verLibroB ? <option value="B">B</option> : null}
        </Selector>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cuenta" className="text-xs">Cuenta</Label>
        <Selector id="cuenta" name="cuenta" defaultValue={f.cuenta}>
          <option value="">Todas</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(c.nivel - 1)}
              {c.codigo} {c.nombre}
            </option>
          ))}
        </Selector>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q" className="text-xs">Buscar en el detalle</Label>
        <Input id="q" name="q" type="search" defaultValue={f.q} placeholder="Texto" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="moneda" className="text-xs">Ver en</Label>
        <Selector id="moneda" name="moneda" defaultValue={f.moneda}>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </Selector>
      </div>
      <Button type="submit" className="h-9">Aplicar</Button>
    </form>
  );
}
