"use client";

import { SelectorAnexo } from "../ui/SelectorAnexo";
import { useEffect, useState } from "react";

import {
  Ancho,
  CampoDinero,
  CampoFecha,
  CampoNumero,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  ResumenIva,
  ivaDe,
  useBorrado,
  useFormulario,
} from "../ui/Formulario";
import { CamposDelContrato } from "../ui/CamposDelContrato";
import { LineasDeServicio } from "./LineasDeServicio";
import { actualizar, crear } from "@/lib/crud";
import type { CampoContrato, Datos } from "@/lib/campos";
import { categoriasDe, opcionesDeCategoria, type Categoria } from "@/lib/categorias";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { formatearPesos } from "@/lib/formato";
import {
  cargarLineasDeServicio,
  guardarLineasDeServicio,
  periodicidades,
  siguienteIdServicio,
  tiposCompra,
  tiposServicio,
  type LineaServicio,
  type Servicio,
  type Periodicidad,
  type TipoCompra,
  type TipoServicio,
} from "@/lib/egresos";

const estadosPago = [
  { id: "pendiente" as const, titulo: "Pendiente de pago" },
  { id: "pagada" as const, titulo: "Pagada" },
];

const hoy = () => new Date().toISOString().slice(0, 10);

/** La fecha ISO más `dias` días, sin pasar por la zona horaria. */
const sumarDias = (iso: string, dias: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

type Borrador = {
  /** El anexo al que se carga; vacío = contrato base. */
  anexo_id: string;
  id: string;
  contrato_id: string;
  categoria_id: string;
  contratista: string;
  documento: string;
  detalle: string;
  tipo_servicio: TipoServicio;
  tipo: TipoCompra;
  neto: number;
  iva: number;
  fecha: string;
  desde: string;
  hasta: string;
  recurrente: boolean;
  periodicidad: Periodicidad | "";
  estado_pago: "pendiente" | "pagada";
  /* Factura y pago a plazo (0072): el gasto cuenta en `fecha`; el plazo corre desde la factura. */
  fecha_factura: string;
  plazo_dias: number;
  fecha_vencimiento: string;
  fecha_pago: string;
};

function borradorDe(s: Servicio | null, contratos: ContratoBreve[]): Borrador {
  if (!s) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      anexo_id: "",
      categoria_id: "",
      contratista: "",
      documento: "",
      detalle: "",
      tipo_servicio: "subcontrato",
      tipo: "ordinario",
      neto: 0,
      iva: 0,
      fecha: hoy(),
      desde: "",
      hasta: "",
      recurrente: false,
      periodicidad: "",
      estado_pago: "pendiente",
      fecha_factura: "",
      plazo_dias: 30,
      fecha_vencimiento: "",
      fecha_pago: "",
    };
  }
  return {
    id: s.id,
    contrato_id: s.contratoId,
    anexo_id: s.anexoId ?? "",
    categoria_id: s.categoriaId ?? "",
    contratista: s.contratista,
    documento: s.documento ?? "",
    detalle: s.detalle,
    tipo_servicio: s.tipoServicio,
    tipo: s.tipo,
    neto: s.neto,
    iva: s.iva,
    fecha: s.fecha,
    desde: s.desde ?? "",
    hasta: s.hasta ?? "",
    recurrente: s.recurrente,
    periodicidad: s.periodicidad ?? "",
    estado_pago: s.estadoPago,
    fecha_factura: s.fechaFactura ?? "",
    plazo_dias: s.plazoDias,
    fecha_vencimiento: s.fechaVencimiento ?? "",
    fecha_pago: s.fechaPago ?? "",
  };
}

export function FormularioServicio({
  servicio,
  contratos,
  campos,
  categorias,
  alCerrar,
  alGuardado,
}: {
  servicio: Servicio | null;
  contratos: ContratoBreve[];
  /** La planilla propia de cada contrato. */
  campos: CampoContrato[];
  /** Las categorías de costo, propias de cada contrato. */
  categorias: Categoria[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(servicio, contratos));
  const editando = servicio !== null;
  const [propios, setPropios] = useState<Datos>(servicio?.datos ?? {});
  /* Detalle por equipo (0071), opcional. Con líneas, el neto es su suma. */
  const [lineas, setLineas] = useState<LineaServicio[]>([]);
  const [teniaLineas, setTeniaLineas] = useState(false);
  useEffect(() => {
    if (!servicio) return;
    let vigente = true;
    cargarLineasDeServicio(servicio.id)
      .then((ls) => {
        if (!vigente) return;
        setLineas(ls);
        setTeniaLineas(ls.length > 0);
      })
      // Sin la migración 0071 el formulario sigue funcionando, sin detalle.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
    // Solo al abrir: el servicio no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarLineas(ls: LineaServicio[]) {
    setLineas(ls);
    if (ls.some((l) => l.equipo.trim())) {
      f.cambiar("neto", ls.filter((l) => l.equipo.trim()).reduce((t, l) => t + l.neto, 0));
    }
  }

  const borrado = useBorrado("servicios", servicio?.id, () => {
    alGuardado();
    alCerrar();
  });

  const propias = categoriasDe(categorias, f.datos.contrato_id, "servicios");

  /* El IVA no se escribe: es el 19% del neto. No lleva si la categoría no es
     afecta (como en Compras) o si se marca exento (boleta de honorarios, por
     ejemplo). Un servicio guardado con neto y sin IVA se abre como exento. */
  const categoria = propias.find((c) => c.id === f.datos.categoria_id);
  const categoriaAfecta = categoria?.afectaIva ?? true;
  const [exento, setExento] = useState(servicio !== null && servicio.neto > 0 && servicio.iva === 0);
  const afecto = categoriaAfecta && !exento;

  /* Cambiar de contrato deja seleccionada una categoría que el nuevo no tiene.
     Se limpia. */
  function elegirContrato(id: string) {
    if (id !== f.datos.contrato_id) setPropios({});
    f.cambiar("contrato_id", id);
    if (!categoriasDe(categorias, id, "servicios").some((c) => c.id === f.datos.categoria_id)) {
      f.cambiar("categoria_id", "");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (f.datos.desde && f.datos.hasta && f.datos.hasta < f.datos.desde) {
      f.setError("La fecha de término del servicio debe ser igual o posterior al inicio.");
      return;
    }
    const { id, ...campos } = f.datos;
    const fila = {
      ...campos,
      iva: ivaDe(campos.neto, afecto),
      datos: propios,
      categoria_id: campos.categoria_id || null,
      anexo_id: campos.anexo_id || null,
      documento: campos.documento.trim() || null,
      desde: campos.desde || null,
      hasta: campos.hasta || null,
      fecha_factura: campos.fecha_factura || null,
      fecha_vencimiento: campos.fecha_vencimiento || null,
      // Pagado sin fecha escrita: se toma hoy.
      fecha_pago: campos.estado_pago === "pagada" ? campos.fecha_pago || hoy() : null,
      // Sin recurrencia no hay periodicidad que guardar.
      periodicidad: campos.recurrente ? campos.periodicidad || "mensual" : null,
    };

    f.enviar(
      async () => {
        // El código no se teclea: es el siguiente correlativo del contrato.
        const servicioId = editando ? servicio.id : id.trim() || (await siguienteIdServicio(campos.contrato_id));
        if (editando) await actualizar("servicios", servicio.id, fila);
        else await crear("servicios", { ...fila, id: servicioId });
        if (lineas.length > 0 || teniaLineas) await guardarLineasDeServicio(servicioId, campos.contrato_id, lineas);
      },
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar servicio" : "Nuevo servicio"}
        descripcion={
          editando
            ? `${servicio.id} · cada cambio queda registrado con tu nombre y la hora.`
            : "Subcontratos, arriendos y servicios de terceros. Van al costo del contrato igual que las compras."
        }
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={onSubmit}>
          <Campos>
            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              opciones={opcionesDeContrato(contratos)}
              valor={f.datos.contrato_id}
              alCambiar={elegirContrato}
            />
            <SelectorAnexo contratoId={f.datos.contrato_id} valor={f.datos.anexo_id} alCambiar={(v) => f.cambiar("anexo_id", v)} />

            {/* La lista sale de la planilla del contrato: Torres tiene "Torres"
                y "Camioneta"; Misceláneos tiene "Traslado de Personal". */}
            <CampoSeleccion
              etiqueta="Categoría de costo"
              requerido
              opciones={opcionesDeCategoria(categorias, f.datos.contrato_id, "servicios")}
              ayuda={
                propias.length === 0
                  ? "Este contrato todavía no tiene categorías de servicios definidas."
                  : "En qué línea de la planilla entra este gasto."
              }
              {...f.campo("categoria_id")}
            />

            <CampoTexto
              etiqueta="Contratista"
              requerido
              marcador="Layher Chile"
              {...f.campo("contratista")}
            />

            <CampoSeleccion
              etiqueta="Clase de servicio"
              requerido
              opciones={tiposServicio}
              ayuda="Para saber cuánto de la obra se ejecuta con terceros."
              {...f.campo("tipo_servicio")}
            />

            <CampoSeleccion
              etiqueta="Tipo de gasto"
              requerido
              opciones={tiposCompra}
              ayuda={
                f.datos.tipo === "reembolsable"
                  ? "No suma al costo real del contrato: se le cobra al mandante."
                  : "Suma al costo real del contrato y descuenta del presupuesto."
              }
              {...f.campo("tipo")}
            />

            <CampoTexto
              etiqueta="N° de documento"
              marcador="EDP 9, OC22-001150 o factura"
              ayuda="Opcional. Puede ser el estado de pago, la orden de compra o la factura; se completa cuando llegue."
              {...f.campo("documento")}
            />

            <Ancho>
              <CampoTexto
                etiqueta="Detalle"
                requerido
                marcador="Montaje y desmontaje de andamios"
                {...f.campo("detalle")}
              />
            </Ancho>

            {lineas.some((l) => l.equipo.trim()) ? (
              <div>
                <p className="text-sm font-semibold text-ink">Neto</p>
                <p className="mt-2 font-display text-lg font-semibold tabular-nums text-ink">
                  {formatearPesos(f.datos.neto)}
                </p>
                <p className="mt-1.5 text-xs text-ink-soft">Suma del detalle por equipo, abajo.</p>
              </div>
            ) : (
              <CampoDinero
                etiqueta="Neto"
                ayuda="Déjalo en 0 si aún no llega el estado de pago: el gasto queda registrado en el mes y lo completas después."
                {...f.campo("neto")}
              />
            )}

            <CampoFecha
              etiqueta="Fecha del gasto"
              requerido
              ayuda="El gasto cuenta en el mes de esta fecha, aunque la factura llegue después y se pague a 30 días."
              {...f.campo("fecha")}
            />

            <CampoSeleccion
              etiqueta="Estado de pago"
              opciones={estadosPago}
              {...f.campo("estado_pago")}
            />

            {/* El gasto ya cuenta en el mes de arriba. Acá se controla el pago: el
                plazo corre desde la fecha de la factura, que llega después. */}
            <CampoFecha
              etiqueta="Fecha de la factura"
              ayuda="Cuando llegue la factura. Mientras no esté, el servicio figura «factura pendiente»."
              valor={f.datos.fecha_factura}
              alCambiar={(v) =>
                f.setDatos((d) => ({
                  ...d,
                  fecha_factura: v,
                  fecha_vencimiento: v ? sumarDias(v, d.plazo_dias) : "",
                }))
              }
            />
            <CampoNumero
              etiqueta="Plazo de pago (días)"
              min={0}
              ayuda="Desde la fecha de la factura. Normalmente 30."
              valor={f.datos.plazo_dias}
              alCambiar={(v) =>
                f.setDatos((d) => ({
                  ...d,
                  plazo_dias: v,
                  fecha_vencimiento: d.fecha_factura ? sumarDias(d.fecha_factura, v) : d.fecha_vencimiento,
                }))
              }
            />
            <CampoFecha
              etiqueta="Vence"
              ayuda="Se calcula sola con la factura y el plazo; corrígela si el contratista pactó otra."
              {...f.campo("fecha_vencimiento")}
            />
            {f.datos.estado_pago === "pagada" && (
              <CampoFecha etiqueta="Fecha de pago" ayuda="Si la dejas vacía se toma hoy." {...f.campo("fecha_pago")} />
            )}

            <CampoFecha
              etiqueta="Servicio desde"
              ayuda="Opcional. Un subcontrato cubre un tramo, no un día."
              {...f.campo("desde")}
            />

            <CampoFecha etiqueta="Servicio hasta" {...f.campo("hasta")} />

            <ResumenIva
              neto={f.datos.neto}
              afecto={afecto}
              alCambiarAfecto={categoriaAfecta ? (v) => setExento(!v) : undefined}
              nota={categoriaAfecta ? undefined : `La categoría ${categoria?.nombre ?? ""} no lleva IVA.`}
            />
            <Ancho>
              <label className="flex items-start gap-3 rounded-xl border border-mist-deep bg-mist/30 px-4 py-3">
                <input
                  type="checkbox"
                  checked={f.datos.recurrente}
                  onChange={(e) => f.setDatos((d) => ({ ...d, recurrente: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-mist-deep accent-cyan"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    Es un gasto recurrente
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    Un arriendo se repite todos los meses mientras dure; un flete puntual no.
                    Marcarlo permite separar el gasto que va a volver del que no.
                  </span>
                </span>
              </label>
            </Ancho>

            {f.datos.recurrente && (
              <CampoSeleccion
                etiqueta="Cada cuánto"
                opciones={periodicidades}
                ayuda="Con qué frecuencia se repite mientras dure el período."
                {...f.campo("periodicidad")}
              />
            )}

            <CamposDelContrato
              campos={campos}
              contratoId={f.datos.contrato_id}
              seccion="servicios"
              datos={propios}
              alCambiar={setPropios}
            />
          </Campos>

          <LineasDeServicio
            lineas={lineas}
            alCambiar={cambiarLineas}
            contratoId={f.datos.contrato_id}
            contratista={f.datos.contratista}
            fecha={f.datos.fecha}
            servicioId={servicio?.id}
            faenaPorDefecto={contratos.find((c) => c.id === f.datos.contrato_id)?.faena ?? ""}
          />

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear servicio"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar servicio"
        detalle={`Se va a eliminar ${servicio?.id ?? ""} — ${servicio?.contratista ?? ""}. El costo del contrato se recalcula sin él.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
