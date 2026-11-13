/**
 * Cookie de corta duración que recuerda que se pidió una recuperación de
 * contraseña. Si Supabase manda el enlace a la Site URL (sin "siguiente"),
 * /auth/confirmar igual sabe que tiene que terminar en /nueva-clave.
 */
export const COOKIE_RECUPERANDO = "paralelo-recuperando";
