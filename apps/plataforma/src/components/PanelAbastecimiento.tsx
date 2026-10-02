"use client";

import Link from "next/link";
import { Chip, type Tono } from "./ui/Chip";
import { Contenido, Resumen } from "./ui/Vista";
import { useConsulta } from "@/lib/consulta";
import {
  cargarProveedores,
  cargarSolped,
  nombreEstadoSolped,
  type EstadoSolped,
  type Proveedor,
  type Solped,
} from "@/lib/abastecimiento";
import { cargarOrdenes, type Orden } from "@/lib/ordenes";
import { formatearFecha, formatearMonto } from "@/lib/formato";
import { RAIZ_ABASTECIMIENTO } from "@/lib/secciones";

/**
 * Panel de Abastecimiento: qué hay que hacer hoy.
 *
 * No es un tablero de cifras: es una lista de trabajo. Lo que aparece acá es lo
 * que está esperando a alguien —una firma, una cotización, una recepción— y
 * cuánto lleva esperando. Los totales de gasto viven en Control de Gestión, que
 * es donde corresponde mirarlos.
 */

type Datos = {
  solped: Solped[];
  ordenes: Orden[];
  proveedores: Proveedor[];
};

async function cargar(): Promise<Datos> {
  const [solped, ordenes, proveedores] = await Promise.all([
    cargarSolped(),
    cargarOrdenes(),
    cargarProveedores(),
  ]);
  return { solped, ordenes, proveedores };
}

const CERRADAS: EstadoSolped[] = ["cerrada", "rechazada", "anulada"];

export function PanelAbastecimiento() {
  const { estado } = useConsulta<Datos>(cargar);

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-ink">Abastecimiento</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          El ciclo completo: lo que faena pide, lo que se cotiza, lo que se ordena y lo
          que llega. Acá aparece lo que está esperando a alguien.
        </p>
      </header>

      <Contenido consulta={estado}>{(datos) => <Tablero datos={datos} />}</Contenido>
    </>
  );
}

function Tablero({ datos }: { datos: Datos }) {
  const abiertas = datos.solped.filter((s) => !CERRADAS.includes(s.estado));
  const porAprobar = datos.solped.filter((s) => s.estado === "en-aprobacion");
  const porCotizar = datos.solped.filter((s) => s.estado === "aprobada");
  const trabadas = abiertas.filter((s) => s.diasAbierta > 7);

  const ordenesAbiertas = datos.ordenes.filter(
    (o) => o.estado === "emitida" || o.estado === "parcial",
  );
  const porRecibir = datos.ordenes.filter((o) => o.estado === "emitida");
  const parciales = datos.ordenes.filter((o) => o.estado === "parcial");
  const comprometido = ordenesAbiertas.reduce((t, o) => t + o.total, 0);

  const fichasIncompletas = datos.proveedores.filter(
    (p) => p.estado === "por_completar" || !p.numeroCuenta,
  );

  const nada =
    datos.solped.length === 0 && datos.ordenes.length === 0 && datos.proveedores.length === 0;

  if (nada) {
    return (
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          El módulo está listo y todavía vacío
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
          Empieza cargando los proveedores que ya usas: quedan disponibles al emitir una
          orden. Después, la primera solicitud de faena.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Enlace href={`${RAIZ_ABASTECIMIENTO}/proveedores/`}>Cargar proveedores</Enlace>
          <Enlace href={`${RAIZ_ABASTECIMIENTO}/solped/`}>Nueva solicitud</Enlace>
        </div>
      </div>
    );
  }

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Esperando firma",
            valor: String(porAprobar.length),
            nota: porAprobar.length === 0 ? "Nada pendiente" : "Sin firma no se puede cotizar",
            acento: porAprobar.length > 0 ? "aviso" : "bueno",
          },
          {
            etiqueta: "Listas para cotizar",
            valor: String(porCotizar.length),
            nota: "Aprobadas y esperando precios",
            acento: porCotizar.length > 0 ? "aviso" : undefined,
          },
          {
            etiqueta: "Órdenes abiertas",
            valor: String(ordenesAbiertas.length),
            nota: `${formatearMonto(comprometido)} comprometidos`,
          },
          {
            etiqueta: "Trabadas",
            valor: String(trabadas.length),
            nota: "Más de 7 días sin cerrarse",
            acento: trabadas.length > 0 ? "critico" : "bueno",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta
          titulo="Solicitudes que esperan a alguien"
          nota="Ordenadas por lo que lleva más tiempo abierto."
          href={`${RAIZ_ABASTECIMIENTO}/solped/`}
          verTodo="Ver solicitudes"
          vacio="Ninguna solicitud abierta."
        >
          {[...abiertas]
            .sort((a, b) => b.diasAbierta - a.diasAbierta)
            .slice(0, 6)
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {s.numero} · {s.contrato}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {s.solicitanteNombre} · {s.items} ítems
                    {s.fechaRequerida ? ` · para ${formatearFecha(s.fechaRequerida)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={
                      s.diasAbierta > 7
                        ? "text-xs font-semibold text-[#a52f24]"
                        : "text-xs text-ink-soft"
                    }
                  >
                    {s.diasAbierta} d
                  </span>
                  <Chip tono={tonoDe(s.estado)}>{nombreEstadoSolped[s.estado]}</Chip>
                </div>
              </li>
            ))}
        </Tarjeta>

        <Tarjeta
          titulo="Órdenes en la calle"
          nota="Emitidas o con recepción a medias."
          href={`${RAIZ_ABASTECIMIENTO}/ordenes/`}
          verTodo="Ver órdenes"
          vacio="Ninguna orden abierta."
        >
          {[...porRecibir, ...parciales].slice(0, 6).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{o.numero}</p>
                <p className="mt-0.5 truncate text-xs text-ink-soft">
                  {o.proveedor} · {formatearFecha(o.fechaEmision)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-ink-soft">{formatearMonto(o.total)}</span>
                <Chip tono={o.estado === "parcial" ? "aviso" : "info"}>
                  {o.estado === "parcial" ? "Parcial" : "Emitida"}
                </Chip>
              </div>
            </li>
          ))}
        </Tarjeta>
      </div>

      {fichasIncompletas.length > 0 && (
        <div className="mt-4 rounded-2xl border border-mist-deep bg-white p-6">
          <h2 className="font-display text-base font-semibold text-ink">
            {fichasIncompletas.length}{" "}
            {fichasIncompletas.length === 1 ? "proveedor" : "proveedores"} sin datos para pagar
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Les falta la cuenta bancaria o quedaron incompletos al crearlos. El día que
            haya que pagarles, ese dato se busca en un correo viejo.
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            {fichasIncompletas
              .slice(0, 6)
              .map((p) => p.razonSocial)
              .join(" · ")}
            {fichasIncompletas.length > 6 ? ` y ${fichasIncompletas.length - 6} más` : ""}
          </p>
          <div className="mt-4">
            <Enlace href={`${RAIZ_ABASTECIMIENTO}/proveedores/`}>Completar fichas</Enlace>
          </div>
        </div>
      )}
    </>
  );
}

function tonoDe(estado: EstadoSolped): Tono {
  if (estado === "en-aprobacion" || estado === "parcial") return "aviso";
  if (estado === "cerrada") return "bueno";
  if (estado === "rechazada") return "critico";
  if (estado === "borrador" || estado === "anulada") return "neutro";
  return "info";
}

function Tarjeta({
  titulo,
  nota,
  href,
  verTodo,
  vacio,
  children,
}: {
  titulo: string;
  nota: string;
  href: string;
  verTodo: string;
  vacio: string;
  children: React.ReactNode;
}) {
  const filas = Array.isArray(children) ? children.flat() : [children];
  const hay = filas.some(Boolean) && filas.length > 0;

  return (
    <section className="rounded-2xl border border-mist-deep bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">{titulo}</h2>
          <p className="mt-1 text-sm text-ink-soft">{nota}</p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-sm font-semibold text-cyan-deep transition-colors hover:text-ink"
        >
          {verTodo}
        </Link>
      </div>

      {hay ? (
        <ul className="mt-4 divide-y divide-mist">{children}</ul>
      ) : (
        <p className="mt-6 text-sm text-ink-soft">{vacio}</p>
      )}
    </section>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep"
    >
      {children}
    </Link>
  );
}
