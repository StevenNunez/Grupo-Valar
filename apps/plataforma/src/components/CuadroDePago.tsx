"use client";

import { LogoMark } from "./Logo";
import { FirmaTeoLabs } from "./FirmaTeoLabs";
import { agrupar } from "./vistas/VistaPagos";
import { emisorOC } from "@/lib/empresa";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { formatearRut } from "@/lib/abastecimiento";
import type { CuentaPorPagar, LineaNomina } from "@/lib/pagos";

/**
 * El cuadro de pago de la semana, listo para imprimir.
 *
 * Es el documento que Valar ya arma a mano cada semana: un bloque por
 * proveedor con sus facturas, el CECO de cada una y el total a transferir.
 * Abajo va la nómina para el banco, en el formato que el banco pide —el RUT
 * partido en número y dígito verificador— para que no haya que volver a
 * teclear nada.
 *
 * Quien no tenga la cuenta creada sale marcado: transferirle sin eso es un
 * pago que rebota y una semana perdida.
 */
export function CuadroDePago({
  fecha,
  lineas,
  nomina,
  tope,
}: {
  fecha: string;
  lineas: CuentaPorPagar[];
  nomina: LineaNomina[];
  tope: number;
}) {
  const grupos = agrupar(lineas);
  const total = lineas.reduce((t, l) => t + l.total, 0);
  const bloqueados = nomina.filter((n) => !n.listo);

  return (
    <article className="hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-ink lg:p-12">
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-auto text-ink" />
          <div>
            <p className="font-display text-xl font-semibold leading-tight tracking-[0.14em]">
              {emisorOC.razonSocial}
            </p>
            <p className="text-xs text-ink-soft">{emisorOC.rut}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-display text-2xl font-semibold">CUADRO DE PAGO</h1>
          <p className="mt-1 font-mono text-lg font-semibold">{formatearFecha(fecha)}</p>
        </div>
      </header>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        {grupos.length} {grupos.length === 1 ? "proveedor" : "proveedores"} ·{" "}
        {lineas.length} {lineas.length === 1 ? "documento" : "documentos"} · total a
        transferir <strong className="text-ink">{formatearPesos(total)}</strong>
        {total > tope && (
          <span className="text-[#a52f24]">
            {" "}
            — {formatearPesos(total - tope)} sobre el tope semanal de {formatearPesos(tope)}
          </span>
        )}
        .
      </p>

      {/* Un bloque por proveedor: es una transferencia cada uno. */}
      {grupos.map((g) => (
        <section key={g.proveedor} className="mt-6 break-inside-avoid">
          <div className="flex items-end justify-between border-b border-ink pb-2">
            <div>
              <p className="font-display text-base font-semibold">{g.proveedor}</p>
              <p className="text-xs text-ink-soft">
                {formatearRut(g.rut)} · {g.banco ?? "Banco por confirmar"}
                {g.numeroCuenta ? ` · cuenta ${g.numeroCuenta}` : " · sin cuenta"}
                {g.estadoCuenta !== "creada" && " · CUENTA NO VALIDADA"}
              </p>
            </div>
            <p className="font-display text-base font-semibold tabular-nums">
              {formatearPesos(g.total)}
            </p>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left uppercase tracking-[0.1em] text-ink-soft">
                <th className="py-2 font-semibold">N° factura</th>
                <th className="py-2 font-semibold">Referencia</th>
                <th className="py-2 font-semibold">CECO</th>
                <th className="py-2 text-right font-semibold">Neto</th>
                <th className="py-2 text-right font-semibold">IVA</th>
                <th className="py-2 text-right font-semibold">Bruto</th>
              </tr>
            </thead>
            <tbody>
              {g.lineas.map((l) => (
                <tr key={l.id} className="border-t border-mist">
                  <td className="py-2 font-mono">{l.documento ?? "SIN FACTURA"}</td>
                  <td className="py-2">{l.ordenNumero ?? "—"}</td>
                  <td className="py-2">{l.contrato}</td>
                  <td className="py-2 text-right tabular-nums">{formatearPesos(l.neto)}</td>
                  <td className="py-2 text-right tabular-nums">{formatearPesos(l.iva)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {formatearPesos(l.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {/* La nómina, tal como la pide el banco. */}
      <section className="mt-10 break-inside-avoid">
        <h2 className="font-display text-lg font-semibold">Nómina para el banco</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Un abono por beneficiario. El RUT va partido, como en el archivo de carga.
        </p>

        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink text-left uppercase tracking-[0.1em] text-ink-soft">
              <th className="py-2 font-semibold">Rut</th>
              <th className="py-2 font-semibold">Dv</th>
              <th className="py-2 font-semibold">Beneficiario</th>
              <th className="py-2 font-semibold">Banco</th>
              <th className="py-2 font-semibold">N° cuenta</th>
              <th className="py-2 text-right font-semibold">Monto</th>
              <th className="py-2 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {nomina.map((n) => (
              <tr key={`${n.rut}-${n.beneficiario}`} className="border-t border-mist">
                <td className="py-2 font-mono">{n.rut || "—"}</td>
                <td className="py-2 font-mono">{n.dv || "—"}</td>
                <td className="py-2">{n.beneficiario}</td>
                <td className="py-2">{n.banco || "—"}</td>
                <td className="py-2 font-mono">{n.numeroCuenta || "—"}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {formatearPesos(n.monto)}
                </td>
                <td className="py-2">{n.descripcion}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-semibold">
              <td className="py-2" colSpan={5}>
                Total
              </td>
              <td className="py-2 text-right tabular-nums">{formatearPesos(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {bloqueados.length > 0 && (
          <p className="mt-3 rounded-lg border border-[#e2b7b1] bg-[#fdeeec] px-4 py-3 text-xs leading-relaxed text-[#a52f24]">
            <strong>No transferir todavía a:</strong>{" "}
            {bloqueados.map((n) => n.beneficiario).join(", ")}. Falta crear o validar la
            cuenta bancaria, o el RUT del proveedor.
          </p>
        )}
      </section>

      <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-xs">
        {["Preparado por", "Autorizado por"].map((t) => (
          <div key={t}>
            <div className="mt-10 border-t border-ink pt-2 text-ink-soft">{t}</div>
          </div>
        ))}
      </footer>
      {/* La firma va al pie de cada documento que sale de la plataforma. */}
      <div className="mt-8 flex justify-center border-t border-mist pt-3">
        <FirmaTeoLabs />
      </div>
    </article>
  );
}
