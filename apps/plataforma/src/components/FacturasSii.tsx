"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, type Tono } from "./ui/Chip";
import { Buscador } from "./ui/Buscador";
import { Tabla, type Columna } from "./ui/Tabla";
import { Filtro, Panel } from "./ui/Vista";
import { Dialogo } from "./ui/Formulario";
import { CicloOrden, type FacturaSugerida } from "./CicloOrden";
import { FormularioReembolso } from "./formularios/FormularioReembolso";
import { formatearRut } from "@/lib/abastecimiento";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { cargarOrden } from "@/lib/ordenes";
import { cargarCategorias } from "@/lib/categorias";
import { cargarContratosBreve } from "@/lib/contratos";
import { cargarCompras } from "@/lib/egresos";
import { useConsulta } from "@/lib/consulta";
import type { CuentaPorPagar } from "@/lib/pagos";
import {
  cargarContextoSii,
  cargarFacturasSii,
  comoLineaDeRendicion,
  cruzar,
  decodificar,
  guardarDocumentosSii,
  leerArchivoSii,
  marcarIgnorada,
  marcarRendidas,
  nombreTipoDocumento,
  type Cruce,
  type FacturaSii,
} from "@/lib/facturas-sii";

/**
 * Facturas del SII (0116). Se suben los documentos recibidos y cada factura se
 * cruza con las órdenes abiertas del proveedor: si calza, se registra en la OC
 * con un clic (el formulario de «Agregar factura» ya viene lleno).
 *
 * Las que no traen OC casi siempre son gastos de rendiciones (combustible,
 * correos, ferretería…): no se ignoran. Se eligen varias y se arma el reembolso
 * con cada una como una línea (N°, comercio, fecha, monto y lo que se compró), y
 * quedan marcadas como rendidas (0117). Lo que nadie reclama sigue a la vista
 * en «Sin OC», que es la lista de gastos por aclarar.
 */

type Vista = "por_registrar" | "con_orden" | "sin_oc" | "cargadas" | "notas" | "ignoradas" | "todas";

const vistas: { id: Vista; titulo: string }[] = [
  { id: "por_registrar", titulo: "Por registrar" },
  { id: "con_orden", titulo: "Con OC" },
  { id: "sin_oc", titulo: "Sin OC · rendiciones y gastos" },
  { id: "cargadas", titulo: "Ya cargadas o rendidas" },
  { id: "notas", titulo: "Notas y guías" },
  { id: "ignoradas", titulo: "Ignoradas" },
  { id: "todas", titulo: "Todas" },
];

const etiquetaCruce: Record<Cruce["tipo"], { texto: string; tono: Tono }> = {
  con_orden: { texto: "Tiene OC", tono: "info" },
  sin_orden: { texto: "Sin OC · gasto", tono: "aviso" },
  sin_proveedor: { texto: "Sin OC · proveedor nuevo", tono: "aviso" },
  cargada: { texto: "Ya cargada", tono: "bueno" },
  rendida: { texto: "En rendición", tono: "bueno" },
  nota_credito: { texto: "Nota de crédito", tono: "neutro" },
  nota_debito: { texto: "Nota de débito", tono: "neutro" },
  guia: { texto: "Guía de despacho", tono: "neutro" },
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
  /* Los documentos elegidos para armar una rendición. */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [armando, setArmando] = useState<FacturaSii[] | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // La búsqueda va a la base, con una pausa para no pedir en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(texto), 350);
    return () => clearTimeout(t);
  }, [texto]);

  type Datos = { docs: FacturaSii[]; cargadas: Set<string>; rendidas: Set<string>; ruts: Set<string> };
  const [estado, setEstado] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; datos: Datos }>({ estado: "cargando" });
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const docs = await cargarFacturasSii(limite, buscado);
        const contexto = await cargarContextoSii(docs);
        if (vigente) setEstado({ estado: "listo", datos: { docs, ...contexto } });
      } catch (e) {
        if (vigente) setEstado({ estado: "error", mensaje: e instanceof Error ? e.message : "No se pudieron leer las facturas." });
      }
    })();
    return () => { vigente = false; };
  }, [limite, buscado, version]);

  const filas = useMemo(() => {
    if (estado.estado !== "listo") return [];
    const ctx = { cargadas: estado.datos.cargadas, rendidas: estado.datos.rendidas, ruts: estado.datos.ruts, ordenes: cuentas };
    return estado.datos.docs.map((d) => ({ doc: d, cruce: cruzar(d, ctx) }));
  }, [estado, cuentas]);

  const visibles = filas.filter(({ cruce: c }) => {
    switch (vista) {
      case "por_registrar": return c.tipo === "con_orden" || c.tipo === "sin_orden" || c.tipo === "sin_proveedor";
      case "con_orden": return c.tipo === "con_orden";
      case "sin_oc": return c.tipo === "sin_orden" || c.tipo === "sin_proveedor";
      case "cargadas": return c.tipo === "cargada" || c.tipo === "rendida";
      case "notas": return c.tipo === "nota_credito" || c.tipo === "nota_debito" || c.tipo === "guia";
      case "ignoradas": return c.tipo === "ignorada";
      default: return true;
    }
  });

  const porRegistrar = filas.filter(({ cruce: c }) => c.tipo === "con_orden" || c.tipo === "sin_orden" || c.tipo === "sin_proveedor");
  const montoPorRegistrar = porRegistrar.reduce((t, { doc }) => t + doc.total, 0);
  const sinOc = porRegistrar.filter(({ cruce: c }) => c.tipo !== "con_orden");

  /* Se puede llevar a una rendición lo que está pendiente (con o sin OC a la vista). */
  const seleccionable = (c: Cruce) => c.tipo === "con_orden" || c.tipo === "sin_orden" || c.tipo === "sin_proveedor";
  const elegibles = visibles.filter(({ cruce }) => seleccionable(cruce));
  const elegidos = filas.filter(({ doc }) => seleccion.has(doc.id)).map(({ doc }) => doc);
  const montoElegido = elegidos.reduce((t, d) => t + d.total, 0);
  const todosElegidos = elegibles.length > 0 && elegibles.every(({ doc }) => seleccion.has(doc.id));
  function alternarTodos() {
    setSeleccion((actual) => {
      const nuevo = new Set(actual);
      for (const { doc } of elegibles) {
        if (todosElegidos) nuevo.delete(doc.id);
        else nuevo.add(doc.id);
      }
      return nuevo;
    });
  }
  function alternar(id: string) {
    setSeleccion((actual) => {
      const nuevo = new Set(actual);
      if (!nuevo.delete(id)) nuevo.add(id);
      return nuevo;
    });
  }

  /** Varios archivos a la vez: el SII entrega de a 20, y los que se repiten entre descargas se descartan. */
  async function subir(archivos: File[]) {
    setAviso(null);
    setSubiendo(true);
    try {
      const leidos = [];
      const saltados: string[] = [];
      let ignoradas = 0;
      for (const archivo of archivos) {
        const lectura = leerArchivoSii(decodificar(await archivo.arrayBuffer()));
        if (lectura.error) {
          // Con varios archivos, el listado en Excel que trae lo mismo que el XML no es un error.
          if (archivos.length > 1) { saltados.push(archivo.name); continue; }
          throw new Error(lectura.error);
        }
        leidos.push(...lectura.documentos);
        ignoradas += lectura.ignoradas;
      }
      if (leidos.length === 0) throw new Error(archivos.length > 1 ? "Ninguno de los archivos tenía documentos que pueda leer. Sube los XML." : "No encontré documentos en el archivo.");
      const vistos = new Set<string>();
      const documentos = leidos.filter((d) => {
        const k = `${d.rutEmisor}|${d.tipoDocumento}|${d.folio}`;
        return vistos.has(k) ? false : (vistos.add(k), true);
      });
      const r = await guardarDocumentosSii(documentos);
      setAviso({
        tono: "ok",
        texto: `Se leyeron ${documentos.length} documentos: ${r.nuevos} nuevos y ${r.yaEstaban} que ya estaban.${ignoradas > 0 ? ` Se saltaron ${ignoradas} sin RUT o folio.` : ""}${saltados.length > 0 ? ` No se usaron: ${saltados.join(", ")} (no son XML).` : ""}`,
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
    ...(puedeCargar
      ? [{
          clave: "elegir", titulo: "",
          celda: ({ doc, cruce }: (typeof filas)[number]) =>
            seleccionable(cruce) ? (
              <input
                type="checkbox"
                aria-label={`Elegir la factura ${doc.folio} de ${doc.razonSocial}`}
                checked={seleccion.has(doc.id)}
                onChange={() => alternar(doc.id)}
                className="h-4 w-4 rounded border-mist-deep accent-cyan"
              />
            ) : null,
        }]
      : []),
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
          <span className="mt-0.5 block text-xs text-ink-soft">
            {doc.resumen ? `${doc.resumen} · ` : ""}neto {formatearPesos(doc.neto + doc.exento)}
          </span>
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
              {cruce.candidatas.some((c) => c.citada)
                ? `Cita la ${cruce.candidatas.filter((c) => c.citada).map((c) => c.numero).join(", ")}${cruce.candidatas.some((c) => c.citada && c.exacta) ? " · monto igual al saldo" : ""}`
                : cruce.candidatas.some((c) => c.exacta)
                  ? `Monto igual al saldo de ${cruce.candidatas.filter((c) => c.exacta).map((c) => c.numero).join(", ")}`
                  : `${cruce.candidatas.length} orden${cruce.candidatas.length === 1 ? "" : "es"} abierta${cruce.candidatas.length === 1 ? "" : "s"}, ninguna con ese monto`}
            </span>
          )}
          {cruce.tipo === "sin_orden" && (
            <span className="mt-1 block text-xs text-ink-soft">
              {cruce.citadas.length > 0 ? "Cita una OC que ya no tiene saldo por facturar" : "Probable rendición o gasto de caja"}
            </span>
          )}
          {cruce.tipo === "sin_proveedor" && <span className="mt-1 block text-xs text-ink-soft">Probable rendición · el proveedor no está registrado</span>}
          {cruce.tipo === "rendida" && <span className="mt-1 block text-xs text-ink-soft">{cruce.compraId}</span>}
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
                      {c.numero} · saldo {formatearPesos(c.saldoNeto)}{c.citada ? " · la cita" : c.exacta ? " ✓" : ""}
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
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <BotonChico onClick={() => setArmando([doc])}>Armar rendición</BotonChico>
              <BotonChico onClick={() => ignorar(doc, true)} secundario>No es nuestro</BotonChico>
            </div>
          );
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
            ? `${porRegistrar.length} sin registrar en la plataforma (${sinOc.length} sin OC, probables rendiciones) · ${formatearPesos(montoPorRegistrar)} con IVA`
            : "Sube los documentos recibidos del SII y se cruzan con tus órdenes abiertas."
        }
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            {puedeCargar && (
              <>
                <input
                  ref={entrada}
                  type="file"
                  accept=".xml,.csv,.txt,text/xml,text/csv"
                  multiple
                  className="sr-only"
                  aria-label="Archivos del SII (XML de documentos recibidos o CSV del Registro de Compras)"
                  onChange={(e) => e.target.files && e.target.files.length > 0 && subir([...e.target.files])}
                />
                <button
                  type="button"
                  disabled={subiendo}
                  onClick={() => entrada.current?.click()}
                  className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-deep disabled:opacity-60"
                >
                  {subiendo ? "Leyendo…" : "Subir archivos del SII"}
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
        {puedeCargar && elegibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mist bg-cyan/5 px-6 py-3 text-sm lg:px-8">
            <button type="button" onClick={alternarTodos} className="font-semibold text-cyan-deep hover:underline">
              {todosElegidos ? "Quitar la selección de esta lista" : `Elegir las ${elegibles.length} de esta lista`}
            </button>
            {elegidos.length > 0 && (
              <>
                <span className="text-ink">
                  <strong>{elegidos.length}</strong> elegida{elegidos.length === 1 ? "" : "s"} · {formatearPesos(montoElegido)}
                </span>
                <BotonChico onClick={() => setArmando(elegidos)}>Armar rendición con las elegidas</BotonChico>
                <BotonChico onClick={() => setSeleccion(new Set())} secundario>Limpiar</BotonChico>
              </>
            )}
          </div>
        )}
        <Buscador valor={texto} alCambiar={setTexto} etiqueta="Buscar facturas del SII" placeholder="Proveedor, RUT, N° de factura…" />
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
                  ? "Todavía no hay facturas del SII. En el portal del SII descarga tus documentos recibidos en XML (de a 20 por vez) y súbelos acá; puedes subir varios archivos juntos."
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

      {armando && (
        <ArmarRendicion
          docs={armando}
          alCerrar={() => setArmando(null)}
          alGuardado={async (compraId) => {
            try {
              await marcarRendidas(armando.map((d) => d.id), compraId);
              setAviso({ tono: "ok", texto: `Rendición ${compraId} guardada con ${armando.length} documento${armando.length === 1 ? "" : "s"} del SII.` });
            } catch (e) {
              setAviso({
                tono: "error",
                texto: `La rendición ${compraId} se guardó, pero no pude marcar los documentos del SII como rendidos: ${e instanceof Error ? e.message : "error"}. Aparecerán como pendientes.`,
              });
            }
            setSeleccion(new Set());
            alCambiarPagos();
            setVersion((v) => v + 1);
          }}
        />
      )}

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

/** El reembolso con cada documento del SII ya como un gasto de la rendición. */
function ArmarRendicion({ docs, alCerrar, alGuardado }: { docs: FacturaSii[]; alCerrar: () => void; alGuardado: (compraId: string) => void }) {
  const { estado } = useConsulta(async () => {
    const [compras, contratos, categorias] = await Promise.all([cargarCompras(), cargarContratosBreve(), cargarCategorias()]);
    return { compras, contratos, categorias };
  });
  if (estado.estado === "error") {
    return (
      <Dialogo titulo="Armar rendición" abierto alCerrar={alCerrar}>
        <p className="px-6 py-10 text-center text-sm text-[#a52f24]">{estado.mensaje}</p>
      </Dialogo>
    );
  }
  if (estado.estado !== "listo") return null;
  const ordenados = [...docs].sort((a, b) => (a.fechaEmision ?? "").localeCompare(b.fechaEmision ?? ""));
  return (
    <FormularioReembolso
      compra={null}
      compras={estado.datos.compras}
      contratos={estado.datos.contratos}
      categorias={estado.datos.categorias}
      sugeridos={ordenados.map(comoLineaDeRendicion)}
      alCerrar={alCerrar}
      alGuardado={(id) => { if (id) alGuardado(id); }}
    />
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
    vencimiento: doc.vencimiento,
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
