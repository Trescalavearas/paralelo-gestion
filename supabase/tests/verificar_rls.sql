-- =============================================================================
-- Verificación de permisos por fila (RLS)
--
-- Cómo usarlo: pegá todo este archivo en el SQL Editor de Supabase y tocá Run.
--
-- Qué hace: crea dos usuarios de prueba (A y B), cada uno administrador de su
-- propio proyecto de prueba, y comprueba "en la piel" de cada uno qué puede ver
-- y qué puede modificar.
--
-- Cómo leer el resultado: el script SIEMPRE termina mostrando un mensaje en
-- rojo. Es a propósito: al terminar con error, Postgres deshace todo y no queda
-- ningún rastro de los usuarios, proyectos ni registros de auditoría de prueba.
--   · "VERIFICACIÓN RLS SUPERADA"  → todo bien.
--   · "VERIFICACIÓN RLS FALLIDA"   → el mensaje lista qué prueba falló.
--   · Cualquier otro error         → probablemente falta aplicar la migración.
-- =============================================================================

do $$
declare
  v_a       uuid := gen_random_uuid();   -- usuario de prueba A
  v_b       uuid := gen_random_uuid();   -- usuario de prueba B
  v_pa      uuid;                        -- proyecto de A
  v_pb      uuid;                        -- proyecto de B
  v_n       bigint;
  v_ok      text[] := '{}';
  v_fallas  text[] := '{}';
  v_prueba  text;
begin
  -- ---------------------------------------------------------------------------
  -- Preparación (como administrador de la base)
  -- ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
     'prueba-rls-a-' || v_a || '@ejemplo.invalid', '{}', '{"nombre":"Prueba A"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
     'prueba-rls-b-' || v_b || '@ejemplo.invalid', '{}', '{"nombre":"Prueba B"}', now(), now());

  insert into public.proyectos (nombre, figura) values ('Prueba RLS · A', 'propio') returning id into v_pa;
  insert into public.proyectos (nombre, figura) values ('Prueba RLS · B', 'propio') returning id into v_pb;

  insert into public.miembros (proyecto_id, usuario_id, rol, ve_libro_b) values
    (v_pa, v_a, 'administrador', true),
    (v_pb, v_b, 'administrador', false);

  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo) values
    (v_pa, '1', 'Activo (prueba)', 1, 'activo'),
    (v_pb, '1', 'Activo (prueba)', 1, 'activo');

  -- ---------------------------------------------------------------------------
  -- Como usuario A
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '1. A ve un solo proyecto (el suyo)';
  select count(*) into v_n from public.proyectos;
  if v_n = 1 and exists (select 1 from public.proyectos where id = v_pa)
    then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ve ' || v_n); end if;

  v_prueba := '2. A no ve el proyecto de B';
  select count(*) into v_n from public.proyectos where id = v_pb;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '3. A no ve los miembros del proyecto de B';
  select count(*) into v_n from public.miembros where proyecto_id = v_pb;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '4. A no ve las cuentas del proyecto de B';
  select count(*) into v_n from public.cuentas where proyecto_id = v_pb;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '5. A no ve el perfil de B';
  select count(*) into v_n from public.perfiles where id = v_b;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '6. A no puede modificar el proyecto de B';
  with cambiados as (
    update public.proyectos set nombre = 'Hackeado' where id = v_pb returning 1
  ) select count(*) into v_n from cambiados;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '7. A no puede sumarse como miembro del proyecto de B';
  begin
    insert into public.miembros (proyecto_id, usuario_id, rol) values (v_pb, v_a, 'administrador');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '8. A (administrador) lee la auditoría de su proyecto';
  select count(*) into v_n from public.auditoria where proyecto_id = v_pa;
  if v_n > 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '9. A no lee la auditoría del proyecto de B';
  select count(*) into v_n from public.auditoria where proyecto_id = v_pb;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '10. A no puede escribir en la auditoría';
  begin
    insert into public.auditoria (accion, tabla, registro_id) values ('alta', 'x', 'x');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '11. Funciones auxiliares para A';
  if public.es_miembro(v_pa) and not public.es_miembro(v_pb)
     and public.rol_en(v_pa) = 'administrador' and public.rol_en(v_pb) is null
     and public.ve_libro_b(v_pa) and not public.ve_libro_b(v_pb)
    then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '12. A, como administrador, suma a B con rol lectura';
  begin
    insert into public.miembros (proyecto_id, usuario_id, rol) values (v_pa, v_b, 'lectura');
    v_ok := v_ok || v_prueba;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Como usuario B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '13. B ve su proyecto y el de A (donde ahora es lectura)';
  select count(*) into v_n from public.proyectos where id in (v_pa, v_pb);
  if v_n = 2 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ve ' || v_n); end if;

  v_prueba := '14. B (lectura) no puede crear cuentas en el proyecto de A';
  begin
    insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo)
    values (v_pa, '2', 'Pasivo (prueba)', 1, 'pasivo');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '15. B (lectura) no puede cambiarse el rol a administrador';
  with cambiados as (
    update public.miembros set rol = 'administrador'
    where proyecto_id = v_pa and usuario_id = v_b returning 1
  ) select count(*) into v_n from cambiados;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '16. B (lectura) no lee la auditoría del proyecto de A';
  select count(*) into v_n from public.auditoria where proyecto_id = v_pa;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Sin sesión (anon)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  v_prueba := '17. Sin sesión no se accede a proyectos';
  begin
    select count(*) into v_n from public.proyectos;
    if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Ni siquiera el administrador de la base modifica la auditoría
  -- ---------------------------------------------------------------------------
  v_prueba := '18. La auditoría no se puede modificar ni borrar';
  begin
    delete from public.auditoria where proyecto_id = v_pa;
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  -- ---------------------------------------------------------------------------
  -- Resultado (el error final deshace todo lo creado arriba)
  -- ---------------------------------------------------------------------------
  if cardinality(v_fallas) = 0 then
    raise exception E'VERIFICACIÓN RLS SUPERADA: % de % pruebas OK.\n%\n(Este mensaje sale como error a propósito: así se deshacen los usuarios y proyectos de prueba.)',
      cardinality(v_ok), cardinality(v_ok), array_to_string(v_ok, E'\n');
  else
    raise exception E'VERIFICACIÓN RLS FALLIDA: % prueba(s) con problemas.\nFALLARON:\n%\nOK:\n%',
      cardinality(v_fallas), array_to_string(v_fallas, E'\n'), array_to_string(v_ok, E'\n');
  end if;
end;
$$;
