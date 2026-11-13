"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Aviso } from "@/components/ingreso/aviso";
import { CampoClave } from "@/components/ingreso/campo-clave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ingresar, type EstadoFormulario } from "@/lib/acciones-auth";

const AVISOS_URL: Record<string, string> = {
  enlace: "El enlace no es válido o ya venció. Pedí uno nuevo desde “¿La olvidaste?”.",
  configuracion:
    "La aplicación todavía no está conectada a Supabase. Falta cargar las variables de entorno.",
};

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(ingresar, {});
  const errorUrl = useSearchParams().get("error");
  const error = estado.error ?? (errorUrl ? AVISOS_URL[errorUrl] : undefined);

  return (
    <div className="flex w-full max-w-sm flex-col gap-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Ingresar</h1>
        <p className="text-muted-foreground text-sm">
          Accedé con tu cuenta para gestionar tus proyectos.
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="clave">Contraseña</Label>
            <Link
              href="/recuperar"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              ¿La olvidaste?
            </Link>
          </div>
          <CampoClave id="clave" name="clave" autoComplete="current-password" />
        </div>

        {error ? <Aviso tipo="error">{error}</Aviso> : null}

        <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={enviando}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs whitespace-nowrap">o continuá con</span>
        <Separator className="flex-1" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full bg-white"
          disabled
          aria-describedby="google-proximamente"
        >
          <IconoGoogle />
          Cuenta de Google
        </Button>
        <span id="google-proximamente" className="text-muted-foreground text-xs">
          Próximamente
        </span>
      </div>
    </div>
  );
}

function IconoGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
