-- La plantilla de ingreso pertenece al contrato; no se deduce de su nombre.
alter table public.contratos
  add column if not exists plantilla_edp text not null default 'general';

alter table public.contratos
  drop constraint if exists contratos_plantilla_edp_check;
alter table public.contratos
  add constraint contratos_plantilla_edp_check
  check (plantilla_edp in ('general', 'miscelaneos', 'torres', 'carpas'));

-- Solo demo contiene las referencias históricas de estas dos planillas.
update public.contratos set plantilla_edp = 'miscelaneos'
where empresa_id = 'demo' and id = 'C-MISC';
update public.contratos set plantilla_edp = 'torres'
where empresa_id = 'demo' and id = 'C-TORRES';

notify pgrst, 'reload schema';
