import { isAuthPKCECodeVerifierMissingError, type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_RECUPERANDO } from "@/lib/auth-constantes";
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
 * invitación). Acepta tres formatos:
 *   - ?code=…                      enlace de fábrica con flujo PKCE (p. ej. "¿La olvidaste?")
 *   - ?token_hash=…&type=…         plantilla de correo personalizada (requiere SMTP propio)
 *   - #access_token=…&type=…       enlace de fábrica con la sesión en el fragmento. El
 *                                  servidor no lo ve: se redirige a /ingresar, el navegador
 *                                  conserva el fragmento y lo procesa SesionDesdeEnlace.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const codigo = searchParams.get("code");
  const errorEnlace = searchParams.get("error_code") ?? searchParams.get("error");
  let siguiente = destinoSeguro(searchParams.get("siguiente") ?? searchParams.get("next"));

  // Una invitación o una recuperación siempre terminan eligiendo contraseña.
  const recuperando = request.cookies.get(COOKIE_RECUPERANDO)?.value === "1";
  if (tipo === "recovery" || tipo === "invite" || (codigo && recuperando)) {
    siguiente = "/nueva-clave";
  }

  const url = request.nextUrl.clone();
  url.search = "";

  const aIngresar = (motivo?: string) => {
    url.pathname = "/ingresar";
    if (motivo) url.searchParams.set("error", motivo);
    return NextResponse.redirect(url);
  };

  // Supabase avisa por la URL cuando el enlace venció o ya se usó.
  if (errorEnlace) return aIngresar("enlace");

  // Sin datos en la URL: la sesión viene (si viene) en el fragmento.
  if (!tokenHash && !codigo) return aIngresar();

  const supabase = await crearClienteServidor();

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (error) return aIngresar("enlace");
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (isAuthPKCECodeVerifierMissingError(error)) return aIngresar("otro-navegador");
    if (error) return aIngresar("enlace");
  } else {
    return aIngresar("enlace");
  }

  url.pathname = siguiente;
  const respuesta = NextResponse.redirect(url);
  if (recuperando) respuesta.cookies.delete(COOKIE_RECUPERANDO);
  return respuesta;
}
