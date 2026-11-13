import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { crearClienteServidor } from "@/lib/supabase/servidor";

/** Solo se permite volver a rutas internas (evita redirecciones abiertas). */
function destinoSeguro(valor: string | null) {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) {
    return "/tablero";
  }
  return valor;
}

/**
 * Destino de los enlaces que manda Supabase por correo (recuperar contraseña,
 * invitación). Acepta los dos formatos:
 *   - ?token_hash=…&type=recovery   (plantilla de correo recomendada)
 *   - ?code=…                       (enlace por defecto, flujo PKCE)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const codigo = searchParams.get("code");
  let siguiente = destinoSeguro(searchParams.get("siguiente") ?? searchParams.get("next"));

  // Una invitación o una recuperación siempre terminan eligiendo contraseña.
  if (tipo === "recovery" || tipo === "invite") siguiente = "/nueva-clave";

  const supabase = await crearClienteServidor();
  let error: unknown = null;

  if (tokenHash && tipo) {
    ({ error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash }));
  } else if (codigo) {
    ({ error } = await supabase.auth.exchangeCodeForSession(codigo));
  } else {
    error = new Error("Enlace sin token");
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (error) {
    url.pathname = "/ingresar";
    url.searchParams.set("error", "enlace");
  } else {
    url.pathname = siguiente;
  }
  return NextResponse.redirect(url);
}
