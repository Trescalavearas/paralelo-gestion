# Gestión Inmobiliaria
App web multi-proyecto: contabilidad en libros A y B, en ARS y USD,
presupuesto y avance de obra, ventas por unidad, boletos de compraventa,
tareas (kanban) y factibilidad de proyectos nuevos.

## Stack
- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Recharts
- Supabase Postgres (migraciones en supabase/migrations) y Storage
- Autenticación: Supabase Auth (Auth0 quedó descartado), con @supabase/ssr.
  Clientes separados: src/lib/supabase/navegador.ts y servidor.ts.
  src/proxy.ts (el "middleware" de Next 16) renueva la sesión y protege
  todo lo que no sea /ingresar, /recuperar y /auth/confirmar.
- Sin registro público: los usuarios los da de alta un administrador desde Supabase.
- Los enlaces de correo funcionan con las plantillas de fábrica: ?code= y ?token_hash=
  en /auth/confirmar (servidor); #access_token= en SesionDesdeEnlace (cliente, layout raíz).
- Variables: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
  La clave secreta (sb_secret_… / service_role) no se usa en la app.
- Deploy en Vercel

## Reglas contables (no negociables)
- Partida doble: cada asiento balancea por libro (A y B por separado).
  Se valida en la base (función + trigger), no solo en la pantalla.
- Importes en numeric(18,2), nunca float. Cada línea guarda moneda,
  importe de origen, TC, importe ARS e importe USD.
- TC desde la tabla cotizaciones (MEP por defecto). TC manual guarda
  la diferencia contra el MEP.
- Traspaso entre libros: cuenta puente "Traspasos entre libros" en cada libro.
- Los asientos no se borran: se anulan con contra-asiento.
- Pantalla en español de Argentina: fechas dd/mm/aaaa, números 1.234,56.

## Seguridad
- Toda tabla con proyecto_id tendrá RLS por la tabla miembros.
- Líneas del libro B solo visibles con miembros.ve_libro_b = true.
- Funciones auxiliares para políticas: es_miembro(), rol_en(), ve_libro_b(),
  es_administrador() (SECURITY DEFINER, search_path vacío).
- Toda tabla nueva: RLS activado, grants explícitos a authenticated (nada a anon)
  y, si guarda datos del proyecto, trigger auditar().
- La auditoría es inmutable (trigger que bloquea UPDATE/DELETE/TRUNCATE).
- Cada cambio de esquema va en una migración nueva; las aplicadas no se editan.
  Probarlas con supabase/tests/verificar_rls.sql.
- Ninguna clave privada llega al navegador.
- Nada de datos reales ni claves en el repositorio.

## Diseño
- Fondo gris claro #EDECE9, tarjetas blancas con bordes muy redondeados (20-22px).
- Acento naranja #E8743B; degradé durazno-naranja en paneles destacados.
- Botón principal negro #151515. Libro A en negro, libro B en naranja.
- Tipografías Geist (texto) y Geist Mono (números).

@AGENTS.md
