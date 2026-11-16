"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { Aviso } from "@/components/ingreso/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deshacerLote } from "@/lib/acciones-importacion";

export function BotonDeshacer({ loteId, archivo, filas }: { loteId: string; archivo: string; filas: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const r = await deshacerLote(loteId);
      if (!r.ok) return setError(r.error);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2 text-xs" onClick={() => setAbierto(true)}>
        <Undo2 className="size-3.5" />
        Deshacer
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deshacer la importación</DialogTitle>
            <DialogDescription>{archivo}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Se van a borrar los {filas} asientos importados en este lote. Es la única excepción a “nada se borra”: queda
            constancia en la auditoría y el lote queda marcado como deshecho. No se puede si alguno de sus meses está cerrado.
          </p>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={pendiente}>
              {pendiente ? "Deshaciendo…" : "Deshacer lote"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
