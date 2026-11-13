import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { leerEntornoSupabase } from "./entorno";

/** Rutas a las que se entra sin sesión. Todo lo demás exige estar logueado. */
const RUTAS_PUBLICAS = ["/ingresar", "/recuperar", "/auth/confirmar"];

function esPublica(ruta: string) {
  return RUTAS_PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));
}

function redirigir(request: NextRequest, destino: string, respuestaBase: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  const respuesta = NextResponse.redirect(url);
  // Conservar las cookies de sesión renovadas.
  respuestaBase.cookies.getAll().forEach((c) => respuesta.cookies.set(c));
  respuesta.headers.set("Cache-Control", "private, no-store");
  return respuesta;
}

/**
 * Renueva la sesión de Supabase (refresca el token si hace falta) y protege
 * las rutas privadas. Se ejecuta desde src/proxy.ts en cada pedido.
 */
export async function actualizarSesion(request: NextRequest) {
  const ruta = request.nextUrl.pathname;

  // Si Supabase no acepta el redirectTo (no está en Redirect URLs), manda el
  // enlace a la Site URL. Se reenvía a /auth/confirmar con los mismos datos.
  const { searchParams } = request.nextUrl;
  if (
    ruta !== "/auth/confirmar" &&
    (searchParams.has("code") || (searchParams.has("token_hash") && searchParams.has("type")))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirmar";
    return NextResponse.redirect(url);
  }
  let respuesta = NextResponse.next({ request });

  const entorno = leerEntornoSupabase();
  if (!entorno) {
    // Sin configuración no hay forma de validar a nadie: solo se ve el ingreso.
    if (ruta === "/ingresar") return respuesta;
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "?error=configuracion";
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(entorno.url, entorno.clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesNuevas, encabezados) {
        cookiesNuevas.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        cookiesNuevas.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
        Object.entries(encabezados).forEach(([clave, valor]) => respuesta.headers.set(clave, valor));
      },
    },
  });

  // No poner código entre createServerClient y getClaims(): getClaims valida
  // el token y, si venció, lo renueva.
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims?.sub);

  if (!conSesion && !esPublica(ruta)) {
    return redirigir(request, "/ingresar", respuesta);
  }

  if (conSesion && (ruta === "/" || ruta === "/ingresar")) {
    return redirigir(request, "/tablero", respuesta);
  }

  return respuesta;
}
