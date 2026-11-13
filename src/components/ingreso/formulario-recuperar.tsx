"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Aviso } from "@/components/ingreso/aviso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enviarRecuperacion, type EstadoFormulario } from "@/lib/acciones-auth";

export function FormularioRecuperar() {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(
    enviarRecuperacion,
    {},
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="text-muted-foreground text-sm">
          Te mandamos un enlace para que elijas una contraseña nueva.
        </p>
      </div>

      <form action={accion} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="correo">Correo electrónico</Label>
          <Input
            id="correo"
            name="correo"
            type="email"
            autoComplete="email"
            placeholder="nombre@empresa.com"
            defaultValue={estado.correo}
            required
            className="h-11"
          />
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="ok">{estado.ok}</Aviso> : null}

        <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>

      <Link
        href="/ingresar"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-center text-sm"
      >
        <ArrowLeft className="size-4" />
        Volver a ingresar
      </Link>
    </div>
  );
}
