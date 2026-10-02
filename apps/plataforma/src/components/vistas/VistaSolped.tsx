"use client";

import { useMemo, useState } from "react";
import { CotizacionesDeSolped } from "../CotizacionesDeSolped";
import { ExpedienteSolped } from "../ExpedienteSolped";
import { FormularioSolped } from "../formularios/FormularioSolped";
import { DialogoAdjuntos } from "../ui/Adjuntos";
import { Chip, type Tono } from "../ui/Chip";
import { Dialogo } from "../ui/Formulario";
import { AccionesFila, BotonNuevo, DialogoHistorial, useEdicion } from "../ui/Historial";
import { Tabla, type Columna } from "../ui/Tabla";
import { Contenido, Encabezado, Filtro, Panel, Resumen } from "../ui/Vista";
import { cargarArticulos, type Articulo } from "@/lib/articulos";
import { useConsulta } from "@/lib/consulta";
import {
  cargarAprobaciones,
  cargarSolped,
  firmar,
  nombreEstadoSolped,
  type Aprobacion,
  type EstadoSolped,
  type Solped,
} from "@/lib/abastecimiento";
import { cargarContratosBreve, type ContratoBreve } from "@/lib/contratos";
import { actualizar } from "@/lib/crud";
import { cargarDashboard, type FilaCategoria } from "@/lib/dashboard";
import { formatearFecha, formatearNumero } from "@/lib/formato";
import { puede, usePuede, useUsuario } from "@/lib/sesion";

/**
 * Las solicitudes de pedido.
 *
 * El ciclo de una SOLPED empieza acá: alguien de faena pide, el administrador de
 * contrato aprueba la necesidad y recién entonces abastecimiento sale a cotizar.
 * Los precios no viven en este documento.
 */

const tonos: Record<EstadoSolped, Tono> = {
  borrador: "neutro",
  "en-aprobacion": "aviso",
  aprobada: "info",
  "en-cotizacion": "info",
  cotizada: "info",
  "en-compra": "info",
  parcial: "aviso",
  cerrada: "bueno",
  rechazada: "critico",
  anulada: "neutro",
};

type Filtrado = "todas" | "por-aprobar" | "abiertas" | "cerradas";

const opciones: { id: Filtrado; titulo: string }[] = [
  { id: "todas", titulo: "Todas" },
  { id: "por-aprobar", titulo: "Por aprobar" },
  { id: "abiertas", titulo: "Abiertas" },
  { id: "cerradas", titulo: "Cerradas" },
];

const CERRADAS: EstadoSolped[] = ["cerrada", "rechazada", "anulada"];

type Datos = {
  solped: Solped[];
  contratos: ContratoBreve[];
  categorias: FilaCategoria[];
  /** El maestro, para autocompletar los ítems al armar la solicitud. */
  articulos: Articulo[];
};

async function cargar(): Promise<Datos> {
  const [solped, contratos, dashboard, articulos] = await Promise.all([
    cargarSolped(),
    cargarContratosBreve(),
    cargarDashboard(),
    /* El catálogo no puede tumbar la pantalla: si la 0027 todavía no está
       aplicada, la solicitud se sigue armando escribiendo a mano. */
    cargarArticulos().catch(() => [] as Articulo[]),
  ]);
  return { solped, contratos, categorias: dashboard.categorias, articulos };
}

export function VistaSolped() {
  const { estado, recargar } = useConsulta<Datos>(cargar);
  const edicion = useEdicion<Solped>("solped");
  const [firmando, setFirmando] = useState<Solped | null>(null);
  const [expediente, setExpediente] = useState<Solped | null>(null);
  const [cotizando, setCotizando] = useState<Solped | null>(null);

  return (
    <>
      <Encabezado
        titulo="Solicitudes de pedido"
        descripcion="Lo que faena necesita comprar. Se aprueba la necesidad, no el monto: los precios aparecen al cotizar, y el monto se autoriza después."
        acciones={<BotonNuevo permiso="solped.crear" onClick={edicion.abrirNuevo}>Nueva solicitud</BotonNuevo>}
      />

      <Contenido consulta={estado}>
        {(datos) => (
          <>
            <Contenidos
              filas={datos.solped}
              edicion={edicion}
              alFirmar={setFirmando}
              alVerExpediente={setExpediente}
              alCotizar={setCotizando}
            />

            {edicion.editando && (
              <FormularioSolped
                solped={edicion.registro}
                todas={datos.solped}
                contratos={datos.contratos}
                categorias={datos.categorias}
                articulos={datos.articulos}
                alCerrar={edicion.cerrar}
                alGuardado={recargar}
              />
            )}

            {expediente && (
              <ExpedienteSolped
                solpedId={expediente.id}
                titulo={`${expediente.numero} · ${expediente.contrato}`}
                alCerrar={() => setExpediente(null)}
              />
            )}

            {cotizando && (
              <CotizacionesDeSolped
                solped={cotizando}
                alCerrar={() => setCotizando(null)}
                alCambiar={recargar}
              />
            )}

            {firmando && (
              <DialogoAprobacion
                solped={firmando}
                alCerrar={() => setFirmando(null)}
                alFirmado={recargar}
              />
            )}
          </>
        )}
      </Contenido>

      {edicion.historial && (
        <DialogoHistorial
          tabla="solped"
          registroId={edicion.historial.id}
          titulo={edicion.historial.titulo}
          abierto
          alCerrar={edicion.cerrarHistorial}
        />
      )}

      {edicion.adjuntos && (
        <DialogoAdjuntos
          tabla="solped"
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
  alFirmar,
  alVerExpediente,
  alCotizar,
}: {
  filas: Solped[];
  edicion: ReturnType<typeof useEdicion<Solped>>;
  alFirmar: (s: Solped) => void;
  alVerExpediente: (s: Solped) => void;
  alCotizar: (s: Solped) => void;
}) {
  const [filtro, setFiltro] = useState<Filtrado>("todas");
  // Mandar a aprobar es de quien crea solicitudes; firmar, de quien aprueba.
  const permisos = { enviar: usePuede("solped.crear"), aprobar: usePuede("solped.aprobar") };

  const visibles = useMemo(() => {
    if (filtro === "por-aprobar") return filas.filter((s) => s.estado === "en-aprobacion");
    if (filtro === "abiertas") return filas.filter((s) => !CERRADAS.includes(s.estado));
    if (filtro === "cerradas") return filas.filter((s) => CERRADAS.includes(s.estado));
    return filas;
  }, [filas, filtro]);

  const porAprobar = filas.filter((s) => s.estado === "en-aprobacion");
  const abiertas = filas.filter((s) => !CERRADAS.includes(s.estado));
  // Una solicitud que lleva más de una semana esperando ya es un problema, no
  // una demora.
  const trabadas = abiertas.filter((s) => s.diasAbierta > 7);
  const urgentes = abiertas.filter((s) => s.prioridad === "urgente");

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-mist-deep bg-white p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Todavía no hay solicitudes
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Cuando faena pida algo, se carga acá con sus ítems y queda esperando la
          aprobación del administrador de contrato.
        </p>
      </div>
    );
  }

  return (
    <>
      <Resumen
        datos={[
          {
            etiqueta: "Esperando aprobación",
            valor: String(porAprobar.length),
            nota: porAprobar.length === 0 ? "Nada pendiente de firma" : "No se puede cotizar hasta que se firmen",
            acento: porAprobar.length > 0 ? "aviso" : "bueno",
          },
          {
            etiqueta: "Abiertas",
            valor: String(abiertas.length),
            nota: `de ${filas.length} solicitudes en total`,
          },
          {
            etiqueta: "Trabadas",
            valor: String(trabadas.length),
            nota: "Más de 7 días sin cerrarse",
            acento: trabadas.length > 0 ? "critico" : "bueno",
          },
          {
            etiqueta: "Urgentes",
            valor: String(urgentes.length),
            nota: "Marcadas como urgentes y todavía abiertas",
            acento: urgentes.length > 0 ? "aviso" : undefined,
          },
        ]}
      />

      <Panel
        titulo="Detalle"
        nota={`${visibles.length} de ${filas.length} solicitudes`}
        filtros={
          <Filtro etiqueta="Estado" opciones={opciones} valor={filtro} alCambiar={setFiltro} />
        }
      >
        <Tabla
          columnas={columnas(edicion, alFirmar, alVerExpediente, alCotizar, permisos)}
          filas={visibles}
          claveDe={(s) => s.id}
          vacio="Ninguna solicitud en este estado."
        />
      </Panel>
    </>
  );
}

const columnas = (
  edicion: ReturnType<typeof useEdicion<Solped>>,
  alFirmar: (s: Solped) => void,
  alVerExpediente: (s: Solped) => void,
  alCotizar: (s: Solped) => void,
  permisos: { enviar: boolean; aprobar: boolean },
): Columna<Solped>[] => [
  {
    clave: "numero",
    titulo: "Solicitud",
    encabezado: true,
    celda: (s) => (
      <button
        type="button"
        onClick={() => alVerExpediente(s)}
        className="text-left"
        title="Ver el expediente completo"
      >
        <span className="block font-semibold text-ink underline decoration-mist-deep underline-offset-4 hover:decoration-ink">
          {s.numero}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{s.contratoId}</span>
      </button>
    ),
  },
  {
    clave: "solicita",
    titulo: "Solicita",
    celda: (s) => (
      <>
        <span className="block text-ink">{s.solicitanteNombre}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {[s.solicitanteCargo, s.area].filter(Boolean).join(" · ") || "—"}
        </span>
      </>
    ),
  },
  {
    clave: "items",
    titulo: "Ítems",
    derecha: true,
    celda: (s) => (
      <>
        <span className="block text-ink">{formatearNumero(s.items)}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {formatearNumero(s.cantidadPedida)} un
        </span>
      </>
    ),
  },
  {
    clave: "requerida",
    titulo: "Requerida",
    celda: (s) => (
      <span className="whitespace-nowrap text-ink-soft">{formatearFecha(s.fechaRequerida)}</span>
    ),
  },
  {
    clave: "dias",
    titulo: "Abierta",
    derecha: true,
    celda: (s) => {
      if (CERRADAS.includes(s.estado)) return <span className="text-ink-soft">—</span>;
      const alerta = s.diasAbierta > 7;
      return (
        <span className={alerta ? "font-semibold text-[#a52f24]" : "text-ink-soft"}>
          {s.diasAbierta} d
        </span>
      );
    },
  },
  {
    clave: "estado",
    titulo: "Estado",
    celda: (s) => (
      <>
        <Chip tono={tonos[s.estado]}>{nombreEstadoSolped[s.estado]}</Chip>
        {s.prioridad !== "normal" && (
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-[#8a5a09]">
            {s.prioridad}
          </span>
        )}
      </>
    ),
  },
  {
    clave: "acciones",
    titulo: "",
    derecha: true,
    celda: (s) => (
      <div className="flex items-center justify-end gap-1">
        {["aprobada", "en-cotizacion", "cotizada"].includes(s.estado) && (
          <button
            type="button"
            onClick={() => alCotizar(s)}
            className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Cotizar
          </button>
        )}
        {((s.estado === "borrador" && permisos.enviar) ||
          (s.estado === "en-aprobacion" && permisos.aprobar)) && (
          <button
            type="button"
            onClick={() => alFirmar(s)}
            className="rounded-full border border-mist-deep px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {s.estado === "borrador" ? "Enviar a aprobación" : "Autorizar"}
          </button>
        )}
        <AccionesFila
          permiso="solped.crear"
          alEditar={() => edicion.abrirEdicion(s)}
          alVerHistorial={() => edicion.verHistorial(s.id, `${s.numero} · ${s.contrato}`)}
          alVerAdjuntos={() => edicion.verAdjuntos(s.id, `${s.numero} · ${s.contrato}`)}
          cuantosAdjuntos={edicion.cuantosAdjuntos(s.id)}
        />
      </div>
    ),
  },
];

/* ── Firmar ───────────────────────────────────────────────────────────────── */

/**
 * Enviar a aprobación y autorizar.
 *
 * Son dos cosas distintas y por eso el diálogo cambia: enviar solo mueve el
 * estado; autorizar deja una firma con nombre, cargo y motivo, que no se puede
 * editar ni borrar después. La base además exige que quien firma tenga rol de
 * administrador de contrato o de gerencia.
 */
function DialogoAprobacion({
  solped,
  alCerrar,
  alFirmado,
}: {
  solped: Solped;
  alCerrar: () => void;
  alFirmado: () => void;
}) {
  const usuario = useUsuario();
  const enviando = solped.estado === "borrador";
  const { estado } = useConsulta<Aprobacion[]>(() => cargarAprobaciones("solped", solped.id));

  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Firma quien tenga el permiso, sea cual sea su cargo. La base lo vuelve a
  // revisar al guardar la firma (`puede_aprobar`).
  const puedeFirmar = puede(usuario, "solped.aprobar");

  async function ejecutar(accion: "aprobado" | "rechazado" | "enviar") {
    setError(null);
    setProcesando(true);
    try {
      if (accion === "enviar") {
        await actualizar("solped", solped.id, { estado: "en-aprobacion" });
      } else {
        await firmar({
          documento: "solped",
          registroId: solped.id,
          monto: null,
          accion,
          usuario: { id: usuario.id, nombre: usuario.nombre, cargo: usuario.cargo, rol: usuario.rol },
          comentario,
        });
        await actualizar("solped", solped.id, {
          estado: accion === "aprobado" ? "aprobada" : "rechazada",
        });
      }
      alFirmado();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialogo
      titulo={enviando ? "Enviar a aprobación" : `Autorizar ${solped.numero}`}
      descripcion={`${solped.numero} · ${solped.contrato} · ${solped.items} ítems`}
      abierto
      alCerrar={alCerrar}
      ancho="max-w-xl"
    >
      <div className="px-6 py-6">
        {enviando ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            La solicitud queda esperando la firma del administrador de contrato. Hasta
            entonces no se puede salir a cotizar.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Lo que se autoriza acá es la <strong className="text-ink">necesidad</strong>: si
              hace falta comprar esto o no. El monto se autoriza después, cuando haya
              cotizaciones y se sepa cuánto cuesta.
            </p>

            {!puedeFirmar && (
              <p className="mt-4 rounded-xl bg-[#fdf4e6] px-4 py-3 text-sm text-[#8a5a09]">
                Tu acceso no incluye <strong>Aprobar solicitudes</strong>. Pídeselo al
                administrador de Abastecimiento.
              </p>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                Comentario
              </span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                placeholder="Se aprueba con cargo al presupuesto de EPP del mes."
                className="mt-2 w-full rounded-xl border border-mist-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-cyan"
              />
              <span className="mt-1.5 block text-xs text-ink-soft">
                Queda guardado con tu nombre y la hora. Una firma no se edita después.
              </span>
            </label>
          </>
        )}

        {estado.estado === "listo" && estado.datos.length > 0 && (
          <div className="mt-6 border-t border-mist pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Firmas anteriores
            </h4>
            <ul className="mt-3 flex flex-col gap-2">
              {estado.datos.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-semibold text-ink">
                    {a.accion === "aprobado" ? "Aprobó" : a.accion === "rechazado" ? "Rechazó" : "Devolvió"}
                  </span>{" "}
                  <span className="text-ink-soft">
                    {a.usuarioNombre}
                    {a.usuarioCargo ? ` · ${a.usuarioCargo}` : ""} ·{" "}
                    {new Date(a.ocurridoEn).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {a.comentario && (
                    <span className="mt-0.5 block text-ink-soft">“{a.comentario}”</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#fdeeec] px-4 py-3 text-sm font-medium text-[#a52f24]"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-mist px-6 py-5">
        <button
          type="button"
          onClick={alCerrar}
          disabled={procesando}
          className="rounded-full border border-mist-deep px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>

        {enviando ? (
          <button
            type="button"
            onClick={() => void ejecutar("enviar")}
            disabled={procesando}
            className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
          >
            {procesando ? "Enviando…" : "Enviar a aprobación"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void ejecutar("rechazado")}
              disabled={procesando || !puedeFirmar}
              className="rounded-full border border-[#e2b8b2] px-5 py-2.5 text-sm font-semibold text-[#a52f24] transition-colors hover:bg-[#fdeeec] disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => void ejecutar("aprobado")}
              disabled={procesando || !puedeFirmar}
              className="rounded-full bg-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
            >
              {procesando ? "Firmando…" : "Aprobar"}
            </button>
          </>
        )}
      </div>
    </Dialogo>
  );
}
