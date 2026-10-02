"use client";

import type { EstadoConsulta } from "@/lib/consulta";

/**
 * Andamiaje de una vista del módulo: encabezado, tira de totales y la caja
 * blanca donde vive la tabla. Los estados de carga y de error salen iguales en
 * todas, así nadie tiene que reinventarlos.
 */

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{titulo}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {descripcion}
        </p>
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </header>
  );
}

export type Dato = {
  etiqueta: string;
  valor: string;
  nota?: string;
  /** Resalta el valor cuando el número pide atención. */
  acento?: "bueno" | "aviso" | "critico";
};

/** Tira de totales sobre la tabla: lo que se responde sin leer fila por fila. */
export function Resumen({ datos }: { datos: Dato[] }) {
  return (
    <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {datos.map((d) => (
        <div key={d.etiqueta} className="rounded-2xl border border-mist-deep bg-white p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {d.etiqueta}
          </dt>
          <dd
            className={`mt-3 font-display text-2xl font-semibold leading-none ${
              d.acento === "critico"
                ? "text-[#a52f24]"
                : d.acento === "aviso"
                  ? "text-[#8a5a09]"
                  : d.acento === "bueno"
                    ? "text-[#0e7a4f]"
                    : "text-ink"
            }`}
          >
            {d.valor}
          </dd>
          {d.nota && <dd className="mt-2 text-sm text-ink-soft">{d.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Caja blanca de la tabla, con su título arriba. */
export function Panel({
  titulo,
  nota,
  filtros,
  children,
}: {
  titulo: string;
  nota?: string;
  filtros?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-mist-deep bg-white">
      <div className="flex flex-col gap-4 border-b border-mist px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
          {nota && <p className="mt-1 text-sm text-ink-soft">{nota}</p>}
        </div>
        {filtros && <div className="flex shrink-0 items-center gap-2">{filtros}</div>}
      </div>
      {children}
    </section>
  );
}

/** Grupo de botones que filtran la tabla. */
export function Filtro<T extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  opciones: { id: T; titulo: string }[];
  valor: T;
  alCambiar: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="flex overflow-x-auto rounded-full border border-mist-deep p-1 sin-barra-scroll"
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => alCambiar(o.id)}
          aria-pressed={valor === o.id}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            valor === o.id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.titulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Filtro con muchas opciones, como los meses.
 *
 * Los chips de `Filtro` se quedan cortos apenas la lista crece: doce meses no
 * caben en una tira, y una tira que se arrastra esconde justo lo que se busca.
 * Acá va un desplegable de verdad, que además agrupa —los rangos arriba, los
 * meses sueltos abajo— y sigue funcionando con el teclado sin que tengamos que
 * inventar nada.
 */
export function Desplegable<T extends string>({
  etiqueta,
  grupos,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  grupos: { titulo?: string; opciones: { id: T; titulo: string }[] }[];
  valor: T;
  alCambiar: (v: T) => void;
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => alCambiar(e.target.value as T)}
        className="appearance-none rounded-full border border-mist-deep bg-white py-2 pl-4 pr-9 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink focus:outline-none focus:ring-2 focus:ring-cyan"
      >
        {grupos.map((g) =>
          g.titulo ? (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </optgroup>
          ) : (
            g.opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo}
              </option>
            ))
          ),
        )}
      </select>
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="pointer-events-none absolute right-3.5 text-ink-soft"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

/* ── Estados ──────────────────────────────────────────────────────────────── */

export function Cargando() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-mist-deep bg-white" />
        ))}
      </div>
      <div className="h-96 rounded-2xl border border-mist-deep bg-white" />
    </div>
  );
}

export function Fallo({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-[#f0cdc8] bg-[#fdeeec] p-6">
      <p className="font-display text-lg font-semibold text-[#a52f24]">
        No se pudieron cargar los datos
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Vuelve a cargar la página. Si el problema sigue, revisa que la base de datos
        esté activa: los proyectos gratis de Supabase se pausan tras una semana sin
        uso.
      </p>
      <p className="mt-3 font-mono text-xs text-ink-soft/80">{mensaje}</p>
    </div>
  );
}

/** Envuelve el contenido de una vista y resuelve sus tres estados. */
export function Contenido<T>({
  consulta,
  children,
}: {
  consulta: EstadoConsulta<T>;
  children: (datos: T) => React.ReactNode;
}) {
  if (consulta.estado === "cargando") return <Cargando />;
  if (consulta.estado === "error") return <Fallo mensaje={consulta.mensaje} />;
  return <>{children(consulta.datos)}</>;
}
