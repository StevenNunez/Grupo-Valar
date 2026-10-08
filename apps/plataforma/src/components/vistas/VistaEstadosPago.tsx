"use client";

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
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarCampos, type CampoContrato } from "@/lib/campos";
import { useConsulta } from "@/lib/consulta";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { formatearMonto } from "@/lib/formato";
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

type Filtrado = "todos" | "pendientes" | Etapa;

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "pendientes", titulo: "Con algo pendiente" },
  { id: "edp", titulo: "Por aprobar" },
  { id: "orden", titulo: "Sin orden" },
  { id: "factura", titulo: "Sin factura" },
  { id: "cobro", titulo: "Pendiente de pago" },
  { id: "cerrado", titulo: "Pagados" },
];

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
  const { estado, recargar } = useConsulta<Datos>(cargar);

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
  if (cual === "orden") return `Orden de compra N° ${ciclo.ordenNumero} · ${ciclo.contrato}`;
  if (cual === "factura") return `Detalle de facturación ${ciclo.facturaId} · ${ciclo.contrato}`;
  return `${nombreEdp(ciclo.numero, ciclo.tipoEdp)} · ${ciclo.contrato}`;
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
          <span className="block font-display text-base font-semibold text-ink">{primero.contrato}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            {primero.contratoId}{primero.cliente ? ` · ${primero.cliente}` : ""} · {ciclos.length} {ciclos.length === 1 ? "estado de pago" : "estados de pago"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {cuantos("edp") > 0 && <Chip tono="info">{cuantos("edp")} por aprobar</Chip>}
          {cuantos("orden") > 0 && <Chip tono="aviso">{cuantos("orden")} sin orden</Chip>}
          {cuantos("factura") > 0 && <Chip tono="aviso">{cuantos("factura")} sin factura</Chip>}
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
  campos,
  abierta,
  alAbrir,
  alCambiar,
  alEditar,
  alVerAdjuntos,
  alImprimir,
}: {
  ciclos: Ciclo[];
  campos: CampoContrato[];
  abierta: string | null;
  alAbrir: (id: string) => void;
  alCambiar: () => void;
  alEditar: (c: Ciclo, que: Editable) => void;
  alVerAdjuntos: (tabla: string, id: string, titulo: string) => void;
  alImprimir: (ciclo: Ciclo, cual: Documento) => void;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todos");

  const visibles = useMemo(() => {
    if (filtro === "todos") return ciclos;
    if (filtro === "pendientes") return ciclos.filter((c) => c.etapa !== "cerrado");
    return ciclos.filter((c) => c.etapa === filtro);
  }, [ciclos, filtro]);

  /* Una tarjeta por contrato: con todos los EDP en una sola lista se
     mezclaban los números (el EP 30 de un contrato junto al EP 30 de otro). */
  const porContrato = useMemo(() => {
    const grupos = new Map<string, Ciclo[]>();
    for (const c of visibles) grupos.set(c.contratoId, [...(grupos.get(c.contratoId) ?? []), c]);
    return [...grupos.values()].sort((a, b) => a[0].contrato.localeCompare(b[0].contrato, "es"));
  }, [visibles]);

  /* Los tres números que importan son los cortes de la cadena: dónde se quedó
     detenido el dinero. */
  const porAprobar = ciclos.filter((c) => c.etapa === "edp");
  const sinOrden = ciclos.filter((c) => c.etapa === "orden");
  const sinFactura = ciclos.filter((c) => c.etapa === "factura");
  const porCobrar = ciclos.filter((c) => c.etapa === "cobro");
  const suma = (ls: Ciclo[]) => ls.reduce((t, c) => t + c.montoNeto, 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Pendiente de pago",
            valor: formatearMonto(suma(porCobrar)),
            nota: `${porCobrar.length} facturados, falta que paguen`,
            acento: porCobrar.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Esperando aprobación",
            valor: formatearMonto(suma(porAprobar)),
            nota: `${porAprobar.length} en manos del mandante`,
            acento: porAprobar.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Aprobado sin orden",
            valor: formatearMonto(suma(sinOrden)),
            nota: `${sinOrden.length} esperando la OC del mandante`,
            acento: sinOrden.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Con orden, sin facturar",
            valor: formatearMonto(suma(sinFactura)),
            nota: `${sinFactura.length} listos para emitir`,
            acento: sinFactura.length > 0 ? "critico" : "bueno",
          },
        ]}
      />

      <Panel
        titulo="El ciclo, uno por uno"
        nota={`${visibles.length} de ${ciclos.length} estados de pago · ${porContrato.length} ${porContrato.length === 1 ? "contrato" : "contratos"}`}
        filtros={<Filtro etiqueta="Ver" opciones={opciones} valor={filtro} alCambiar={setFiltro} />}
      >
        {visibles.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-soft lg:px-8">
            Ningún estado de pago en este filtro.
          </p>
        ) : (
          <div className="flex flex-col gap-5 px-6 py-6 lg:px-8">
            {porContrato.map((grupo) => (
              <TarjetaDeContrato key={grupo[0].contratoId} ciclos={grupo}>
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
