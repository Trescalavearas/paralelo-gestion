/**
 * Variables públicas de Supabase. Ambas son seguras en el navegador:
 * la URL del proyecto y la clave publicable (sb_publishable_…).
 * La clave secreta (service_role / sb_secret_…) NUNCA se usa en esta app.
 */
export function leerEntornoSupabase(): { url: string; clave: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) return null;
  return { url, clave };
}

export function exigirEntornoSupabase(): { url: string; clave: string } {
  const entorno = leerEntornoSupabase();
  if (!entorno) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Cargalas en .env.local (local) o en Vercel → Settings → Environment Variables.",
    );
  }
  return entorno;
}
