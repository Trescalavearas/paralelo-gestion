import { createBrowserClient } from "@supabase/ssr";

import { exigirEntornoSupabase } from "./entorno";

/** Cliente de Supabase para componentes de cliente ("use client"). */
export function crearClienteNavegador() {
  const { url, clave } = exigirEntornoSupabase();
  return createBrowserClient(url, clave);
}
