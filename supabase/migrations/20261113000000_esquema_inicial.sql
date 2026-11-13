-- =============================================================================
-- Fase 1 · Esquema inicial
-- perfiles, proyectos, miembros, cuentas, auditoría, funciones auxiliares y RLS.
--
-- Se aplica una sola vez, completa, desde el SQL Editor de Supabase
-- (o con `supabase db push`). No carga datos: para el proyecto inicial ver
-- supabase/seed.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.figura_proyecto as enum ('fideicomiso', 'pozo', 'propio');

create type public.moneda as enum ('ARS', 'USD');

create type public.estado_proyecto as enum ('en_estudio', 'activo', 'finalizado', 'archivado');

create type public.rol_miembro as enum (
  'administrador',
  'contador',
  'direccion_obra',
  'comercial',
  'lectura'
);

create type public.tipo_cuenta as enum (
  'activo',
  'pasivo',
  'patrimonio_neto',
  'ingreso',
  'egreso'
);


-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

-- Perfil de cada usuario de Supabase Auth (se crea solo, ver trigger más abajo).
create table public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null default '',
  creado_en timestamptz not null default now()
);
comment on table public.perfiles is 'Datos visibles de cada usuario. id = auth.users.id.';

create table public.proyectos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) > 0),
  figura      public.figura_proyecto not null,
  moneda_base public.moneda not null default 'ARS',
  estado      public.estado_proyecto not null default 'activo',
  creado_en   timestamptz not null default now()
);
comment on table public.proyectos is 'Cada emprendimiento (fideicomiso, pozo o propio).';

create table public.miembros (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  rol         public.rol_miembro not null default 'lectura',
  ve_libro_b  boolean not null default false,
  creado_en   timestamptz not null default now(),
  primary key (proyecto_id, usuario_id)
);
comment on table public.miembros is 'Quién participa de cada proyecto, con qué rol y si ve el libro B.';
create index miembros_usuario_idx on public.miembros (usuario_id);

-- Plan de cuentas por proyecto, hasta 4 niveles.
create table public.cuentas (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos (id) on delete restrict,
  codigo       text not null check (length(btrim(codigo)) > 0),
  nombre       text not null check (length(btrim(nombre)) > 0),
  nivel        smallint not null check (nivel between 1 and 4),
  cuenta_padre uuid,
  tipo         public.tipo_cuenta not null,
  computa      boolean not null default true,
  rubro_obra   text,
  creado_en    timestamptz not null default now(),
  unique (proyecto_id, codigo),
  unique (proyecto_id, id),
  -- La cuenta padre tiene que ser del mismo proyecto.
  foreign key (proyecto_id, cuenta_padre)
    references public.cuentas (proyecto_id, id) on delete restrict,
  -- Nivel 1 no tiene padre; los niveles 2 a 4 sí.
  check ((nivel = 1) = (cuenta_padre is null))
);
comment on column public.cuentas.computa is 'Si la cuenta computa en los reportes e indicadores del proyecto.';
comment on column public.cuentas.rubro_obra is 'Rubro de obra asociado (para presupuesto y avance), si corresponde.';
create index cuentas_padre_idx on public.cuentas (cuenta_padre);

-- Registro de altas, cambios y bajas. Nadie lo modifica.
create table public.auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid,               -- auth.uid() de quien hizo el cambio (null = SQL Editor / sistema)
  accion      text not null check (accion in ('alta', 'cambio', 'baja')),
  tabla       text not null,
  registro_id text not null,
  proyecto_id uuid,               -- sin FK: el registro sobrevive aunque se borre el proyecto
  antes       jsonb,
  despues     jsonb,
  fecha_hora  timestamptz not null default now()
);
comment on table public.auditoria is 'Bitácora inmutable de cambios en proyectos, miembros y cuentas.';
create index auditoria_proyecto_idx on public.auditoria (proyecto_id, fecha_hora desc);


-- -----------------------------------------------------------------------------
-- Funciones auxiliares (usadas por las políticas RLS)
--
-- Son SECURITY DEFINER para poder leer `miembros` sin volver a disparar su
-- propia RLS (evita recursión). Solo informan sobre el usuario que llama.
-- -----------------------------------------------------------------------------

create function public.es_miembro(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.miembros m
    where m.proyecto_id = p_proyecto
      and m.usuario_id = (select auth.uid())
  );
$$;

create function public.rol_en(p_proyecto uuid)
returns public.rol_miembro
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol
  from public.miembros m
  where m.proyecto_id = p_proyecto
    and m.usuario_id = (select auth.uid());
$$;

create function public.ve_libro_b(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.ve_libro_b
    from public.miembros m
    where m.proyecto_id = p_proyecto
      and m.usuario_id = (select auth.uid())
  ), false);
$$;

create function public.es_administrador(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_en(p_proyecto) = 'administrador', false);
$$;


-- -----------------------------------------------------------------------------
-- Perfil automático al crear un usuario en Supabase Auth
-- -----------------------------------------------------------------------------

create function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_de_usuario();

-- Usuarios que ya existían antes de esta migración.
insert into public.perfiles (id, nombre)
select u.id, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Reglas de integridad
-- -----------------------------------------------------------------------------

-- Nivel de la cuenta = nivel del padre + 1.
create function public.validar_nivel_cuenta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nivel_padre smallint;
begin
  if new.cuenta_padre is not null then
    select c.nivel into v_nivel_padre
    from public.cuentas c
    where c.id = new.cuenta_padre;

    if v_nivel_padre is distinct from new.nivel - 1 then
      raise exception 'La cuenta % es de nivel % pero su cuenta padre es de nivel %.',
        new.codigo, new.nivel, v_nivel_padre
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger cuentas_validar_nivel
  before insert or update of nivel, cuenta_padre on public.cuentas
  for each row execute function public.validar_nivel_cuenta();

-- Un proyecto nunca se queda sin administrador por un cambio en miembros.
create function public.conservar_un_administrador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Si se está borrando el proyecto entero (cascada), no hay nada que cuidar.
  if not exists (select 1 from public.proyectos p where p.id = old.proyecto_id) then
    return null;
  end if;

  if old.rol = 'administrador'
     and not exists (
       select 1 from public.miembros m
       where m.proyecto_id = old.proyecto_id
         and m.rol = 'administrador'
     ) then
    raise exception 'El proyecto tiene que conservar al menos un administrador.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger miembros_conservar_administrador
  after update of rol or delete on public.miembros
  for each row execute function public.conservar_un_administrador();


-- -----------------------------------------------------------------------------
-- Auditoría
-- -----------------------------------------------------------------------------

create function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_fila    jsonb := coalesce(v_despues, v_antes);
begin
  if tg_op = 'UPDATE' and v_antes = v_despues then
    return null;  -- sin cambios reales
  end if;

  insert into public.auditoria (usuario_id, accion, tabla, registro_id, proyecto_id, antes, despues)
  values (
    (select auth.uid()),
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    tg_table_name,
    coalesce(v_fila ->> 'id', (v_fila ->> 'proyecto_id') || '/' || (v_fila ->> 'usuario_id')),
    case when tg_table_name = 'proyectos' then (v_fila ->> 'id')::uuid
         else (v_fila ->> 'proyecto_id')::uuid end,
    v_antes,
    v_despues
  );
  return null;
end;
$$;

create trigger auditar_proyectos
  after insert or update or delete on public.proyectos
  for each row execute function public.auditar();

create trigger auditar_miembros
  after insert or update or delete on public.miembros
  for each row execute function public.auditar();

create trigger auditar_cuentas
  after insert or update or delete on public.cuentas
  for each row execute function public.auditar();

-- La auditoría no se modifica ni se borra, tampoco desde el SQL Editor.
create function public.auditoria_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger auditoria_sin_cambios
  before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();

create trigger auditoria_sin_truncate
  before truncate on public.auditoria
  for each statement execute function public.auditoria_inmutable();


-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- Las de trigger no se exponen; las auxiliares solo para usuarios con sesión.
-- -----------------------------------------------------------------------------

revoke all on function
  public.es_miembro(uuid),
  public.rol_en(uuid),
  public.ve_libro_b(uuid),
  public.es_administrador(uuid),
  public.crear_perfil_de_usuario(),
  public.validar_nivel_cuenta(),
  public.conservar_un_administrador(),
  public.auditar(),
  public.auditoria_inmutable()
from public, anon, authenticated;

grant execute on function
  public.es_miembro(uuid),
  public.rol_en(uuid),
  public.ve_libro_b(uuid),
  public.es_administrador(uuid)
to authenticated;


-- -----------------------------------------------------------------------------
-- Permisos de tablas
-- Los visitantes sin sesión (anon) no acceden a nada. Las filas visibles para
-- authenticated las decide RLS.
-- -----------------------------------------------------------------------------

revoke all on public.perfiles, public.proyectos, public.miembros, public.cuentas, public.auditoria
from anon, authenticated;

grant select, update (nombre)           on public.perfiles  to authenticated;
grant select, update                    on public.proyectos to authenticated;
grant select, insert, update, delete    on public.miembros  to authenticated;
grant select, insert, update, delete    on public.cuentas   to authenticated;
grant select                            on public.auditoria to authenticated;


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.perfiles  enable row level security;
alter table public.proyectos enable row level security;
alter table public.miembros  enable row level security;
alter table public.cuentas   enable row level security;
alter table public.auditoria enable row level security;

-- perfiles: el propio y el de quienes comparten algún proyecto conmigo.
create policy "perfiles: ver propio y compañeros"
  on public.perfiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.miembros m
      where m.usuario_id = perfiles.id
        and public.es_miembro(m.proyecto_id)
    )
  );

create policy "perfiles: editar el propio"
  on public.perfiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- proyectos: cada usuario ve solo aquellos donde es miembro.
-- Altas y bajas de proyectos: por ahora solo desde el SQL Editor.
create policy "proyectos: ver si soy miembro"
  on public.proyectos for select to authenticated
  using (public.es_miembro(id));

create policy "proyectos: editar si soy administrador"
  on public.proyectos for update to authenticated
  using (public.es_administrador(id))
  with check (public.es_administrador(id));

-- miembros: se ven los del mismo proyecto; solo un administrador los modifica.
create policy "miembros: ver los de mis proyectos"
  on public.miembros for select to authenticated
  using (public.es_miembro(proyecto_id));

create policy "miembros: alta por administrador"
  on public.miembros for insert to authenticated
  with check (public.es_administrador(proyecto_id));

create policy "miembros: cambio por administrador"
  on public.miembros for update to authenticated
  using (public.es_administrador(proyecto_id))
  with check (public.es_administrador(proyecto_id));

create policy "miembros: baja por administrador"
  on public.miembros for delete to authenticated
  using (public.es_administrador(proyecto_id));

-- cuentas: las ven los miembros; solo un administrador las modifica.
create policy "cuentas: ver las de mis proyectos"
  on public.cuentas for select to authenticated
  using (public.es_miembro(proyecto_id));

create policy "cuentas: alta por administrador"
  on public.cuentas for insert to authenticated
  with check (public.es_administrador(proyecto_id));

create policy "cuentas: cambio por administrador"
  on public.cuentas for update to authenticated
  using (public.es_administrador(proyecto_id))
  with check (public.es_administrador(proyecto_id));

create policy "cuentas: baja por administrador"
  on public.cuentas for delete to authenticated
  using (public.es_administrador(proyecto_id));

-- auditoría: la leen solo administradores del proyecto. Sin políticas de
-- escritura: las filas las agrega únicamente el trigger auditar().
create policy "auditoria: leer si soy administrador"
  on public.auditoria for select to authenticated
  using (proyecto_id is not null and public.es_administrador(proyecto_id));
