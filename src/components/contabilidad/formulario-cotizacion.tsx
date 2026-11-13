"use client";

import { useActionState } from "react";

import { Aviso } from "@/components/ingreso/aviso";
import { Selector } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarCotizacion, type Resultado } from "@/lib/acciones-contabilidad";

export function FormularioCotizacion({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState<Resultado, FormData>(guardarCotizacion, {});

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fecha">Fecha</Label>
          <Input id="fecha" name="fecha" type="date" required defaultValue={hoy} max={hoy} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tipo">Dólar</Label>
          <Selector id="tipo" name="tipo" defaultValue="mep">
            <option value="mep">MEP</option>
            <option value="blue">Blue</option>
            <option value="oficial">Oficial</option>
          </Selector>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="compra">Compra</Label>
          <Input id="compra" name="compra" inputMode="decimal" required placeholder="0,00" className="font-mono" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="venta">Venta</Label>
          <Input id="venta" name="venta" inputMode="decimal" required placeholder="0,00" className="font-mono" />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Si ya hay una cotización para esa fecha y tipo, se reemplaza. Una carga manual no la pisa la carga automática.
      </p>
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
      {estado.ok ? <Aviso tipo="ok">{estado.ok}</Aviso> : null}
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar cotización"}
      </Button>
    </form>
  );
}
