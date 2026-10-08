"use client";

import { LogoMark } from "./Logo";
import { camposDe, mostrarValor, type CampoContrato } from "@/lib/campos";
import { empresa, emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearPesos, formatearUf, mesLargo } from "@/lib/formato";
import { nombreEdp, nombreEstadoEP, type Ciclo } from "@/lib/ingresos";
import { camposEdp, clavesEdp, comportamientoEdp } from "@/lib/plantillas-edp";

/**
 * Los tres documentos del ciclo, listos para imprimir o guardar en PDF.
 *
 * El PDF lo hace el navegador desde la vista previa, igual que el informe del
 * Dashboard y la orden de compra a proveedores: no hay librería de PDF ni
 * servidor que genere archivos, y por eso la hoja se puede diseñar con el mismo
 * HTML y las mismas fuentes que el resto de la plataforma.
 *
 * QUÉ ES CADA HOJA, que no es lo mismo en los tres casos:
 *
 *   · El ESTADO DE PAGO lo emite Valar y se presenta al mandante. Es un
 *     documento propio y esta hoja es el documento.
 *
 *   · La ORDEN DE COMPRA la emite el MANDANTE. Valar no la crea, la recibe. Por
 *     eso esta hoja es el comprobante de recepción —qué orden llegó, contra qué
 *     estado de pago y por cuánto—, y el documento original del mandante va
 *     adjunto en los respaldos.
 *
 *   · La FACTURA la emite el SII a través del facturador electrónico. El
 *     documento tributario es ese, no éste. Esta hoja es el detalle de
 *     facturación: de qué EDP y de qué orden salió el folio, que es lo que hay
 *     que poder reconstruir cuando el mandante pregunta o cuando se cobra.
 *
 * Confundir las tres cosas sería fácil y caro: una hoja que se parezca a una
 * factura del SII sin serlo termina en manos de alguien que la trata como si lo
 * fuera.
 */

/* ── El estado de pago ────────────────────────────────────────────────────── */

export function EstadoPagoImprimible({ ciclo, campos }: { ciclo: Ciclo; campos: CampoContrato[] }) {
  const plantilla = ciclo.plantillaEdp;
  const particulares = camposEdp(plantilla, ciclo.tipoEdp, ciclo.camposEdp);
  const clavesParticulares = clavesEdp(plantilla, ciclo.camposEdp);
  const comportamiento = comportamientoEdp(plantilla, ciclo.camposEdp);
  const propios = camposDe(campos, ciclo.contratoId, "estado_pago")
    .filter((campo) => !clavesParticulares.includes(campo.clave));
  const aCobrar = ciclo.montoNeto - ciclo.retenciones;

  /* La tercera casilla de la cabecera depende del contrato: solo Carpas mide
     avance y solo la plantilla general guarda `avance_periodo`. Para Torres y
     Misceláneos esa casilla salía "0,0%" en todas las hojas, porque el
     formulario de esos contratos ni siquiera pide el dato. */
  const destacados = [
    { etiqueta: "Período", valor: mesLargo(ciclo.periodo) },
    { etiqueta: "Tipo", valor: ciclo.tipoEdp === "extraordinario" ? "Extraordinario" : "Ordinario" },
  ];
  if (comportamiento.destacaAvance && ciclo.datos.avance_real !== undefined) {
    destacados.push({
      etiqueta: "Avance real",
      valor: `${Number(ciclo.datos.avance_real).toLocaleString("es-CL")}%`,
    });
  } else if (comportamiento.usaUf && ciclo.montoUf !== null) {
    destacados.push({ etiqueta: "Monto del período", valor: `${formatearUf(ciclo.montoUf)} UF` });
  } else if (plantilla === "general") {
    destacados.push({
      etiqueta: "Avance del período",
      valor: `${ciclo.avancePeriodo.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    });
  }
  destacados.push({ etiqueta: "Presentado", valor: formatearFecha(ciclo.fechaPresentacion) });

  return (
    <Hoja titulo="ESTADO DE PAGO" folio={`N° ${ciclo.numero}`}>
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Presenta">
          <Dato etiqueta="Razón social" valor={empresa.razonSocial} />
          <Dato etiqueta="Rut" valor={empresa.rut} />
          <Dato etiqueta="Dirección" valor={emisorOC.direccion} />
          <Dato etiqueta="Ciudad" valor={`${emisorOC.ciudad}, ${emisorOC.region}`} />
          <Dato etiqueta="Correo" valor={empresa.email} />
        </Bloque>

        <Bloque titulo="Mandante">
          <Dato etiqueta="Cliente" valor={ciclo.cliente} />
          <Dato etiqueta="Contrato" valor={ciclo.contrato} />
          <Dato etiqueta="Código" valor={ciclo.contratoId} />
        </Bloque>
      </div>

      <div
        className={`mt-6 grid grid-cols-2 gap-4 border-y border-mist-deep py-4 ${
          destacados.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        {destacados.map((d) => (
          <Dato key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} destacado />
        ))}
      </div>

      {/* La planilla del contrato: es lo que este contrato presenta y otro no. */}
      {(particulares.length > 0 || propios.length > 0) && (
        <section className="mt-6">
          <h2 className="mb-2 border-b-2 border-ink pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
            Detalle del período
          </h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {comportamiento.usaUf && typeof ciclo.datos.valor_uf_periodo === "number" && (
                <Fila etiqueta="UF aplicada al período" valor={`$${ciclo.datos.valor_uf_periodo.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              )}
              {particulares.filter((campo) => {
                // El avance real ya va en la cabecera: repetirlo acá deja la
                // misma cifra dos veces en la misma hoja.
                if (campo.clave === "avance_real" && destacados.some((d) => d.etiqueta === "Avance real")) return false;
                const valor = ciclo.datos[campo.clave];
                return valor !== null && valor !== undefined && valor !== "";
              }).map((campo) => (
                <Fila
                  key={campo.clave}
                  etiqueta={campo.etiqueta}
                  valor={campo.tipo === "moneda"
                    ? formatearPesos(Number(ciclo.datos[campo.clave]) || 0)
                    : campo.tipo === "numero"
                      ? `${Number(ciclo.datos[campo.clave]).toLocaleString("es-CL")}${campo.unidad ? ` ${campo.unidad}` : ""}`
                      : String(ciclo.datos[campo.clave])}
                />
              ))}
              {propios.map((c) => (
                <tr key={c.id} className="border-b border-mist">
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-ink-soft">
                    {c.etiqueta}
                  </th>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {mostrarValor(c, ciclo.datos[c.clave])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="text-sm">
          <Dato etiqueta="Código EP" valor={ciclo.id} />
          {ciclo.montoUf !== null && <Dato etiqueta="Equivalente" valor={`${formatearUf(ciclo.montoUf)} UF`} />}
        </div>

        <dl className="w-full max-w-xs text-sm">
          <Linea etiqueta="Monto neto del período" valor={formatearPesos(ciclo.montoNeto)} />
          {plantilla !== "general" && <>
            <Linea etiqueta="IVA referencial (19%)" valor={formatearPesos(Math.round(ciclo.montoNeto * 0.19))} />
            <Linea etiqueta="Total con IVA" valor={formatearPesos(ciclo.montoNeto + Math.round(ciclo.montoNeto * 0.19))} />
          </>}
          <Linea
            etiqueta="Retención de garantía"
            valor={`− ${formatearPesos(ciclo.retenciones)}`}
          />
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2">
            <dt className="font-display font-semibold">A COBRAR</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {formatearPesos(aCobrar)}
            </dd>
          </div>
        </dl>
      </div>

      <Firmas
        firmas={[
          ["Presenta", empresa.representante],
          ["Recibe conforme", ciclo.cliente],
        ]}
      />
    </Hoja>
  );
}

/* ── La orden de compra del mandante ──────────────────────────────────────── */

/**
 * La orden puede cubrir varios estados de pago (el ordinario y el
 * extraordinario del mes): la hoja los lista todos. `cubiertos` son los EDP que
 * apuntan a esta orden; si no se pasan, solo el de la ficha.
 */
export function OrdenDelMandanteImprimible({ ciclo, cubiertos = [ciclo] }: { ciclo: Ciclo; cubiertos?: Ciclo[] }) {
  const presentado = cubiertos.reduce((t, c) => t + c.montoNeto, 0);
  const corta =
    ciclo.montoAutorizado !== null && ciclo.montoAutorizado < presentado
      ? presentado - ciclo.montoAutorizado
      : 0;

  return (
    <Hoja titulo="ORDEN DE COMPRA" folio={`N° ${ciclo.ordenNumero ?? "—"}`}>
      <p className="mt-4 rounded-lg border border-mist-deep bg-mist/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
        Comprobante de recepción. La orden la emite el mandante; esta hoja deja constancia de cuál
        llegó, contra qué estado de pago y por cuánto. El documento original va adjunto en los
        respaldos de la orden.
      </p>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Emite la orden">
          <Dato etiqueta="Mandante" valor={ciclo.cliente} />
          <Dato etiqueta="Contrato" valor={ciclo.contrato} />
          <Dato etiqueta="Código" valor={ciclo.contratoId} />
        </Bloque>

        <Bloque titulo="Recibe">
          <Dato etiqueta="Razón social" valor={empresa.razonSocial} />
          <Dato etiqueta="Rut" valor={empresa.rut} />
          <Dato etiqueta="Dirección" valor={emisorOC.direccion} />
        </Bloque>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-y border-mist-deep py-4 sm:grid-cols-4">
        <Dato etiqueta="Forma de pago" valor={ciclo.ordenFormaPago === "contado" ? "AL CONTADO" : ciclo.ordenFormaPago === "credito" ? "A CRÉDITO" : "—"} destacado />
        <Dato etiqueta="Fecha de cobro" valor={formatearFecha(ciclo.ordenFechaCobro)} destacado />
        <Dato etiqueta="Período" valor={mesLargo(ciclo.periodo)} destacado />
        <Dato etiqueta="Recibida el" valor={formatearFecha(ciclo.ordenFecha)} destacado />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 border-b-2 border-ink pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {cubiertos.length > 1 ? "Qué estados de pago cubre" : "De qué estado de pago sale"}
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {cubiertos.map((c) => (
              <Fila
                key={c.id}
                etiqueta={`${nombreEdp(c.numero, c.tipoEdp)} · ${mesLargo(c.periodo)}`}
                valor={formatearPesos(c.montoNeto)}
              />
            ))}
            {cubiertos.length === 1 && <>
              <Fila etiqueta="Presentado el" valor={formatearFecha(ciclo.fechaPresentacion)} />
              <Fila etiqueta="Aprobado el" valor={formatearFecha(ciclo.fechaAprobacion)} />
            </>}
          </tbody>
        </table>
      </section>

      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs text-sm">
          <Linea etiqueta={cubiertos.length > 1 ? "Presentado en los EDP" : "Presentado en el EDP"} valor={formatearPesos(presentado)} />
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2">
            <dt className="font-display font-semibold">AUTORIZADO</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {formatearPesos(ciclo.montoAutorizado ?? 0)}
            </dd>
          </div>
        </dl>
      </div>

      {corta > 0 && (
        <p className="mt-4 border-t border-mist-deep pt-3 text-xs leading-relaxed">
          <strong>Diferencia:</strong> la orden autoriza {formatearPesos(corta)} menos de lo
          presentado. No se puede facturar por sobre este monto.
        </p>
      )}

      <Firmas
        firmas={[
          ["Recibe", empresa.representante],
          ["Cobro", ciclo.ordenFechaCobro ? formatearFecha(ciclo.ordenFechaCobro) : "—"],
        ]}
      />
    </Hoja>
  );
}

/* ── El detalle de facturación ────────────────────────────────────────────── */

/** Una factura puede cobrar varios EDP: `incluidos` son todos los que apuntan a este folio. */
export function FacturaImprimible({ ciclo, incluidos = [ciclo] }: { ciclo: Ciclo; incluidos?: Ciclo[] }) {
  const neto = ciclo.facturaNeto ?? 0;
  const total = ciclo.facturaTotal ?? 0;
  const iva = total - neto;

  return (
    <Hoja titulo="DETALLE DE FACTURACIÓN" folio={`Folio ${ciclo.facturaId ?? "—"}`}>
      <p className="mt-4 rounded-lg border border-mist-deep bg-mist/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
        Documento interno. El documento tributario es la factura electrónica emitida ante el SII;
        esta hoja acompaña el cobro y deja por escrito de qué estado de pago y de qué orden de
        compra salió el folio.
      </p>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Factura">
          <Dato etiqueta="Razón social" valor={empresa.razonSocial} />
          <Dato etiqueta="Rut" valor={empresa.rut} />
          <Dato etiqueta="Dirección" valor={emisorOC.direccion} />
          <Dato etiqueta="Correo" valor={empresa.email} />
        </Bloque>

        <Bloque titulo="Se cobra a">
          <Dato etiqueta="Cliente" valor={ciclo.cliente} />
          <Dato etiqueta="Contrato" valor={ciclo.contrato} />
          <Dato etiqueta="Código" valor={ciclo.contratoId} />
        </Bloque>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-y border-mist-deep py-4 sm:grid-cols-4">
        <Dato etiqueta="Emitida" valor={formatearFecha(ciclo.facturaFecha)} destacado />
        <Dato etiqueta="Vencimiento" valor={formatearFecha(ciclo.facturaVencimiento)} destacado />
        <Dato
          etiqueta="Estado de cobro"
          valor={ciclo.estadoCobro === "pagada" ? "PAGADA" : ciclo.estadoCobro ? nombreEstadoEP.facturado.toUpperCase() : ""}
          destacado
        />
        <Dato etiqueta="Período" valor={mesLargo(ciclo.periodo)} destacado />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 border-b-2 border-ink pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          De dónde viene
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {incluidos.map((c) => (
              <Fila
                key={c.id}
                etiqueta={`${nombreEdp(c.numero, c.tipoEdp)} · ${mesLargo(c.periodo)}`}
                valor={formatearPesos(c.montoNeto)}
              />
            ))}
            {[...new Map(incluidos.filter((c) => c.ordenId).map((c) => [c.ordenId, c])).values()].map((c) => (
              <Fila
                key={c.ordenId}
                etiqueta={`Orden de compra N° ${c.ordenNumero ?? "—"}`}
                valor={c.montoAutorizado === null ? "—" : formatearPesos(c.montoAutorizado)}
              />
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs text-sm">
          <Linea etiqueta="Neto" valor={formatearPesos(neto)} />
          <Linea etiqueta="IVA 19%" valor={formatearPesos(iva)} />
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2">
            <dt className="font-display font-semibold">TOTAL</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {formatearPesos(total)}
            </dd>
          </div>
        </dl>
      </div>

      <Firmas
        firmas={[
          ["Emite", empresa.representante],
          ["Recibe conforme", ciclo.cliente],
        ]}
      />
    </Hoja>
  );
}

/* ── Las piezas que comparten las tres hojas ──────────────────────────────── */

function Hoja({
  titulo,
  folio,
  children,
}: {
  titulo: string;
  folio: string;
  children: React.ReactNode;
}) {
  return (
    <article className="hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-ink lg:p-12">
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto text-ink" />
          <div>
            <p className="font-display text-xl font-semibold leading-tight tracking-[0.14em]">
              {emisorOC.razonSocial}
            </p>
            <p className="text-xs text-ink-soft">RUT {empresa.rut}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-display text-2xl font-semibold">{titulo}</h1>
          <p className="mt-1 font-mono text-lg font-semibold">{folio}</p>
        </div>
      </header>

      {children}
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 border-b border-mist-deep pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {titulo}
      </h2>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor?: string | null;
  destacado?: boolean;
}) {
  return (
    <div className={destacado ? "" : "flex gap-2 text-sm"}>
      <dt
        className={
          destacado
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft"
            : "w-24 shrink-0 text-ink-soft"
        }
      >
        {etiqueta}
      </dt>
      <dd className={destacado ? "mt-0.5 text-sm font-semibold" : "min-w-0 flex-1"}>
        {valor || "—"}
      </dd>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <tr className="border-b border-mist">
      <th scope="row" className="py-2 pr-4 text-left font-normal text-ink-soft">
        {etiqueta}
      </th>
      <td className="py-2 text-right font-semibold tabular-nums">{valor}</td>
    </tr>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between py-1">
      <dt className="text-ink-soft">{etiqueta}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

function Firmas({ firmas }: { firmas: [string, string][] }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs">
      {firmas.map(([etiqueta, nombre]) => (
        <div key={etiqueta}>
          <div className="mx-auto h-12" />
          <p className="border-t border-ink pt-2 font-semibold">{nombre || "—"}</p>
          <p className="mt-0.5 text-ink-soft">{etiqueta}</p>
        </div>
      ))}
    </div>
  );
}
