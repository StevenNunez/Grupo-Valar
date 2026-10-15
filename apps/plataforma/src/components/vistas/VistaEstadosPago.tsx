"use client";

import { useFiltro } from "@/lib/vista-guardada";
import { useMemo, useState } from "react";
import { FichaDeCiclo, type Documento, type Editable } from "../CicloDeIngreso";
import {
  EstadoPagoImprimible,
  FacturaImprimible,
  OrdenDelMandanteImprimible,
} from "../DocumentosDelCiclo";
import { FormularioEstadoPago } from "../formularios/FormularioEstadoPago";
import { FormularioFactura } from "../formularios/FormularioFactura";
import { FormularioOrdenCompra } from "../formularios/FormularioOrdenCompra";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { BotonNuevo } from "../ui/Historial";
import { Impresion } from "../ui/Impresion";
import { Chip } from "../ui/Chip";
import { CampoFiltro, Contenido, Desplegable, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarCampos, type CampoContrato } from "@/lib/campos";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { useUsuario } from "@/lib/sesion";
import { formatearMonto, mesLargo } from "@/lib/formato";
import {
  cargarCiclo,
  facturaDelCiclo,
  nombreEdp,
  ordenDelCiclo,
  type Ciclo,
  type Etapa,
} from "@/lib/ingresos";

/**
 * Estado de Pago: acá se hace el ciclo completo.
 *
 * El flujo de Valar es una cadena —sin estado de pago no hay orden de compra, y
 * sin orden no se factura— y esta es la pantalla donde se recorre entera. Cada
 * ficha se abre y muestra las tres etapas, cada una habilitada por la anterior.
 *
 * Órdenes de Compra y Facturas quedan como listados para consultar. Emitir se
 * emite desde acá, que es donde se ve de dónde viene cada cosa.
 */

type Filtrado = "todos" | "presentado" | "documento" | "orden" | "factura" | "cobro" | "cerrado";

/* Filtro secundario: lo primario es el período y el contrato. */
const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "presentado", titulo: "Presentados" },
  { id: "documento", titulo: "Con documento pendiente" },
  { id: "orden", titulo: "Sin orden" },
  { id: "factura", titulo: "Sin factura" },
  { id: "cobro", titulo: "Pendiente de pago" },
  { id: "cerrado", titulo: "Pagados" },
];

/* El flujo pide la OC antes de la factura, pero la falta de factura se cuenta
   igual aunque todavía no haya OC: de lo contrario "Sin factura" daba 0 con
   muchos EP sin facturar. Un EP rechazado no espera documentos. */
/* El período de un EP puede venir con cualquier día del mes; el filtro cuenta meses. */
const delMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;
const sinOrden = (c: Ciclo) => c.estado !== "rechazado" && !c.ordenId;
const sinFactura = (c: Ciclo) => c.estado !== "rechazado" && !c.facturaId;
const documentoPendiente = (c: Ciclo) => sinOrden(c) || sinFactura(c);
const pagado = (c: Ciclo) => c.etapa === "cerrado";

type Datos = { ciclos: Ciclo[]; contratos: ContratoBreve[]; campos: CampoContrato[] };

async function cargar(): Promise<Datos> {
  const [ciclos, contratos, campos] = await Promise.all([
    cargarCiclo(),
    cargarContratosBreve(),
    cargarCampos(),
  ]);
  return { ciclos, contratos, campos };
}

export function VistaEstadosPago() {
  const usuario = useUsuario();
  const { estado, recargar } = useConsulta<Datos>(cargar, `${usuario.id}:${usuario.empresa}:estados-de-pago-v2`);

  /* Solo una ficha abierta a la vez: con varias desplegadas el listado deja de
     servir para lo que se usa, que es encontrar el EP que falta. */
  const [abierta, setAbierta] = useState<string | null>(null);
  /* Qué se está editando: un EDP nuevo, o alguno de los tres registros de una
     ficha. Los tres reusan el formulario que ya tiene cada tabla. */
  const [editando, setEditando] = useState<{ ciclo: Ciclo; que: Editable } | "nuevo" | null>(null);

  /* Los respaldos cuelgan de tres tablas distintas según la etapa, así que el
     diálogo lleva la tabla consigo. */
  const [adjuntos, setAdjuntos] = useState<{
    tabla: string;
    id: string;
    titulo: string;
  } | null>(null);

  /* La hoja que se está mirando antes de guardarla en PDF. Vive acá y no dentro
     de la ficha porque tiene que colgar del body para que la impresión no salga
     en blanco; ver `ui/Impresion`. */
  const [documento, setDocumento] = useState<{
    ciclo: Ciclo;
    cual: Documento;
    campos: CampoContrato[];
    ciclos: Ciclo[];
  } | null>(null);

  return (
    <>
      <Encabezado
        titulo="Estados de Pago"
        descripcion="El ciclo del ingreso, de punta a punta: se presenta el estado de pago, el mandante lo aprueba y emite su orden, y contra esa orden se factura. Cada ficha se abre y muestra en qué va."
        acciones={
          <BotonNuevo permiso="gestion.editar" onClick={() => setEditando("nuevo")}>Nuevo estado de pago</BotonNuevo>
        }
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Listado
              ciclos={datos.ciclos}
              contratos={datos.contratos}
              campos={datos.campos}
              abierta={abierta}
              alAbrir={(id) => setAbierta((a) => (a === id ? null : id))}
              alCambiar={recargar}
              alEditar={(ciclo, que) => setEditando({ ciclo, que })}
              alVerAdjuntos={(tabla, id, titulo) => setAdjuntos({ tabla, id, titulo })}
              alImprimir={(ciclo, cual) => setDocumento({ ciclo, cual, campos: datos.campos, ciclos: datos.ciclos })}
            />

            {(editando === "nuevo" || editando?.que === "edp") && (
              <FormularioEstadoPago
                estadoPago={editando === "nuevo" ? null : editando.ciclo}
                existentes={datos.ciclos}
                contratos={datos.contratos}
                campos={datos.campos}
                alCerrar={() => setEditando(null)}
                alGuardado={recargar}
              />
            )}

            {editando !== "nuevo" && editando?.que === "orden" && (
              <FormularioOrdenCompra
                orden={ordenDelCiclo(editando.ciclo)}
                contratos={datos.contratos}
                alCerrar={() => setEditando(null)}
                alGuardado={recargar}
              />
            )}

            {editando !== "nuevo" && editando?.que === "factura" && (
              <FormularioFactura
                factura={facturaDelCiclo(editando.ciclo)}
                contratos={datos.contratos}
                alCerrar={() => setEditando(null)}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {documento && (
        <Impresion
          titulo={tituloDocumento(documento.ciclo, documento.cual)}
          alCerrar={() => setDocumento(null)}
        >
          {documento.cual === "edp" && (
            <EstadoPagoImprimible ciclo={documento.ciclo} campos={documento.campos} />
          )}
          {documento.cual === "orden" && (
            <OrdenDelMandanteImprimible
              ciclo={documento.ciclo}
              cubiertos={documento.ciclos.filter((c) => c.ordenId === documento.ciclo.ordenId)}
            />
          )}
          {documento.cual === "factura" && (
            <FacturaImprimible
              ciclo={documento.ciclo}
              incluidos={documento.ciclos.filter((c) => c.facturaId === documento.ciclo.facturaId)}
            />
          )}
        </Impresion>
      )}

      {adjuntos && (
        <DialogoAdjuntos
          tabla={adjuntos.tabla}
          registroId={adjuntos.id}
          titulo={adjuntos.titulo}
          abierto
          alCerrar={() => setAdjuntos(null)}
          alCambiar={recargar}
        />
      )}
    </>
  );
}

/** El nombre que lleva la barra de la vista previa. */
function tituloDocumento(ciclo: Ciclo, cual: Documento) {
  if (cual === "orden") return `Orden de compra N° ${ciclo.ordenNumero} · ${ciclo.unidadNombre}`;
  if (cual === "factura") return `Detalle de facturación ${ciclo.facturaId} · ${ciclo.unidadNombre}`;
  return `${nombreEdp(ciclo.numero, ciclo.tipoEdp)} · ${ciclo.unidadNombre}`;
}

/**
 * Los estados de pago de un contrato, juntos. La cabecera dice lo que importa
 * del contrato de un vistazo: qué falta y cuánto está por pagarse. Se pliega
 * para despejar la pantalla; abierta por defecto si tiene algo pendiente.
 */
function TarjetaDeContrato({ ciclos, children }: { ciclos: Ciclo[]; children: React.ReactNode }) {
  const primero = ciclos[0];
  const pendientes = ciclos.filter((c) => c.etapa !== "cerrado");
  const [abierta, setAbierta] = useState(pendientes.length > 0);
  const porCobrar = ciclos.filter((c) => c.etapa === "cobro").reduce((t, c) => t + c.montoNeto, 0);
  const cuantos = (e: Etapa) => ciclos.filter((c) => c.etapa === e).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-mist-deep bg-mist/20">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-mist/40 sm:flex-row sm:items-center"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold text-ink">{primero.unidadNombre}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {primero.anexoNombre ? `Anexo de ${primero.contrato}` : primero.contratoId}{primero.cliente ? ` · ${primero.cliente}` : ""} · {ciclos.length} {ciclos.length === 1 ? "estado de pago" : "estados de pago"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {cuantos("edp") > 0 && <Chip tono="info">{cuantos("edp")} por aprobar</Chip>}
          {ciclos.filter(sinOrden).length > 0 && <Chip tono="aviso">{ciclos.filter(sinOrden).length} sin orden</Chip>}
          {ciclos.filter(sinFactura).length > 0 && <Chip tono="aviso">{ciclos.filter(sinFactura).length} sin factura</Chip>}
          {porCobrar > 0 && <Chip tono="aviso">{formatearMonto(porCobrar)} pendiente de pago</Chip>}
          {pendientes.length === 0 && <Chip tono="bueno">Todo pagado</Chip>}
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
        </span>
      </button>
      {abierta && <ul className="flex flex-col gap-3 border-t border-mist-deep px-4 py-4">{children}</ul>}
    </section>
  );
}

function Listado({
  ciclos,
  contratos,
  campos,
  abierta,
  alAbrir,
  alCambiar,
  alEditar,
  alVerAdjuntos,
  alImprimir,
}: {
  ciclos: Ciclo[];
  contratos: ContratoBreve[];
  campos: CampoContrato[];
  abierta: string | null;
  alAbrir: (id: string) => void;
  alCambiar: () => void;
  alEditar: (c: Ciclo, que: Editable) => void;
  alVerAdjuntos: (tabla: string, id: string, titulo: string) => void;
  alImprimir: (ciclo: Ciclo, cual: Documento) => void;
}) {
  const [filtro, setFiltro] = useFiltro<Filtrado>("estados-de-pago:estado", "todos");
  const [periodo, setPeriodo] = useFiltro("estados-de-pago:periodo", "todos");
  const [contrato, setContrato] = useFiltro("estados-de-pago:contrato", "todos");

  const periodos = useMemo(
    () => [
      { id: "todos", titulo: "Todos" },
      ...[...new Set(ciclos.map((c) => delMes(c.periodo)))].sort().reverse()
        .map((p) => ({ id: p, titulo: mesLargo(p) })),
    ],
    [ciclos],
  );
  const opcionesContrato = useMemo(() => {
    /* Cada anexo es su propio contrato: aparece aparte en el filtro. */
    const alias = new Map(contratos.map((c) => [c.id, c.nombreCorto || c.nombre]));
    const vistos = new Map<string, string>();
    for (const c of ciclos) vistos.set(c.unidadId, c.anexoNombre ?? alias.get(c.contratoId) ?? c.contrato);
    return [
      { id: "todos", titulo: "Todos" },
      ...[...vistos].map(([id, titulo]) => ({ id, titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, "es")),
    ];
  }, [ciclos, contratos]);

  /* Período y contrato recortan todo, KPIs incluidos; la barra de estatus
     solo recorta la lista. */
  const delRecorte = useMemo(
    () => ciclos.filter((c) => (periodo === "todos" || delMes(c.periodo) === periodo) && (contrato === "todos" || c.unidadId === contrato)),
    [ciclos, periodo, contrato],
  );

  const visibles = useMemo(() => {
    if (filtro === "todos") return delRecorte;
    if (filtro === "presentado") return delRecorte.filter((c) => c.etapa === "edp");
    if (filtro === "documento") return delRecorte.filter((c) => !pagado(c) && documentoPendiente(c));
    if (filtro === "orden") return delRecorte.filter(sinOrden);
    if (filtro === "factura") return delRecorte.filter(sinFactura);
    return delRecorte.filter((c) => c.etapa === filtro);
  }, [delRecorte, filtro]);

  /* Una tarjeta por contrato: con todos los EDP en una sola lista se
     mezclaban los números (el EP 30 de un contrato junto al EP 30 de otro). */
  const porContrato = useMemo(() => {
    const grupos = new Map<string, Ciclo[]>();
    for (const c of visibles) grupos.set(c.unidadId, [...(grupos.get(c.unidadId) ?? []), c]);
    return [...grupos.values()].sort((a, b) =>
      a[0].contrato.localeCompare(b[0].contrato, "es") || (a[0].anexoNombre ?? "").localeCompare(b[0].anexoNombre ?? "", "es"));
  }, [visibles]);

  const suma = (ls: Ciclo[]) => ls.reduce((t, c) => t + c.montoNeto, 0);
  const presentado = suma(delRecorte);
  const cobrado = suma(delRecorte.filter(pagado));
  const pendiente = presentado - cobrado;
  const conDocumento = delRecorte.filter((c) => !pagado(c) && documentoPendiente(c));
  const pctPagado = presentado > 0 ? Math.round((cobrado / presentado) * 100) : 0;

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Total presentado",
            valor: formatearMonto(presentado),
            nota: `${delRecorte.length} ${delRecorte.length === 1 ? "estado de pago" : "estados de pago"}`,
          },
          {
            etiqueta: "Total pagado",
            valor: formatearMonto(cobrado),
            nota: `${pctPagado}% de lo presentado`,
            acento: presentado > 0 && cobrado === presentado ? "bueno" : undefined,
          },
          {
            etiqueta: "Pendiente de pago",
            valor: formatearMonto(pendiente),
            nota: `${presentado > 0 ? 100 - pctPagado : 0}% de lo presentado`,
            acento: pendiente > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Con documento pendiente",
            valor: String(conDocumento.length),
            nota: `${conDocumento.length} de ${delRecorte.length} estados de pago afectados · ${conDocumento.filter(sinOrden).length} sin OC · ${conDocumento.filter(sinFactura).length} sin factura`,
            acento: conDocumento.length > 0 ? "critico" : "bueno",
          },
        ]}
      />

      <Panel
        titulo="El ciclo, uno por uno"
        nota={`${visibles.length} de ${delRecorte.length} estados de pago · ${porContrato.length} ${porContrato.length === 1 ? "contrato" : "contratos"}`}
        filtrosAbajo
        filtros={
          <>
            <CampoFiltro etiqueta="Período">
              <Desplegable
                etiqueta="Período"
                valor={periodo}
                alCambiar={setPeriodo}
                grupos={[{ opciones: periodos.map((o) => ({ ...o, titulo: o.id === "todos" ? "Todos los meses" : o.titulo })) }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Contrato">
              <Desplegable
                etiqueta="Contrato"
                valor={contrato}
                alCambiar={setContrato}
                grupos={[{ opciones: opcionesContrato.map((o) => ({ ...o, titulo: o.id === "todos" ? "Todos los contratos" : o.titulo })) }]}
              />
            </CampoFiltro>
            <CampoFiltro etiqueta="Estatus">
              <Filtro etiqueta="Estatus" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
            </CampoFiltro>
          </>
        }
      >
        {visibles.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-soft lg:px-8">
            Ningún estado de pago en este filtro.
          </p>
        ) : (
          <div className="flex flex-col gap-5 px-6 py-6 lg:px-8">
            {porContrato.map((grupo) => (
              <TarjetaDeContrato key={grupo[0].unidadId} ciclos={grupo}>
                {grupo.map((c) => (
                  <FichaDeCiclo
                    key={c.id}
                    ciclo={c}
                    ciclos={ciclos}
                    campos={campos}
                    abierta={abierta === c.id}
                    alAbrir={() => alAbrir(c.id)}
                    alCambiar={alCambiar}
                    alEditar={(que) => alEditar(c, que)}
                    alVerAdjuntos={alVerAdjuntos}
                    alImprimir={(cual) => alImprimir(c, cual)}
                  />
                ))}
              </TarjetaDeContrato>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
