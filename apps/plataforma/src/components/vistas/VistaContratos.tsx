"use client";

import { useMemo, useState } from "react";
import { AnexosDelContrato } from "../AnexosDelContrato";
import { CategoriasDelContrato } from "../CategoriasDelContrato";
import { PlantillaDelContrato } from "../PlantillaDelContrato";
import { FormularioContrato } from "../formularios/FormularioContrato";
import { Chip, type Tono } from "../ui/Chip";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, Total, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { cargarContratos } from "@/lib/contratos";
import { formatearFecha, formatearMonto } from "@/lib/formato";
import {
  formasContrato,
  modalidades,
  vigencias,
  type Contrato,
  type Vigencia,
} from "@/lib/control-de-gestion";

const tonoVigencia: Record<Vigencia, Tono> = {
  vigente: "bueno",
  "por-vencer": "aviso",
  cerrado: "neutro",
  cancelado: "critico",
};

/** Cerrado por calendario o cancelado antes: ya no corre. */
const terminado = (c: Contrato) => c.vigencia === "cerrado" || c.vigencia === "cancelado";

type Filtrado = "todos" | "vigentes" | "por-vencer" | "cerrados";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "vigentes", titulo: "Vigentes" },
  { id: "por-vencer", titulo: "Por vencer" },
  { id: "cerrados", titulo: "Cerrados" },
];

/**
 * Cuánto del monto contratado se lleva gastado.
 *
 * Antes esto comparaba el consumo contra el avance físico informado. Ese avance
 * dejó de existir —no había forma de mantenerlo al día y terminaba en cero—, y
 * una desviación contra cero no dice nada. Ahora es lo directo: qué proporción
 * del monto vigente ya se consumió.
 *
 * Los contratos recurrentes no tienen monto total, y ahí devuelve `null`: su
 * control es el margen del mes, no el consumo de un presupuesto que no existe.
 */
function consumoPct(c: Contrato): number | null {
  if (!c.montoVigente) return null;
  return (c.costoReal / c.montoVigente) * 100;
}

export function VistaContratos() {
  const { estado, recargar } = useConsulta<Contrato[]>(cargarContratos);
  const edicion = useEdicion<Contrato>("contratos");
  const [anexos, setAnexos] = useState<Contrato | null>(null);
  const [plantilla, setPlantilla] = useState<Contrato | null>(null);
  const [categorias, setCategorias] = useState<Contrato | null>(null);

  return (
    <>
      <Encabezado
        titulo="Contratos"
        descripcion="La base del módulo: todo lo demás —estados de pago, facturas, compras y personal— cuelga de un contrato. El costo real no se escribe acá, se deduce de sus egresos."
        acciones={<BotonNuevo permiso="contratos.editar" onClick={edicion.abrirNuevo}>Nuevo contrato</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos
              filas={datos}
              edicion={edicion}
              alVerAnexos={setAnexos}
              alVerPlantilla={setPlantilla}
              alVerCategorias={setCategorias}
            />

            {plantilla && (
              <PlantillaDelContrato contrato={plantilla} alCerrar={() => setPlantilla(null)} />
            )}

            {categorias && (
              <CategoriasDelContrato contrato={categorias} alCerrar={() => setCategorias(null)} />
            )}

            {anexos && (
              <AnexosDelContrato
                contrato={anexos}
                alCerrar={() => setAnexos(null)}
                alCambiar={recargar}
              />
            )}
            {edicion.editando && (
              <FormularioContrato
                contrato={edicion.registro}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla="contratos"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="contratos"
          registroId={edicion.adjuntos.id}
          titulo={edicion.adjuntos.titulo}
          abierto
          alCerrar={edicion.cerrarAdjuntos}
          alCambiar={edicion.recontarAdjuntos}
        />
      )}
    </>
  );
}

function Contenidos({
  filas,
  edicion,
  alVerAnexos,
  alVerPlantilla,
  alVerCategorias,
}: {
  filas: Contrato[];
  edicion: ReturnType<typeof useEdicion<Contrato>>;
  alVerAnexos: (c: Contrato) => void;
  alVerPlantilla: (c: Contrato) => void;
  alVerCategorias: (c: Contrato) => void;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todos");

  const visibles = useMemo(() => {
    if (filtro === "vigentes") return filas.filter((c) => !terminado(c));
    if (filtro === "cerrados") return filas.filter(terminado);
    if (filtro === "por-vencer") return filas.filter((c) => c.vigencia === "por-vencer");
    return filas;
  }, [filas, filtro]);

  const presupuesto = visibles.reduce((t, c) => t + c.presupuesto, 0);
  const costo = visibles.reduce((t, c) => t + c.costoReal, 0);
  const facturado = visibles.reduce((t, c) => t + c.facturado, 0);

  const vigentes = filas.filter((c) => c.vigencia === "vigente");
  const porVencer = filas.filter((c) => c.vigencia === "por-vencer");
  const cerrados = filas.filter(terminado);
  const conMonto = filas.filter((c) => c.montoVigente !== null).length;
  const montoVigente = filas
    .filter((c) => !terminado(c))
    .reduce((t, c) => t + (c.montoVigente ?? 0), 0);
  const montoCerrado = cerrados.reduce((t, c) => t + (c.montoVigente ?? 0), 0);

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Contratos",
            valor: String(filas.length),
            nota: `${vigentes.length} vigentes · ${porVencer.length} por vencer`,
          },
          {
            etiqueta: "Monto contratado",
            valor: montoVigente > 0 ? formatearMonto(montoVigente) : "—",
            nota:
              conMonto === 0
                ? "Los recurrentes no llevan monto total"
                : `${conMonto} de ${filas.length} contratos con monto`,
          },
          {
            etiqueta: "Cerrados",
            valor: String(cerrados.length),
            nota:
              montoCerrado > 0
                ? `${formatearMonto(montoCerrado)} contratados`
                : "Sin monto asociado",
          },
          {
            etiqueta: "Costo comprometido",
            valor: formatearMonto(filas.reduce((t, c) => t + c.costoReal, 0)),
            nota: "Compras, servicios y personal cargados",
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} contratos`}
        filtros={
          <Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
        }
      >
        <Tabla
          columnas={columnas(edicion, alVerAnexos, alVerPlantilla, alVerCategorias)}
          filas={visibles}
          claveDe={(c) => c.id}
          vacio="Todavía no hay contratos. Crea el primero para poder cargar movimientos."
          pie={
            <>
              <Total colSpan={3}>Total</Total>
              <Total derecha>{formatearMonto(presupuesto)}</Total>
              <Total derecha>{formatearMonto(costo)}</Total>
              <Total derecha>{formatearMonto(facturado)}</Total>
              <Total colSpan={3} />
            </>
          }
        />
      </Panel>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<Contrato>>,
  alVerAnexos: (c: Contrato) => void,
  alVerPlantilla: (c: Contrato) => void,
  alVerCategorias: (c: Contrato) => void,
): Columna<Contrato>[] => [
  {
    clave: "contrato",
    titulo: "Contrato",
    encabezado: true,
    celda: (c) => (
      <>
        <span className="block font-semibold text-ink">{c.nombre}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {c.id} · {c.cliente} · {c.faena}
        </span>
        <span className="mt-1 inline-block rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          {modalidades.find((m) => m.id === c.modalidad)?.titulo ?? c.modalidad}
          {" · "}
          {formasContrato.find((t) => t.id === c.forma)?.titulo ?? c.forma}
        </span>
      </>
    ),
  },
  {
    clave: "estado",
    titulo: "Vigencia",
    celda: (c) => (
      <>
        <Chip tono={tonoVigencia[c.vigencia]}>{vigencias[c.vigencia]}</Chip>
        <span className="mt-1 block text-xs text-ink-soft">
          {c.vigencia === "cancelado"
            ? "terminado antes de plazo"
            : c.vigencia === "cerrado"
            ? `terminó hace ${Math.abs(c.diasRestantes)} d`
            : `${c.diasRestantes} d restantes`}
        </span>
      </>
    ),
  },
  {
    clave: "presupuesto",
    titulo: "Presupuesto",
    derecha: true,
    celda: (c) => {
      if (c.montoVigente === null) return <span className="text-ink-soft">—</span>;
      return (
        <>
          <span className="font-semibold text-ink">{formatearMonto(c.montoVigente)}</span>
          {c.montoAnexos !== 0 && (
            <span className="mt-0.5 block text-xs text-ink-soft">
              base {formatearMonto(c.presupuesto)} {c.montoAnexos > 0 ? "+" : "−"}{" "}
              {formatearMonto(Math.abs(c.montoAnexos))} en anexos
            </span>
          )}
        </>
      );
    },
  },
  {
    clave: "costo",
    titulo: "Costo real",
    derecha: true,
    celda: (c) => (
      <>
        <span className="block text-ink-soft">{formatearMonto(c.costoReal)}</span>
        <span className="mt-0.5 block text-xs text-ink-soft/70">
          {formatearMonto(c.costoCompras)} compras · {formatearMonto(c.costoServicios)}{" "}
          servicios · {formatearMonto(c.costoPersonal)} personal
        </span>
      </>
    ),
  },
  {
    clave: "facturado",
    titulo: "Facturado",
    derecha: true,
    celda: (c) => <span className="text-ink-soft">{formatearMonto(c.facturado)}</span>,
  },
  {
    clave: "consumo",
    titulo: "Consumo",
    derecha: true,
    celda: (c) => {
      const pct = consumoPct(c);
      if (pct === null) return <span className="text-ink-soft">—</span>;
      return (
        <span
          className={`font-semibold ${
            pct > 100 ? "text-[#a52f24]" : pct > 85 ? "text-[#8a5a09]" : "text-[#0e7a4f]"
          }`}
        >
          {pct.toFixed(0)}%
        </span>
      );
    },
  },
  {
    clave: "termino",
    titulo: "Término",
    celda: (c) => (
      <span className="whitespace-nowrap text-ink-soft">{formatearFecha(c.termino)}</span>
    ),
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (c) => (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => alVerCategorias(c)}
          title="Categorías de costo: de qué se compone el costo de este contrato"
          aria-label="Categorías de costo"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 6h16M4 12h16M4 18h9" strokeLinecap="round" />
            <circle cx="18.5" cy="18" r="2.2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => alVerPlantilla(c)}
          title="Planilla del contrato: qué campos pide al cargar información"
          aria-label="Planilla del contrato"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.5" y="4" width="17" height="16" rx="2" />
            <path d="M3.5 9h17M9 9v11M15 9v11" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => alVerAnexos(c)}
          title={c.anexos === 0 ? "Sin anexos" : `${c.anexos} anexos vigentes`}
          className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
          aria-label="Anexos"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M7 3h7l5 5v13H7Z" strokeLinejoin="round" />
            <path d="M14 3v5h5" strokeLinejoin="round" />
            <path d="M12 11.5v5M9.5 14h5" strokeLinecap="round" />
          </svg>
          {c.anexos > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan px-1 text-[10px] font-bold text-white">
              {c.anexos}
            </span>
          )}
        </button>
        <AccionesFila
          permiso="contratos.editar"
          alEditar={() => edicion.abrirEdicion(c)}
          alVerHistorial={() => edicion.verHistorial(c.id, `${c.id} · ${c.nombre}`)}
          alVerAdjuntos={() => edicion.verAdjuntos(c.id, `${c.id} · ${c.nombre}`)}
          cuantosAdjuntos={edicion.cuantosAdjuntos(c.id)}
        />
      </div>
    ),
  },
];
