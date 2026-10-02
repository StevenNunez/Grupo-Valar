-- Los EDP históricos de demo conservan la plantilla con que se interpretan.
-- La fuente es el contrato explícito configurado por 0040.
update public.estados_pago e
set datos = coalesce(e.datos, '{}'::jsonb) || jsonb_build_object('plantilla_edp', c.plantilla_edp)
from public.contratos c
where e.empresa_id = 'demo'
  and c.empresa_id = e.empresa_id
  and c.id = e.contrato_id
  and c.id in ('C-MISC', 'C-TORRES')
  and not (coalesce(e.datos, '{}'::jsonb) ? 'plantilla_edp');
