"use client";

import { useEffect, useState } from "react";
import {
  Ancho,
  CampoFecha,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  useBorrado,
  useFormulario,
} from "../ui/Formulario";
import { Etiqueta } from "../ui/Chip";
import { Combo } from "../ui/Combo";
import {
  condicionDeProveedor,
  formatearRut,
  opcionesCondicionPago,
  type Proveedor,
} from "@/lib/abastecimiento";
import { cargarAnexos, proyectoDeAnexo, type Anexo } from "@/lib/anexos";
import { SelectorAnexo } from "../ui/SelectorAnexo";
import { actualizar, crear, eliminar } from "@/lib/crud";
import { opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { tiposCompra } from "@/lib/egresos";
import { emisorOC } from "@/lib/empresa";
import { formatearPesos } from "@/lib/formato";
import {
  cargarLineasDeOrden,
  estadosOrden,
  siguienteNumero,
  ultimoTelefonoDeEmisor,
  type EstadoOrden,
  type Orden,
} from "@/lib/ordenes";
import { leerPegado, type FilaPegada } from "@/lib/pegado";
import { CampoConPagnol, unidadDesdePagnol } from "../ui/CampoConPagnol";
import type { Usuario } from "@/lib/sesion";

/**
 * Alta y edición de una orden de compra, con sus ítems en la misma pantalla.
 *
 * Los ítems se editan acá y no en un diálogo aparte porque una OC sin sus
 * líneas no significa nada: el monto, el IVA y el total salen de ellas.
 */

const hoy = () => new Date().toISOString().slice(0, 10);

type BorradorOrden = {
  id: string;
  contrato_id: string;
  numero: string;
  proyecto: string;
  /** Contra qué anexo se compra (0059); vacío = contrato base. */
  anexo_id: string;
  proveedor_id: string;
  proveedor: string;
  rut_proveedor: string;
  direccion_proveedor: string;
  ciudad_proveedor: string;
  comuna_proveedor: string;
  contacto: string;
  correo_contacto: string;
  telefono_contacto: string;
  emisor_nombre: string;
  emisor_correo: string;
  emisor_telefono: string;
  fecha_emision: string;
  fecha_requerida: string;
  lugar_entrega: string;
  condiciones_pago: string;
  solicitado_por: string;
  retira: string;
  estado: EstadoOrden;
  observaciones: string;
};

/** Línea en edición. Vive en memoria hasta que se guarda la orden. */
type Linea = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  tipo: "ordinario" | "reembolsable";
  categoria_id: string;
  /** El material en Pagnol, si se eligió de su catálogo. Solo la referencia. */
  pagnol_material_id: string;
  /** Su código, para mostrarlo bajo la descripción mientras se edita. */
  pagnol_codigo: string;
  /** Los que ya existen en la base se actualizan; los nuevos se insertan. */
  nuevo: boolean;
};

function borradorDe(
  orden: Orden | null,
  contratos: ContratoBreve[],
  usuario: Usuario,
  registrar: boolean,
): BorradorOrden {
  if (!orden) {
    return {
      id: "",
      contrato_id: contratos[0]?.id ?? "",
      numero: "",
      proyecto: "",
      anexo_id: "",
      proveedor_id: "",
      proveedor: "",
      rut_proveedor: "",
      direccion_proveedor: "",
      ciudad_proveedor: "",
      comuna_proveedor: "",
      contacto: "",
      correo_contacto: "",
      telefono_contacto: "",
      // Quien emite es quien tiene la sesión abierta: crear una OC ya exige el
      // permiso, así que no hay nada que elegir. Solo el teléfono se escribe.
      emisor_nombre: usuario.nombre,
      emisor_correo: usuario.correo,
      emisor_telefono: "",
      fecha_emision: hoy(),
      fecha_requerida: "",
      lugar_entrega: "",
      condiciones_pago: emisorOC.condicionesPagoPorDefecto,
      solicitado_por: "",
      retira: "",
      // La que ya se mandó desde la planilla de Drive no pasa por borrador.
      estado: registrar ? "emitida" : "borrador",
      observaciones: "",
    };
  }
  return {
    id: orden.id,
    contrato_id: orden.contratoId,
    numero: orden.numero,
    proyecto: orden.proyecto ?? "",
    anexo_id: orden.anexoId ?? "",
    proveedor_id: orden.proveedorId ?? "",
    proveedor: orden.proveedor,
    rut_proveedor: orden.rutProveedor ?? "",
    direccion_proveedor: orden.direccionProveedor ?? "",
    ciudad_proveedor: orden.ciudadProveedor ?? "",
    comuna_proveedor: orden.comunaProveedor ?? "",
    contacto: orden.contacto ?? "",
    correo_contacto: orden.correoContacto ?? "",
    telefono_contacto: orden.telefonoContacto ?? "",
    // Una orden ya emitida conserva a quien la emitió. Las anteriores a este
    // campo, que lo tienen vacío, lo toman de quien la está corrigiendo.
    emisor_nombre: orden.emisorNombre || usuario.nombre,
    emisor_correo: orden.emisorNombre ? orden.emisorCorreo ?? "" : usuario.correo,
    emisor_telefono: orden.emisorTelefono ?? "",
    fecha_emision: orden.fechaEmision,
    fecha_requerida: orden.fechaRequerida ?? "",
    lugar_entrega: orden.lugarEntrega ?? "",
    condiciones_pago: orden.condicionesPago ?? "",
    solicitado_por: orden.solicitadoPor ?? "",
    retira: orden.retira ?? "",
    estado: orden.estado,
    observaciones: orden.observaciones ?? "",
  };
}

function lineaVacia(n: number): Linea {
  return {
    id: `nueva-${n}-${Date.now()}`,
    descripcion: "",
    unidad: "UN",
    cantidad: 1,
    precio_unitario: 0,
    tipo: "ordinario",
    categoria_id: "",
    pagnol_material_id: "",
    pagnol_codigo: "",
    nuevo: true,
  };
}

function lineaPegada(fila: FilaPegada, n: number): Linea {
  return {
    ...lineaVacia(n),
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    cantidad: fila.cantidad,
    precio_unitario: fila.precioUnitario,
  };
}

export function FormularioOrden({
  orden,
  contratos,
  categorias,
  proveedores,
  usuario,
  registrar = false,
  alCerrar,
  alGuardado,
}: {
  orden: Orden | null;
  contratos: ContratoBreve[];
  categorias: { id: string; nombre: string; contratoId: string }[];
  /** El maestro de Abastecimiento: de acá se copian los datos del proveedor. */
  proveedores: Proveedor[];
  usuario: Usuario;
  /** Registrar una OC que ya se emitió fuera de la plataforma (la planilla de
      Drive): nace emitida y el número se escribe como está en el PDF. */
  registrar?: boolean;
  alCerrar: () => void;
  /** Con el código interno de la orden, para poder adjuntarle el PDF. */
  alGuardado: (ordenId?: string) => void;
}) {
  const f = useFormulario<BorradorOrden>(borradorDe(orden, contratos, usuario, registrar));
  const editando = orden !== null;
  // Una orden nueva arranca con una línea en blanco. Se hace en el
  // inicializador y no en el efecto: llamar a setState en el cuerpo de un
  // efecto provoca un render en cascada.
  const [lineas, setLineas] = useState<Linea[]>(orden ? [] : [lineaVacia(0)]);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const borrado = useBorrado("ordenes_compra_proveedor", orden?.id, () => {
    alGuardado();
    alCerrar();
  });

  // Al abrir: si es nueva, se propone el número siguiente y una línea en
  // blanco. Si es existente, se traen sus ítems.
  useEffect(() => {
    let vigente = true;

    if (orden) {
      cargarLineasDeOrden(orden.id).then((items) => {
        if (!vigente) return;
        setLineas(
          items.map((i) => ({
            id: i.id,
            descripcion: i.descripcion,
            unidad: i.unidad,
            cantidad: i.cantidad,
            precio_unitario: i.precioUnitario,
            tipo: i.tipo,
            categoria_id: i.categoriaId ?? "",
            pagnol_material_id: i.pagnolMaterialId ?? "",
            pagnol_codigo: "",
            nuevo: false,
          })),
        );
      });
    } else {
      siguienteNumero().then((n) => {
        if (vigente && n) f.setDatos((d) => (d.numero ? d : { ...d, numero: n }));
      });
      ultimoTelefonoDeEmisor(usuario.correo).then((t) => {
        if (vigente && t) f.setDatos((d) => (d.emisor_telefono ? d : { ...d, emisor_telefono: t }));
      });
    }

    return () => {
      vigente = false;
    };
    // Solo al montar: `orden` no cambia mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Los anexos del contrato elegido. Se piden al cambiar de contrato porque son
     pocos y cambian poco; guardarlos todos en memoria sería cargar los de
     contratos que nadie va a mirar. */
  const [anexos, setAnexos] = useState<{ contratoId: string; lista: Anexo[] }>({
    contratoId: "",
    lista: [],
  });
  useEffect(() => {
    const contratoId = f.datos.contrato_id;
    if (!contratoId) return;

    let vigente = true;
    cargarAnexos(contratoId)
      .then((lista) => vigente && setAnexos({ contratoId, lista }))
      .catch(() => vigente && setAnexos({ contratoId, lista: [] }));

    return () => {
      vigente = false;
    };
  }, [f.datos.contrato_id]);


  /* El código interno no se teclea: es el contrato y el correlativo del número.
     Escribirlo a mano es la forma más común de terminar con dos órdenes con el
     mismo código, o con uno que no calza con ningún contrato. Es la misma regla
     con que se arma la orden que nace de una cotización. */
  const codigoInterno = f.datos.numero
    ? `OCP-${f.datos.contrato_id.replace(/^C-/, "")}-${f.datos.numero.replace(/\D/g, "").slice(-6)}`
    : "";

  /* Elegir proveedor copia su ficha adentro de la orden, incluida la forma de
     pago: es lo que hace que no haya que teclear ocho campos que la plataforma
     ya sabe. */
  function elegirProveedor(id: string) {
    const p = proveedores.find((x) => x.id === id);
    f.setDatos((d) => ({
      ...d,
      proveedor_id: id,
      proveedor: p?.razonSocial ?? "",
      rut_proveedor: p?.rut ?? "",
      direccion_proveedor: p?.direccion ?? "",
      ciudad_proveedor: p?.ciudad ?? "",
      comuna_proveedor: p?.comuna ?? "",
      contacto: p?.contacto ?? "",
      correo_contacto: p?.correoPago ?? p?.correo ?? "",
      telefono_contacto: p?.telefono ?? "",
      condiciones_pago: p ? condicionDeProveedor(p) : d.condiciones_pago,
    }));
  }

  const delContrato = categorias.filter((c) => c.contratoId === f.datos.contrato_id);
  const opcionesCategoria = [
    { id: "", titulo: "— Sin categoría —" },
    ...delContrato.map((c) => ({ id: c.id, titulo: c.nombre })),
  ];

  const neto = lineas.reduce((t, l) => t + Math.round(l.cantidad * l.precio_unitario), 0);
  const iva = Math.round(neto * 0.19);
  const reembolsable = lineas
    .filter((l) => l.tipo === "reembolsable")
    .reduce((t, l) => t + Math.round(l.cantidad * l.precio_unitario), 0);

  function cambiar(id: string, campo: keyof Linea, valor: unknown) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function quitar(linea: Linea) {
    if (!linea.nuevo) setEliminadas((e) => [...e, linea.id]);
    setLineas((ls) => ls.filter((l) => l.id !== linea.id));
  }

  /* Pegar filas de la planilla. Las líneas en blanco se descartan —la orden
     nueva arranca con una— y las pegadas van al final de las que ya tienen algo. */
  const [pegando, setPegando] = useState(false);
  const [textoPegado, setTextoPegado] = useState("");
  const filasPegadas = leerPegado(textoPegado);

  function agregarPegadas(filas: FilaPegada[]) {
    setLineas((ls) => {
      const conAlgo = ls.filter((l) => l.descripcion.trim() || !l.nuevo);
      return [...conAlgo, ...filas.map((fila, i) => lineaPegada(fila, conAlgo.length + i))];
    });
    setTextoPegado("");
    setPegando(false);
  }

  /** Pegar varias celdas directo en una descripción también sirve. */
  function alPegarEnCelda(e: React.ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text");
    if (!texto.includes("\t") && !texto.includes("\n")) return;
    const filas = leerPegado(texto);
    if (filas.length === 0) return;
    e.preventDefault();
    agregarPegadas(filas);
  }

  /** Lo que se elige acá se aplica a todas las líneas; después se corrigen las excepciones. */
  function aplicarATodas(campo: "categoria_id" | "tipo", valor: string) {
    setLineas((ls) => ls.map((l) => ({ ...l, [campo]: valor })));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ordenId = editando ? orden.id : codigoInterno;

    // Los campos de fecha vacíos van nulos: una cadena vacía no es una fecha.
    // El proyecto vacío también: significa "contrato base", y lo que se imprime
    // en ese caso lo resuelve la orden con el nombre del contrato.
    const cabecera = {
      ...f.datos,
      id: ordenId,
      fecha_requerida: f.datos.fecha_requerida || null,
      // Lo impreso en «Proyecto» sale del anexo elegido; sin anexo, la base.
      anexo_id: f.datos.anexo_id || null,
      proyecto: (() => {
        const anexo = anexos.lista.find((a) => a.id === f.datos.anexo_id);
        return anexo ? proyectoDeAnexo(anexo) : null;
      })(),
      proveedor_id: f.datos.proveedor_id || null,
    };

    f.enviar(async () => {
      if (editando) await actualizar("ordenes_compra_proveedor", orden.id, cabecera);
      else await crear("ordenes_compra_proveedor", cabecera);

      for (const borrada of eliminadas) await eliminar("items_compra", borrada);

      let n = 0;
      for (const l of lineas) {
        if (!l.descripcion.trim()) continue;
        n += 1;
        const fila = {
          contrato_id: cabecera.contrato_id,
          orden_id: ordenId,
          categoria_id: l.categoria_id || null,
          pagnol_material_id: l.pagnol_material_id || null,
          descripcion: l.descripcion.trim(),
          unidad: l.unidad || "UN",
          cantidad: l.cantidad || 1,
          precio_unitario: l.precio_unitario,
          // El IVA de la línea sigue la regla general; si una partida fuera
          // exenta, se corrige después en el detalle del ítem.
          iva: Math.round(l.cantidad * l.precio_unitario * 0.19),
          tipo: l.tipo,
        };

        if (l.nuevo) {
          await crear("items_compra", {
            ...fila,
            id: `IT-${ordenId}-${String(n).padStart(3, "0")}`,
          });
        } else {
          await actualizar("items_compra", l.id, fila);
        }
      }
    }, () => {
      alGuardado(ordenId);
      alCerrar();
    });
  }

  return (
    <>
      <Dialogo
        titulo={editando ? `Orden ${orden.numero}` : registrar ? "Registrar OC emitida" : "Nueva orden de compra"}
        descripcion={
          editando
            ? "El estado se actualiza solo según lo que se vaya recibiendo y facturando."
            : registrar
              ? "Para la OC que ya se emitió desde la planilla de Drive. Escribe el número como aparece en el PDF y pega sus ítems; al guardar se abre para adjuntar el PDF."
              : "El número viene propuesto con el siguiente de la serie. Puedes cambiarlo."
        }
        abierto
        alCerrar={alCerrar}
        ancho="max-w-5xl"
      >
        <form onSubmit={onSubmit}>
          <Campos>
            <CampoTexto
              etiqueta="N° de orden"
              requerido
              marcador="OC22-001129"
              ayuda={
                editando
                  ? "El número que ve el proveedor."
                  : `El número que ve el proveedor. El código interno se arma solo: ${codigoInterno || "…"}`
              }
              {...f.campo("numero")}
            />

            <CampoSeleccion
              etiqueta="Contrato"
              requerido
              ayuda="El centro de costo de la compra. De acá sale lo que se imprime como proyecto."
              opciones={opcionesDeContrato(contratos)}
              {...f.campo("contrato_id")}
            />

            {/* El proyecto impreso NO se pregunta: el CECO es el contrato. Solo
                aparece cuando el contrato tiene anexos vigentes, porque ahí sí
                hay algo que decidir: si la compra va contra la base o contra un
                adicional. */}
            <SelectorAnexo
              contratoId={f.datos.contrato_id}
              valor={f.datos.anexo_id}
              alCambiar={(v) => f.cambiar("anexo_id", v)}
              ayuda="Lo comprado contra un anexo sale en su resultado, y se imprime en la línea «Proyecto» de la orden."
            />
          </Campos>

          {/* El proveedor se elige del maestro y sus datos se copian solos.
              Se copian y no se dejan apuntando: la OC es un documento que se
              imprime y tiene que seguir diciendo lo mismo dentro de dos años,
              aunque el proveedor se cambie de oficina. Corregirlos acá sería
              corregir una copia; se corrigen en Proveedores. */}
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
                    nota: [formatearRut(p.rut), ...p.rubros.slice(0, 2)]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                marcador="Escribe para buscar entre los proveedores…"
                ayuda="Los datos se completan solos. Si algo está mal o falta, se arregla en Proveedores y vale para todas las órdenes."
                valor={f.datos.proveedor_id}
                alCambiar={(v) => elegirProveedor(v)}
              />
            </Ancho>

            {f.datos.proveedor && (
              <Ancho>
                <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-mist-deep bg-mist/30 p-4 text-sm sm:grid-cols-2">
                  <DatoCopiado etiqueta="Razón social">{f.datos.proveedor}</DatoCopiado>
                  <DatoCopiado etiqueta="RUT">
                    {f.datos.rut_proveedor ? formatearRut(f.datos.rut_proveedor) : "Sin RUT"}
                  </DatoCopiado>
                  <DatoCopiado etiqueta="Dirección">
                    {[f.datos.direccion_proveedor, f.datos.comuna_proveedor, f.datos.ciudad_proveedor]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </DatoCopiado>
                  <DatoCopiado etiqueta="Contacto">
                    {[f.datos.contacto, f.datos.correo_contacto, f.datos.telefono_contacto]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </DatoCopiado>
                </dl>
              </Ancho>
            )}
          </Seccion>

          {/* Quien emite no se elige: es quien tiene la sesión, y solo llega
              hasta acá quien tiene permiso para crear órdenes. Se muestra para
              que se vea qué va a decir el PDF; el teléfono, que el perfil no
              guarda, se propone con el de su última orden. */}
          <Seccion titulo="Emite">
            <Ancho>
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-mist-deep bg-mist/30 p-4 text-sm sm:grid-cols-2">
                <DatoCopiado etiqueta="Nombre">{f.datos.emisor_nombre || "—"}</DatoCopiado>
                <DatoCopiado etiqueta="Correo">{f.datos.emisor_correo || "—"}</DatoCopiado>
              </dl>
              <p className="mt-1.5 text-xs text-ink-soft">
                {editando
                  ? "Quien emitió la orden. No cambia al corregirla."
                  : "Se completa con tu sesión. El proveedor le responde a esta persona."}
              </p>
            </Ancho>
            <CampoTexto etiqueta="Teléfono" marcador="+56 9 1234 5678" {...f.campo("emisor_telefono")} />
          </Seccion>

          <Seccion titulo="Condiciones">
            <CampoFecha etiqueta="Fecha de emisión" requerido {...f.campo("fecha_emision")} />
            <CampoFecha
              etiqueta="Requerida en faena"
              ayuda="Es lo que convierte la orden en un compromiso."
              {...f.campo("fecha_requerida")}
            />
            <CampoSeleccion
              etiqueta="Forma de pago"
              opciones={opcionesCondicionPago}
              ayuda="Viene de la ficha del proveedor. Con esto se calcula el vencimiento de su factura."
              {...f.campo("condiciones_pago")}
            />
            <CampoTexto etiqueta="Lugar de entrega" marcador="Faena Coya Sur" {...f.campo("lugar_entrega")} />
            <CampoTexto etiqueta="Solicitado por" {...f.campo("solicitado_por")} />
            <CampoTexto etiqueta="Retira" {...f.campo("retira")} />
            {/* Recepción parcial, Recibida y Cerrada no se eligen: las calcula la
                base con lo recibido y facturado en cada línea, y al guardar las
                vuelve a calcular. Ofrecerlas acá era guardar un estado que el
                trigger deshacía en el mismo instante. */}
            {estadoManual(f.datos.estado) ? (
              <CampoSeleccion
                etiqueta="Estado"
                opciones={estadosOrden.filter((e) => estadoManual(e.id))}
                ayuda="Para pasarla a Recibida, registra la recepción desde el ciclo de la orden."
                {...f.campo("estado")}
              />
            ) : (
              <div>
                <p className="text-sm font-semibold text-ink">Estado</p>
                <p className="mt-2">
                  <Etiqueta destacada>{estadosOrden.find((e) => e.id === f.datos.estado)?.titulo}</Etiqueta>
                </p>
                <p className="mt-1.5 text-xs text-ink-soft">
                  Lo calcula la recepción y la facturación de sus ítems.
                </p>
              </div>
            )}
            <Ancho>
              <CampoTexto etiqueta="Observaciones" {...f.campo("observaciones")} />
            </Ancho>
          </Seccion>

          {/* ── Ítems ──────────────────────────────────────────────────────── */}
          <section className="border-t border-mist px-6 py-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Ítems de la orden
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPegando((p) => !p)}
                  aria-expanded={pegando}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan px-4 py-2 text-sm font-semibold text-cyan-deep transition-colors hover:bg-cyan/5"
                >
                  Pegar desde la planilla
                </button>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, lineaVacia(ls.length)])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-mist-deep px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  Agregar ítem
                </button>
              </div>
            </div>

            {pegando && (
              <div className="mb-5 rounded-xl border border-mist-deep bg-mist/30 p-4">
                <label className="block text-sm font-semibold text-ink" htmlFor="pegado-oc">
                  Pega las filas de la OC
                </label>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  En la planilla, selecciona las filas de ítems (de la columna ÍTEM a TOTALES) y cópialas. Las filas vacías y el
                  encabezado se ignoran. Revisa abajo cómo quedó antes de agregarlas.
                </p>
                <textarea
                  id="pegado-oc"
                  rows={4}
                  value={textoPegado}
                  onChange={(e) => setTextoPegado(e.target.value)}
                  placeholder={"1\tBOTIN MAXWORK TRAIL. AISL. P, CAFÉ, 40\tUN\t1\t$ 29,900\t$ 29,900"}
                  className={`${claseCelda} mt-3 font-mono text-xs`}
                />
                {filasPegadas.length > 0 && (
                  <div className="mt-3">
                    <ul className="max-h-48 overflow-y-auto rounded-lg border border-mist bg-white text-xs">
                      {filasPegadas.map((fila, i) => (
                        <li key={i} className="flex justify-between gap-4 border-b border-mist px-3 py-1.5 last:border-0">
                          <span className="truncate text-ink">{fila.descripcion}</span>
                          <span className="shrink-0 tabular-nums text-ink-soft">
                            {fila.cantidad.toLocaleString("es-CL")} {fila.unidad} × {formatearPesos(fila.precioUnitario)} ={" "}
                            <strong className="text-ink">{formatearPesos(Math.round(fila.cantidad * fila.precioUnitario))}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-ink-soft">
                        {filasPegadas.length} ítems · neto{" "}
                        {formatearPesos(filasPegadas.reduce((t, x) => t + Math.round(x.cantidad * x.precioUnitario), 0))}
                      </span>
                      <button
                        type="button"
                        onClick={() => agregarPegadas(filasPegadas)}
                        className="rounded-full bg-cyan px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-deep"
                      >
                        Agregar {filasPegadas.length} ítems
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {lineas.length > 1 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span className="font-semibold uppercase tracking-[0.1em]">A todas las líneas:</span>
                <select
                  aria-label="Categoría para todas las líneas"
                  value=""
                  onChange={(e) => e.target.value && aplicarATodas("categoria_id", e.target.value === "-" ? "" : e.target.value)}
                  className="rounded-full border border-mist-deep bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft"
                >
                  <option value="">Categoría…</option>
                  <option value="-">— Sin categoría —</option>
                  {delContrato.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <select
                  aria-label="Tipo para todas las líneas"
                  value=""
                  onChange={(e) => e.target.value && aplicarATodas("tipo", e.target.value)}
                  className="rounded-full border border-mist-deep bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft"
                >
                  <option value="">Tipo…</option>
                  {tiposCompra.map((t) => (
                    <option key={t.id} value={t.id}>{t.titulo}</option>
                  ))}
                </select>
                <span>Después cambia solo las excepciones.</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-mist text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="w-40 py-2 pr-3">Categoría</th>
                    <th className="w-20 py-2 pr-3">UM</th>
                    <th className="w-24 py-2 pr-3 text-right">Cant.</th>
                    <th className="w-32 py-2 pr-3 text-right">P. unitario</th>
                    <th className="w-36 py-2 pr-3">Tipo</th>
                    <th className="w-28 py-2 text-right">Total</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.id} className="border-b border-mist last:border-0">
                      <td className="py-2 pr-3">
                        <CampoConPagnol
                          ariaLabel="Descripción"
                          valor={l.descripcion}
                          // Escribir a mano suelta la referencia: ya no es ese material.
                          alCambiar={(v) =>
                            setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, descripcion: v, pagnol_material_id: "", pagnol_codigo: "" } : x)))
                          }
                          alElegir={(m) =>
                            setLineas((ls) =>
                              ls.map((x) =>
                                x.id === l.id
                                  ? { ...x, descripcion: m.nombre, unidad: unidadDesdePagnol(m.unidad_medida), pagnol_material_id: m.id, pagnol_codigo: m.codigo }
                                  : x,
                              ),
                            )
                          }
                          enlazado={l.pagnol_material_id ? l.pagnol_codigo || "enlazado" : null}
                          onPaste={alPegarEnCelda}
                          placeholder="Disco de corte 4½″"
                          className={claseCelda}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={l.categoria_id}
                          onChange={(e) => cambiar(l.id, "categoria_id", e.target.value)}
                          className={claseCelda}
                        >
                          {opcionesCategoria.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.titulo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={l.unidad}
                          onChange={(e) => cambiar(l.id, "unidad", e.target.value)}
                          className={claseCelda}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.cantidad}
                          onChange={(e) => cambiar(l.id, "cantidad", Number(e.target.value) || 0)}
                          className={`${claseCelda} text-right tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={l.precio_unitario === 0 ? "" : l.precio_unitario.toLocaleString("es-CL")}
                          placeholder="0"
                          onChange={(e) =>
                            cambiar(l.id, "precio_unitario", Number(e.target.value.replace(/\D/g, "")) || 0)
                          }
                          className={`${claseCelda} text-right tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={l.tipo}
                          onChange={(e) => cambiar(l.id, "tipo", e.target.value)}
                          className={claseCelda}
                        >
                          {tiposCompra.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.titulo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-ink">
                        {formatearPesos(Math.round(l.cantidad * l.precio_unitario))}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitar(l)}
                          aria-label="Quitar ítem"
                          className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-[#fdeeec] hover:text-[#a52f24]"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col items-end gap-1 text-sm">
              <p className="text-ink-soft">
                Neto <span className="ml-2 font-semibold tabular-nums text-ink">{formatearPesos(neto)}</span>
              </p>
              <p className="text-ink-soft">
                IVA 19% <span className="ml-2 tabular-nums">{formatearPesos(iva)}</span>
              </p>
              <p className="font-display text-lg font-semibold text-ink">
                Total {formatearPesos(neto + iva)}
              </p>
              {reembolsable > 0 && (
                <p className="mt-1">
                  <Etiqueta destacada>
                    {formatearPesos(reembolsable)} reembolsables — no descuentan del margen
                  </Etiqueta>
                </p>
              )}
            </div>
          </section>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : registrar ? "Registrar orden" : "Crear orden"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar orden de compra"
        detalle={`Se va a eliminar ${orden?.numero ?? ""}. Sus ítems quedan sin orden asociada, pero no se borran: si ya se facturaron, siguen siendo costo del contrato.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}

/** Los estados que se ponen a mano. El resto lo dicen las líneas. */
const estadoManual = (e: EstadoOrden) => e === "borrador" || e === "emitida" || e === "anulada";

const claseCelda =
  "w-full rounded-lg border border-mist-deep bg-white px-2.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/45 focus:border-cyan focus:ring-2 focus:ring-cyan/20";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-mist px-6 pb-6 pt-5">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {titulo}
      </h3>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Un dato que vino del maestro: se lee acá, se corrige en Proveedores. */
function DatoCopiado({
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
