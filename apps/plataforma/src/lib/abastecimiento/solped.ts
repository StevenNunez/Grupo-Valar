"use client";

import { traerTodo } from "../paginar";
import { CONTRATO_OFICINA } from "../contratos";
import { supabase } from "../supabase";

/* ── SOLPED ───────────────────────────────────────────────────────────────── */

export type EstadoSolped =
  | "borrador"
  | "en-aprobacion"
  | "aprobada"
  | "en-cotizacion"
  | "cotizada"
  | "en-compra"
  | "parcial"
  | "cerrada"
  | "rechazada"
  | "anulada";

/** El camino normal de una solicitud, en orden. */
export const etapasSolped: EstadoSolped[] = [
  "borrador",
  "en-aprobacion",
  "aprobada",
  "en-cotizacion",
  "cotizada",
  "en-compra",
  "parcial",
  "cerrada",
];

export const nombreEstadoSolped: Record<EstadoSolped, string> = {
  borrador: "Borrador",
  "en-aprobacion": "En aprobación",
  aprobada: "Aprobada",
  "en-cotizacion": "En cotización",
  cotizada: "Cotizada",
  "en-compra": "En compra",
  parcial: "Recepción parcial",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
  anulada: "Anulada",
};

export type Prioridad = "normal" | "alta" | "urgente";

export const prioridades: { id: Prioridad; titulo: string }[] = [
  { id: "normal", titulo: "Normal" },
  { id: "alta", titulo: "Alta" },
  { id: "urgente", titulo: "Urgente" },
];

export const tiposGasto = [
  { id: "ordinario" as const, titulo: "No reembolsable" },
  { id: "reembolsable" as const, titulo: "Reembolsable" },
];

export type Solped = {
  /** El anexo al que se carga (0059); nulo = contrato base. */
  anexoId: string | null;
  id: string;
  numero: string;
  contratoId: string;
  contrato: string;
  solicitanteNombre: string;
  solicitanteCargo: string | null;
  area: string | null;
  fechaEmision: string;
  fechaRequerida: string | null;
  tipoGasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  estado: EstadoSolped;
  items: number;
  cantidadPedida: number;
  cantidadComprada: number;
  cantidadRecibida: number;
  compradoNeto: number;
  diasAbierta: number;
};

type FilaSolped = {
  anexo_id?: string | null;
  id: string;
  numero: string;
  contrato_id: string;
  contrato: string;
  solicitante_nombre: string;
  solicitante_cargo: string | null;
  area: string | null;
  fecha_emision: string;
  fecha_requerida: string | null;
  tipo_gasto: "ordinario" | "reembolsable";
  prioridad: Prioridad;
  estado: EstadoSolped;
  items: number;
  cantidad_pedida: number;
  cantidad_comprada: number;
  cantidad_recibida: number;
  comprado_neto: number;
  dias_abierta: number;
};

export async function cargarSolped(): Promise<Solped[]> {
  // Todas, no solo las primeras 1000 que devuelve la API por defecto.
  const data = await traerTodo<FilaSolped>(
    (desde, hasta) =>
      supabase
        .from("solped_resumen")
        .select("*")
        .order("fecha_emision", { ascending: false })
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: FilaSolped[] | null; error: { message: string } | null }>,
  );

  return data.map(mapearSolped);
}

/* ── La lista de Solicitudes, por partes ───────────────────────────────────────
   Abre con las más recientes; el resto se busca. Filtros, buscador y orden se
   resuelven en la base. */

export type OrdenDeListaSolped = "numero-desc" | "numero-asc" | "fecha-desc" | "fecha-asc" | "requerida" | "antiguedad" | "solicitante";

export type FiltrosSolped = {
  /** Nulo = todos. Es lo que la base puede decidir del filtro de estado. */
  estados: EstadoSolped[] | null;
  /** Para «abiertas»: todo menos estos. */
  excluir: EstadoSolped[] | null;
  /** «Faltan ítems por comprar»: al menos algo ya comprado. */
  conCompra: boolean;
  /** Id del contrato, o vacío para todos. */
  contrato: string;
  mes: string;
  texto: string;
  orden: OrdenDeListaSolped;
};

const limpiarBusqueda = (t: string) => t.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();

export async function cargarPaginaSolped(f: FiltrosSolped, desde: number, cuantos: number): Promise<Solped[]> {
  let q = supabase.from("solped_resumen").select("*");

  if (f.estados) q = q.in("estado", f.estados);
  if (f.excluir) q = q.not("estado", "in", `(${f.excluir.join(",")})`);
  if (f.conCompra) q = q.gt("cantidad_comprada", 0);
  if (f.contrato) q = q.eq("contrato_id", f.contrato);
  if (f.mes) {
    const [a, m] = f.mes.split("-").map(Number);
    const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    q = q.gte("fecha_emision", `${f.mes}-01`).lt("fecha_emision", siguiente);
  }

  const texto = limpiarBusqueda(f.texto);
  if (texto) {
    q = q.or(
      ["numero", "solicitante_nombre", "solicitante_cargo", "area", "contrato_id", "contrato"]
        .map((c) => `${c}.ilike.*${texto}*`)
        .join(","),
    );
  }

  switch (f.orden) {
    case "numero-desc": q = q.order("numero", { ascending: false }); break;
    case "numero-asc": q = q.order("numero", { ascending: true }); break;
    case "fecha-asc": q = q.order("fecha_emision", { ascending: true }); break;
    case "requerida": q = q.order("fecha_requerida", { ascending: true, nullsFirst: false }); break;
    case "antiguedad": q = q.order("dias_abierta", { ascending: false }); break;
    case "solicitante": q = q.order("solicitante_nombre", { ascending: true }); break;
    default: q = q.order("fecha_emision", { ascending: false });
  }
  // Desempate fijo: sin él, las páginas siguientes pueden repetir o saltarse filas.
  const { data, error } = await q.order("id").range(desde, desde + cuantos - 1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaSolped[]).map(mapearSolped);
}

export type ResumenSolped = {
  cantidad: number;
  porAprobar: number;
  abiertas: number;
  /** Abiertas con más de 7 días. */
  trabadas: number;
  urgentes: number;
  meses: string[];
};

/** Las cifras de arriba de la pantalla, sobre TODAS las solicitudes. */
export async function cargarResumenSolped(): Promise<ResumenSolped> {
  type Fila = { estado: EstadoSolped; prioridad: Prioridad; dias_abierta: number; fecha_emision: string };
  const filas = await traerTodo<Fila>(
    (desde, hasta) =>
      supabase
        .from("solped_resumen")
        .select("estado, prioridad, dias_abierta, fecha_emision")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
  );
  const cerrada = (e: EstadoSolped) => e === "cerrada" || e === "rechazada" || e === "anulada";
  const abiertas = filas.filter((s) => !cerrada(s.estado));
  return {
    cantidad: filas.length,
    porAprobar: filas.filter((s) => s.estado === "en-aprobacion").length,
    abiertas: abiertas.length,
    trabadas: abiertas.filter((s) => Number(s.dias_abierta) > 7).length,
    urgentes: abiertas.filter((s) => s.prioridad === "urgente").length,
    meses: [...new Set(filas.map((s) => s.fecha_emision.slice(0, 7)))].sort().reverse(),
  };
}

/** Solo los números y contratos, para proponer el siguiente N° al crear una solicitud. */
export type NumeroDeSolped = Pick<Solped, "numero" | "contratoId">;

export async function cargarNumerosSolped(): Promise<NumeroDeSolped[]> {
  type Fila = { numero: string; contrato_id: string };
  const filas = await traerTodo<Fila>(
    (desde, hasta) =>
      supabase
        .from("solped_resumen")
        .select("numero, contrato_id")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
  );
  return filas.map((f) => ({ numero: f.numero, contratoId: f.contrato_id }));
}

function mapearSolped(f: FilaSolped): Solped {
  return {
    anexoId: (f.anexo_id as string | null | undefined) ?? null,
    id: f.id,
    numero: f.numero,
    contratoId: f.contrato_id,
    contrato: f.contrato,
    solicitanteNombre: f.solicitante_nombre,
    solicitanteCargo: f.solicitante_cargo,
    area: f.area,
    fechaEmision: f.fecha_emision,
    fechaRequerida: f.fecha_requerida,
    tipoGasto: f.tipo_gasto,
    prioridad: f.prioridad,
    estado: f.estado,
    items: Number(f.items),
    cantidadPedida: Number(f.cantidad_pedida),
    cantidadComprada: Number(f.cantidad_comprada),
    cantidadRecibida: Number(f.cantidad_recibida),
    compradoNeto: Number(f.comprado_neto),
    diasAbierta: Number(f.dias_abierta),
  };
}

export type ItemSolped = {
  id: string;
  solpedId: string;
  linea: number;
  /** Como lo escribió faena. */
  descripcion: string;
  unidad: string;
  cantidad: number;
  categoriaId: string | null;
  /** Solo en solicitudes de Oficina Central (0122): su categoría de oficina. */
  categoriaOficina: string | null;
  observacion: string | null;
  /** Del maestro, cuando el ítem quedó enlazado. */
  articuloId: string | null;
  /** El material en Pagnol, si se eligió de ahí. Solo la referencia. */
  pagnolMaterialId: string | null;
  /** Con el que hay que pedirlo: el técnico si se conoce, si no el de faena. */
  nombreParaPedir: string;
  /** El nombre técnico que ya tiene el artículo del catálogo; nulo si aún no lo tiene. */
  nombreTecnico: string | null;
  especificacion: string | null;
};

export async function cargarItemsDeSolped(solpedId: string): Promise<ItemSolped[]> {
  /* Se trae el artículo enlazado para saber con qué nombre pedirlo: faena pide
     "lentes oscuros" y al proveedor hay que decirle "LENTE MAX FENIX IN OUT".
     Ver `lib/articulos.ts` para por qué son dos nombres y no uno. */
  const { data, error } = await supabase
    .from("solped_items")
    .select("*, articulos(nombre, nombre_tecnico, especificacion)")
    .eq("solped_id", solpedId)
    .order("linea");

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: Record<string, unknown>) => {
    const articulo = [f.articulos].flat()[0] as
      | { nombre: string; nombre_tecnico: string | null; especificacion: string | null }
      | undefined;
    const descripcion = f.descripcion as string;

    return {
      id: f.id as string,
      solpedId: f.solped_id as string,
      linea: Number(f.linea),
      descripcion,
      unidad: f.unidad as string,
      cantidad: Number(f.cantidad),
      categoriaId: (f.categoria_id as string | null) ?? null,
      categoriaOficina: (f.categoria_oficina as string | null) ?? null,
      observacion: (f.observacion as string | null) ?? null,
      articuloId: (f.articulo_id as string | null) ?? null,
      pagnolMaterialId: (f.pagnol_material_id as string | null) ?? null,
      nombreParaPedir: articulo?.nombre_tecnico?.trim() || descripcion,
      nombreTecnico: articulo?.nombre_tecnico?.trim() || null,
      especificacion: articulo?.especificacion ?? null,
    };
  });
}

/**
 * El centro de costo de una solicitud de Oficina Central (0122). Va aparte
 * porque `solped_resumen` no lo trae; sin dato, «general».
 */
export async function cargarCentroDeSolped(solpedId: string): Promise<string> {
  const { data } = await supabase.from("solped").select("centro_costo").eq("id", solpedId).maybeSingle();
  return ((data as { centro_costo?: string | null } | null)?.centro_costo) ?? "general";
}

/** Una cotización suelta, para lo que la vista del comparativo no expone. */
export async function cargarCotizacion(id: string) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("observaciones, validez_hasta")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return {
    observaciones: (data?.observaciones as string | null) ?? null,
    validezHasta: (data?.validez_hasta as string | null) ?? null,
  };
}

/**
 * El número que le toca a la próxima solicitud.
 *
 * Se calcula en la app y no con una función SQL por la misma razón que el
 * correlativo de la orden de compra: PostgREST sirve desde una caché de esquema
 * y una función recién creada puede no existir todavía para el cliente.
 *
 * Compara la parte numérica, no el texto: "SOLPED-9" no le gana a "SOLPED-097".
 */
export function siguienteNumeroSolped(
  solped: NumeroDeSolped[],
  contrato?: { id: string; nombreCorto?: string },
) {
  const ultimo = (lista: NumeroDeSolped[]) =>
    Math.max(0, ...lista.map((s) => Number(/(\d+)\s*$/.exec(s.numero)?.[1] ?? 0)));
  if (!contrato) return `SOLPED-${String(ultimo(solped) + 1).padStart(3, "0")}`;

  /* Cada contrato lleva su propia serie: el código del contrato va en el número
     (así dos contratos pueden tener su "001" sin chocar) y el correlativo sigue
     solo lo que ese contrato ya emitió. */
  const codigo = codigoDeContrato(contrato);
  let n = ultimo(solped.filter((s) => s.contratoId === contrato.id)) + 1;
  const tomado = (c: string) => solped.some((s) => s.numero === c);
  let candidato = `SOLPED-${codigo}-${String(n).padStart(3, "0")}`;
  while (tomado(candidato)) candidato = `SOLPED-${codigo}-${String(++n).padStart(3, "0")}`;
  return candidato;
}

/** "Misceláneos" → "MISC"; sin alias, el id del contrato sin el "C-". */
export function codigoDeContrato(contrato: { id: string; nombreCorto?: string }) {
  if (contrato.id === CONTRATO_OFICINA) return CONTRATO_OFICINA;
  const base = (contrato.nombreCorto?.trim() || contrato.id.replace(/^C-/, ""))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return base.slice(0, 8) || "GEN";
}

