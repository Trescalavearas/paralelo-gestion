"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_RECUPERANDO } from "@/lib/auth-constantes";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoFormulario = {
  error?: string;
  ok?: string;
  correo?: string;
};

function texto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Traduce los errores de Supabase Auth a mensajes para la pantalla. */
function traducirError(codigo: string | undefined, mensaje: string): string {
  switch (codigo) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Todavía no confirmaste tu correo. Revisá tu casilla.";
    case "user_banned":
      return "Tu usuario está suspendido. Hablá con un administrador.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    case "same_password":
      return "La contraseña nueva tiene que ser distinta de la anterior.";
    case "weak_password":
      return "La contraseña es muy débil. Usá al menos 8 caracteres, combinando letras y números.";
    case "reauthentication_needed":
      return "Por seguridad, cerrá sesión, volvé a ingresar y cambiá la contraseña enseguida.";
    case "session_not_found":
    case "session_expired":
      return "El enlace venció. Pedí uno nuevo desde “¿La olvidaste?”.";
    default:
      console.error("Supabase Auth:", codigo, mensaje);
      return "No se pudo completar la operación. Probá de nuevo en unos minutos.";
  }
}

async function origenDelSitio() {
  const h = await headers();
  const origen = h.get("origin");
  if (origen) return origen;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? "https";
  return `${protocolo}://${host}`;
}

// -----------------------------------------------------------------------------

export async function ingresar(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const correo = texto(formData, "correo");
  const clave = formData.get("clave");

  if (!correo || typeof clave !== "string" || !clave) {
    return { error: "Completá el correo y la contraseña.", correo };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });

  if (error) {
    return { error: traducirError(error.code, error.message), correo };
  }

  redirect("/tablero");
}

export async function enviarRecuperacion(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const correo = texto(formData, "correo");
  if (!correo) return { error: "Escribí tu correo.", correo };

  const supabase = await crearClienteServidor();
  const origen = await origenDelSitio();
  const { error } = await supabase.auth.resetPasswordForEmail(correo, {
    redirectTo: `${origen}/auth/confirmar?siguiente=/nueva-clave`,
  });

  (await cookies()).set(COOKIE_RECUPERANDO, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: origen.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60, // lo que dura el enlace de Supabase por defecto
  });

  // Por seguridad, la respuesta es la misma exista o no el correo.
  if (error && error.code?.startsWith("over_")) {
    return { error: traducirError(error.code, error.message), correo };
  }
  if (error) console.error("Supabase Auth:", error.code, error.message);

  return {
    ok: "Si el correo está registrado, te llega un enlace para elegir una contraseña nueva.",
    correo,
  };
}

export async function cambiarClave(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const clave = formData.get("clave");
  const repetida = formData.get("repetida");

  if (typeof clave !== "string" || clave.length < 8) {
    return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  }
  if (clave !== repetida) {
    return { error: "Las dos contraseñas no coinciden." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) return { error: traducirError(error.code, error.message) };

  redirect("/tablero");
}

/** Cambio de contraseña desde la app, con la sesión ya iniciada. */
export async function cambiarMiClave(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const clave = formData.get("clave");
  const repetida = formData.get("repetida");

  if (typeof clave !== "string" || clave.length < 8) {
    return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  }
  if (clave !== repetida) {
    return { error: "Las dos contraseñas no coinciden." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) return { error: traducirError(error.code, error.message) };

  return { ok: "Listo: tu contraseña quedó cambiada." };
}

export async function salir() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
