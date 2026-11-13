"use client";

import { useActionState } from "react";

import { Aviso } from "@/components/ingreso/aviso";
import { CampoClave } from "@/components/ingreso/campo-clave";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cambiarClave, type EstadoFormulario } from "@/lib/acciones-auth";

export function FormularioNuevaClave() {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(cambiarClave, {});

  return (
    <div className="flex w-full max-w-sm flex-col gap-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Elegí tu contraseña</h1>
        <p className="text-muted-foreground text-sm">Mínimo 8 caracteres.</p>
      </div>

      <form action={accion} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="clave">Contraseña nueva</Label>
          <CampoClave id="clave" name="clave" autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="repetida">Repetila</Label>
          <CampoClave id="repetida" name="repetida" autoComplete="new-password" />
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

        <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </div>
  );
}
