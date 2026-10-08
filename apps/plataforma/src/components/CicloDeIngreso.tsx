"use client";

import { useState } from "react";
import { Chip, type Tono } from "./ui/Chip";
import { camposDe, mostrarValor, type CampoContrato } from "@/lib/campos";
import { actualizar } from "@/lib/crud";
import { formatearFecha, formatearPesos, mesLargo } from "@/lib/formato";
import {
  cargarOrdenEnEdps,
  facturarEdps,
  formasPago,
  marcarFacturaPagada,
  nombreEdp,
  type Ciclo,
  type Etapa,
  type FormaPago,
} from "@/lib/ingresos";
import { usePuede } from "@/lib/sesion";

/**
 * El ciclo del ingreso, en una ficha que se abre.
 *
 * El flujo de Valar es una cadena: sin estado de pago no hay orden de compra, y
 * sin orden no se factura. Por eso las tres etapas viven acá adentro y cada una
 * se habilita cuando la anterior está lista, en vez de estar repartidas en tres
 * pantallas donde nada impide saltarse un paso.
 *
 * La orden y la factura se proponen con lo que el estado de pago ya dice. Es la
 * misma información: volver a teclearla es la forma más común de que la orden
 * autorice un monto distinto del que se presentó.
 *
 * El mandante emite una sola orden para el ordinario y el extraordinario del
 * mes, y se cobran con una sola factura (0067). Por eso al cargar la orden o la
 * factura de un EDP se pueden sumar los otros del contrato, y si el N° de OC o
 * el folio ya están cargados se reusan en vez de pedirlos de nuevo.
 *
 * En Órdenes de Compra y en Facturas queda el listado, para consultar. Emitir se
 * emite desde acá, que es donde se ve de dónde viene cada cosa.
 */

const tonoEtapa: Record<Etapa, Tono> = {
  edp: "info",
  orden: "aviso",
  factura: "aviso",
  cobro: "aviso",
  cerrado: "bueno",
};

const nombreEtapa: Record<Etapa, string> = {
  edp: "Por aprobar",
  orden: "Falta la orden",
  factura: "Falta facturar",
  cobro: "Pendiente de pago",
  cerrado: "Pagado",
};

const nombreForma: Record<FormaPago, string> = { contado: "al contado", credito: "a crédito" };

/** Adónde se cuelgan los respaldos: la tabla y el registro de cada etapa. */
type AbrirAdjuntos = (tabla: string, id: string, titulo: string) => void;

/** Qué hoja abrir en vista previa. La hoja la dibuja la pantalla, no la ficha. */
export type Documento = "edp" | "orden" | "factura";
type AbrirDocumento = (doc: Documento) => void;

/** Qué registro de la cadena se va a editar. */
export type Editable = "edp" | "orden" | "factura";
type AbrirEdicion = (que: Editable) => void;

export function FichaDeCiclo({
  ciclo,
  ciclos,
  campos,
  abierta,
  alAbrir,
  alCambiar,
  alEditar,
  alVerAdjuntos,
  alImprimir,
}: {
  ciclo: Ciclo;
  /** Todos: para ver qué otros EDP comparten la orden o la factura. */
  ciclos: Ciclo[];
  campos: CampoContrato[];
  abierta: boolean;
  alAbrir: () => void;
  alCambiar: () => void;
  alEditar: AbrirEdicion;
  alVerAdjuntos: AbrirAdjuntos;
  alImprimir: AbrirDocumento;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-mist-deep bg-white">
      {/* La línea de resumen: se hace clic acá y se despliega el ciclo entero. */}
      <button
        type="button"
        onClick={alAbrir}
        aria-expanded={abierta}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-mist/30"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={`shrink-0 text-ink-soft transition-transform ${abierta ? "rotate-90" : ""}`}
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            EP N° {ciclo.numero} · {mesLargo(ciclo.periodo)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-soft">
            {ciclo.contrato} · {ciclo.contratoId} · {ciclo.tipoEdp}
          </span>
        </span>

        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-sm font-semibold tabular-nums text-ink">
            {formatearPesos(ciclo.montoNeto)}
          </span>
          {ciclo.montoUf !== null && (
            <span className="block text-xs tabular-nums text-ink-soft">{ciclo.montoUf} UF</span>
          )}
        </span>

        <Chip tono={tonoEtapa[ciclo.etapa]}>{nombreEtapa[ciclo.etapa]}</Chip>
      </button>

      {abierta && (
        <div className="border-t border-mist bg-mist/20 px-5 py-5">
          <ol className="flex flex-col gap-3">
            <PasoEdp
              ciclo={ciclo}
              campos={campos}
              alEditar={() => alEditar("edp")}
              alVerAdjuntos={alVerAdjuntos}
              alCambiar={alCambiar}
              alImprimir={alImprimir}
            />
            <PasoOrden
              ciclo={ciclo}
              ciclos={ciclos}
              alCambiar={alCambiar}
              alEditar={() => alEditar("orden")}
              alVerAdjuntos={alVerAdjuntos}
              alImprimir={alImprimir}
            />
            <PasoFactura
              ciclo={ciclo}
              ciclos={ciclos}
              alCambiar={alCambiar}
              alEditar={() => alEditar("factura")}
              alVerAdjuntos={alVerAdjuntos}
              alImprimir={alImprimir}
            />
          </ol>
        </div>
      )}
    </li>
  );
}

/* ── El armazón de cada paso ──────────────────────────────────────────────── */

/* La marca lleva color y símbolo: el estado del paso no se distingue solo por
   el verde contra el gris. */
const marcas = {
  hecho: { fondo: "bg-[#0e7a4f]", simbolo: "✓" },
  activo: { fondo: "bg-cyan-deep", simbolo: "▸" },
  bloqueado: { fondo: "bg-mist-deep", simbolo: "○" },
};

function Paso({
  n,
  titulo,
  estado,
  resumen,
  children,
}: {
  n: number;
  titulo: string;
  estado: keyof typeof marcas;
  resumen: string;
  children?: React.ReactNode;
}) {
  const marca = marcas[estado];
  return (
    <li
      className={`rounded-xl border bg-white p-4 ${
        estado === "bloqueado" ? "border-mist" : "border-mist-deep"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${marca.fondo}`}
        >
          <span aria-hidden="true">{estado === "activo" ? n : marca.simbolo}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h4
            className={`text-sm font-semibold ${estado === "bloqueado" ? "text-ink-soft" : "text-ink"}`}
          >
            {titulo}
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{resumen}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

/** "EP N° 25 ordinario y EP N° 26 extraordinario". */
function listaEdps(cs: Ciclo[]) {
  const nombres = cs.map((c) => nombreEdp(c.numero, c.tipoEdp));
  return nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

/* ── 1. El estado de pago ─────────────────────────────────────────────────── */

function PasoEdp({
  ciclo,
  campos,
  alEditar,
  alVerAdjuntos,
  alCambiar,
  alImprimir,
}: {
  ciclo: Ciclo;
  campos: CampoContrato[];
  alEditar: () => void;
  alVerAdjuntos: AbrirAdjuntos;
  alCambiar: () => void;
  alImprimir: AbrirDocumento;
}) {
  const propios = camposDe(campos, ciclo.contratoId, "estado_pago");
  const aprobado = ciclo.estado !== "presentado" && ciclo.estado !== "rechazado";
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aprobar() {
    setError(null);
    setGuardando(true);
    try {
      await actualizar("estados_pago", ciclo.id, {
        estado: "aprobado",
        fecha_aprobacion: new Date().toISOString().slice(0, 10),
      });
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Paso
      n={1}
      titulo="Estado de pago"
      estado={aprobado ? "hecho" : "activo"}
      resumen={
        ciclo.estado === "rechazado"
          ? "Rechazado por el mandante. Hay que corregirlo y volver a presentarlo."
          : aprobado
            ? /* Hay EDP aprobados sin fecha —vienen de antes de la plataforma—:
                 se dice "Aprobado" a secas en vez de "Aprobado el —". */
              `${ciclo.fechaAprobacion ? `Aprobado el ${formatearFecha(ciclo.fechaAprobacion)}` : "Aprobado"} · ${formatearPesos(ciclo.montoNeto)} netos, ${formatearPesos(ciclo.retenciones)} retenidos`
            : `Presentado el ${formatearFecha(ciclo.fechaPresentacion)} · esperando la aprobación del mandante`
      }
    >
      {propios.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-mist pt-3 sm:grid-cols-2">
          {propios.map((c) => (
            <div key={c.id} className="flex justify-between gap-3 text-xs">
              <dt className="text-ink-soft">{c.etiqueta}</dt>
              <dd className="font-semibold tabular-nums text-ink">
                {mostrarValor(c, ciclo.datos[c.clave])}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {error && <Aviso tono="malo">{error}</Aviso>}

      <div className="mt-3 flex flex-wrap gap-2">
        <BotonChico onClick={() => alImprimir("edp")} icono="hoja">
          Ver y descargar
        </BotonChico>
        <BotonChico escribe onClick={alEditar}>Editar el estado de pago</BotonChico>
        <BotonChico
          onClick={() => alVerAdjuntos("estados_pago", ciclo.id, `${nombreEdp(ciclo.numero, ciclo.tipoEdp)} · ${ciclo.contrato}`)}
        >
          Adjuntar respaldo
        </BotonChico>
        {!aprobado && (
          <BotonChico escribe onClick={() => void aprobar()} destacado disabled={guardando}>
            {guardando ? "Guardando…" : "Marcar como aprobado"}
          </BotonChico>
        )}
      </div>
    </Paso>
  );
}

/* ── 2. La orden de compra del mandante ───────────────────────────────────── */

function PasoOrden({
  ciclo,
  ciclos,
  alCambiar,
  alEditar,
  alVerAdjuntos,
  alImprimir,
}: {
  ciclo: Ciclo;
  ciclos: Ciclo[];
  alCambiar: () => void;
  alEditar: () => void;
  alVerAdjuntos: AbrirAdjuntos;
  alImprimir: AbrirDocumento;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const habilitado = ciclo.estado === "aprobado" || ciclo.estado === "facturado";
  const ordenId = ciclo.ordenId;

  if (ordenId) {
    // Lo que se presentó contra esta orden, contando los otros EDP que cubre.
    const cubiertos = ciclos.filter((c) => c.ordenId === ordenId);
    const presentado = cubiertos.reduce((t, c) => t + c.montoNeto, 0);
    const corta =
      ciclo.montoAutorizado !== null && ciclo.montoAutorizado < presentado
        ? presentado - ciclo.montoAutorizado
        : 0;
    const cobro = [
      ciclo.ordenFormaPago ? nombreForma[ciclo.ordenFormaPago] : null,
      ciclo.ordenFechaCobro ? `cobro el ${formatearFecha(ciclo.ordenFechaCobro)}` : null,
    ].filter(Boolean).join(", ");

    return (
      <Paso
        n={2}
        titulo="Orden de compra"
        estado="hecho"
        resumen={`N° ${ciclo.ordenNumero} · ${formatearPesos(ciclo.montoAutorizado ?? 0)} autorizados${cobro ? ` · ${cobro}` : ""}`}
      >
        {cubiertos.length > 1 && (
          <p className="mt-2 text-xs text-ink-soft">Cubre {listaEdps(cubiertos)}.</p>
        )}
        {corta > 0 && (
          <Aviso tono="ojo">
            La orden autoriza {formatearPesos(corta)} menos de lo presentado. No se puede facturar
            por sobre la orden.
          </Aviso>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <BotonChico onClick={() => alImprimir("orden")} icono="hoja">
            Ver y descargar
          </BotonChico>
          <BotonChico escribe onClick={alEditar}>Editar la orden</BotonChico>
          <BotonChico
            onClick={() =>
              alVerAdjuntos("ordenes_compra", ordenId, `Orden de compra N° ${ciclo.ordenNumero}`)
            }
          >
            Adjuntar la orden original
          </BotonChico>
        </div>
      </Paso>
    );
  }

  // Pagado antes de la plataforma: no hay orden que pedir.
  if (ciclo.etapa === "cerrado") {
    return <Paso n={2} titulo="Orden de compra" estado="hecho" resumen="Sin orden registrada: el estado de pago ya está pagado." />;
  }

  return (
    <Paso
      n={2}
      titulo="Orden de compra"
      estado={habilitado ? "activo" : "bloqueado"}
      resumen={
        habilitado
          ? "El mandante aprobó el estado de pago: ya se puede cargar su orden."
          : "Se habilita cuando el mandante apruebe el estado de pago. Sin EDP no hay orden."
      }
    >
      {habilitado && !abriendo && (
        <div className="mt-3">
          <BotonChico escribe onClick={() => setAbriendo(true)} destacado>
            Cargar la orden
          </BotonChico>
        </div>
      )}

      {abriendo && (
        <FormularioOrdenMandante
          ciclo={ciclo}
          ciclos={ciclos}
          alCerrar={() => setAbriendo(false)}
          alGuardado={alCambiar}
        />
      )}
    </Paso>
  );
}

const enDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

/** Al contado se cobra al tiro; a crédito, a 30 días. Es lo que se propone, se puede cambiar. */
const cobroSegun = (forma: FormaPago) => (forma === "contado" ? enDias(0) : enDias(30));

function FormularioOrdenMandante({
  ciclo,
  ciclos,
  alCerrar,
  alGuardado,
}: {
  ciclo: Ciclo;
  ciclos: Ciclo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  // Los otros EDP del contrato que todavía no tienen orden: el del mismo mes
  // (el ordinario con su extraordinario) se propone marcado.
  const otros = ciclos.filter(
    (c) => c.id !== ciclo.id && c.contratoId === ciclo.contratoId && c.anexoId === ciclo.anexoId &&
      c.ordenId === null && c.etapa !== "cerrado" && c.estado !== "rechazado",
  );
  const [incluidos, setIncluidos] = useState<string[]>(otros.filter((c) => c.periodo === ciclo.periodo).map((c) => c.id));
  const elegidos = [ciclo, ...otros.filter((c) => incluidos.includes(c.id))];
  const sumaElegidos = elegidos.reduce((t, c) => t + c.montoNeto, 0);

  // Las órdenes que ya están cargadas en el contrato: si el N° es una de
  // ellas, no se vuelve a pedir nada.
  const yaCargadas = [...new Map(
    ciclos.filter((c) => c.contratoId === ciclo.contratoId && c.ordenId && c.ordenNumero)
      .map((c) => [c.ordenNumero!.trim(), c]),
  ).values()];

  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaPago>("credito");
  const [fechaCobro, setFechaCobro] = useState(cobroSegun("credito"));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const existente = yaCargadas.find((c) => c.ordenNumero!.trim() === numero.trim()) ?? null;
  // Mientras no se toque, el monto es lo que suman los EDP marcados.
  const montoAutorizado = monto ?? sumaElegidos;

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await cargarOrdenEnEdps(elegidos, { numero, montoAutorizado, formaPago: forma, fechaCobro });
      alGuardado();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-mist-deep bg-mist/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="N° de la orden" requerido ayuda={yaCargadas.length > 0 ? "Si es una que ya está cargada, se elige de la lista." : undefined}>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="9000114150"
            list={`ocs-${ciclo.id}`}
            className={claseCampo}
          />
          <datalist id={`ocs-${ciclo.id}`}>
            {yaCargadas.map((c) => <option key={c.ordenId} value={c.ordenNumero!} />)}
          </datalist>
        </Campo>

        {existente ? (
          <p className="self-end rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-ink-soft">
            Ya está cargada: {formatearPesos(existente.montoAutorizado ?? 0)} autorizados
            {existente.ordenFormaPago ? `, ${nombreForma[existente.ordenFormaPago]}` : ""}
            {existente.ordenFechaCobro ? `, cobro el ${formatearFecha(existente.ordenFechaCobro)}` : ""}.
            Se usa esa.
          </p>
        ) : <>
          <Campo
            etiqueta="Monto autorizado"
            ayuda={monto === null ? "La suma de los estados de pago que cubre. Cámbialo si la orden dice otra cifra." : undefined}
          >
            <input
              inputMode="numeric"
              value={montoAutorizado === 0 ? "" : montoAutorizado.toLocaleString("es-CL")}
              onChange={(e) => setMonto(Number(e.target.value.replace(/\D/g, "")) || 0)}
              className={`${claseCampo} text-right tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Forma de pago" requerido>
            <select
              value={forma}
              onChange={(e) => {
                const nueva = e.target.value as FormaPago;
                // La fecha propuesta sigue a la forma de pago, salvo que ya se haya escrito otra.
                if (fechaCobro === cobroSegun(forma)) setFechaCobro(cobroSegun(nueva));
                setForma(nueva);
              }}
              className={claseCampo}
            >
              {formasPago.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Fecha de cobro" ayuda="Cuándo se le cobra al mandante. Pasa a ser el vencimiento de la factura.">
            <input
              type="date"
              value={fechaCobro}
              onChange={(e) => setFechaCobro(e.target.value)}
              className={claseCampo}
            />
          </Campo>
        </>}
      </div>

      {otros.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Esta orden también cubre
          </legend>
          <ListaEdps ciclos={otros} marcados={incluidos} alCambiar={setIncluidos} />
        </fieldset>
      )}

      {error && <Aviso tono="malo">{error}</Aviso>}

      <div className="mt-3 flex gap-2">
        <BotonChico onClick={() => void guardar()} destacado disabled={guardando || !numero.trim()}>
          {guardando ? "Guardando…" : elegidos.length > 1 ? `Guardar la orden de ${elegidos.length} estados de pago` : "Guardar la orden"}
        </BotonChico>
        <BotonChico onClick={alCerrar}>Cancelar</BotonChico>
      </div>
    </div>
  );
}

/** Casillas de EDP para sumarlos a la orden o a la factura. */
function ListaEdps({ ciclos, marcados, alCambiar }: { ciclos: Ciclo[]; marcados: string[]; alCambiar: (ids: string[]) => void }) {
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {ciclos.map((c) => (
        <li key={c.id}>
          <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={marcados.includes(c.id)}
              onChange={(e) => alCambiar(e.target.checked ? [...marcados, c.id] : marcados.filter((id) => id !== c.id))}
            />
            <span className="flex-1">{nombreEdp(c.numero, c.tipoEdp)} · {mesLargo(c.periodo)}</span>
            <span className="tabular-nums text-ink-soft">{formatearPesos(c.montoNeto)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/* ── 3. La factura ────────────────────────────────────────────────────────── */

function PasoFactura({
  ciclo,
  ciclos,
  alCambiar,
  alEditar,
  alVerAdjuntos,
  alImprimir,
}: {
  ciclo: Ciclo;
  ciclos: Ciclo[];
  alCambiar: () => void;
  alEditar: () => void;
  alVerAdjuntos: AbrirAdjuntos;
  alImprimir: AbrirDocumento;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const habilitado = ciclo.ordenId !== null;
  const facturaId = ciclo.facturaId;

  if (facturaId) {
    const pagada = ciclo.estadoCobro === "pagada";
    const incluidos = ciclos.filter((c) => c.facturaId === facturaId);

    const pagar = async () => {
      setError(null);
      setPagando(true);
      try {
        await marcarFacturaPagada(facturaId!);
        alCambiar();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPagando(false);
      }
    };

    return (
      <Paso
        n={3}
        titulo="Factura"
        estado={pagada ? "hecho" : "activo"}
        resumen={`Folio ${facturaId} · ${formatearPesos(ciclo.facturaTotal ?? 0)} con IVA · ${
          pagada
            ? "pagada"
            : `pendiente de pago${ciclo.facturaVencimiento ? `, vence el ${formatearFecha(ciclo.facturaVencimiento)}` : ""}`
        }`}
      >
        {incluidos.length > 1 && (
          <p className="mt-2 text-xs text-ink-soft">Incluye {listaEdps(incluidos)}.</p>
        )}
        {error && <Aviso tono="malo">{error}</Aviso>}
        <div className="mt-3 flex flex-wrap gap-2">
          <BotonChico onClick={() => alImprimir("factura")} icono="hoja">
            Ver y descargar
          </BotonChico>
          <BotonChico escribe onClick={alEditar}>Editar la factura</BotonChico>
          <BotonChico onClick={() => alVerAdjuntos("facturas", facturaId, `Factura ${facturaId}`)}>
            Adjuntar la factura del SII
          </BotonChico>
          {!pagada && (
            <BotonChico escribe destacado onClick={() => void pagar()} disabled={pagando}>
              {pagando ? "Guardando…" : incluidos.length > 1 ? `Marcar como pagada (${incluidos.length} EDP)` : "Marcar como pagada"}
            </BotonChico>
          )}
        </div>
      </Paso>
    );
  }

  if (ciclo.etapa === "cerrado") {
    return <Paso n={3} titulo="Factura" estado="hecho" resumen="Sin factura registrada: el estado de pago ya está pagado." />;
  }

  return (
    <Paso
      n={3}
      titulo="Factura"
      estado={habilitado ? "activo" : "bloqueado"}
      resumen={
        habilitado
          ? "Hay orden del mandante: ya se puede emitir la factura."
          : "Se habilita cuando esté cargada la orden. Sin orden no se factura."
      }
    >
      {habilitado && !abriendo && (
        <div className="mt-3">
          <BotonChico escribe onClick={() => setAbriendo(true)} destacado>
            Emitir la factura
          </BotonChico>
        </div>
      )}

      {abriendo && (
        <FormularioFacturaDesdeOrden
          ciclo={ciclo}
          ciclos={ciclos}
          alCerrar={() => setAbriendo(false)}
          alGuardado={alCambiar}
        />
      )}
    </Paso>
  );
}

function FormularioFacturaDesdeOrden({
  ciclo,
  ciclos,
  alCerrar,
  alGuardado,
}: {
  ciclo: Ciclo;
  ciclos: Ciclo[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  // Los otros EDP del contrato con orden y sin factura. Los de la misma orden
  // se proponen marcados: lo normal es facturarlos juntos.
  const otros = ciclos.filter(
    (c) => c.id !== ciclo.id && c.contratoId === ciclo.contratoId && c.ordenId !== null && c.facturaId === null && c.etapa !== "cerrado",
  );
  const [incluidos, setIncluidos] = useState<string[]>(otros.filter((c) => c.ordenId === ciclo.ordenId).map((c) => c.id));
  const elegidos = [ciclo, ...otros.filter((c) => incluidos.includes(c.id))];
  const sumaElegidos = elegidos.reduce((t, c) => t + c.montoNeto, 0);

  // Facturas del contrato todavía por pagar: si el folio es una de ellas, se le suman estos EDP.
  const yaEmitidas = [...new Map(
    ciclos.filter((c) => c.contratoId === ciclo.contratoId && c.facturaId && c.estadoCobro !== "pagada")
      .map((c) => [c.facturaId!, c]),
  ).values()];

  const [folio, setFolio] = useState("");
  const [netoEscrito, setNetoEscrito] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoy);
  // El vencimiento es la fecha de cobro de la orden: ya se dijo al cargarla.
  const [vencimiento, setVencimiento] = useState(ciclo.ordenFechaCobro ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const existente = yaEmitidas.find((c) => c.facturaId === folio.trim()) ?? null;
  /* Se propone la suma de lo presentado, sin pasar lo que autorizan las
     órdenes: la orden es el techo de lo que se puede cobrar, y facturar por
     sobre ella es una nota de crédito esperando a pasar. */
  const ordenes = [...new Map(elegidos.map((c) => [c.ordenId, c.montoAutorizado ?? 0])).values()];
  const tope = ordenes.reduce((t, m) => t + m, 0);
  const neto = netoEscrito ?? Math.min(sumaElegidos, tope || sumaElegidos);
  const iva = Math.round(neto * 0.19);
  const exceso = tope > 0 && neto > tope ? neto - tope : 0;

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await facturarEdps(elegidos, { folio, neto, fechaEmision: fecha, vencimiento });
      alGuardado();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-mist-deep bg-mist/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Folio" requerido ayuda="El número de la factura emitida.">
          <input
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="678"
            list={`facturas-${ciclo.id}`}
            className={claseCampo}
          />
          <datalist id={`facturas-${ciclo.id}`}>
            {yaEmitidas.map((c) => <option key={c.facturaId} value={c.facturaId!} />)}
          </datalist>
        </Campo>

        {existente ? (
          <p className="self-end rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-ink-soft">
            Ya está emitida: {formatearPesos(existente.facturaTotal ?? 0)} con IVA. Se le suma este estado de pago.
          </p>
        ) : <>
          <Campo
            etiqueta="Neto"
            ayuda={`IVA ${formatearPesos(iva)} · total ${formatearPesos(neto + iva)}`}
          >
            <input
              inputMode="numeric"
              value={neto === 0 ? "" : neto.toLocaleString("es-CL")}
              onChange={(e) => setNetoEscrito(Number(e.target.value.replace(/\D/g, "")) || 0)}
              className={`${claseCampo} text-right tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Fecha de emisión">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={claseCampo}
            />
          </Campo>
          <Campo etiqueta="Vencimiento" ayuda={ciclo.ordenFechaCobro ? "La fecha de cobro de la orden." : "La fecha en que se hace exigible el cobro."}>
            <input
              type="date"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
              className={claseCampo}
            />
          </Campo>
        </>}
      </div>

      {otros.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Esta factura también incluye
          </legend>
          <ListaEdps ciclos={otros} marcados={incluidos} alCambiar={setIncluidos} />
        </fieldset>
      )}

      {!existente && exceso > 0 && (
        <Aviso tono="ojo">
          Estás facturando {formatearPesos(exceso)} por sobre lo que autoriza la orden. Eso vuelve
          como nota de crédito.
        </Aviso>
      )}

      {error && <Aviso tono="malo">{error}</Aviso>}

      <div className="mt-3 flex gap-2">
        <BotonChico onClick={() => void guardar()} destacado disabled={guardando || !folio.trim()}>
          {guardando ? "Emitiendo…" : elegidos.length > 1 ? `Emitir la factura de ${elegidos.length} estados de pago` : "Emitir la factura"}
        </BotonChico>
        <BotonChico onClick={alCerrar}>Cancelar</BotonChico>
      </div>
    </div>
  );
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

const claseCampo =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyan";

function Campo({
  etiqueta,
  requerido,
  ayuda,
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
        {etiqueta}
        {requerido && <span className="text-cyan-deep"> *</span>}
      </span>
      {children}
      {ayuda && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-soft">{ayuda}</span>
      )}
    </label>
  );
}

function Aviso({ tono, children }: { tono: "ojo" | "malo"; children: React.ReactNode }) {
  return (
    <p
      role={tono === "malo" ? "alert" : undefined}
      className={`mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed ${
        tono === "malo" ? "bg-[#fdeeec] font-medium text-[#a52f24]" : "bg-[#fdf3e3] text-[#8a5a09]"
      }`}
    >
      {children}
    </p>
  );
}

function BotonChico({
  onClick,
  destacado = false,
  disabled = false,
  icono,
  escribe = false,
  children,
}: {
  onClick: () => void;
  /** Cambia datos: sin "Cargar ingresos y egresos" no aparece. Imprimir y ver
      respaldos quedan para todos los que ven el ciclo. */
  escribe?: boolean;
  destacado?: boolean;
  disabled?: boolean;
  /** El de la hoja marca los botones que abren un documento. */
  icono?: "hoja";
  children: React.ReactNode;
}) {
  const puedeCargar = usePuede("gestion.editar");
  if (escribe && !puedeCargar) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
        destacado
          ? "bg-cyan text-white hover:bg-cyan-deep"
          : "border border-mist-deep bg-white text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {icono === "hoja" && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden="true"
        >
          <path
            d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7Z"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
