"use client";

import { mesCorto } from "./formato";
import { supabase } from "./supabase";
import { anexoRaiz, cargarAnexos, etiquetaAnexo } from "./anexos";
import { cargarEgresosOficina, cargarNominasOficina, type EgresoOficina } from "./oficina-central";

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

/**
 * Una fila del Dashboard es una "unidad": un contrato (su base) o un anexo.
 * Un anexo es un contrato más —cobra y gasta aparte—, así que tiene sus propias
 * filas, con id `<contrato>#<anexo>`. La base de un contrato NO incluye lo de
 * sus anexos; para ver todo junto se marcan los anexos en el filtro.
 */
export type FilaMes = {
  contratoId: string;
  /** Si es un anexo: el contrato del que cuelga. Nulo en un contrato. */
  padreId: string | null;
  contrato: string;
  /** Alias interno del contrato (0074); vacío si no tiene. */
  contratoCorto: string;
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

/** Un anexo con el que se puede armar la vista (aunque todavía no tenga nada cargado). */
export type AnexoDisponible = {
  /** Id de unidad: `<contrato>#<anexo>`. */
  id: string;
  contratoId: string;
  nombre: string;
};

export type DatosDashboard = {
  meses: FilaMes[];
  /** Los anexos que se pueden elegir o sumar a su contrato. */
  anexosDisponibles: AnexoDisponible[];
  categorias: FilaCategoria[];
  oficina: EgresoOficina[];
  /** Costo de la nómina de Oficina Central por mes. Vacío para quien no ve sueldos. */
  personalOficina: { periodo: string; costo: number }[];
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

type Acum = {
  venta: number;
  ordinaria: number;
  extraordinaria: number;
  cobrado: number;
  costo: number;
  reembolsable: number;
};
const acumVacio = (): Acum => ({ venta: 0, ordinaria: 0, extraordinaria: 0, cobrado: 0, costo: 0, reembolsable: 0 });

export async function cargarDashboard(): Promise<DatosDashboard> {
  const [resumen, categorias, oficina, nominas, anexos, alias, edpsAnexo, costosAnexo] = await Promise.all([
    supabase.from("resumen_mensual").select("*").order("periodo"),
    supabase.from("costos_por_categoria").select("*"),
    cargarEgresosOficina(),
    /* Si la 0048 todavía no está aplicada, el Dashboard sigue sin la nómina.
       Quien no ve sueldos recibe la lista vacía (RLS), no un error. */
    cargarNominasOficina().catch(() => []),
    cargarAnexos().catch(() => []),
    /* Los alias son un extra (0074): sin la migración, el filtro usa el nombre. */
    supabase.from("contratos").select("id, nombre_corto"),
    /* Lo de los anexos se separa del contrato: sus EDP y sus costos. Si falla,
       el Dashboard sale igual, con todo en el contrato (como antes). */
    supabase.from("estados_pago").select("contrato_id, anexo_id, periodo, tipo_edp, monto_neto, monto_cobrado").not("anexo_id", "is", null),
    supabase.from("costos_unificados").select("contrato_id, anexo_id, categoria_id, categoria, familia, periodo, tipo, neto").not("anexo_id", "is", null),
  ]);

  const fallo = resumen.error ?? categorias.error;
  if (fallo) throw new Error(fallo.message);

  const cortos = new Map(
    (alias.error ? [] : alias.data ?? []).map((f) => [f.id as string, (f.nombre_corto as string | null) ?? ""]),
  );

  /* Cada anexo es una unidad aparte. Las adendas suman a su anexo principal. */
  const raizDe = (contratoId: string, anexoId: string) =>
    anexoRaiz(anexos.filter((a) => a.contratoId === contratoId), anexoId);
  const unidadDe = (contratoId: string, anexoId: string) => `${contratoId}#${raizDe(contratoId, anexoId)}`;
  const nombreAnexo = (contratoId: string, raiz: string) => {
    const a = anexos.find((x) => x.contratoId === contratoId && x.id === raiz);
    return a ? (a.nombre?.trim() ? `Anexo ${a.nombre.trim()}` : etiquetaAnexo(a)) : "Anexo";
  };

  /* unidad → período → cifras */
  const deAnexos = new Map<string, Map<string, Acum>>();
  const celda = (unidad: string, periodo: string) => {
    let porPeriodo = deAnexos.get(unidad);
    if (!porPeriodo) deAnexos.set(unidad, (porPeriodo = new Map()));
    let a = porPeriodo.get(periodo);
    if (!a) porPeriodo.set(periodo, (a = acumVacio()));
    return a;
  };
  type MovCosto = { contrato_id: string; anexo_id: string; categoria_id: string | null; categoria: string | null; familia: string | null; periodo: string | null; tipo: string; neto: number };
  const movimientos = (costosAnexo.error ? [] : costosAnexo.data ?? []) as MovCosto[];

  for (const e of (edpsAnexo.error ? [] : edpsAnexo.data ?? []) as {
    contrato_id: string; anexo_id: string; periodo: string; tipo_edp: string; monto_neto: number; monto_cobrado: number;
  }[]) {
    if (!e.periodo) continue;
    const a = celda(unidadDe(e.contrato_id, e.anexo_id), e.periodo);
    a.venta += Number(e.monto_neto);
    if (e.tipo_edp === "extraordinario") a.extraordinaria += Number(e.monto_neto);
    else a.ordinaria += Number(e.monto_neto);
    a.cobrado += Number(e.monto_cobrado);
  }
  for (const m of movimientos) {
    if (!m.periodo) continue;
    const a = celda(unidadDe(m.contrato_id, m.anexo_id), m.periodo);
    // Igual que resumen_mensual: lo ordinario es costo, lo reembolsable va aparte y un activo no cuenta.
    if (m.tipo === "ordinario") a.costo += Number(m.neto);
    else if (m.tipo === "reembolsable") a.reembolsable += Number(m.neto);
  }

  /* La base de cada contrato = el resumen menos lo de sus anexos. */
  const filasResumen = ((resumen.data ?? []) as FilaResumenSQL[]).filter((r) => r.periodo);
  const meses: FilaMes[] = [];
  const baseDe = new Map<string, FilaMes>();
  for (const r of filasResumen) {
    const fila: FilaMes = {
      contratoId: r.contrato_id,
      padreId: null,
      contrato: r.contrato,
      contratoCorto: cortos.get(r.contrato_id) ?? "",
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
    };
    baseDe.set(`${r.contrato_id}|${r.periodo}`, fila);
    meses.push(fila);
  }

  const recalcular = (f: FilaMes) => {
    f.margen = f.venta - f.costo;
    f.margenPct = f.venta > 0 ? Math.round(((f.venta - f.costo) / f.venta) * 10000) / 100 : null;
  };
  const anexosConDatos: FilaMes[] = [];
  for (const [unidad, porPeriodo] of deAnexos) {
    const [contratoId, raiz] = unidad.split("#");
    for (const [periodo, a] of porPeriodo) {
      const base = baseDe.get(`${contratoId}|${periodo}`);
      if (base) {
        base.venta -= a.venta;
        base.ventaOrdinaria -= a.ordinaria;
        base.ventaExtraordinaria -= a.extraordinaria;
        base.cobrado -= a.cobrado;
        base.costo -= a.costo;
        base.reembolsable -= a.reembolsable;
        recalcular(base);
      }
      const nombre = nombreAnexo(contratoId, raiz);
      const fila: FilaMes = {
        contratoId: unidad,
        padreId: contratoId,
        contrato: nombre,
        contratoCorto: nombre,
        cliente: base?.cliente ?? "",
        periodo,
        etiqueta: mesCorto(periodo),
        venta: a.venta,
        ventaOrdinaria: a.ordinaria,
        ventaExtraordinaria: a.extraordinaria,
        cobrado: a.cobrado,
        costo: a.costo,
        reembolsable: a.reembolsable,
        margen: 0,
        margenPct: null,
        metaMargen: base?.metaMargen ?? filasResumen.find((r) => r.contrato_id === contratoId)?.meta_margen ?? 20,
      };
      recalcular(fila);
      anexosConDatos.push(fila);
    }
  }
  // Un mes de la base que solo tenía lo del anexo queda vacío: no se muestra.
  const vacia = (f: FilaMes) => !f.venta && !f.costo && !f.reembolsable && !f.cobrado;
  const filasMes = [...meses.filter((f) => !vacia(f)), ...anexosConDatos].sort((a, b) =>
    a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : 0,
  );

  /* Los anexos que se pueden elegir: los principales que no están anulados. */
  const anexosDisponibles: AnexoDisponible[] = anexos
    .filter((a) => !a.padreId && a.estado !== "anulado")
    .map((a) => ({ id: `${a.contratoId}#${a.id}`, contratoId: a.contratoId, nombre: nombreAnexo(a.contratoId, a.id) }));

  /* Las categorías: lo del anexo sale de la categoría del contrato y pasa a una fila propia. */
  const filasCategoria: FilaCategoria[] = ((categorias.data ?? []) as FilaCategoriaSQL[]).map((c) => ({
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
  }));
  const categoriaBase = new Map(filasCategoria.map((c) => [`${c.contratoId}|${c.categoriaId}|${c.periodo}`, c]));
  const categoriasDeAnexo = new Map<string, FilaCategoria>();
  for (const m of movimientos) {
    if (!m.periodo) continue;
    const catId = m.categoria_id ?? "sin-categoria";
    const base = categoriaBase.get(`${m.contrato_id}|${catId}|${m.periodo}`);
    const neto = Number(m.neto);
    const ordinario = m.tipo === "ordinario" ? neto : 0;
    if (base) {
      base.real = Math.max(0, base.real - neto);
      base.realOrdinario = Math.max(0, base.realOrdinario - ordinario);
    }
    const unidad = unidadDe(m.contrato_id, m.anexo_id);
    const clave = `${unidad}|${catId}|${m.periodo}`;
    const actual = categoriasDeAnexo.get(clave);
    if (actual) {
      actual.real += neto;
      actual.realOrdinario += ordinario;
    } else {
      categoriasDeAnexo.set(clave, {
        categoriaId: `${catId}#${unidad.split("#")[1]}`,
        contratoId: unidad,
        categoria: m.categoria ?? "Sin categoría",
        familia: (m.familia as FilaCategoria["familia"] | null) ?? "compras",
        presupuestoMensual: 0,
        periodo: m.periodo,
        real: neto,
        realOrdinario: ordinario,
      });
    }
  }

  return {
    oficina,
    anexosDisponibles,
    personalOficina: nominas.map((n) => ({ periodo: n.periodo, costo: n.costo_total })),
    /* Un ítem suelto (sin orden ni factura, p. ej. de una OC borrada) llega con
       periodo nulo: no pertenece a ningún mes y no debe tumbar el Dashboard. */
    meses: filasMes,
    categorias: [...filasCategoria, ...categoriasDeAnexo.values()],
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
  /** Si es un anexo: el contrato del que cuelga. */
  padreId: string | null;
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
        padreId: suyas[0].padreId,
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
  contratoFiltro: string | string[],
  meses: number,
  periodosVisibles?: string[],
): CategoriaAcumulada[] {
  const acumulado = new Map<string, CategoriaAcumulada>();
  const unidades = typeof contratoFiltro === "string" ? (contratoFiltro === "todos" ? null : [contratoFiltro]) : contratoFiltro;

  for (const c of categorias) {
    if (unidades && !unidades.includes(c.contratoId)) continue;

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
