"use client";

import { useActionState, useEffect } from "react";

import { Aviso } from "@/components/ingreso/aviso";
import { Casilla, Selector } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarCuenta, type Resultado } from "@/lib/acciones-contabilidad";

export type CuentaEditable = {
  id?: string;
  codigo: string;
  nombre: string;
  tipo: string;
  computa: boolean;
  rubro_obra: string | null;
  es_puente: boolean;
  es_diferencia_cambio: boolean;
};

const TIPOS = [
  ["activo", "Activo"],
  ["pasivo", "Pasivo"],
  ["patrimonio_neto", "Patrimonio neto"],
  ["ingreso", "Ingreso"],
  ["egreso", "Egreso"],
] as const;

export function FormularioCuenta({
  abierto,
  alCerrar,
  cuenta,
  madre,
  bloqueadas,
}: {
  abierto: boolean;
  alCerrar: () => void;
  cuenta: CuentaEditable | null;
  madre: { id: string; codigo: string; nombre: string; nivel: number; tipo: string } | null;
  /** La cuenta tiene subcuentas o movimientos: no puede ser puente ni de diferencia. */
  bloqueadas?: { especiales: boolean };
}) {
  const [estado, accion, enviando] = useActionState<Resultado, FormData>(guardarCuenta, {});
  const editando = Boolean(cuenta?.id);

  useEffect(() => {
    if (estado.ok) alCerrar();
  }, [estado, alCerrar]);

  const nivel = madre ? madre.nivel + 1 : 1;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && alCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>
            {editando
              ? `${cuenta?.codigo} · ${cuenta?.nombre}`
              : madre
                ? `Subcuenta de ${madre.codigo} ${madre.nombre} (nivel ${nivel})`
                : "Cuenta de nivel 1"}
          </DialogDescription>
        </DialogHeader>

        <form action={accion} className="flex flex-col gap-4" key={cuenta?.id ?? madre?.id ?? "raiz"}>
          {cuenta?.id ? <input type="hidden" name="id" value={cuenta.id} /> : null}
          {madre && !editando ? <input type="hidden" name="cuenta_padre" value={madre.id} /> : null}

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                name="codigo"
                required
                className="font-mono"
                defaultValue={cuenta?.codigo ?? (madre ? `${madre.codigo}.` : "")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" required defaultValue={cuenta?.nombre ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Selector id="tipo" name="tipo" defaultValue={cuenta?.tipo ?? madre?.tipo ?? "activo"}>
                {TIPOS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Selector>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rubro_obra">Rubro de obra (opcional)</Label>
              <Input id="rubro_obra" name="rubro_obra" defaultValue={cuenta?.rubro_obra ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl border border-black/5 p-3.5">
            <Casilla name="computa" label="Computa en reportes e indicadores" defaultChecked={cuenta?.computa ?? true} />
            <Casilla
              name="es_puente"
              label="Es la cuenta puente “Traspasos entre libros”"
              defaultChecked={cuenta?.es_puente ?? false}
              disabled={bloqueadas?.especiales}
            />
            <Casilla
              name="es_diferencia_cambio"
              label="Es la cuenta de diferencia de cambio"
              defaultChecked={cuenta?.es_diferencia_cambio ?? false}
              disabled={bloqueadas?.especiales}
            />
            {bloqueadas?.especiales ? (
              <p className="text-muted-foreground text-xs">
                Tiene subcuentas o movimientos: no se puede marcar como puente ni como diferencia de cambio.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Puede haber una sola de cada una por proyecto, y no pueden tener subcuentas.
              </p>
            )}
          </div>

          {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
