import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { exigirEntornoSupabase } from "./entorno";

/**
 * Cliente de Supabase para el servidor (componentes de servidor, acciones y
 * route handlers). Crear uno nuevo en cada pedido; nunca compartirlo.
 */
export async function crearClienteServidor() {
  // Primero cookies(): marca el render como dinámico (por pedido) antes de
  // validar el entorno, así el build no necesita las variables.
  const almacen = await cookies();
  // supabase-js lee el reloj al iniciar la sesión: esto deja todo lo que sigue
  // para el momento del pedido (no se precalcula ni en los prefetch).
  await connection();
  const { url, clave } = exigirEntornoSupabase();

  return createServerClient(url, clave, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(cookiesNuevas) {
        try {
          cookiesNuevas.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // Llamado desde un componente de servidor, donde no se pueden escribir
          // cookies. No pasa nada: el proxy ya renueva la sesión en cada pedido.
        }
      },
    },
  });
}
