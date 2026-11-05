"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, type Tono } from "./ui/Chip";
import { Buscador } from "./ui/Buscador";
import { Tabla, type Columna } from "./ui/Tabla";
import { Filtro, Panel } from "./ui/Vista";
import { Dialogo } from "./ui/Formulario";
import { CicloOrden, type FacturaSugerida } from "./CicloOrden";
import { formatearRut } from "@/lib/abastecimiento";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { cargarOrden } from "@/lib/ordenes";
import { useConsulta } from "@/lib/consulta";
import type { CuentaPorPagar } from "@/lib/pagos";
import {
  cargarContextoSii,
  cargarFacturasSii,
  cruzar,
  decodificar,
  guardarDocumentosSii,
  leerArchivoSii,
  marcarIgnorada,
  nombreTipoDocumento,
  type Cruce,
  type FacturaSii,
} from "@/lib/facturas-sii";

/**
 * Facturas del SII (0116). Se sube el detalle del Registro de Compras y cada
 * factura se cruza con las órdenes abiertas del proveedor: si calza, se registra
 * en la OC con un clic (el formulario de «Agregar factura» ya viene lleno).
 */

type Vista = "por_registrar" | "con_orden" | "cargadas" | "notas" | "ignoradas" | "todas";

const vistas: { id: Vista; titulo: string }[] = [
  { id: "por_registrar", titulo: "Por registrar" },
  { id: "con_orden", titulo: "Con OC" },
  { id: "cargadas", titulo: "Ya cargadas" },
  { id: "notas", titulo: "Notas de crédito/débito" },
  { id: "ignoradas", titulo: "Ignoradas" },
  { id: "todas", titulo: "Todas" },
];

const etiquetaCruce: Record<Cruce["tipo"], { texto: string; tono: Tono }> = {
  con_orden: { texto: "Tiene OC", tono: "info" },
  sin_orden: { texto: "Sin OC abierta", tono: "aviso" },
  sin_proveedor: { texto: "Proveedor no registrado", tono: "critico" },
  cargada: { texto: "Ya cargada", tono: "bueno" },
  nota_credito: { texto: "Nota de crédito", tono: "neutro" },
  nota_debito: { texto: "Nota de débito", tono: "neutro" },
  ignorada: { texto: "Ignorada", tono: "neutro" },
};

export function FacturasSii({
  cuentas,
  puedeCargar,
  alCambiarPagos,
  selectorDeVista,
}: {
  cuentas: CuentaPorPagar[];
  puedeCargar: boolean;
  /** Pagos se relee: una factura nueva cambia los saldos. */
  alCambiarPagos: () => void;
  selectorDeVista: React.ReactNode;
}) {
  const [vista, setVista] = useState<Vista>("por_registrar");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [limite, setLimite] = useState(300);
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [registrando, setRegistrando] = useState<{ doc: FacturaSii; ordenId: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // La búsqueda va a la base, con una pausa para no pedir en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(texto), 350);
    return () => clearTimeout(t);
  }, [texto]);

  type Datos = { docs: FacturaSii[]; cargadas: Set<string>; ruts: Set<string> };
  const [estado, setEstado] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; datos: Datos }>({ estado: "cargando" });
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const docs = await cargarFacturasSii(limite, buscado);
        const contexto = await cargarContextoSii(docs.map((d) => d.folio));
        if (vigente) setEstado({ estado: "listo", datos: { docs, ...contexto } });
      } catch (e) {
        if (vigente) setEstado({ estado: "error", mensaje: e instanceof Error ? e.message : "No se pudieron leer las facturas." });
      }
    })();
    return () => { vigente = false; };
  }, [limite, buscado, version]);

  const filas = useMemo(() => {
    if (estado.estado !== "listo") return [];
    const ctx = { cargadas: estado.datos.cargadas, ruts: estado.datos.ruts, ordenes: cuentas };
    return estado.datos.docs.map((d) => ({ doc: d, cruce: cruzar(d, ctx) }));
  }, [estado, cuentas]);

  const visibles = filas.filter(({ cruce: c }) => {
    switch (vista) {
      case "por_registrar": return c.tipo === "con_orden" || c.tipo === "sin_orden" || c.tipo === "sin_proveedor";
      case "con_orden": return c.tipo === "con_orden";
      case "cargadas": return c.tipo === "cargada";
      case "notas": return c.tipo === "nota_credito" || c.tipo === "nota_debito";
      case "ignoradas": return c.tipo === "ignorada";
      default: return true;
    }
  });

  const porRegistrar = filas.filter(({ cruce: c }) => c.tipo === "con_orden" || c.tipo === "sin_orden" || c.tipo === "sin_proveedor");
  const montoPorRegistrar = porRegistrar.reduce((t, { doc }) => t + doc.total, 0);

  async function subir(archivo: File) {
    setAviso(null);
    setSubiendo(true);
    try {
      const lectura = leerArchivoSii(decodificar(await archivo.arrayBuffer()));
      if (lectura.error) throw new Error(lectura.error);
      if (lectura.documentos.length === 0) throw new Error("No encontré documentos en el archivo.");
      const r = await guardarDocumentosSii(lectura.documentos);
      setAviso({
        tono: "ok",
        texto: `Se leyeron ${lectura.documentos.length} documentos: ${r.nuevos} nuevos y ${r.yaEstaban} que ya estaban.${lectura.ignoradas > 0 ? ` Se saltaron ${lectura.ignoradas} filas sin RUT o folio.` : ""}`,
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setAviso({ tono: "error", texto: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function ignorar(d: FacturaSii, ignorar: boolean) {
    try {
      await marcarIgnorada(d.id, ignorar);
      setVersion((v) => v + 1);
    } catch (e) {
      setAviso({ tono: "error", texto: e instanceof Error ? e.message : "No se pudo cambiar." });
    }
  }

  const columnas: Columna<(typeof filas)[number]>[] = [
    {
      clave: "fecha", titulo: "Emisión",
      celda: ({ doc }) => <span className="text-ink">{formatearFecha(doc.fechaEmision)}</span>,
    },
    {
      clave: "proveedor", titulo: "Proveedor", encabezado: true,
      celda: ({ doc }) => (
        <>
          <span className="block font-semibold text-ink">{doc.razonSocial || "Sin nombre"}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{formatearRut(doc.rutEmisor)}</span>
        </>
      ),
    },
    {
      clave: "documento", titulo: "Documento",
      celda: ({ doc }) => (
        <>
          <span className="block text-ink">{nombreTipoDocumento[doc.tipoDocumento] ?? `Tipo ${doc.tipoDocumento}`} N° {doc.folio}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">Neto {formatearPesos(doc.neto + doc.exento)}</span>
        </>
      ),
    },
    {
      clave: "total", titulo: "Total", derecha: true,
      celda: ({ doc }) => <span className="font-semibold tabular-nums text-ink">{formatearPesos(doc.total)}</span>,
    },
    {
      clave: "cruce", titulo: "Cruce",
      celda: ({ cruce }) => (
        <>
          <Chip tono={etiquetaCruce[cruce.tipo].tono}>{etiquetaCruce[cruce.tipo].texto}</Chip>
          {cruce.tipo === "con_orden" && (
            <span className="mt-1 block text-xs text-ink-soft">
              {cruce.candidatas.some((c) => c.exacta)
                ? `Monto igual al saldo de ${cruce.candidatas.filter((c) => c.exacta).map((c) => c.numero).join(", ")}`
                : `${cruce.candidatas.length} orden${cruce.candidatas.length === 1 ? "" : "es"} abierta${cruce.candidatas.length === 1 ? "" : "s"}, ninguna con ese monto`}
            </span>
          )}
          {cruce.tipo === "sin_proveedor" && <span className="mt-1 block text-xs text-ink-soft">Créalo en Proveedores para poder cruzarla</span>}
        </>
      ),
    },
    {
      clave: "acciones", titulo: "", derecha: true, fija: true,
      celda: ({ doc, cruce }) => {
        if (!puedeCargar) return null;
        if (cruce.tipo === "ignorada") {
          return <BotonChico onClick={() => ignorar(doc, false)} secundario>Volver a mostrar</BotonChico>;
        }
        if (cruce.tipo === "con_orden") {
          const elegida = elegidas[doc.id] ?? cruce.candidatas[0].ordenId;
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {cruce.candidatas.length > 1 && (
                <select
                  aria-label="Orden de compra"
                  value={elegida}
                  onChange={(e) => setElegidas((x) => ({ ...x, [doc.id]: e.target.value }))}
                  className="max-w-[11rem] rounded-lg border border-mist-deep bg-white px-2 py-1.5 text-xs text-ink"
                >
                  {cruce.candidatas.map((c) => (
                    <option key={c.ordenId} value={c.ordenId}>
                      {c.numero} · saldo {formatearPesos(c.saldoNeto)}{c.exacta ? " ✓" : ""}
                    </option>
                  ))}
                </select>
              )}
              <BotonChico onClick={() => setRegistrando({ doc, ordenId: elegida })}>
                Registrar en {cruce.candidatas.length > 1 ? "la OC" : cruce.candidatas[0].numero}
              </BotonChico>
              <BotonChico onClick={() => ignorar(doc, true)} secundario>Ignorar</BotonChico>
            </div>
          );
        }
        if (cruce.tipo === "sin_orden" || cruce.tipo === "sin_proveedor") {
          return <BotonChico onClick={() => ignorar(doc, true)} secundario>Ignorar</BotonChico>;
        }
        return null;
      },
    },
  ];

  return (
    <>
      <Panel
        titulo="Facturas del SII"
        nota={
          porRegistrar.length > 0
            ? `${porRegistrar.length} sin registrar en la plataforma · ${formatearPesos(montoPorRegistrar)} con IVA`
            : "Sube el detalle del Registro de Compras del SII y se cruza con tus órdenes abiertas."
        }
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            {puedeCargar && (
              <>
                <input
                  ref={entrada}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="sr-only"
                  aria-label="Archivo del Registro de Compras del SII"
                  onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
                />
                <button
                  type="button"
                  disabled={subiendo}
                  onClick={() => entrada.current?.click()}
                  className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-deep disabled:opacity-60"
                >
                  {subiendo ? "Leyendo…" : "Subir archivo del SII"}
                </button>
              </>
            )}
            <Filtro etiqueta="Mostrar" opciones={vistas} valor={vista} alCambiar={setVista} />
            {selectorDeVista}
          </div>
        }
      >
        {aviso && (
          <p
            role="status"
            className={`border-b border-mist px-6 py-3 text-sm lg:px-8 ${aviso.tono === "ok" ? "bg-[#eaf6ee] text-[#1f6b3a]" : "bg-[#fdeeec] text-[#a52f24]"}`}
          >
            {aviso.texto}
          </p>
        )}
        <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar facturas del SII" placeholder="Proveedor, RUT o N° de factura…" />
        {estado.estado === "cargando" ? (
          <p className="px-6 py-14 text-center text-sm text-ink-soft">Cargando…</p>
        ) : estado.estado === "error" ? (
          <p className="px-6 py-14 text-center text-sm text-[#a52f24]">{estado.mensaje}</p>
        ) : (
          <>
            <Tabla
              columnas={columnas}
              filas={visibles}
              claveDe={({ doc }) => doc.id}
              vacio={
                filas.length === 0
                  ? "Todavía no hay facturas del SII. En el portal del SII entra a Registro de Compras y Ventas → Compras, descarga el detalle del mes y súbelo acá."
                  : "Nada en esta vista."
              }
            />
            {estado.datos.docs.length >= limite && (
              <div className="border-t border-mist px-6 py-4 text-center lg:px-8">
                <button type="button" onClick={() => setLimite((l) => l + 300)} className="text-sm font-semibold text-cyan-deep hover:underline">
                  Ver más antiguas
                </button>
              </div>
            )}
          </>
        )}
      </Panel>

      {registrando && (
        <RegistrarEnOrden
          doc={registrando.doc}
          ordenId={registrando.ordenId}
          alCerrar={() => setRegistrando(null)}
          alCambiar={() => {
            alCambiarPagos();
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

/** Abre la orden en «Agregar factura» con los datos del SII ya puestos. */
function RegistrarEnOrden({ doc, ordenId, alCerrar, alCambiar }: { doc: FacturaSii; ordenId: string; alCerrar: () => void; alCambiar: () => void }) {
  const { estado } = useConsulta(() => cargarOrden(ordenId));
  if (estado.estado === "error") {
    return (
      <Dialogo titulo="Registrar factura" abierto alCerrar={alCerrar}>
        <p className="px-6 py-10 text-center text-sm text-[#a52f24]">{estado.mensaje}</p>
      </Dialogo>
    );
  }
  if (estado.estado !== "listo") return null;
  const sugerida: FacturaSugerida = {
    documento: doc.folio,
    fechaFactura: doc.fechaEmision,
    neto: doc.neto + doc.exento,
    iva: doc.iva,
  };
  return <CicloOrden orden={estado.datos} modoInicial="facturar" sugerida={sugerida} alCerrar={alCerrar} alCambiar={alCambiar} />;
}

function BotonChico({ children, onClick, secundario }: { children: React.ReactNode; onClick: () => void; secundario?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        secundario
          ? "rounded-full border border-mist-deep px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink"
          : "rounded-full bg-cyan px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-deep"
      }
    >
      {children}
    </button>
  );
}
