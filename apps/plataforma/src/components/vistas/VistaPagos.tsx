"use client";

import { useMemo, useState } from "react";
import { Chip, type Tono } from "../ui/Chip";
import {
  CampoFecha,
  CampoTexto,
  Campos,
  Dialogo,
  Pie,
  useFormulario,
} from "../ui/Formulario";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { BotonImprimir, Impresion } from "../ui/Impresion";
import { CuadroDePago } from "../CuadroDePago";
import { CicloOrden } from "../CicloOrden";
import { useConsulta } from "@/lib/consulta";
import { formatearFecha, formatearMonto, formatearPesos } from "@/lib/formato";
import { formatearRut } from "@/lib/abastecimiento";
import { cargarOrden } from "@/lib/ordenes";
import { usePuede } from "@/lib/sesion";
import {
  armarNomina,
  cambiarEstadoPago,
  cargarCuentasPorPagar,
  cargarFlujoDePagos,
  cargarParametrosPago,
  marcarPagada,
  nombreEstadoCuenta,
  nombreEstadoDocumento,
  programarPago,
  proximasFechasDePago,
  registrarFactura,
  type CuentaPorPagar,
  type EstadoDocumento,
  type ParametrosPago,
  type ProveedorPorPagar,
} from "@/lib/pagos";

/**
 * Pagos a proveedores.
 *
 * Es la planilla semanal de Valar, con su misma regla: **sin factura no se
 * paga**. Lo que se le debe a un proveedor aparece igual —una OC emitida es
 * plata comprometida— pero separado en dos columnas, exigible y bloqueado,
 * porque son dos conversaciones distintas: una con el banco y otra con el
 * proveedor, para que mande la factura.
 *
 * El tope semanal avisa y no impide. Una factura grande y vencida se paga
 * igual; lo que no puede pasar es que la semana se pase de $20 millones sin
 * que nadie lo note.
 */

const tonos: Record<EstadoDocumento, Tono> = {
  vencido: "critico",
  por_vencer: "aviso",
  pendiente: "info",
  no_facturado: "neutro",
  retenido: "aviso",
  pagado: "bueno",
  anulado: "neutro",
};

type Datos = {
  cuentas: CuentaPorPagar[];
  proveedores: ProveedorPorPagar[];
  parametros: ParametrosPago;
};

async function cargar(): Promise<Datos> {
  const [cuentas, proveedores, parametros] = await Promise.all([
    cargarCuentasPorPagar(),
    cargarFlujoDePagos(),
    cargarParametrosPago(),
  ]);
  return { cuentas, proveedores, parametros };
}

type Pestana = "vencimiento" | "proveedor" | "semana";

const pestanas: { id: Pestana; titulo: string }[] = [
  { id: "vencimiento", titulo: "Por vencimiento" },
  { id: "proveedor", titulo: "Por proveedor" },
  { id: "semana", titulo: "Cuadro de la semana" },
];

export function VistaPagos() {
  const { estado, recargar } = useConsulta<Datos>(cargar);

  return (
    <>
      <Encabezado
        titulo="Pagos a proveedores"
        descripcion="Lo que se le debe a cada proveedor y qué se paga esta semana. Una línea sin factura registrada aparece, pero no se paga: es la regla con la que Valar ya trabaja."
      />

      <Contenido consulta={estado}>
        {(datos) => <Tablero datos={datos} recargar={recargar} />}
      </Contenido>
    </>
  );
}

function Tablero({ datos, recargar }: { datos: Datos; recargar: () => void }) {
  const [pestana, setPestana] = useState<Pestana>("vencimiento");
  const [facturando, setFacturando] = useState<CuentaPorPagar | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const fechas = useMemo(
    () => proximasFechasDePago(datos.parametros.diaPagoSemanal),
    [datos.parametros.diaPagoSemanal],
  );
  const [semana, setSemana] = useState(fechas[0]);

  const abiertas = datos.cuentas.filter(
    (c) => c.estadoDocumento !== "pagado" && c.estadoDocumento !== "anulado",
  );
  const vencido = suma(abiertas.filter((c) => c.estadoDocumento === "vencido"));
  const porVencer = suma(abiertas.filter((c) => c.estadoDocumento === "por_vencer"));
  const bloqueado = suma(abiertas.filter((c) => c.estadoDocumento === "no_facturado"));
  /* Lo agendado para esa fecha y todavía sin pagar: el cuadro de la semana es
     lo que hay que transferir, no un histórico de lo que ya se transfirió. */
  const deLaSemana = datos.cuentas.filter(
    (c) =>
      c.fechaPagoProgramada === semana &&
      c.estadoDocumento !== "pagado" &&
      c.estadoDocumento !== "anulado",
  );

  if (datos.cuentas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          No hay nada pendiente de pago
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
          Acá van a aparecer las facturas de proveedor por pagar y las órdenes emitidas
          que todavía no facturan. Se llena solo a medida que se emiten órdenes.
        </p>
      </div>
    );
  }

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Vencido",
            valor: formatearMonto(vencido),
            nota: "Pasó su fecha y sigue impago",
            acento: vencido > 0 ? "critico" : "bueno",
          },
          {
            etiqueta: "Por vencer",
            valor: formatearMonto(porVencer),
            nota: `Dentro de ${datos.parametros.diasAlertaVencimiento} días`,
            acento: porVencer > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Bloqueado sin factura",
            valor: formatearMonto(bloqueado),
            nota: "Comprometido, todavía no pagable",
            acento: bloqueado > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: `Programado al ${formatearFecha(semana)}`,
            valor: formatearMonto(suma(deLaSemana)),
            nota: `Tope semanal ${formatearMonto(datos.parametros.topeSemanal)}`,
            acento:
              suma(deLaSemana) > datos.parametros.topeSemanal ? "critico" : undefined,
          },
        ]}
      />

      {pestana === "vencimiento" && (
        <PorVencimiento
          datos={datos}
          semana={semana}
          fechas={fechas}
          alCambiarSemana={setSemana}
          pestana={pestana}
          alCambiarPestana={setPestana}
          alFacturar={setFacturando}
          recargar={recargar}
        />
      )}

      {pestana === "proveedor" && (
        <Panel
          titulo="Por proveedor"
          nota="Lo exigible es lo que tiene factura. Lo bloqueado espera que el proveedor la mande."
          filtros={
            <Filtro
              etiqueta="Vista"
              opciones={pestanas}
              valor={pestana}
              alCambiar={setPestana}
            />
          }
        >
          <Tabla
            columnas={columnasProveedor}
            filas={datos.proveedores}
            claveDe={(p) => p.clave}
            vacio="Sin deuda con proveedores."
            pie={
              <>
                <Total>Total</Total>
                <Total derecha>
                  {formatearMonto(datos.proveedores.reduce((t, p) => t + p.exigible, 0))}
                </Total>
                <Total derecha>
                  {formatearMonto(datos.proveedores.reduce((t, p) => t + p.bloqueado, 0))}
                </Total>
                <Total derecha>
                  {formatearMonto(datos.proveedores.reduce((t, p) => t + p.pendienteTotal, 0))}
                </Total>
                <Total />
              </>
            }
          />
        </Panel>
      )}

      {pestana === "semana" && (
        <Panel
          titulo={`Cuadro de pago · ${formatearFecha(semana)}`}
          nota={
            suma(deLaSemana) > datos.parametros.topeSemanal
              ? `Se pasa ${formatearPesos(suma(deLaSemana) - datos.parametros.topeSemanal)} del tope semanal.`
              : `${formatearPesos(datos.parametros.topeSemanal - suma(deLaSemana))} disponibles bajo el tope.`
          }
          filtros={
            <div className="flex flex-wrap items-center gap-2">
              <SelectorSemana fechas={fechas} valor={semana} alCambiar={setSemana} />
              <BotonImprimir onClick={() => setImprimiendo(true)}>Cuadro PDF</BotonImprimir>
              <Filtro
                etiqueta="Vista"
                opciones={pestanas}
                valor={pestana}
                alCambiar={setPestana}
              />
            </div>
          }
        >
          <Semana lineas={deLaSemana} recargar={recargar} semana={semana} />
        </Panel>
      )}

      {facturando?.origen === "orden" && facturando.ordenId && (
        <FacturaDeOrden
          ordenId={facturando.ordenId}
          alCerrar={() => setFacturando(null)}
          alCambiar={recargar}
        />
      )}

      {facturando && facturando.origen !== "orden" && (
        <DialogoFactura
          linea={facturando}
          plazoPorDefecto={datos.parametros.plazoPagoDias}
          alCerrar={() => setFacturando(null)}
          alGuardado={recargar}
        />
      )}

      {imprimiendo && (
        <Impresion titulo={`Cuadro de pago · ${formatearFecha(semana)}`} alCerrar={() => setImprimiendo(false)}>
          <CuadroDePago
            fecha={semana}
            lineas={deLaSemana}
            nomina={armarNomina(deLaSemana)}
            tope={datos.parametros.topeSemanal}
          />
        </Impresion>
      )}
    </>
  );
}

/* ── Por vencimiento ──────────────────────────────────────────────────────── */

type FiltroEstado = "abiertas" | "vencidas" | "sin_factura" | "programadas" | "todas";

const filtrosEstado: { id: FiltroEstado; titulo: string }[] = [
  { id: "abiertas", titulo: "Abiertas" },
  { id: "vencidas", titulo: "Vencidas" },
  { id: "sin_factura", titulo: "Sin factura" },
  { id: "programadas", titulo: "Programadas" },
  { id: "todas", titulo: "Todas" },
];

function PorVencimiento({
  datos,
  semana,
  fechas,
  alCambiarSemana,
  pestana,
  alCambiarPestana,
  alFacturar,
  recargar,
}: {
  datos: Datos;
  semana: string;
  fechas: string[];
  alCambiarSemana: (v: string) => void;
  pestana: Pestana;
  alCambiarPestana: (v: Pestana) => void;
  alFacturar: (linea: CuentaPorPagar) => void;
  recargar: () => void;
}) {
  const [filtro, setFiltro] = useState<FiltroEstado>("abiertas");
  const puedeProgramar = usePuede("pagos.programar");
  const puedeMarcar = usePuede("pagos.marcar");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const cs = datos.cuentas;
    if (filtro === "vencidas") return cs.filter((c) => c.estadoDocumento === "vencido");
    if (filtro === "sin_factura") return cs.filter((c) => c.estadoDocumento === "no_facturado");
    if (filtro === "programadas") return cs.filter((c) => c.fechaPagoProgramada !== null);
    if (filtro === "abiertas")
      return cs.filter((c) => c.estadoDocumento !== "pagado" && c.estadoDocumento !== "anulado");
    return cs;
  }, [datos.cuentas, filtro]);

  async function accion(id: string, hacer: () => Promise<void>) {
    setError(null);
    setTrabajando(id);
    try {
      await hacer();
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Panel
      titulo="Cuentas por pagar"
      nota={`${visibles.length} de ${datos.cuentas.length} líneas · se programa para el ${formatearFecha(semana)}`}
      filtros={
        <div className="flex flex-wrap items-center gap-2">
          <SelectorSemana fechas={fechas} valor={semana} alCambiar={alCambiarSemana} />
          <Filtro etiqueta="Estado" opciones={filtrosEstado} valor={filtro} alCambiar={setFiltro} />
          <Filtro
            etiqueta="Vista"
            opciones={pestanas}
            valor={pestana}
            alCambiar={alCambiarPestana}
          />
        </div>
      }
    >
      {error && (
        <p role="alert" className="mx-6 mt-5 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24] lg:mx-8">
          {error}
        </p>
      )}

      <Tabla
        columnas={columnasLinea({ semana, trabajando, accion, alFacturar, puedeProgramar, puedeMarcar })}
        filas={visibles}
        claveDe={(c) => c.id}
        vacio="Nada en este estado."
        pie={
          <>
            <Total>Total</Total>
            <Total />
            <Total />
            <Total derecha>{formatearMonto(suma(visibles))}</Total>
            <Total />
            <Total />
          </>
        }
      />
    </Panel>
  );
}

function columnasLinea({
  semana,
  trabajando,
  accion,
  alFacturar,
  puedeProgramar,
  puedeMarcar,
}: {
  semana: string;
  trabajando: string | null;
  /** Registrar la factura y agendarla en una semana. */
  puedeProgramar: boolean;
  /** Retener, soltar y dar por pagada. */
  puedeMarcar: boolean;
  accion: (id: string, hacer: () => Promise<void>) => Promise<void>;
  alFacturar: (linea: CuentaPorPagar) => void;
}): Columna<CuentaPorPagar>[] {
  return [
    {
      clave: "proveedor",
      titulo: "Proveedor",
      encabezado: true,
      celda: (c) => (
        <>
          <span className="block font-semibold text-ink">{c.proveedor}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {formatearRut(c.rut)} · {c.contrato}
          </span>
        </>
      ),
    },
    {
      clave: "documento",
      titulo: "Documento",
      celda: (c) => (
        <>
          <span className="block text-ink">
            {c.documento ? `Factura ${c.documento}` : "Sin factura"}
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {c.ordenNumero ? `${c.ordenNumero} · ` : ""}
            {c.detalle.slice(0, 46)}
          </span>
        </>
      ),
    },
    {
      clave: "vencimiento",
      titulo: "Vence",
      celda: (c) =>
        c.vencimiento ? (
          <>
            <span className="block text-ink">{formatearFecha(c.vencimiento)}</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {c.diasParaVencer === null
                ? ""
                : c.diasParaVencer < 0
                  ? `${Math.abs(c.diasParaVencer)} días de atraso`
                  : `en ${c.diasParaVencer} días`}
            </span>
          </>
        ) : (
          <>
            <span className="block text-ink-soft">—</span>
            <span className="mt-0.5 block text-xs text-[#8a5a09]">
              {c.diasSinFacturar ?? 0} días sin facturar
            </span>
          </>
        ),
    },
    {
      clave: "monto",
      titulo: "Monto",
      derecha: true,
      celda: (c) => <span className="font-semibold text-ink">{formatearMonto(c.total)}</span>,
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (c) => (
        <>
          <Chip tono={tonos[c.estadoDocumento]}>{nombreEstadoDocumento[c.estadoDocumento]}</Chip>
          {c.fechaPagoProgramada && (
            <span className="mt-1 block text-xs text-ink-soft">
              Programado {formatearFecha(c.fechaPagoProgramada)}
            </span>
          )}
          {c.estadoCuenta !== "creada" && c.aptoParaPago && (
            <span className="mt-1 block text-xs text-[#8a5a09]">
              {nombreEstadoCuenta[c.estadoCuenta]}
            </span>
          )}
        </>
      ),
    },
    {
      clave: "acciones",
      titulo: "",
      derecha: true,
      celda: (c) => {
        const ocupado = trabajando === c.id;

        if (!c.documento) {
          if (!puedeProgramar) return <span className="text-xs text-ink-soft">Sin factura</span>;
          return (
            <Boton onClick={() => alFacturar(c)} disabled={ocupado}>
              Registrar factura
            </Boton>
          );
        }

        if (c.estadoDocumento === "pagado") {
          return <span className="text-xs text-ink-soft">{formatearFecha(c.fechaPago)}</span>;
        }

        if (!c.compraId) return null;
        const compraId = c.compraId;

        /* Retenida: la factura existe pero hay una razón para no pagarla —una
           diferencia, un respaldo que falta—. Sale de la lista de exigibles sin
           desaparecer, que es lo que pasaba cuando esto se resolvía borrándola. */
        if (c.estadoDocumento === "retenido") {
          if (!puedeMarcar) return null;
          return (
            <Boton
              secundario
              disabled={ocupado}
              onClick={() => accion(c.id, () => cambiarEstadoPago(compraId, "pendiente"))}
            >
              Soltar
            </Boton>
          );
        }

        return (
          <div className="flex items-center justify-end gap-2">
            {puedeMarcar && (
            <Boton
              secundario
              disabled={ocupado}
              onClick={() => accion(c.id, () => cambiarEstadoPago(compraId, "retenida"))}
            >
              Retener
            </Boton>
            )}
            {puedeProgramar && (
            <>
            {c.fechaPagoProgramada === semana ? (
              <Boton
                secundario
                disabled={ocupado}
                onClick={() => accion(c.id, () => programarPago(compraId, null))}
              >
                Quitar
              </Boton>
            ) : (
              <Boton
                secundario
                disabled={ocupado}
                onClick={() => accion(c.id, () => programarPago(compraId, semana))}
              >
                Programar
              </Boton>
            )}
            </>
            )}
            {puedeMarcar && (
            <Boton
              disabled={ocupado}
              onClick={() =>
                accion(c.id, () => marcarPagada(compraId, new Date().toISOString().slice(0, 10)))
              }
            >
              Pagar
            </Boton>
            )}
          </div>
        );
      },
    },
  ];
}

/* ── Por proveedor ────────────────────────────────────────────────────────── */

const columnasProveedor: Columna<ProveedorPorPagar>[] = [
  {
    clave: "proveedor",
    titulo: "Proveedor",
    encabezado: true,
    celda: (p) => (
      <>
        <span className="block font-semibold text-ink">{p.proveedor}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {formatearRut(p.rut)} · {p.lineas} {p.lineas === 1 ? "línea" : "líneas"}
        </span>
      </>
    ),
  },
  {
    clave: "exigible",
    titulo: "Exigible",
    derecha: true,
    celda: (p) => <span className="font-semibold text-ink">{formatearMonto(p.exigible)}</span>,
  },
  {
    clave: "bloqueado",
    titulo: "Sin factura",
    derecha: true,
    celda: (p) => <span className="text-ink-soft">{formatearMonto(p.bloqueado)}</span>,
  },
  {
    clave: "pendiente",
    titulo: "Total pendiente",
    derecha: true,
    celda: (p) => <span className="text-ink-soft">{formatearMonto(p.pendienteTotal)}</span>,
  },
  {
    clave: "cuenta",
    titulo: "Cuenta",
    celda: (p) => (
      <>
        <Chip tono={p.estadoCuenta === "creada" ? "bueno" : "aviso"}>
          {nombreEstadoCuenta[p.estadoCuenta]}
        </Chip>
        {p.vencido > 0 && (
          <span className="mt-1 block text-xs text-[#a52f24]">
            {formatearMonto(p.vencido)} vencido
          </span>
        )}
      </>
    ),
  },
];

/* ── El cuadro de la semana ───────────────────────────────────────────────── */

function Semana({
  lineas,
  semana,
  recargar,
}: {
  lineas: CuentaPorPagar[];
  semana: string;
  recargar: () => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grupos = useMemo(() => agrupar(lineas), [lineas]);
  const puedeMarcar = usePuede("pagos.marcar");

  async function pagarTodo() {
    setError(null);
    setTrabajando(true);
    try {
      for (const l of lineas) {
        if (l.compraId) await marcarPagada(l.compraId, semana);
      }
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  if (lineas.length === 0) {
    return (
      <p className="px-6 py-14 text-center text-sm text-ink-soft lg:px-8">
        Nada programado para esta fecha. Se agrega desde «Por vencimiento», con el botón
        Programar de cada línea.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mx-6 mt-5 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24] lg:mx-8">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5 px-6 py-6 lg:px-8">
        {grupos.map((g) => (
          <div key={g.proveedor} className="rounded-xl border border-mist-deep">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist px-5 py-4">
              <div>
                <p className="font-semibold text-ink">{g.proveedor}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {formatearRut(g.rut)} · {g.banco ?? "Sin banco"}{" "}
                  {g.numeroCuenta ? `· ${g.numeroCuenta}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Chip tono={g.estadoCuenta === "creada" ? "bueno" : "aviso"}>
                  {nombreEstadoCuenta[g.estadoCuenta]}
                </Chip>
                <span className="font-display text-lg font-semibold text-ink">
                  {formatearPesos(g.total)}
                </span>
              </div>
            </div>
            <ul className="divide-y divide-mist">
              {g.lineas.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 text-ink">
                    {l.documento ? `Factura ${l.documento}` : "Sin factura"}
                    <span className="text-ink-soft"> · {l.contrato}</span>
                  </span>
                  <Chip tono={tonos[l.estadoDocumento]}>
                    {nombreEstadoDocumento[l.estadoDocumento]}
                  </Chip>
                  <span className="w-32 text-right font-semibold tabular-nums text-ink">
                    {formatearPesos(l.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {puedeMarcar && (
          <div className="flex justify-end">
            <Boton onClick={pagarTodo} disabled={trabajando}>
              {trabajando ? "Marcando…" : `Marcar las ${lineas.length} como pagadas`}
            </Boton>
          </div>
        )}
      </div>
    </>
  );
}

export type GrupoDePago = {
  proveedor: string;
  rut: string | null;
  banco: string | null;
  numeroCuenta: string | null;
  estadoCuenta: CuentaPorPagar["estadoCuenta"];
  total: number;
  lineas: CuentaPorPagar[];
};

/** Una transferencia por proveedor: es como se paga y como se revisa. */
export function agrupar(lineas: CuentaPorPagar[]): GrupoDePago[] {
  const mapa = new Map<string, GrupoDePago>();

  for (const l of lineas) {
    const clave = l.proveedorId ?? l.proveedor;
    const grupo = mapa.get(clave) ?? {
      proveedor: l.proveedor,
      rut: l.rut,
      banco: l.banco,
      numeroCuenta: l.numeroCuenta,
      estadoCuenta: l.estadoCuenta,
      total: 0,
      lineas: [],
    };
    grupo.total += l.total;
    grupo.lineas.push(l);
    mapa.set(clave, grupo);
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/* ── Registrar la factura ─────────────────────────────────────────────────── */

function DialogoFactura({
  linea,
  plazoPorDefecto,
  alCerrar,
  alGuardado,
}: {
  linea: CuentaPorPagar;
  plazoPorDefecto: number;
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const plazo = linea.plazoDias || plazoPorDefecto;

  const f = useFormulario({
    documento: "",
    fechaFactura: hoy,
    vencimiento: sumarDias(hoy, plazo),
  });

  return (
    <Dialogo
      titulo="Registrar factura del proveedor"
      descripcion={`${linea.proveedor} · ${linea.ordenNumero ?? linea.contrato}. Con el número registrado, la línea pasa a ser pagable.`}
      abierto
      alCerrar={alCerrar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          f.enviar(async () => {
            await registrarFactura(linea.compraId!, {
              documento: f.datos.documento,
              fechaFactura: f.datos.fechaFactura,
              vencimiento: f.datos.vencimiento || null,
            });
          }, () => {
            alGuardado();
            alCerrar();
          });
        }}
      >
        <Campos>
          <CampoTexto
            etiqueta="N° de factura"
            requerido
            marcador="117249"
            {...f.campo("documento")}
          />
          <CampoFecha
            etiqueta="Fecha de la factura"
            requerido
            ayuda="De acá se cuenta el plazo de pago."
            valor={f.datos.fechaFactura}
            alCambiar={(v) => {
              f.cambiar("fechaFactura", v);
              f.cambiar("vencimiento", sumarDias(v, plazo));
            }}
          />
          <CampoFecha
            etiqueta="Vence"
            ayuda={`${plazo} días desde la factura. Se puede cambiar si se pactó otra cosa.`}
            {...f.campo("vencimiento")}
          />
        </Campos>

        <Pie
          error={f.error}
          guardando={f.guardando}
          alCancelar={alCerrar}
          textoGuardar="Registrar factura"
        />
      </form>
    </Dialogo>
  );
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

function SelectorSemana({
  fechas,
  valor,
  alCambiar,
}: {
  fechas: string[];
  valor: string;
  alCambiar: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
      <span className="uppercase tracking-[0.12em]">Semana</span>
      <select
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="rounded-full border border-mist-deep bg-white px-4 py-1.5 text-xs font-semibold text-ink"
      >
        {fechas.map((f) => (
          <option key={f} value={f}>
            {formatearFecha(f)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Boton({
  children,
  onClick,
  disabled,
  secundario,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secundario?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
        secundario
          ? "border border-mist-deep text-ink-soft hover:border-ink hover:text-ink"
          : "bg-cyan text-white hover:bg-cyan-deep"
      }`}
    >
      {children}
    </button>
  );
}

const suma = (ls: CuentaPorPagar[]) => ls.reduce((t, l) => t + l.total, 0);

function sumarDias(iso: string, dias: number) {
  const f = new Date(`${iso}T12:00:00`);
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
}

/* ── La factura de una OC ─────────────────────────────────────────────────── */

/**
 * La factura que llega contra una OC se registra por líneas: puede cubrir una
 * parte, y la orden puede tener varias. Se abre el ciclo de la orden directo en
 * "Agregar factura", el mismo que se usa desde Compras y desde Órdenes.
 */
function FacturaDeOrden({ ordenId, alCerrar, alCambiar }: { ordenId: string; alCerrar: () => void; alCambiar: () => void }) {
  const { estado } = useConsulta(() => cargarOrden(ordenId));
  if (estado.estado === "error") {
    return (
      <Dialogo titulo="Registrar factura" abierto alCerrar={alCerrar}>
        <p className="px-6 py-10 text-center text-sm text-[#a52f24]">{estado.mensaje}</p>
      </Dialogo>
    );
  }
  if (estado.estado !== "listo") return null;
  return <CicloOrden orden={estado.datos} modoInicial="facturar" alCerrar={alCerrar} alCambiar={alCambiar} />;
}
