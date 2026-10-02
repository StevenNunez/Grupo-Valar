"use client";

import { mesCorto } from "./formato";
import { supabase } from "./supabase";
import { cargarEgresosOficina, type EgresoOficina } from "./oficina-central";

/**
 * Datos del Dashboard de rentabilidad.
 *
 * Todo sale de dos vistas que suman lo que se carga en Ingresos y Egresos:
 *
 *   resumen_mensual      venta, costo y margen por contrato y mes
 *   costos_por_categoria real contra presupuesto, por categoría
 *
 * El Dashboard no guarda ningún número propio. Si un total no cuadra, el dato
 * que hay que corregir está en la vista donde se carga.
 */

export type FilaMes = {
  contratoId: string;
  contrato: string;
  cliente: string;
  periodo: string;
  etiqueta: string;
  venta: number;
  ventaOrdinaria: number;
  ventaExtraordinaria: number;
  cobrado: number;
  costo: number;
  reembolsable: number;
  margen: number;
  margenPct: number | null;
  metaMargen: number;
};

export type FilaCategoria = {
  categoriaId: string;
  contratoId: string;
  categoria: string;
  familia: "compras" | "servicios" | "personal";
  presupuestoMensual: number;
  periodo: string | null;
  /** Todo lo cargado a la categoría, reembolsables incluidos. */
  real: number;
  /** Solo lo que descuenta margen. Es lo que suma el costo del contrato. */
  realOrdinario: number;
};

export type DatosDashboard = {
  meses: FilaMes[];
  categorias: FilaCategoria[];
  oficina: EgresoOficina[];
};

type FilaResumenSQL = {
  contrato_id: string;
  contrato: string;
  cliente: string;
  periodo: string;
  venta: number;
  venta_ordinaria: number;
  venta_extraordinaria: number;
  cobrado: number;
  costo: number;
  reembolsable: number;
  margen: number;
  margen_pct: number | null;
  meta_margen: number;
};

type FilaCategoriaSQL = {
  categoria_id: string;
  contrato_id: string;
  categoria: string;
  familia: "compras" | "servicios" | "personal";
  presupuesto_mensual: number;
  periodo: string | null;
  real: number;
  /* Lo agrega la migración 0014. Puede no venir si todavía no está aplicada. */
  real_ordinario?: number;
};

export async function cargarDashboard(): Promise<DatosDashboard> {
  const [resumen, categorias, oficina] = await Promise.all([
    supabase.from("resumen_mensual").select("*").order("periodo"),
    supabase.from("costos_por_categoria").select("*"),
    cargarEgresosOficina(),
  ]);

  const fallo = resumen.error ?? categorias.error;
  if (fallo) throw new Error(fallo.message);

  return {
    oficina,
    meses: ((resumen.data ?? []) as FilaResumenSQL[]).map((r) => ({
      contratoId: r.contrato_id,
      contrato: r.contrato,
      cliente: r.cliente,
      periodo: r.periodo,
      etiqueta: mesCorto(r.periodo),
      venta: r.venta,
      ventaOrdinaria: r.venta_ordinaria,
      ventaExtraordinaria: r.venta_extraordinaria,
      cobrado: r.cobrado,
      costo: r.costo,
      reembolsable: r.reembolsable,
      margen: r.margen,
      margenPct: r.margen_pct === null ? null : Number(r.margen_pct),
      metaMargen: Number(r.meta_margen),
    })),
    categorias: ((categorias.data ?? []) as FilaCategoriaSQL[]).map((c) => ({
      categoriaId: c.categoria_id,
      contratoId: c.contrato_id,
      categoria: c.categoria,
      familia: c.familia,
      presupuestoMensual: c.presupuesto_mensual,
      periodo: c.periodo,
      real: c.real,
      // Si la 0014 no está aplicada, la columna no viene y `real` es lo mejor
      // que hay. La composición del costo quedará incluyendo reembolsables
      // hasta que se aplique, pero nada se cae.
      realOrdinario: c.real_ordinario ?? c.real,
    })),
  };
}

/* ── Cálculos ─────────────────────────────────────────────────────────────── */

export type Totales = {
  venta: number;
  costo: number;
  margen: number;
  margenPct: number;
  reembolsable: number;
  cobrado: number;
};

export function sumar(filas: FilaMes[]): Totales {
  const venta = filas.reduce((t, f) => t + f.venta, 0);
  const costo = filas.reduce((t, f) => t + f.costo, 0);
  return {
    venta,
    costo,
    margen: venta - costo,
    margenPct: venta > 0 ? ((venta - costo) / venta) * 100 : 0,
    reembolsable: filas.reduce((t, f) => t + f.reembolsable, 0),
    cobrado: filas.reduce((t, f) => t + f.cobrado, 0),
  };
}

export type Contrato = {
  id: string;
  nombre: string;
  cliente: string;
  meta: number;
  totales: Totales;
  /** Cuánto del margen total aporta este contrato. */
  aporteMargen: number;
  /** Cuánto de la venta total representa. */
  aporteVenta: number;
};

/** Agrupa las filas mensuales por contrato y calcula su peso en el total. */
export function porContrato(filas: FilaMes[]): Contrato[] {
  const total = sumar(filas);
  const grupos = new Map<string, FilaMes[]>();

  for (const f of filas) {
    const actual = grupos.get(f.contratoId);
    if (actual) actual.push(f);
    else grupos.set(f.contratoId, [f]);
  }

  return [...grupos.entries()]
    .map(([id, suyas]) => {
      const totales = sumar(suyas);
      return {
        id,
        nombre: suyas[0].contrato,
        cliente: suyas[0].cliente,
        meta: suyas[0].metaMargen,
        totales,
        aporteMargen: total.margen > 0 ? (totales.margen / total.margen) * 100 : 0,
        aporteVenta: total.venta > 0 ? (totales.venta / total.venta) * 100 : 0,
      };
    })
    .sort((a, b) => b.totales.venta - a.totales.venta);
}

/** Una fila por mes con el consolidado y el detalle de cada contrato. */
export type Evolucion = {
  periodo: string;
  etiqueta: string;
  consolidado: Totales;
  porContrato: Map<string, Totales>;
};

export function evolucion(filas: FilaMes[]): Evolucion[] {
  const meses = [...new Set(filas.map((f) => f.periodo))].sort();

  return meses.map((periodo) => {
    const delMes = filas.filter((f) => f.periodo === periodo);
    const porContrato = new Map<string, Totales>();
    for (const f of delMes) porContrato.set(f.contratoId, sumar([f]));

    return {
      periodo,
      etiqueta: mesCorto(periodo),
      consolidado: sumar(delMes),
      porContrato,
    };
  });
}

/* ── Valor de la UF ───────────────────────────────────────────────────────── */

export type EstadoUf = {
  valorHoy: number;
  fechaValor: string;
  ultimoDiaCargado: string;
  diasCargados: number;
  ultimaCorrida: string | null;
};

/**
 * Qué UF rige y hasta qué día está cargada la serie.
 *
 * Importa porque C-TORRES factura en UF: si la serie se quedó atrás, el ingreso
 * del mes se valoriza con un valor viejo. La trae una tarea programada de la
 * base (`supabase/migraciones/0011_uf_automatica.sql`).
 *
 * Devuelve `null` en vez de reventar si la vista todavía no existe: es un dato
 * de contexto, no puede impedir que el Dashboard se dibuje.
 */
export async function cargarEstadoUf(): Promise<EstadoUf | null> {
  const { data, error } = await supabase
    .from("uf_estado")
    .select("valor_hoy, fecha_valor, ultimo_dia_cargado, dias_cargados, ultima_corrida")
    .maybeSingle();

  if (error || !data || data.valor_hoy === null) return null;

  return {
    valorHoy: Number(data.valor_hoy),
    fechaValor: data.fecha_valor as string,
    ultimoDiaCargado: data.ultimo_dia_cargado as string,
    diasCargados: Number(data.dias_cargados),
    ultimaCorrida: (data.ultima_corrida as string | null) ?? null,
  };
}

/* ── Costo por categoría ──────────────────────────────────────────────────── */

export type CategoriaAcumulada = {
  id: string;
  categoria: string;
  contratoId: string;
  real: number;
  /** El presupuesto del período: el mensual del contrato por los meses vistos. */
  presupuesto: number;
};

/**
 * Junta las filas de `costos_por_categoria`, que vienen una por categoría y
 * mes, en una sola por categoría.
 *
 * Vive acá y no en la tabla que la dibuja porque el informe impreso tiene que
 * mostrar exactamente el mismo número que la pantalla. Cuando estaba duplicado,
 * el informe listaba la misma categoría tres veces, una por mes.
 *
 * `periodosVisibles` es lo que hace que el porcentaje de consumo signifique
 * algo: el presupuesto se multiplica por los meses que se están mirando, así
 * que el gasto real tiene que venir de esos mismos meses. Sin ese filtro, mirar
 * un mes daba "246% consumido" —el gasto de todo el año contra el presupuesto
 * de un mes—. Omitirlo suma todos los meses que haya.
 */
export function acumularCategorias(
  categorias: FilaCategoria[],
  contratoFiltro: string,
  meses: number,
  periodosVisibles?: string[],
): CategoriaAcumulada[] {
  const acumulado = new Map<string, CategoriaAcumulada>();

  for (const c of categorias) {
    if (contratoFiltro !== "todos" && c.contratoId !== contratoFiltro) continue;

    // Las categorías sin ningún movimiento vienen con el período en nulo. Se
    // dejan pasar: aportan su presupuesto y un real de cero, que es justamente
    // lo que hay que mostrar.
    if (periodosVisibles && c.periodo !== null && !periodosVisibles.includes(c.periodo)) {
      continue;
    }

    const actual = acumulado.get(c.categoriaId);
    if (actual) {
      actual.real += c.real;
    } else {
      acumulado.set(c.categoriaId, {
        id: c.categoriaId,
        categoria: c.categoria,
        contratoId: c.contratoId,
        real: c.real,
        // El presupuesto es mensual: para compararlo contra el acumulado hay
        // que multiplicarlo por los meses que se están mirando.
        presupuesto: c.presupuestoMensual * meses,
      });
    }
  }

  return [...acumulado.values()]
    .filter((f) => f.real > 0 || f.presupuesto > 0)
    .sort((a, b) => b.real - a.real);
}

/* ── Composición del costo ────────────────────────────────────────────────── */

export const FAMILIAS = ["compras", "servicios", "personal"] as const;
export type Familia = (typeof FAMILIAS)[number];

export const nombreFamilia: Record<Familia, string> = {
  compras: "Compras",
  servicios: "Servicios",
  personal: "Personal",
};

export type CostoDeContrato = {
  contratoId: string;
  nombre: string;
  porFamilia: Record<Familia, number>;
  total: number;
};

/**
 * El costo de cada contrato abierto en las tres familias del menú de Egresos.
 *
 * Usa `realOrdinario`, no `real`: los reembolsables se le cobran al mandante y
 * no descuentan margen, así que sumarlos dejaría la composición más alta que el
 * costo que muestra el resto del Dashboard. Con dos contratos eran $1,3 M de
 * diferencia — poco en plata, fatal en una reunión donde dos totales de la
 * misma pantalla no calzan.
 */
export function costoPorFamilia(
  categorias: FilaCategoria[],
  contratos: Contrato[],
  periodosVisibles?: string[],
): CostoDeContrato[] {
  const porContrato = new Map<string, CostoDeContrato>();

  for (const c of contratos) {
    porContrato.set(c.id, {
      contratoId: c.id,
      nombre: c.nombre,
      porFamilia: { compras: 0, servicios: 0, personal: 0 },
      total: 0,
    });
  }

  for (const f of categorias) {
    const destino = porContrato.get(f.contratoId);
    if (!destino) continue;
    if (periodosVisibles && f.periodo !== null && !periodosVisibles.includes(f.periodo)) {
      continue;
    }
    destino.porFamilia[f.familia] += f.realOrdinario;
    destino.total += f.realOrdinario;
  }

  return [...porContrato.values()].filter((c) => c.total > 0);
}

/* ── Color de cada contrato ───────────────────────────────────────────────── */

/**
 * Los tres colores de serie del módulo. Validados para daltonismo con el
 * comprobador de la guía de visualización: pasan las seis pruebas —incluida la
 * de todos los pares, la exigente— sobre fondo blanco.
 *
 * Los dos primeros son los que el módulo ya usaba. El tercero reemplaza a un
 * verde y un morado que NO estaban validados: ese verde colapsaba con el
 * naranjo bajo deuteranopía (ΔE 3,1, cuando el mínimo es 8).
 *
 * No se agregan colores más allá de estos tres. Si algún día hay más series de
 * las que caben, la cola se agrupa en "Otros" —en gris— o se separa en varios
 * gráficos; inventar un cuarto tono es justamente lo que rompe la prueba.
 */
export const SERIES = ["#137e9e", "#9c5518", "#4a3aa7"] as const;

export const GRIS_OTROS = "#8c9296";

/**
 * El color de un contrato, atado a su id y no a su posición.
 *
 * Importa: la lista de contratos viene ordenada por venta. Si el color saliera
 * de esa posición, filtrar o un mes en que Torres venda más que Misceláneos les
 * cambiaría el color, y quien aprendió "Misceláneos es azul" leería mal el
 * gráfico siguiente.
 */
export function colorDeContrato(id: string, ids: string[]) {
  const orden = [...ids].sort();
  const i = orden.indexOf(id);
  return i >= 0 && i < SERIES.length ? SERIES[i] : GRIS_OTROS;
}

/** Semáforo contra la meta, con el mismo criterio de las planillas. */
export type Semaforo = "bueno" | "aviso" | "critico";

export function semaforo(margenPct: number, meta: number): Semaforo {
  if (margenPct >= meta) return "bueno";
  // Hasta cinco puntos bajo la meta es para mirar; más abajo, es problema.
  if (margenPct >= meta - 5) return "aviso";
  return "critico";
}

export const textoSemaforo: Record<Semaforo, string> = {
  bueno: "Saludable",
  aviso: "Bajo la meta",
  critico: "Requiere atención",
};
