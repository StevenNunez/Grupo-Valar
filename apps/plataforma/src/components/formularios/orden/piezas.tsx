"use client";

import { Combo } from "../../ui/Combo";
import { Ancho } from "../../ui/Formulario";
import { formatearRut, type Proveedor } from "@/lib/abastecimiento";
import type { BorradorOrden, Guardado } from "./borrador";

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-mist px-6 pb-6 pt-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {titulo}
      </h3>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Un dato que vino del maestro: se lee acá, se corrige en Proveedores. */
export function DatoCopiado({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

/** El aviso de que quedó una orden a medio escribir: se recupera o se empieza de cero. */
export function AvisoPendiente({
  pendiente,
  alRecuperar,
  alDescartar,
}: {
  pendiente: Guardado;
  alRecuperar: () => void;
  alDescartar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist bg-cyan/5 px-6 py-3">
      <p className="text-sm text-ink">
        Tienes una orden sin terminar
        {pendiente.datos.proveedor ? <> para <strong>{pendiente.datos.proveedor}</strong></> : null}
        {" "}({pendiente.lineas.filter((l) => l.descripcion.trim()).length} ítems), del{" "}
        {new Date(pendiente.cuando).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={alRecuperar}
          className="rounded-full bg-cyan-deep px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-hondo"
        >
          Recuperarla
        </button>
        <button
          type="button"
          onClick={alDescartar}
          className="rounded-full border border-mist-deep px-4 py-1.5 text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink"
        >
          Empezar de cero
        </button>
      </div>
    </div>
  );
}

/**
 * El proveedor se elige del maestro y sus datos se copian solos.
 * Se copian y no se dejan apuntando: la OC es un documento que se
 * imprime y tiene que seguir diciendo lo mismo dentro de dos años,
 * aunque el proveedor se cambie de oficina. Corregirlos acá sería
 * corregir una copia; se corrigen en Proveedores.
 */
export function SeccionProveedor({
  proveedores,
  datos,
  alElegir,
}: {
  proveedores: Proveedor[];
  datos: BorradorOrden;
  alElegir: (id: string) => void;
}) {
  return (
    <Seccion titulo="Proveedor">
      <Ancho>
        <Combo
          etiqueta="Proveedor"
          requerido
          opciones={proveedores
            .filter((p) => p.estado === "activo" || p.estado === "por_completar")
            .map((p) => ({
              id: p.id,
              titulo: p.razonSocial,
              // El nombre de fantasía también se busca: "Max Service" es como se le dice, no su razón social.
              nota: [p.nombreFantasia, formatearRut(p.rut), ...p.rubros.slice(0, 2)]
                .filter(Boolean)
                .join(" · "),
            }))}
          marcador="Escribe para buscar entre los proveedores…"
          ayuda="Los datos se completan solos. Si algo está mal o falta, se arregla en Proveedores y vale para todas las órdenes."
          valor={datos.proveedor_id}
          alCambiar={(v) => alElegir(v)}
        />
      </Ancho>

      {datos.proveedor && (
        <Ancho>
          <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-mist-deep bg-mist/30 p-4 text-sm sm:grid-cols-2">
            <DatoCopiado etiqueta="Razón social">{datos.proveedor}</DatoCopiado>
            <DatoCopiado etiqueta="RUT">
              {datos.rut_proveedor ? formatearRut(datos.rut_proveedor) : "Sin RUT"}
            </DatoCopiado>
            <DatoCopiado etiqueta="Dirección">
              {[datos.direccion_proveedor, datos.comuna_proveedor, datos.ciudad_proveedor]
                .filter(Boolean)
                .join(", ") || "—"}
            </DatoCopiado>
            <DatoCopiado etiqueta="Contacto">
              {[datos.contacto, datos.correo_contacto, datos.telefono_contacto]
                .filter(Boolean)
                .join(" · ") || "—"}
            </DatoCopiado>
          </dl>
        </Ancho>
      )}
    </Seccion>
  );
}
