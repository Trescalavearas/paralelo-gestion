# Paralelo · Gestión inmobiliaria

App web multi-proyecto de gestión inmobiliaria y contable (libros A y B, ARS y USD,
presupuesto y avance de obra, unidades y cobranzas, boletos, tareas y factibilidad).
Primer proyecto: **Paralelo · Crisol 168** (fideicomiso).

> **Fase 1: acceso y permisos.** Login real con Supabase Auth (correo y contraseña),
> recuperación de contraseña, tablas base (perfiles, proyectos, miembros, cuentas,
> auditoría) y permisos por fila (RLS). Todavía no hay asientos ni montos.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (componentes en `src/components/ui`)
- [Supabase](https://supabase.com): Postgres, Auth y (más adelante) Storage, vía `@supabase/ssr`
- Recharts (instalado para las próximas fases)
- Tipografías Geist y Geist Mono (paquete `geist`)

Las reglas del proyecto (contables, de seguridad y de diseño) están en [`CLAUDE.md`](./CLAUDE.md).

---

## Puesta en marcha (una sola vez)

Seguí los pasos en este orden.

### 1. Crear el proyecto en Supabase

1. Entrá a <https://supabase.com/dashboard> y creá un proyecto nuevo (región sugerida:
   São Paulo, la más cercana).
2. Guardá la contraseña de la base en un gestor de contraseñas. La app no la usa.

### 2. Aplicar la migración desde el SQL Editor

1. En Supabase abrí **SQL Editor** → **New query**.
2. Copiá **todo** el contenido de
   [`supabase/migrations/20261113000000_esquema_inicial.sql`](./supabase/migrations/20261113000000_esquema_inicial.sql),
   pegalo y tocá **Run**. Tiene que terminar en *Success. No rows returned*.
3. En otra consulta nueva, pegá [`supabase/seed.sql`](./supabase/seed.sql) y tocá **Run**.
   Crea solo el proyecto "Paralelo · Crisol 168" (en ARS: revisá `moneda_base` antes
   de correrlo si corresponde USD).
4. Verificá los permisos: en otra consulta, pegá
   [`supabase/tests/verificar_rls.sql`](./supabase/tests/verificar_rls.sql) y tocá **Run**.
   - El resultado **sale en rojo a propósito**. Así se deshacen solos los dos usuarios y
     proyectos de prueba que crea el script, y no queda ningún rastro.
   - Si el mensaje dice **"VERIFICACIÓN RLS SUPERADA: 18 de 18 pruebas OK"**, está todo bien.
   - Si dice "VERIFICACIÓN RLS FALLIDA", el mensaje lista qué prueba falló.

> La migración se aplica una sola vez. Los cambios futuros de la base van en
> migraciones nuevas, que se aplican igual, en orden de fecha.

### 3. Apagar el registro público

Nadie tiene que poder crearse una cuenta solo.

1. En Supabase: **Authentication** → **Sign In / Providers** (en algunas versiones del
   panel: **Authentication → Settings**).
2. Desactivá **Allow new users to sign up** y guardá.
3. En la misma pantalla, dentro de **Email**, dejá activado el proveedor de correo y
   contraseña.

Con el registro apagado, solo un administrador puede invitar usuarios (paso 6).

### 4. Configurar las direcciones permitidas

En **Authentication → URL Configuration**:

- **Site URL**: la dirección de producción, p. ej. `https://paralelo-gestion.vercel.app`.
  Ahí vuelven los enlaces de invitación.
- **Redirect URLs**: agregá
  - `https://paralelo-gestion.vercel.app/auth/confirmar`
  - `http://localhost:3000/auth/confirmar` (para probar en tu computadora)
  - opcional, para las vistas previas de Vercel: `https://*-<tu-equipo>.vercel.app/auth/confirmar`

**Plantillas de correo: no hace falta tocarlas.** La app funciona con los enlaces de
fábrica de Supabase:

- **Invitación** (y recuperación enviada desde el panel de Supabase): el enlace vuelve a la
  Site URL con la sesión en el fragmento (`#access_token=…&type=invite`). La app la toma en
  el navegador, limpia la dirección y lleva a `/nueva-clave` para elegir la contraseña.
- **"¿La olvidaste?"** desde la app: el enlace vuelve con `?code=…` a `/auth/confirmar` y
  termina en `/nueva-clave`. Este enlace hay que abrirlo **en el mismo navegador** donde se
  pidió; si no, la app avisa y pide uno nuevo.

> **Sobre el correo de fábrica de Supabase.** Sin SMTP propio, Supabase solo entrega
> correos a las direcciones de los **miembros de la organización** de Supabase (el equipo
> del proyecto), y manda muy pocos por hora. Para invitar o recuperar la contraseña de
> **terceros** hace falta configurar un SMTP propio en
> **Authentication → Emails → SMTP Settings**. Mientras tanto, dá de alta a los usuarios a
> mano (paso 6, opción A).
>
> Con SMTP propio también se pueden editar las plantillas (opcional). Si las editás, este
> formato funciona en cualquier dispositivo:
> **Invite user** → `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite` ·
> **Reset Password** → `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery`

### 5. Cargar las variables en Vercel

Hacen falta dos variables. Los valores están en Supabase → **Project Settings**:

| Variable | Dónde está en Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Data API** → *Project URL* (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **API Keys** → *Publishable key* (empieza con `sb_publishable_`) |

Las dos son públicas por diseño: la seguridad la dan las políticas RLS de la base.
**No** cargues nunca la *secret key* (`sb_secret_…`) ni la `service_role`: la app no
las necesita.

En Vercel:

1. Abrí el proyecto → **Settings** → **Environment Variables**.
2. Agregá cada variable con su valor y marcá **Production**, **Preview** y **Development**.
3. Volvé a publicar para que tomen efecto: **Deployments** → el último → **⋯** → **Redeploy**.

Sin estas variables, la app muestra en la pantalla de ingreso el aviso "La aplicación
todavía no está conectada a Supabase".

### 6. Dar de alta usuarios y asignarlos a un proyecto

**Opción A: alta a mano (sin SMTP propio).** Sirve para cualquier persona.

1. En Supabase: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribí el correo y una **contraseña provisoria**, y marcá **Auto Confirm User**.
3. Pasale la contraseña provisoria por un canal seguro (no por el mismo correo).
4. Lo primero que tiene que hacer al ingresar es ir a **Cambiar mi contraseña** (abajo de
   todo en la barra lateral) y elegir una propia.

**Opción B: invitación por correo.** Solo llega a miembros de la organización de Supabase,
salvo que haya SMTP propio (ver paso 4).

1. En Supabase: **Authentication** → **Users** → **Add user** → **Send invitation**.
2. Al abrir el enlace del correo, la persona entra a la app y elige su contraseña.

**En los dos casos:**

1. Asignale proyecto y rol. Por ahora se hace desde el **SQL Editor** (cambiá el correo
   y, si hace falta, el rol y `ve_libro_b`):

   ```sql
   insert into public.miembros (proyecto_id, usuario_id, rol, ve_libro_b)
   select p.id, u.id, 'administrador', true
   from public.proyectos p, auth.users u
   where p.nombre = 'Paralelo · Crisol 168'
     and u.email = 'CORREO_DE_LA_PERSONA';
   ```

   Roles: `administrador`, `contador`, `direccion_obra`, `comercial`, `lectura`.
   El primer administrador de cada proyecto se carga así. Después, un administrador
   ya puede gestionar miembros desde la app (la pantalla llega en la próxima fase).

2. Para cambiar el nombre que se muestra en el tablero:

   ```sql
   update public.perfiles set nombre = 'Nombre Apellido'
   where id = (select id from auth.users where email = 'CORREO_DE_LA_PERSONA');
   ```

---

## Correrlo en tu computadora

Requisitos: **Node.js 20.9 o superior** y npm.

1. Copiá `.env.example` como `.env.local` y completá las dos variables (ver paso 5).
   `.env.local` no se sube al repositorio.
2. Instalá y arrancá:

```bash
npm install
```

```bash
npm run dev
```

Abrí <http://localhost:3000>.

| Comando | Para qué sirve |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run build` | Compila la versión de producción (lo mismo que hace Vercel) |
| `npm run start` | Sirve la versión compilada |
| `npm run lint` | Revisa el código con ESLint |

## Publicar en Vercel

1. Entrá a <https://vercel.com/new>, elegí **Import Git Repository** y seleccioná
   `paralelo-gestion`. Vercel detecta Next.js solo.
2. Antes de **Deploy**, desplegá **Environment Variables** y cargá las dos variables del
   paso 5 (o cargalas después y hacé *Redeploy*).
3. Cada push a `main` publica en producción y cada pull request genera una vista previa.

## Cómo funciona el acceso

- **Sin sesión** solo se puede entrar a `/ingresar`, `/recuperar` y `/auth/confirmar`.
  Cualquier otra ruta redirige a `/ingresar`. Lo hace `src/proxy.ts` (en Next.js 16 el
  *middleware* se llama *proxy*), que además renueva la sesión en cada pedido.
- **¿La olvidaste?** manda el correo de recuperación. El enlace pasa por
  `/auth/confirmar` y termina en `/nueva-clave`, donde se elige la contraseña nueva.
- **Enlaces con la sesión en el fragmento** (`#access_token=…`, como la invitación de
  fábrica): los procesa `src/components/auth/sesion-desde-enlace.tsx` en el navegador, en
  cualquier página donde caigan. Inicia la sesión, borra los tokens de la dirección y
  lleva a `/nueva-clave` (invitación o recuperación) o al tablero.
- **Cambiar mi contraseña** (`/cambiar-clave`): con la sesión iniciada, desde la barra
  lateral, junto a **Salir**.
- **Salir** cierra la sesión.
- **Cuenta de Google** se ve pero está deshabilitado ("Próximamente").
- No existe "crear cuenta": los usuarios los da de alta un administrador (paso 6).

## Base de datos

| Tabla | Para qué |
|---|---|
| `perfiles` | Nombre de cada usuario (`id` = `auth.users.id`; se crea solo al invitarlo) |
| `proyectos` | Emprendimientos: figura (fideicomiso, pozo, propio), moneda base, estado |
| `miembros` | Quién participa de cada proyecto, con qué rol y si ve el libro B |
| `cuentas` | Plan de cuentas por proyecto (niveles 1 a 4) |
| `auditoria` | Registro de altas, cambios y bajas en proyectos, miembros y cuentas |

Permisos (RLS):

- Cada usuario ve solo los proyectos donde es miembro, y los miembros, cuentas y
  perfiles de esos proyectos.
- Solo un **administrador** del proyecto modifica el proyecto, sus miembros y sus cuentas.
- La **auditoría** la leen solo los administradores del proyecto. Nadie la modifica ni la
  borra, ni siquiera desde el SQL Editor.
- Sin sesión no se accede a ninguna tabla.

Reglas de integridad que controla la base:

- Un proyecto no puede quedarse sin administrador. Por eso tampoco se puede borrar
  desde Supabase al usuario que sea el único administrador de un proyecto: primero
  hay que nombrar a otro.
- Una cuenta de nivel *n* tiene que colgar de una cuenta de nivel *n − 1* del mismo
  proyecto. Las de nivel 1 no tienen padre.
- Los proyectos con cuentas no se pueden borrar.

## Estructura

```
src/
  proxy.ts                Protección de rutas y renovación de sesión
  app/
    (auth)/ingresar/      Ingreso
    (auth)/recuperar/     Pedido de correo de recuperación
    (auth)/nueva-clave/   Elegir contraseña nueva (requiere sesión)
    auth/confirmar/       Destino de los enlaces de los correos de Supabase
    (app)/                Pantallas internas (barra lateral + contenido)
  components/
    app/                  Barra lateral, menú móvil, logo, secciones vacías
    ingreso/              Formularios de acceso
    ui/                   Componentes de shadcn/ui
  lib/
    supabase/             Clientes de Supabase (navegador, servidor, proxy)
    acciones-auth.ts      Ingresar, recuperar, cambiar contraseña, salir
    formato.ts            Formatos es-AR (dd/mm/aaaa, 1.234,56)
supabase/
  migrations/             Migraciones (se aplican en orden)
  seed.sql                Proyecto inicial, sin personas ni montos
  tests/verificar_rls.sql Prueba de permisos para el SQL Editor
```

## Logos

Los originales están en `public/marca/` (no se tocan). Los que usa la app se generan con:

```bash
npm run logos
```

Ese comando (`scripts/generar-logos.mjs`, con sharp) recorta cada original al contenido, convierte
el blanco en transparencia (negro puro con bordes suaves, sin halos grises) y escribe
`public/paralelo-logotipo.png` (pantallas de acceso) y
`public/paralelo-isotipo.png` (barra lateral). Si faltaran, la app muestra "Paralelo" / "P".

## Próximos pasos

- Pantalla de usuarios y roles para administradores.
- Selector de proyecto en la barra lateral, leído de la base.
- Plan de cuentas, cotizaciones y asientos con partida doble validada en la base.
- Ingreso con Google.
