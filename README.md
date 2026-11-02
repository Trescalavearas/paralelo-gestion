# Paralelo · Gestión inmobiliaria

App web multi-proyecto de gestión inmobiliaria y contable (libros A y B, ARS y USD,
presupuesto y avance de obra, unidades y cobranzas, boletos, tareas y factibilidad).
Primer proyecto: **Paralelo · Crisol 168** (fideicomiso).

> **Fase 0 — esqueleto.** Solo diseño y navegación. No hay autenticación ni base de
> datos: la pantalla de ingreso no valida nada y "Ingresar" lleva directo al tablero.
> No se carga ningún dato real.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (componentes en `src/components/ui`)
- Recharts (instalado para las próximas fases)
- Tipografías Geist y Geist Mono (paquete `geist`, sin depender de Google Fonts)
- Próximas fases: Supabase (Postgres + Storage) y autenticación

Las reglas del proyecto (contables, de seguridad y de diseño) están en [`CLAUDE.md`](./CLAUDE.md).

## Correrlo en tu computadora

Requisitos: **Node.js 20.9 o superior** y npm.

```bash
npm install
```

```bash
npm run dev
```

Abrí <http://localhost:3000>: te lleva a `/ingresar`. Tocá **Ingresar** para ir al tablero.

Otros comandos:

| Comando | Para qué sirve |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run build` | Compila la versión de producción (lo mismo que hace Vercel) |
| `npm run start` | Sirve la versión compilada |
| `npm run lint` | Revisa el código con ESLint |

## Logos

Subí a la carpeta `public/` estos archivos, con estos nombres exactos:

- `paralelo-logotipo.png`: logo completo, en la pantalla de ingreso.
- `paralelo-isotipo.png`: símbolo cuadrado, en el selector de proyecto de la barra lateral.

Mientras no estén, la app muestra el texto "Paralelo" / "P" en su lugar.

## Estructura

```
src/
  app/
    (auth)/ingresar/      Pantalla de ingreso (solo diseño)
    (app)/layout.tsx      Barra lateral + contenido
    (app)/tablero/        Tablero
    (app)/tareas/ …       Secciones (vacías por ahora)
    globals.css           Colores, radios y degradé del tema
  components/
    app/                  Barra lateral, menú móvil, logo, secciones vacías
    ingreso/              Formulario de ingreso
    ui/                   Componentes de shadcn/ui
  config/navegacion.ts    Ítems del menú y proyecto actual
  lib/formato.ts          Formatos es-AR (dd/mm/aaaa, 1.234,56)
supabase/migrations/      Migraciones de la base (desde la fase 1)
```

Para agregar una sección al menú: sumá el ítem en `src/config/navegacion.ts` y creá
`src/app/(app)/<ruta>/page.tsx`.

## Publicar en Vercel

**Opción A: desde la web (recomendada)**

1. Entrá a <https://vercel.com/new> con tu cuenta.
2. Elegí **Import Git Repository** y seleccioná `paralelo-gestion`
   (la primera vez, autorizá a Vercel a ver el repositorio en GitHub).
3. Vercel detecta **Next.js** solo. No hace falta cambiar comandos ni carpeta.
4. En la fase 0 **no hay variables de entorno** que cargar.
5. Tocá **Deploy**. En un par de minutos tenés la URL pública.

Desde ahí, cada push a `main` publica en producción y cada pull request genera una
URL de vista previa.

**Opción B: desde la terminal**

```bash
npx vercel
```

```bash
npx vercel --prod
```

## Variables de entorno

La fase 0 no usa ninguna. Ver [`.env.example`](./.env.example). Cuando se agreguen
(fase 1), los valores reales van en `.env.local` (no se sube al repo) y en Vercel →
*Settings → Environment Variables*. Nunca subas claves al repositorio.

## Próximos pasos

- **Fase 1:** autenticación (Supabase Auth o Auth0), tablas `proyectos` y `miembros`
  con RLS, primeras migraciones.
- Después: plan de cuentas, asientos con partida doble validada en la base,
  cotizaciones, unidades, boletos, presupuesto, tareas.
