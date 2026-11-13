"use client";

import { Chip } from "../ui/Chip";
import { formatearRut, type ItemCotizado, type ItemSolped, type AvanceItem, type Cotizacion, type EnvioSolicitud, type Proveedor } from "@/lib/abastecimiento";

/* Piezas compartidas por los diálogos de cotizaciones (CotizacionesDeSolped). */

export const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyan";

export type Datos = {
  cotizaciones: Cotizacion[];
  items: AvanceItem[];
  /* Los ítems tal como se pidieron, con el artículo del maestro enlazado: de
     ahí sale el nombre técnico con el que se le pide al proveedor. */
  pedidos: ItemSolped[];
  proveedores: Proveedor[];
  /* Qué pasó con cada solicitud enviada: abierta por el proveedor, recibida. */
  envios: EnvioSolicitud[];
  /* Por proveedor con solicitud pendiente: lo que se le pidió y cómo suele
     llamarle a cada artículo. Es lo que arma el formulario de precios solo. */
  solicitados: Record<string, { items: ItemCotizado[]; nombres: Map<string, string> }>;
};

/** Lo que pasó con el último envío: sin abrir → vista por el proveedor → recibida. */
export function EstadoDelEnvio({ envio }: { envio: EnvioSolicitud | undefined }) {
  if (!envio) return null;
  if (envio.recibidaEn) {
    return (
      <span className="mt-1 block">
        <Chip tono="bueno">Recibida{envio.recibidaPor ? ` por ${envio.recibidaPor}` : ""}</Chip>
        {envio.comentario && <span className="mt-1 block text-xs text-ink-soft">“{envio.comentario}”</span>}
      </span>
    );
  }
  return (
    <span className="mt-1 block">
      {envio.vistaEn ? <Chip tono="info">Vista por el proveedor</Chip> : <Chip tono="aviso">Enviada, sin abrir</Chip>}
    </span>
  );
}

/* ── Cargar una cotización ────────────────────────────────────────────────── */

export type Linea = {
  solpedItemId: string;
  /** Como se pidió (el nombre técnico del catálogo si se conoce). */
  descripcion: string;
  /** El nombre con que el proveedor lo cotizó: editable, y es el que irá a la orden de compra. */
  nombre: string;
  /** Del catálogo, si el ítem está enlazado: ahí se aprende el nombre. */
  articuloId: string | null;
  /** El artículo ya tiene nombre técnico en el catálogo. */
  tieneNombreTecnico: boolean;
  unidad: string;
  cantidad: number;
  precio: number;
  disponible: boolean;
};

/**
 * Un proveedor como opción del buscador: nombre arriba, RUT y rubro abajo. A los
 * que ya se les pidió cotización (`esperando`: proveedor → N° de solicitud) se
 * les avisa, porque son los que casi siempre se buscan.
 */
export function opcionesDe(proveedores: Proveedor[], esperando: Map<string, string> = new Map()) {
  return proveedores.map((p) => ({
    id: p.id,
    titulo: p.razonSocial,
    nota: [
      esperando.get(p.id) ?? null,
      formatearRut(p.rut),
      ...p.rubros.slice(0, 2),
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

export function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </span>
  );
}

export function Ayuda({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-xs text-ink-soft">{children}</span>;
}

export function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{etiqueta}</dt>
      <dd className="tabular-nums text-ink-soft">{valor}</dd>
    </div>
  );
}

/** Casilla de sí o no, para lo que es opcional y casi siempre no viene. */
export function Casilla({
  marcada,
  alCambiar,
  children,
}: {
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => alCambiar(e.target.checked)}
        className="size-4 rounded border-mist-deep text-cyan accent-cyan"
      />
      {children}
    </label>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
