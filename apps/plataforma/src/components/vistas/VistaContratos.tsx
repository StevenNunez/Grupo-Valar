"use client";

import { useMemo, useState } from "react";
import { AnexosDelContrato } from "../AnexosDelContrato";
import { CategoriasDelContrato } from "../CategoriasDelContrato";
import { PlantillaDelContrato } from "../PlantillaDelContrato";
import { FormularioContrato } from "../formularios/FormularioContrato";
import { AnexosDesplegados, DetalleContrato } from "../FichaContrato";
import { Chip, type Tono } from "../ui/Chip";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Contenido, Encabezado, Filtro, Resumen } from "../ui/Vista";
import { useConsulta } from "@/lib/consulta";
import { cargarContratos } from "@/lib/contratos";
import { formatearFecha, formatearMonto, formatearUf } from "@/lib/formato";
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
              alCambiar={recargar}
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
  alCambiar,
  alVerPlantilla,
  alVerCategorias,
}: {
  filas: Contrato[];
  edicion: ReturnType<typeof useEdicion<Contrato>>;
  alVerAnexos: (c: Contrato) => void;
  alCambiar: () => void;
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

  const presupuesto = visibles.reduce((t, c) => t + (c.montoVigente ?? 0), 0);
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {visibles.length} de {filas.length} contratos · monto {formatearMonto(presupuesto)} · costo{" "}
          {formatearMonto(costo)} · facturado {formatearMonto(facturado)}
        </p>
        <Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-mist-deep bg-white px-6 py-14 text-center text-sm text-ink-soft">
          {filas.length === 0
            ? "Todavía no hay contratos. Crea el primero para poder cargar movimientos."
            : "Ningún contrato en este filtro."}
        </p>
      ) : (
        /* Tarjetas y no tabla: un nombre de contrato largo («Obras Civiles
           Acceso Vial y Refuerzo Gasoducto Taltal…») deformaba todas las
           columnas. En la tarjeta el nombre ocupa lo que necesita y las cifras
           siguen alineadas debajo. */
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {visibles.map((c) => (
            <TarjetaContrato
              key={c.id}
              c={c}
              edicion={edicion}
              alGestionarAnexos={() => alVerAnexos(c)}
              alCambiar={alCambiar}
              alVerPlantilla={() => alVerPlantilla(c)}
              alVerCategorias={() => alVerCategorias(c)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TarjetaContrato({
  c,
  edicion,
  alGestionarAnexos,
  alCambiar,
  alVerPlantilla,
  alVerCategorias,
}: {
  c: Contrato;
  edicion: ReturnType<typeof useEdicion<Contrato>>;
  alGestionarAnexos: () => void;
  alCambiar: () => void;
  alVerPlantilla: () => void;
  alVerCategorias: () => void;
}) {
  const pct = consumoPct(c);
  // Una sola ficha abierta a la vez: detalle o anexos.
  const [abierto, setAbierto] = useState<"detalle" | "anexos" | null>(null);
  const alternar = (que: "detalle" | "anexos") => setAbierto((a) => (a === que ? null : que));

  return (
    <article className="flex flex-col rounded-2xl border border-mist-deep bg-white p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold leading-snug text-ink">{c.nombre}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {c.id} · {c.cliente} · {c.faena}
          </p>
        </div>
        <Chip tono={tonoVigencia[c.vigencia]}>{vigencias[c.vigencia]}</Chip>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="rounded-full bg-mist px-2 py-0.5 font-semibold">
          {modalidades.find((m) => m.id === c.modalidad)?.titulo ?? c.modalidad}
          {" · "}
          {formasContrato.find((t) => t.id === c.forma)?.titulo ?? c.forma}
        </span>
        <span>
          {c.vigencia === "cancelado"
            ? "terminado antes de plazo"
            : c.vigencia === "cerrado"
              ? `terminó hace ${Math.abs(c.diasRestantes)} días`
              : `${c.diasRestantes} días restantes`}{" "}
          · {c.inicio ? `inicio ${formatearFecha(c.inicio)} · ` : ""}término {formatearFecha(c.terminoVigente)}
          {c.diasPlazoTotal !== null && ` · ${c.diasPlazoTotal} días de plazo`}
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-mist pt-4">
        <Cifra etiqueta="Monto vigente" valor={c.montoVigente === null ? "—" : formatearMonto(c.montoVigente)}
          nota={c.montoAnexos !== 0 ? `base ${formatearMonto(c.presupuesto)} ${c.montoAnexos > 0 ? "+" : "−"} ${formatearMonto(Math.abs(c.montoAnexos))} anexos` : c.montoVigente === null ? "sin monto total" : c.moneda === "UF" && c.montoUf ? `${formatearUf(c.montoUf)} UF a la UF de hoy` : undefined} />
        <Cifra etiqueta="Costo real" valor={formatearMonto(c.costoReal)} />
        <Cifra etiqueta="Facturado" valor={formatearMonto(c.facturado)} />
      </dl>
      <p className="mt-2 text-xs text-ink-soft">
        {formatearMonto(c.costoCompras)} compras · {formatearMonto(c.costoServicios)} servicios ·{" "}
        {formatearMonto(c.costoPersonal)} personal
      </p>

      {pct !== null && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-soft">Consumo del monto vigente</span>
            <span className={`font-semibold ${pct > 100 ? "text-[#a52f24]" : pct > 85 ? "text-[#8a5a09]" : "text-[#0e7a4f]"}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mist" aria-hidden="true">
            <div
              className={`h-full rounded-full ${pct > 100 ? "bg-[#a52f24]" : pct > 85 ? "bg-[#c98a1c]" : "bg-[#0e7a4f]"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-mist pt-3">
        <div className="flex flex-wrap gap-2">
          <Desplegar abierto={abierto === "detalle"} onClick={() => alternar("detalle")}>Detalle</Desplegar>
          <Desplegar abierto={abierto === "anexos"} onClick={() => alternar("anexos")}>
            Anexos{c.anexos > 0 ? ` (${c.anexos})` : ""}
          </Desplegar>
        </div>
        <div className="flex items-center gap-1">
          <BotonIcono titulo="Categorías de costo: de qué se compone el costo de este contrato" onClick={alVerCategorias}>
            <path d="M4 6h16M4 12h16M4 18h9" strokeLinecap="round" />
            <circle cx="18.5" cy="18" r="2.2" />
          </BotonIcono>
          <BotonIcono titulo="Planilla del contrato: qué campos pide al cargar información" onClick={alVerPlantilla}>
            <rect x="3.5" y="4" width="17" height="16" rx="2" />
            <path d="M3.5 9h17M9 9v11M15 9v11" />
          </BotonIcono>
          <AccionesFila
            permiso="contratos.editar"
            alEditar={() => edicion.abrirEdicion(c)}
            alVerHistorial={() => edicion.verHistorial(c.id, `${c.id} · ${c.nombre}`)}
            alVerAdjuntos={() => edicion.verAdjuntos(c.id, `${c.id} · ${c.nombre}`)}
            cuantosAdjuntos={edicion.cuantosAdjuntos(c.id)}
          />
        </div>
      </div>

      {abierto === "detalle" && <DetalleContrato c={c} alEditar={() => edicion.abrirEdicion(c)} />}
      {abierto === "anexos" && (
        <AnexosDesplegados
          c={c}
          alGestionar={alGestionarAnexos}
          alCambiar={alCambiar}
        />
      )}
    </article>
  );
}

function Desplegar({ abierto, onClick, children }: { abierto: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        abierto ? "border-cyan bg-cyan/5 text-cyan-deep" : "border-mist-deep text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {children}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"
        className={`transition-transform ${abierto ? "rotate-180" : ""}`}>
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{etiqueta}</dt>
      <dd className="mt-0.5 font-display text-base font-semibold tabular-nums text-ink">{valor}</dd>
      {nota && <dd className="mt-0.5 text-[11px] leading-snug text-ink-soft">{nota}</dd>}
    </div>
  );
}

function BotonIcono({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
