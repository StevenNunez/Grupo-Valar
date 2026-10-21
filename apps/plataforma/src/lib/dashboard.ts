"use client";

import { mesCorto } from "./formato";
import { supabase } from "./supabase";
import { anexoRaiz, cargarAnexos, etiquetaAnexo } from "./anexos";
import { cargarPersonal } from "./egresos";
import { cargarFiniquitos } from "./finiquitos";
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
  /**
   * De `costo`, lo extraordinario: las HH de parada de planta (personal). Todo
   * lo demás —planta, reemplazos, licencias, feriados compensados, compras,
   * servicios— es ordinario.
   */
  costoParadaPlanta: number;
  /** Las HH extra del mes abiertas por motivo; de aquí sale el sobrecosto. */
  hh: Hh;
  reembolsable: number;
  margen: number;
  margenPct: number | null;
  metaMargen: number;
};

/**
 * HH extra de un conjunto de filas. `sobrecosto` es el costo de todas las HH
 * extra menos las de parada de planta (que son el costo extraordinario); las
 * cinco claves siguientes lo reparten. `sinMotivo` es lo que se cargó como total
 * de HH extra sin indicar el motivo.
 */
export type Hh = {
  /** Horas de parada de planta que el EP extraordinario cobra (`cantidad_hh`). */
  horasCobradas: number;
  horasParada: number;
  horasOrdinarias: number;
  sobrecosto: number;
  reemplazo: number;
  feriado: number;
  apoyo: number;
  otras: number;
  sinMotivo: number;
};
export const hhVacio = (): Hh => ({
  horasCobradas: 0, horasParada: 0, horasOrdinarias: 0, sobrecosto: 0, reemplazo: 0, feriado: 0, apoyo: 0, otras: 0, sinMotivo: 0,
});
const sumarHh = (a: Hh, b: Hh, signo = 1): Hh => {
  const r = hhVacio();
  for (const k of Object.keys(r) as (keyof Hh)[]) r[k] = a[k] + signo * b[k];
  return r;
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
  /** Ids de los contratos cerrados a mano: no se miden mes a mes, pero se pueden incluir. */
  cerrados: string[];
  categorias: FilaCategoria[];
  oficina: EgresoOficina[];
  /**
   * Finiquitos pagados, de contratos (`contratoId`) y de Oficina Central (nulo).
   * Son informativos (0082): NO entran al costo ni al resultado de un contrato;
   * sí cuentan en el resultado de la empresa y se imputan al cerrar el contrato.
   */
  finiquitos: { contratoId: string | null; anexoId: string | null; periodo: string; total: number }[];
  /** Costo de la nómina de Oficina Central por mes. Vacío para quien no ve sueldos. */
  personalOficina: { periodo: string; costo: number }[];
  /**
   * Lo comprado como ACTIVO para un contrato (0099). Cuenta como gasto del contrato
   * —se gastó en esa obra— y también es un activo de la empresa. Cuando el contrato se
   * cierra, esos activos quedan en Valar y la tarjeta de Oficina Central los valoriza
   * aparte (dato informativo: no suma a sus egresos ni resta al contrato).
   */
  activosDeContratos: { contratoId: string; periodo: string; neto: number }[];
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
  parada: number;
  hh: Hh;
  reembolsable: number;
};
const acumVacio = (): Acum => ({ venta: 0, ordinaria: 0, extraordinaria: 0, cobrado: 0, costo: 0, parada: 0, hh: hhVacio(), reembolsable: 0 });

/**
 * El período de un movimiento puede venir con cualquier día del mes (un EP
 * con período "2026-08-15", una compra con su fecha). El Dashboard cuenta
 * meses: sin llevarlos todos al día 1, agosto aparecía dos veces en el filtro
 * y las cifras de un contrato quedaban partidas en dos filas.
 */
const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

/** Junta las filas de un mismo contrato y mes (distintos días del mismo mes). */
function unirResumenPorMes(filas: FilaResumenSQL[]): FilaResumenSQL[] {
  const porClave = new Map<string, FilaResumenSQL>();
  for (const r of filas) {
    const periodo = primeroDelMes(r.periodo);
    const clave = `${r.contrato_id}|${periodo}`;
    const previa = porClave.get(clave);
    if (!previa) {
      porClave.set(clave, { ...r, periodo });
      continue;
    }
    previa.venta += r.venta;
    previa.venta_ordinaria += r.venta_ordinaria;
    previa.venta_extraordinaria += r.venta_extraordinaria;
    previa.cobrado += r.cobrado;
    previa.costo += r.costo;
    previa.reembolsable += r.reembolsable;
    previa.margen = previa.venta - previa.costo;
    previa.margen_pct = previa.venta > 0 ? Math.round(((previa.venta - previa.costo) / previa.venta) * 10000) / 100 : null;
  }
  return [...porClave.values()];
}

export async function cargarDashboard(): Promise<DatosDashboard> {
  const [resumen, categorias, oficina, nominas, anexos, alias, edpsAnexo, costosAnexo, finiquitos, finiquitosOficina, personal, edpsHh] = await Promise.all([
    supabase.from("resumen_mensual").select("*").order("periodo"),
    supabase.from("costos_por_categoria").select("*"),
    cargarEgresosOficina(),
    /* Si la 0048 todavía no está aplicada, el Dashboard sigue sin la nómina.
       Quien no ve sueldos recibe la lista vacía (RLS), no un error. */
    cargarNominasOficina().catch(() => []),
    cargarAnexos().catch(() => []),
    /* Los alias son un extra (0074): sin la migración, el filtro usa el nombre. */
    supabase.from("contratos").select("id, nombre_corto, estado"),
    /* Lo de los anexos se separa del contrato: sus EDP y sus costos. Si falla,
       el Dashboard sale igual, con todo en el contrato (como antes). */
    supabase.from("estados_pago").select("contrato_id, anexo_id, periodo, tipo_edp, monto_neto, monto_cobrado").not("anexo_id", "is", null),
    supabase.from("costos_unificados").select("contrato_id, anexo_id, categoria_id, categoria, familia, periodo, tipo, neto").not("anexo_id", "is", null),
    /* Quien no ve personal recibe la lista vacía; si la tabla falla, el Dashboard sale igual. */
    cargarFiniquitos("contratos").catch(() => []),
    cargarFiniquitos("oficina").catch(() => []),
    /* De acá sale el costo extraordinario (HH por motivo). Sin acceso a personal llega vacío. */
    cargarPersonal().catch(() => []),
    /* Las HH que cobra cada EP extraordinario, para contrastarlas con las trabajadas. */
    supabase.from("estados_pago").select("contrato_id, anexo_id, periodo, datos").eq("tipo_edp", "extraordinario"),
  ]);

  const fallo = resumen.error ?? categorias.error;
  if (fallo) throw new Error(fallo.message);

  /* Los activos comprados para un contrato: si falla, el Dashboard sale igual sin ellos. */
  const { data: activosCostos } = await supabase.from("costos_unificados").select("contrato_id, periodo, neto").eq("es_activo", true);

  /* Los contratos cerrados (0083) salen del tablero operativo; su historia sigue acá. */
  const cerrados = (alias.error ? [] : alias.data ?? []).filter((f) => f.estado === "cerrado").map((f) => f.id as string);

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

  /* El valor de un anexo "por avance" (con sus adendas vigentes); nulo si se
     mide por sus estados de pago como cualquier otro. */
  const valorPorAvance = (contratoId: string, raiz: string) => {
    const principal = anexos.find((x) => x.contratoId === contratoId && x.id === raiz);
    if (!principal?.ventaPorValor || principal.estado !== "vigente") return null;
    return anexos
      .filter((x) => x.contratoId === contratoId && x.estado === "vigente" && raizDe(contratoId, x.id) === raiz)
      .reduce((t, x) => t + x.monto, 0);
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
    const a = celda(unidadDe(e.contrato_id, e.anexo_id), primeroDelMes(e.periodo));
    a.venta += Number(e.monto_neto);
    if (e.tipo_edp === "extraordinario") a.extraordinaria += Number(e.monto_neto);
    else a.ordinaria += Number(e.monto_neto);
    a.cobrado += Number(e.monto_cobrado);
  }
  for (const m of movimientos) {
    if (!m.periodo) continue;
    const a = celda(unidadDe(m.contrato_id, m.anexo_id), primeroDelMes(m.periodo));
    // Igual que resumen_mensual: lo ordinario es costo (un activo comprado para el contrato también, 0099) y lo reembolsable va aparte.
    if (m.tipo === "ordinario") a.costo += Number(m.neto);
    else if (m.tipo === "reembolsable") a.reembolsable += Number(m.neto);
  }

  /* La base de cada contrato = el resumen menos lo de sus anexos. */
  const filasResumen = unirResumenPorMes(((resumen.data ?? []) as FilaResumenSQL[]).filter((r) => r.periodo));
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
      costoParadaPlanta: 0,
      hh: hhVacio(),
      reembolsable: r.reembolsable,
      margen: r.margen,
      margenPct: r.margen_pct === null ? null : Number(r.margen_pct),
      metaMargen: Number(r.meta_margen),
    };
    baseDe.set(`${r.contrato_id}|${r.periodo}`, fila);
    meses.push(fila);
  }

  /* Costo extraordinario: solo las HH de parada de planta. El costo total ya las
     incluye; acá solo se separan. Lo de un anexo se mueve a su unidad más abajo,
     igual que el resto de las cifras. */
  for (const p of personal) {
    if (!p.periodo) continue;
    const mes = primeroDelMes(p.periodo);
    const parada = Math.min(p.montosHh.monto_hh_parada_planta, p.horasExtraMonto);
    /* Sobrecosto: las HH extra de todos los motivos menos la parada de planta. */
    const sobrecosto = Math.max(0, p.horasExtraMonto - parada);
    const reemplazo = p.montosHh.monto_hh_reemplazo;
    const feriado = p.montosHh.monto_hh_feriado_compensado;
    const apoyo = p.montosHh.monto_hh_apoyo_oficina;
    const otras = p.montosHh.monto_hh_otras;
    const hh: Hh = {
      horasCobradas: 0,
      horasParada: p.hhParadaPlanta,
      horasOrdinarias: p.hhReemplazo + p.hhFeriadoCompensado + p.hhApoyoOficina + p.hhOtras,
      sobrecosto,
      reemplazo, feriado, apoyo, otras,
      sinMotivo: Math.max(0, sobrecosto - reemplazo - feriado - apoyo - otras),
    };
    if (parada === 0 && sobrecosto === 0 && hh.horasParada === 0 && hh.horasOrdinarias === 0) continue;
    const base = baseDe.get(`${p.contratoId}|${mes}`);
    if (base) {
      base.costoParadaPlanta += parada;
      base.hh = sumarHh(base.hh, hh);
    }
    if (p.anexoId) {
      const a = celda(unidadDe(p.contratoId, p.anexoId), mes);
      a.parada += parada;
      a.hh = sumarHh(a.hh, hh);
    }
  }

  /* Horas que el EP extraordinario efectivamente cobra; la diferencia con las
     trabajadas (Personal) es lo que se dejó de cobrar. */
  for (const e of (edpsHh.error ? [] : edpsHh.data ?? []) as {
    contrato_id: string; anexo_id: string | null; periodo: string | null; datos: Record<string, unknown> | null;
  }[]) {
    const horasCobradas = Number(e.datos?.cantidad_hh ?? 0);
    if (!e.periodo || !horasCobradas) continue;
    const mes = primeroDelMes(e.periodo);
    const base = baseDe.get(`${e.contrato_id}|${mes}`);
    if (base) base.hh = { ...base.hh, horasCobradas: base.hh.horasCobradas + horasCobradas };
    if (e.anexo_id) {
      const a = celda(unidadDe(e.contrato_id, e.anexo_id), mes);
      a.hh = { ...a.hh, horasCobradas: a.hh.horasCobradas + horasCobradas };
    }
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
        base.costoParadaPlanta -= a.parada;
        base.hh = sumarHh(base.hh, a.hh, -1);
        base.reembolsable -= a.reembolsable;
        recalcular(base);
      }
      const nombre = nombreAnexo(contratoId, raiz);
      /* Un contrato por avance (Carpas) vende su valor completo, no lo que han
         cobrado sus estados de pago; ese valor se reconoce en el mes de su
         primer movimiento. Los estados de pago quedan como cobro. */
      const valorContrato = valorPorAvance(contratoId, raiz);
      const primerMes = [...porPeriodo.keys()].sort()[0];
      const ventaDelMes =
        valorContrato === null
          ? { venta: a.venta, ordinaria: a.ordinaria }
          : periodo === primerMes
            ? { venta: valorContrato + a.extraordinaria, ordinaria: valorContrato }
            : { venta: a.extraordinaria, ordinaria: 0 };
      const fila: FilaMes = {
        contratoId: unidad,
        padreId: contratoId,
        contrato: nombre,
        contratoCorto: nombre,
        cliente: base?.cliente ?? "",
        periodo,
        etiqueta: mesCorto(periodo),
        venta: ventaDelMes.venta,
        ventaOrdinaria: ventaDelMes.ordinaria,
        ventaExtraordinaria: a.extraordinaria,
        cobrado: a.cobrado,
        costo: a.costo,
        costoParadaPlanta: a.parada,
        hh: a.hh,
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
  const categoriaBase = new Map<string, FilaCategoria>();
  for (const c of (categorias.data ?? []) as FilaCategoriaSQL[]) {
    const periodo = c.periodo ? primeroDelMes(c.periodo) : null;
    // Si la 0014 no está aplicada, la columna no viene y `real` es lo mejor
    // que hay. La composición del costo quedará incluyendo reembolsables
    // hasta que se aplique, pero nada se cae.
    const realOrdinario = c.real_ordinario ?? c.real;
    const clave = `${c.contrato_id}|${c.categoria_id}|${periodo}`;
    const previa = categoriaBase.get(clave);
    if (previa) {
      previa.real += c.real;
      previa.realOrdinario += realOrdinario;
    } else {
      categoriaBase.set(clave, {
        categoriaId: c.categoria_id,
        contratoId: c.contrato_id,
        categoria: c.categoria,
        familia: c.familia,
        presupuestoMensual: c.presupuesto_mensual,
        periodo,
        real: c.real,
        realOrdinario,
      });
    }
  }
  const filasCategoria = [...categoriaBase.values()];
  const categoriasDeAnexo = new Map<string, FilaCategoria>();
  for (const m of movimientos) {
    if (!m.periodo) continue;
    const mes = primeroDelMes(m.periodo);
    /* Igual que la vista (0085): lo sin categoría va en una fila por familia. */
    const catId = m.categoria_id ?? `sin-categoria-${m.familia ?? "compras"}`;
    const base = categoriaBase.get(`${m.contrato_id}|${catId}|${mes}`);
    const neto = Number(m.neto);
    const ordinario = m.tipo === "ordinario" ? neto : 0;
    if (base) {
      base.real = Math.max(0, base.real - neto);
      base.realOrdinario = Math.max(0, base.realOrdinario - ordinario);
    }
    const unidad = unidadDe(m.contrato_id, m.anexo_id);
    const clave = `${unidad}|${catId}|${mes}`;
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
        periodo: mes,
        real: neto,
        realOrdinario: ordinario,
      });
    }
  }

  return {
    oficina,
    anexosDisponibles,
    cerrados,
    finiquitos: [...finiquitos, ...finiquitosOficina].map((f) => ({
      contratoId: f.contratoId,
      anexoId: f.anexoId,
      periodo: primeroDelMes(f.periodo),
      total: f.total,
    })),
    personalOficina: nominas.map((n) => ({ periodo: primeroDelMes(n.periodo), costo: n.costo_total })),
    activosDeContratos: (activosCostos ?? [])
      .filter((f) => f.periodo)
      .map((f) => ({ contratoId: f.contrato_id as string, periodo: primeroDelMes(f.periodo as string), neto: Number(f.neto) })),
    /* Un ítem suelto (sin orden ni factura, p. ej. de una OC borrada) llega con
       periodo nulo: no pertenece a ningún mes y no debe tumbar el Dashboard. */
    meses: filasMes,
    categorias: [...filasCategoria, ...categoriasDeAnexo.values()],
  };
}

/* ── Cálculos ─────────────────────────────────────────────────────────────── */

export type Totales = {
  venta: number;
  ventaOrdinaria: number;
  ventaExtraordinaria: number;
  costo: number;
  /** Costo de HH en parada de planta: el único costo extraordinario. */
  costoParadaPlanta: number;
  /** Costo ordinario: todo lo demás (incluye las otras HH extra). */
  costoOrdinario: number;
  /** HH extra por motivo y horas; el sobrecosto es lo ordinario de ellas. */
  hh: Hh;
  margen: number;
  margenPct: number;
  reembolsable: number;
  cobrado: number;
};

export function sumar(filas: FilaMes[]): Totales {
  const venta = filas.reduce((t, f) => t + f.venta, 0);
  const costo = filas.reduce((t, f) => t + f.costo, 0);
  const costoParadaPlanta = filas.reduce((t, f) => t + (f.costoParadaPlanta ?? 0), 0);
  return {
    venta,
    ventaOrdinaria: filas.reduce((t, f) => t + (f.ventaOrdinaria ?? 0), 0),
    ventaExtraordinaria: filas.reduce((t, f) => t + (f.ventaExtraordinaria ?? 0), 0),
    costo,
    costoParadaPlanta,
    costoOrdinario: costo - costoParadaPlanta,
    hh: filas.reduce((t, f) => sumarHh(t, f.hh ?? hhVacio()), hhVacio()),
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

/* ── Alertas de desviación ────────────────────────────────────────────────── */

export type Alerta = {
  periodo: string;
  nivel: "critico" | "aviso";
  titulo: string;
  detalle: string;
  /** Unidad (contrato o anexo) que más explica la desviación, si se distingue. */
  contratoId: string | null;
  contrato: string | null;
  /** A qué pantalla ir para ver los movimientos detrás de la cifra. */
  destino: "ingresos" | "egresos";
};

const variacion = (ahora: number, antes: number) => (antes > 0 ? ((ahora - antes) / antes) * 100 : null);

/**
 * Compara cada mes contra el anterior y avisa de lo que no conviene dejar pasar:
 *
 *   crítico  vende menos y gasta más (ventas −10% o peor con costos +10% o más)
 *   crítico  la rentabilidad cae 8 puntos o más de un mes a otro
 *   aviso    el costo sube 25% o más y lo hace muy por encima de la venta
 *
 * Son umbrales de lectura, no de contabilidad: señalan dónde mirar. Cada alerta
 * trae el contrato que más pesa en el cambio para pasar directo a su detalle.
 */
export function detectarAlertas(evol: Evolucion[]): Alerta[] {
  const alertas: Alerta[] = [];

  for (let i = 1; i < evol.length; i++) {
    const hoy = evol[i];
    const antes = evol[i - 1];
    const dVenta = variacion(hoy.consolidado.venta, antes.consolidado.venta);
    const dCosto = variacion(hoy.consolidado.costo, antes.consolidado.costo);
    const dPuntos = hoy.consolidado.margenPct - antes.consolidado.margenPct;

    // El contrato cuyo costo (o venta) más se movió explica la alerta.
    const mayor = (clave: "costo" | "venta", signo: 1 | -1) => {
      let mejor: { id: string; delta: number } | null = null;
      for (const [id, t] of hoy.porContrato) {
        const delta = (t[clave] - (antes.porContrato.get(id)?.[clave] ?? 0)) * signo;
        if (delta > 0 && (!mejor || delta > mejor.delta)) mejor = { id, delta };
      }
      return mejor?.id ?? null;
    };

    const caso = (nivel: Alerta["nivel"], titulo: string, detalle: string, contratoId: string | null, destino: Alerta["destino"]) =>
      alertas.push({ periodo: hoy.periodo, nivel, titulo, detalle, contratoId, contrato: null, destino });

    const antesTxt = mesCorto(antes.periodo);
    if (dVenta !== null && dCosto !== null && dVenta <= -10 && dCosto >= 10) {
      caso(
        "critico",
        "Vende menos y gasta más",
        `Las ventas cayeron ${Math.abs(dVenta).toFixed(0)}% y los costos subieron ${dCosto.toFixed(0)}% respecto de ${antesTxt}.`,
        mayor("costo", 1),
        "egresos",
      );
    } else if (dCosto !== null && dCosto >= 25 && dCosto - (dVenta ?? 0) >= 15) {
      caso(
        "aviso",
        "Costos por sobre la venta",
        `Los costos subieron ${dCosto.toFixed(0)}% contra ${antesTxt}${dVenta === null ? "" : `, con ventas ${dVenta >= 0 ? "+" : "−"}${Math.abs(dVenta).toFixed(0)}%`}.`,
        mayor("costo", 1),
        "egresos",
      );
    }
    if (dPuntos <= -8) {
      caso(
        "critico",
        "Cae la rentabilidad",
        `Bajó ${Math.abs(dPuntos).toFixed(1)} puntos: de ${antes.consolidado.margenPct.toFixed(1)}% en ${antesTxt} a ${hoy.consolidado.margenPct.toFixed(1)}%.`,
        mayor("costo", 1) ?? mayor("venta", -1),
        dVenta !== null && dVenta < 0 ? "ingresos" : "egresos",
      );
    }
  }
  return alertas;
}

/** Los meses con alguna alerta, y la más grave de cada uno. */
export function nivelPorMes(alertas: Alerta[]) {
  const porMes = new Map<string, Alerta["nivel"]>();
  for (const a of alertas) {
    if (porMes.get(a.periodo) !== "critico") porMes.set(a.periodo, a.nivel);
  }
  return porMes;
}

/* ── Personal: ordinario y extraordinario ─────────────────────────────────── */

export type PersonalDividido = { total: number; ordinario: number; paradaPlanta: number };

/**
 * El costo de la familia Personal abierto en ordinario y extraordinario, para
 * los mismos contratos y meses que se están mirando. Lo extraordinario sale de
 * `Totales` (HH extra por motivo); lo ordinario es el resto del Personal.
 */
export function dividirPersonal(
  categorias: FilaCategoria[],
  contratoFiltro: string | string[],
  periodosVisibles: string[],
  totales: Totales,
): PersonalDividido {
  const unidades = typeof contratoFiltro === "string" ? (contratoFiltro === "todos" ? null : [contratoFiltro]) : contratoFiltro;
  let total = 0;
  for (const c of categorias) {
    if (c.familia !== "personal") continue;
    if (unidades && !unidades.includes(c.contratoId)) continue;
    if (c.periodo !== null && !periodosVisibles.includes(c.periodo)) continue;
    total += c.realOrdinario;
  }
  return { total, ordinario: Math.max(0, total - totales.costoParadaPlanta), paradaPlanta: totales.costoParadaPlanta };
}
