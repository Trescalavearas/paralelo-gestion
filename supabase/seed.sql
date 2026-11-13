-- =============================================================================
-- Datos iniciales: solo el proyecto "Paralelo · Crisol 168".
-- Sin cuentas, sin miembros, sin personas ni montos.
--
-- Se puede correr más de una vez: si el proyecto ya existe, no hace nada.
-- Revisá moneda_base antes de correrlo (queda en ARS por defecto).
-- =============================================================================

insert into public.proyectos (nombre, figura, moneda_base, estado)
select 'Paralelo · Crisol 168', 'fideicomiso', 'ARS', 'activo'
where not exists (
  select 1 from public.proyectos where nombre = 'Paralelo · Crisol 168'
);
