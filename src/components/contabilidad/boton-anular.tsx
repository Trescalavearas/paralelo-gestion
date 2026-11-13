"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Aviso } from "@/components/ingreso/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anularAsiento, type Resultado } from "@/lib/acciones-contabilidad";

export function BotonAnular({ asientoId, numero, detalle }: { asientoId: string; numero: number; detalle: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Resultado, FormData>(anularAsiento, {});

  function cambiarAbierto(valor: boolean) {
    setAbierto(valor);
    if (!valor && estado.ok) router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-7 px-2 text-xs"
        onClick={() => setAbierto(true)}
        aria-label={`Anular el asiento ${numero}`}
      >
        <Ban className="size-3.5" />
        Anular
      </Button>
      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular el asiento {numero}</DialogTitle>
            <DialogDescription>{detalle}</DialogDescription>
          </DialogHeader>
          {estado.ok ? (
            <div className="flex flex-col gap-4">
              <Aviso tipo="ok">{estado.ok}</Aviso>
              <Button onClick={() => cambiarAbierto(false)}>Listo</Button>
            </div>
          ) : (
            <form action={accion} className="flex flex-col gap-4">
              <input type="hidden" name="asiento" value={asientoId} />
              <p className="text-muted-foreground text-sm">
                No se borra nada: se registra un contra-asiento con fecha de hoy, con el debe y el haber invertidos, y
                este queda marcado como anulado.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`motivo-${asientoId}`}>Motivo</Label>
                <Input id={`motivo-${asientoId}`} name="motivo" required autoFocus placeholder="Por ejemplo: importe mal cargado" />
              </div>
              {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={enviando}>
                  {enviando ? "Anulando…" : "Anular asiento"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
