"use client";

import { useEffect, useState } from "react";

import { crearClienteNavegador } from "@/lib/supabase/navegador";

/** Tipos de enlace que terminan eligiendo contraseña. */
const TIPOS_CON_CLAVE_NUEVA = new Set(["invite", "recovery"]);

function leerFragmento(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const esDeSupabase =
    params.has("access_token") || params.has("error") || params.has("error_code");
  return esDeSupabase ? params : null;
}

/** Saca el fragmento de la barra de direcciones sin recargar. */
function limpiarDireccion() {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search);
}

/**
 * Procesa los enlaces de los correos de fábrica de Supabase (invitación,
 * recuperación desde el panel, etc.), que vuelven a la app con la sesión en
 * el fragmento: #access_token=…&refresh_token=…&type=invite
 *
 * El fragmento no llega nunca al servidor, por eso esto corre en el navegador.
 * Está montado en el layout raíz: funciona en cualquier página donde caiga el
 * enlace (la Site URL redirige a /ingresar y el navegador conserva el fragmento).
 */
export function SesionDesdeEnlace() {
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const params = leerFragmento();
    if (!params) return;

    // Hay que mostrar el aviso antes de procesar: el fragmento se lee recién
    // acá porque en el servidor no existe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcesando(true);
    limpiarDireccion(); // los tokens no deben quedar a la vista ni en el historial

    const irA = (destino: string) => window.location.replace(destino);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const tipo = params.get("type") ?? "";

    if (params.has("error") || params.has("error_code") || !accessToken || !refreshToken) {
      irA("/ingresar?error=enlace");
      return;
    }

    (async () => {
      try {
        const supabase = crearClienteNavegador();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        irA(TIPOS_CON_CLAVE_NUEVA.has(tipo) ? "/nueva-clave" : "/tablero");
      } catch (e) {
        console.error("No se pudo iniciar sesión con el enlace:", e);
        irA("/ingresar?error=enlace");
      }
    })();
  }, []);

  if (!procesando) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-background fixed inset-0 z-[100] flex items-center justify-center p-6"
    >
      <p className="text-muted-foreground text-sm">Verificando el enlace…</p>
    </div>
  );
}
