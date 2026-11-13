import { createBrowserClient } from "@supabase/ssr";

import { exigirEntornoSupabase } from "./entorno";

/** Cliente de Supabase para componentes de cliente ("use client"). */
export function crearClienteNavegador() {
  const { url, clave } = exigirEntornoSupabase();
  return createBrowserClient(url, clave, {
    auth: {
      // Los enlaces de los correos se procesan a mano: los que traen ?code=
      // en /auth/confirmar (servidor) y los que traen #access_token= en
      // SesionDesdeEnlace (cliente). Así no hay dos procesos compitiendo.
      detectSessionInUrl: false,
    },
  });
}
