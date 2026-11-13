"use client";

import { useActionState } from "react";

import { Aviso } from "@/components/ingreso/aviso";
import { CampoClave } from "@/components/ingreso/campo-clave";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cambiarMiClave, type EstadoFormulario } from "@/lib/acciones-auth";

/** Cambio de contraseña con la sesión iniciada (pantalla interna de la app). */
export function FormularioCambiarClave() {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(
    cambiarMiClave,
    {},
  );

  return (
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
      {estado.ok ? <Aviso tipo="ok">{estado.ok}</Aviso> : null}

      <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
