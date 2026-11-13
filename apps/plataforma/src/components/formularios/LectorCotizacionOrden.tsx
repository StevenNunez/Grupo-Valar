"use client";

import { useState } from "react";
import { CampoPrecio } from "../ui/CampoPrecio";
import { formatearPesos } from "@/lib/formato";
import {
  leerCotizacionPdf,
  leerCotizacionPegada,
  type LecturaCotizacion,
} from "@/lib/lector-cotizacion";
import type { Proveedor } from "@/lib/abastecimiento";

/**
 * Leer la cotización del proveedor al crear una orden de compra.
 *
 * Es el mismo lector que usan las cotizaciones de una solicitud (pdf.js en el
 * navegador: el archivo no sale del computador), pero sin solicitud de la cual
 * emparejar ítems: acá las líneas leídas SON los ítems de la orden. Por eso lo
 * que se lee se muestra editable antes de agregarlo —nombre, cantidad y precio—,
 * porque un PDF mal leído no debe llegar a una orden sin que alguien lo vea.
 *
 * Además de las líneas rescata lo que el documento dice del encabezado: el N.º
 * de cotización, la forma de pago, el proveedor (por su RUT, contra el maestro),
 * el flete y el descuento.
 */

export type ResultadoLectura = {
  filas: { descripcion: string; cantidad: number; precioUnitario: number }[];
  condicion: string | null;
  numero: string | null;
  proveedorId: string | null;
  /** Se agrega como una línea más. */
  flete: number | null;
  /** En %, calculado contra las líneas elegidas. */
  descuentoPorcentaje: number | null;
};

type Editable = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** El documento no traía precio: se marca para que se escriba a mano. */
  sinPrecio: boolean;
  usar: boolean;
};

const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-xs text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20";

/** «76.123.456-7» y «761234567» llegan al mismo lugar. */
const llaveRut = (rut: string | null | undefined) => (rut ?? "").replace(/[^\dkK]/g, "").toUpperCase();

export function LectorCotizacionOrden({
  proveedores,
  proveedorActual,
  enUf,
  alAplicar,
  alCerrar,
}: {
  proveedores: Proveedor[];
  /** El proveedor que ya está elegido en la orden, si lo hay. */
  proveedorActual: string;
  enUf: boolean;
  alAplicar: (r: ResultadoLectura) => void;
  alCerrar: () => void;
}) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pegado, setPegado] = useState("");
  const [lectura, setLectura] = useState<LecturaCotizacion | null>(null);
  const [filas, setFilas] = useState<Editable[]>([]);
  const [usarCondicion, setUsarCondicion] = useState(true);
  const [usarNumero, setUsarNumero] = useState(true);
  const [usarProveedor, setUsarProveedor] = useState(true);
  const [usarFlete, setUsarFlete] = useState(true);
  const [usarDescuento, setUsarDescuento] = useState(true);

  /* El proveedor se reconoce por RUT contra el maestro. El RUT de Valar también
     sale en el documento, pero no está entre los proveedores, así que no estorba. */
  const proveedorLeido = lectura
    ? proveedores.find((p) => p.estado !== "inactivo" && lectura.ruts.includes(llaveRut(p.rut).replace(/(.)$/, "-$1")))
    : undefined;

  function nuevaLectura(l: LecturaCotizacion) {
    setLectura(l);
    setFilas(
      l.filas.map((f) => ({
        descripcion: f.descripcion,
        cantidad: f.cantidad ?? 1,
        precioUnitario: f.precioUnitario ?? 0,
        sinPrecio: f.precioUnitario === null,
        usar: true,
      })),
    );
    setUsarProveedor(true);
  }

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setLeyendo(true);
    try {
      nuevaLectura(await leerCotizacionPdf(archivo));
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudo leer el PDF: ${e.message}. Si es un escaneo o una foto, pega la tabla.`
          : String(e),
      );
    } finally {
      setLeyendo(false);
    }
  }

  const cambiar = (i: number, cambio: Partial<Editable>) =>
    setFilas((fs) => fs.map((f, n) => (n === i ? { ...f, ...cambio } : f)));

  const elegidas = filas.filter((f) => f.usar && f.descripcion.trim());
  const subtotal = elegidas.reduce((t, f) => t + Math.round(f.cantidad * f.precioUnitario), 0);
  const descuentoPct =
    lectura?.descuento && subtotal > 0
      ? Math.min(99.99, Math.round((lectura.descuento / subtotal) * 10000) / 100)
      : null;
  const sinPrecio = elegidas.filter((f) => !(f.precioUnitario > 0)).length;

  function aplicar() {
    if (!lectura || elegidas.length === 0) return;
    alAplicar({
      filas: elegidas.map((f) => ({
        descripcion: f.descripcion.trim(),
        cantidad: f.cantidad || 1,
        precioUnitario: f.precioUnitario,
      })),
      condicion: usarCondicion ? lectura.condicion : null,
      numero: usarNumero ? lectura.numero : null,
      proveedorId: usarProveedor && proveedorLeido ? proveedorLeido.id : null,
      flete: usarFlete ? lectura.flete : null,
      descuentoPorcentaje: usarDescuento ? descuentoPct : null,
    });
  }

  return (
    <div className="mb-5 rounded-xl border border-cyan/40 bg-cyan/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Leer la cotización del proveedor</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-soft">
            El PDF se lee en tu navegador: no se sube a ninguna parte. Revisa y corrige los nombres y precios antes de
            agregarlos. Si es un escaneo o una foto, pega la tabla en el cuadro.
            {enUf && " La orden está en UF: los precios leídos se cargan como UF."}
          </p>
        </div>
        <button type="button" onClick={alCerrar} className="text-xs font-semibold text-ink-soft hover:text-ink">
          Cerrar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
          {leyendo ? "Leyendo…" : lectura ? "Elegir otro PDF" : "Elegir PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              void leerArchivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-ink-soft">o pega la tabla desde Excel o el correo</span>
      </div>

      <textarea
        value={pegado}
        onChange={(e) => {
          setPegado(e.target.value);
          if (e.target.value.trim()) nuevaLectura(leerCotizacionPegada(e.target.value));
          else {
            setLectura(null);
            setFilas([]);
          }
        }}
        rows={3}
        aria-label="Tabla de la cotización pegada"
        placeholder={"Descripción\tCantidad\tPrecio\tTotal\nDisco de corte 4½″\t10\t2.400\t24.000"}
        className={`${claseCelda} mt-3 font-mono`}
      />

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-peligro-suave px-3 py-2 text-xs font-medium text-peligro">
          {error}
        </p>
      )}

      {lectura?.aviso && (
        <p className="mt-3 rounded-lg bg-alerta-suave px-3 py-2 text-xs text-alerta">{lectura.aviso}</p>
      )}

      {lectura && !lectura.aviso && (
        <div className="mt-4 border-t border-mist-deep/60 pt-4">
          <p className="text-sm text-ink">
            Leí <strong>{filas.length}</strong> {filas.length === 1 ? "línea" : "líneas"}. Desmarca las que no
            corresponden y corrige lo que haga falta.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-mist text-left text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="w-8 py-1.5" />
                  <th className="py-1.5 pr-2">Nombre</th>
                  <th className="w-20 py-1.5 pr-2 text-right">Cant.</th>
                  <th className="w-28 py-1.5 pr-2 text-right">{enUf ? "P. unit. (UF)" : "P. unitario"}</th>
                  <th className="w-24 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className={`border-b border-mist last:border-0 ${f.usar ? "" : "opacity-45"}`}>
                    <td className="py-1.5 pr-1">
                      <input
                        type="checkbox"
                        checked={f.usar}
                        onChange={(e) => cambiar(i, { usar: e.target.checked })}
                        aria-label={`Usar la línea ${i + 1}`}
                        className="h-4 w-4 accent-cyan"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={f.descripcion}
                        onChange={(e) => cambiar(i, { descripcion: e.target.value })}
                        aria-label="Nombre del ítem"
                        className={claseCelda}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={f.cantidad}
                        onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) || 0 })}
                        aria-label="Cantidad"
                        className={`${claseCelda} text-right tabular-nums`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <CampoPrecio
                        valor={f.precioUnitario}
                        alCambiar={(n) => cambiar(i, { precioUnitario: n, sinPrecio: false })}
                        ariaLabel="Precio unitario"
                        className={`${claseCelda} text-right tabular-nums ${f.sinPrecio ? "border-alerta-borde" : ""}`}
                      />
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                      {enUf ? "—" : formatearPesos(Math.round(f.cantidad * f.precioUnitario))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5 text-xs text-ink">
            {proveedorLeido && (
              <Opcion marcada={usarProveedor} alCambiar={setUsarProveedor}>
                Proveedor: <strong>{proveedorLeido.razonSocial}</strong>
                {proveedorActual && proveedorActual !== proveedorLeido.id && (
                  <span className="text-alerta"> (cambia el proveedor ya elegido)</span>
                )}
              </Opcion>
            )}
            {lectura.condicion && (
              <Opcion marcada={usarCondicion} alCambiar={setUsarCondicion}>
                Forma de pago: <strong>{lectura.condicion}</strong>
              </Opcion>
            )}
            {lectura.numero && (
              <Opcion marcada={usarNumero} alCambiar={setUsarNumero}>
                N.º de cotización: <strong>{lectura.numero}</strong>
              </Opcion>
            )}
            {lectura.flete !== null && (
              <Opcion marcada={usarFlete} alCambiar={setUsarFlete}>
                Flete: <strong>{formatearPesos(lectura.flete)}</strong> (se agrega como un ítem)
              </Opcion>
            )}
            {descuentoPct !== null && (
              <Opcion marcada={usarDescuento} alCambiar={setUsarDescuento}>
                Descuento: <strong>{descuentoPct.toLocaleString("es-CL")} %</strong> ({formatearPesos(lectura.descuento ?? 0)})
              </Opcion>
            )}
          </ul>

          {sinPrecio > 0 && (
            <p className="mt-3 rounded-lg bg-alerta-suave px-3 py-2 text-xs text-alerta">
              {sinPrecio === 1 ? "Una línea quedó" : `${sinPrecio} líneas quedaron`} sin precio. Escríbelo aquí o
              después en la orden.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-ink-soft">
              {elegidas.length} {elegidas.length === 1 ? "ítem" : "ítems"}
              {!enUf && <> · neto {formatearPesos(subtotal)}</>}
            </span>
            <button
              type="button"
              onClick={aplicar}
              disabled={elegidas.length === 0}
              className="rounded-full bg-cyan-deep px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo disabled:opacity-50"
            >
              Agregar {elegidas.length} {elegidas.length === 1 ? "ítem" : "ítems"} a la orden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Opcion({
  marcada,
  alCambiar,
  children,
}: {
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => alCambiar(e.target.checked)}
          className="h-4 w-4 accent-cyan"
        />
        <span>{children}</span>
      </label>
    </li>
  );
}
