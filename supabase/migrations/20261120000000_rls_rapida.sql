-- =============================================================================
-- RLS rápida: los permisos se calculan una vez por consulta, no por fila
--
-- Las políticas de lineas, asientos y cuentas llamaban a puede_ver_movimientos(),
-- ve_libro_b() y es_miembro() con el proyecto_id de CADA fila. Con el histórico
-- importado (~10.800 líneas) el balance tardaba 7-8 s: casi todo era repetir el
-- mismo chequeo de permisos decenas de miles de veces.
--
-- Ahora cada política compara proyecto_id contra el conjunto de proyectos del
-- usuario, que Postgres calcula una sola vez por consulta ("in (select ...)").
-- Las reglas son las mismas:
--   · lineas:   veo movimientos del proyecto y (libro A o veo el libro B).
--   · asientos: veo movimientos y veo alguna de sus líneas (si veo el libro B veo
--               todas; si no, alguna del libro A).
--   · cuentas:  soy miembro del proyecto.
-- =============================================================================

-- Proyectos donde el usuario es miembro.
create function public.mis_proyectos()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.proyecto_id from public.miembros m where m.usuario_id = (select auth.uid());
$$;

-- Proyectos donde el usuario ve movimientos (mismos roles que puede_ver_movimientos).
create function public.mis_proyectos_con_movimientos()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.proyecto_id from public.miembros m
  where m.usuario_id = (select auth.uid())
    and m.rol in ('administrador', 'contador', 'direccion_obra', 'lectura');
$$;

-- Proyectos donde el usuario ve el libro B.
create function public.mis_proyectos_con_libro_b()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.proyecto_id from public.miembros m
  where m.usuario_id = (select auth.uid()) and m.ve_libro_b;
$$;

revoke all on function public.mis_proyectos() from public, anon;
revoke all on function public.mis_proyectos_con_movimientos() from public, anon;
revoke all on function public.mis_proyectos_con_libro_b() from public, anon;
grant execute on function public.mis_proyectos() to authenticated;
grant execute on function public.mis_proyectos_con_movimientos() to authenticated;
grant execute on function public.mis_proyectos_con_libro_b() to authenticated;

-- lineas
drop policy "lineas: ver según rol y libro" on public.lineas;
create policy "lineas: ver según rol y libro" on public.lineas
  for select to authenticated
  using (
    proyecto_id in (select public.mis_proyectos_con_movimientos())
    and (libro = 'A' or proyecto_id in (select public.mis_proyectos_con_libro_b()))
  );

-- asientos (todo asiento registrado tiene líneas: si veo el libro B, veo alguna)
drop policy "asientos: ver si veo alguna línea" on public.asientos;
create policy "asientos: ver si veo alguna línea" on public.asientos
  for select to authenticated
  using (
    proyecto_id in (select public.mis_proyectos_con_movimientos())
    and (
      proyecto_id in (select public.mis_proyectos_con_libro_b())
      or exists (select 1 from public.lineas l where l.asiento_id = asientos.id and l.libro = 'A')
    )
  );

-- cuentas
drop policy "cuentas: ver las de mis proyectos" on public.cuentas;
create policy "cuentas: ver las de mis proyectos" on public.cuentas
  for select to authenticated
  using (proyecto_id in (select public.mis_proyectos()));
