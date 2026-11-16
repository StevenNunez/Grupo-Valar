"use client";
import { ivaDe } from "@/lib/iva";

import { SeccionRespaldos, useRespaldos } from "@/components/ui/Respaldos";
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
import { condicionDeProveedor, opcionesCondicionPago, type Proveedor } from "@/lib/abastecimiento";
import { cargarAnexos, proyectoDeAnexo, type Anexo } from "@/lib/anexos";
import { SelectorAnexo } from "../ui/SelectorAnexo";
import { esOficina, opcionesDeContrato, type ContratoBreve } from "@/lib/contratos";
import { cargarCatalogoOficina, CENTRO_GENERAL } from "@/lib/oficina-central";
import { tiposCompra } from "@/lib/egresos";
import { formatearPesosUnitario } from "@/lib/formato";
import { useUfHoy } from "@/lib/uf";
import {
  cargarLineasDeOrden,
  eliminarOrdenCompleta,
  cargarDescuentoDeOrden,
  cargarOrdenEnUf,
  cargarOficinaDeOrden,
  ufAPrecio,
  eliminarOrdenConItems,
  estadosOrden,
  precioConDescuento,
  siguienteNumero,
  ultimoTelefonoDeEmisor,
  type Orden,
} from "@/lib/ordenes";
import { leerPegado, type FilaPegada } from "@/lib/pegado";
import { CampoPrecio } from "../ui/CampoPrecio";
import { LectorCotizacionOrden, type ResultadoLectura } from "./LectorCotizacionOrden";
import {
  borradorDe,
  estadoManual,
  leerGuardado,
  lineaPegada,
  lineaVacia,
  olvidarGuardado,
  tieneAlgo,
  type BorradorOrden,
  type Guardado,
  type Linea,
} from "./orden/borrador";
import { guardarOrden } from "./orden/guardar";
import { PanelPegado } from "./orden/PanelPegado";
import { AvisoPendiente, DatoCopiado, Seccion, SeccionProveedor } from "./orden/piezas";
import { TablaLineas } from "./orden/TablaLineas";
import { TotalesOrden } from "./orden/TotalesOrden";
import type { Usuario } from "@/lib/sesion";

/**
 * Alta y edición de una orden de compra, con sus ítems en la misma pantalla.
 *
 * Los ítems se editan acá y no en un diálogo aparte porque una OC sin sus
 * líneas no significa nada: el monto, el IVA y el total salen de ellas.
 */

export function FormularioOrden({
  orden,
  contratos,
  categorias,
  proveedores,
  usuario,
  alCerrar,
  alGuardado,
}: {
  orden: Orden | null;
  contratos: ContratoBreve[];
  categorias: { id: string; nombre: string; contratoId: string }[];
  /** El maestro de Abastecimiento: de acá se copian los datos del proveedor. */
  proveedores: Proveedor[];
  usuario: Usuario;
  alCerrar: () => void;
  /** Con el código interno de la orden, para poder adjuntarle el PDF. */
  alGuardado: (ordenId?: string) => void;
}) {
  const f = useFormulario<BorradorOrden>(borradorDe(orden, contratos, usuario));
  const editando = orden !== null;
  // Solo Soporte borra una orden con recepciones o facturas (lo vuelve a exigir la base).
  const esSoporte = usuario.general === "soporte";
  // Una orden nueva arranca con una línea en blanco. Se hace en el
  // inicializador y no en el efecto: llamar a setState en el cuerpo de un
  // efecto provoca un render en cascada.
  const [lineas, setLineas] = useState<Linea[]>(orden ? [] : [lineaVacia(0)]);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  /* Orden sin IVA: servicios como exámenes médicos o capacitación. Es de toda la
     orden y no de cada línea, porque así se emiten; al editar se deduce de sus
     ítems (todos con IVA cero). */
  const [exenta, setExenta] = useState(false);
  /** Descuento sobre el subtotal, en % (0102). Los precios de las líneas son los de lista; al guardar se descuentan. */
  const [descuento, setDescuento] = useState(0);
  /** El que traía la orden al abrirla: las columnas del descuento (0102) solo se tocan si hubo o hay descuento. */
  const [descuentoInicial, setDescuentoInicial] = useState(0);
  /** Número de la cotización del proveedor (0104), opcional. Aparte de `f.datos` para que guardar siga andando sin la migración. */
  const [cotizacion, setCotizacion] = useState("");
  const [cotizacionInicial, setCotizacionInicial] = useState("");
  /* Orden cotizada en UF (0114). Los precios se escriben en UF y se guardan en pesos
     con la UF de acá, que queda fija en la orden. Aparte de `f.datos` para que
     guardar siga andando sin la migración. */
  const [enUf, setEnUf] = useState(false);
  const [enUfInicial, setEnUfInicial] = useState(false);
  const [valorUf, setValorUf] = useState(0);
  const ufHoy = useUfHoy();
  // Al pasar a UF se propone la de hoy; después se puede corregir (p. ej. la del día de la cotización).
  function elegirMoneda(uf: boolean) {
    setEnUf(uf);
    if (uf && valorUf === 0 && ufHoy) setValorUf(ufHoy.valorHoy);
  }

  /* Oficina Central (0122): la orden va a UN centro de costo y cada línea lleva
     su categoría de oficina. El catálogo se pide recién cuando se elige. */
  const oficina = esOficina(f.datos.contrato_id);
  const eraOficina = esOficina(orden?.contratoId);
  const [centro, setCentro] = useState(CENTRO_GENERAL);
  const [catalogoOficina, setCatalogoOficina] = useState<Awaited<ReturnType<typeof cargarCatalogoOficina>> | null>(null);
  useEffect(() => {
    if (!oficina || catalogoOficina) return;
    let vigente = true;
    cargarCatalogoOficina()
      .then((c) => vigente && setCatalogoOficina(c))
      .catch(() => vigente && setCatalogoOficina({ categorias: [], centros: [] }));
    return () => {
      vigente = false;
    };
  }, [oficina, catalogoOficina]);
  /* Las categorías de un contrato no son las de Oficina Central: al pasar de uno
     a la otra, las ya elegidas en las líneas dejan de valer. */
  function cambiarContrato(id: string) {
    if (esOficina(id) !== oficina) setLineas((ls) => ls.map((l) => ({ ...l, categoria_id: "" })));
    f.setDatos((d) => ({ ...d, contrato_id: id, anexo_id: esOficina(id) ? "" : d.anexo_id }));
  }

  const claveGuardado = editando ? null : `oc-borrador:${usuario.id}:nueva`;
  /* La que quedó de antes, mientras no se decida qué hacer con ella. Hasta
     entonces no se pisa: lo nuevo se guarda recién cuando se recupera o se
     descarta, para no perderla por abrir el formulario sin querer. */
  const [pendiente, setPendiente] = useState<Guardado | null>(() => leerGuardado(claveGuardado));

  useEffect(() => {
    if (!claveGuardado || pendiente) return;
    const t = setTimeout(() => {
      try {
        if (tieneAlgo(f.datos, lineas)) {
          localStorage.setItem(
            claveGuardado,
            JSON.stringify({ datos: f.datos, lineas, cuando: new Date().toISOString(), enUf, valorUf } satisfies Guardado),
          );
        }
      } catch {
        // Sin espacio o sin almacenamiento: se sigue sin red de seguridad.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [claveGuardado, pendiente, f.datos, lineas, enUf, valorUf]);

  function recuperar() {
    if (!pendiente) return;
    // El número propuesto se recalcula: el que tenía puede ya estar usado.
    f.setDatos((d) => ({ ...pendiente.datos, numero: d.numero }));
    setLineas(pendiente.lineas);
    if (pendiente.enUf) {
      setEnUf(true);
      setValorUf(pendiente.valorUf ?? 0);
    }
    setPendiente(null);
  }

  function descartarPendiente() {
    olvidarGuardado(claveGuardado);
    setPendiente(null);
  }
  const borrado = useBorrado("ordenes_compra_proveedor", orden?.id, () => {
    alGuardado();
    alCerrar();
  }, esSoporte ? eliminarOrdenCompleta : eliminarOrdenConItems);

  // Al abrir: si es nueva, se propone el número siguiente y una línea en
  // blanco. Si es existente, se traen sus ítems.
  useEffect(() => {
    let vigente = true;

    if (orden) {
      Promise.all([
        cargarLineasDeOrden(orden.id),
        cargarDescuentoDeOrden(orden.id),
        cargarOrdenEnUf(orden.id),
        eraOficina ? cargarOficinaDeOrden(orden.id) : null,
      ]).then(([items, desc, uf, deOficina]) => {
        if (!vigente) return;
        if (deOficina) setCentro(deOficina.centro);
        setEnUf(uf.moneda === "UF");
        setEnUfInicial(uf.moneda === "UF");
        setValorUf(uf.valorUf);
        setExenta(items.length > 0 && items.every((i) => i.iva === 0));
        setDescuento(desc.porcentaje);
        setDescuentoInicial(desc.porcentaje);
        setCotizacion(desc.cotizacion);
        setCotizacionInicial(desc.cotizacion);
        setLineas(
          items.map((i) => ({
            id: i.id,
            descripcion: i.descripcion,
            unidad: i.unidad,
            cantidad: i.cantidad,
            // Se edita el precio de lista; el descuento se aplica al guardar.
            precio_unitario: desc.listas.get(i.id) ?? i.precioUnitario,
            precio_uf: uf.preciosUf.get(i.id) ?? 0,
            tipo: i.tipo,
            categoria_id: (deOficina ? deOficina.categorias.get(i.id) : i.categoriaId) ?? "",
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

  // Las categorías que se ofrecen: las del contrato o, en Oficina Central, las de oficina que están activas.
  const delContrato = oficina
    ? (catalogoOficina?.categorias ?? [])
        .filter((c) => c.activa || lineas.some((l) => l.categoria_id === c.id))
        .map((c) => ({ id: c.id, nombre: c.titulo }))
    : categorias.filter((c) => c.contratoId === f.datos.contrato_id);
  const opcionesCategoria = [
    { id: "", titulo: "— Sin categoría —" },
    ...delContrato.map((c) => ({ id: c.id, titulo: c.nombre })),
  ];
  const opcionesCentro = (catalogoOficina?.centros ?? [])
    .filter((c) => c.activo || c.id === centro)
    .map((c) => ({ id: c.id, titulo: c.nombre }));

  // Lo que se paga por línea: la lista menos el descuento. Es lo mismo que se guarda.
  // El precio de lista en pesos: el escrito, o el de UF convertido con la UF de la orden.
  const listaEnPesos = (l: Linea) => (enUf ? ufAPrecio(l.precio_uf, valorUf) : l.precio_unitario);
  const netoDe = (l: Linea) => Math.round(l.cantidad * precioConDescuento(listaEnPesos(l), descuento));
  const subtotal = lineas.reduce((t, l) => t + Math.round(l.cantidad * listaEnPesos(l)), 0);
  const neto = lineas.reduce((t, l) => t + netoDe(l), 0);
  const iva = exenta ? 0 : ivaDe(neto);
  const reembolsable = lineas.filter((l) => l.tipo === "reembolsable").reduce((t, l) => t + netoDe(l), 0);

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
      return [
        ...conAlgo,
        ...filas.map((fila, i) => {
          const l = lineaPegada(fila, conAlgo.length + i);
          // En una orden en UF el precio de la planilla es el precio en UF.
          return enUf ? { ...l, precio_unitario: 0, precio_uf: fila.precioUnitario } : l;
        }),
      ];
    });
    setTextoPegado("");
    setPegando(false);
  }

  /* Leer el PDF de la cotización del proveedor: las líneas, y de paso el
     proveedor, la forma de pago, el N.º de cotización y el descuento. */
  const [leyendoPdf, setLeyendoPdf] = useState(false);
  function aplicarLectura(r: ResultadoLectura) {
    const filas: FilaPegada[] = r.filas.map((x) => ({ ...x, unidad: "UN" }));
    if (r.flete && r.flete > 0) {
      filas.push({ descripcion: "Flete", unidad: "UN", cantidad: 1, precioUnitario: r.flete });
    }
    agregarPegadas(filas);
    if (r.proveedorId) elegirProveedor(r.proveedorId);
    if (r.condicion) {
      const condicion = r.condicion;
      f.setDatos((d) => ({ ...d, condiciones_pago: condicion }));
    }
    if (r.numero) setCotizacion(r.numero);
    if (r.descuentoPorcentaje) setDescuento(r.descuentoPorcentaje);
    setLeyendoPdf(false);
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

  const respaldos = useRespaldos("ordenes_compra_proveedor", editando ? orden.id : null);
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ordenId = editando ? orden.id : codigoInterno;
    if (enUf && !(valorUf > 0)) {
      f.setError("Falta el valor de la UF: sin él no se pueden pasar los precios a pesos.");
      return;
    }

    // Los campos de fecha vacíos van nulos: una cadena vacía no es una fecha.
    // El proyecto vacío también: significa "contrato base", y lo que se imprime
    // en ese caso lo resuelve la orden con el nombre del contrato.
    const cabecera = {
      ...f.datos,
      id: ordenId,
      fecha_requerida: f.datos.fecha_requerida || null,
      // Lo impreso en «Proyecto» sale del anexo elegido; sin anexo, la base.
      anexo_id: oficina ? null : f.datos.anexo_id || null,
      // Oficina Central: un centro para toda la orden. En un contrato la columna no se
      // manda (así guardar no depende de la 0122), salvo para vaciarla si lo era.
      ...(oficina ? { centro_costo: centro } : eraOficina ? { centro_costo: null } : {}),
      proyecto: (() => {
        const anexo = anexos.lista.find((a) => a.id === f.datos.anexo_id);
        return anexo ? proyectoDeAnexo(anexo) : null;
      })(),
      proveedor_id: f.datos.proveedor_id || null,
      // Sin descuento antes ni ahora no se manda: así guardar sigue andando aunque falte la 0102.
      ...(descuento > 0 || descuentoInicial > 0 ? { descuento_porcentaje: descuento } : {}),
      // Igual con la UF (0114): solo se manda si es en UF o lo era.
      ...(enUf || enUfInicial ? { moneda: enUf ? "UF" : "CLP", valor_uf: enUf ? valorUf : null } : {}),
      // Igual: sin número antes ni ahora no se manda (y se puede borrar uno ya puesto).
      ...(cotizacion.trim() || cotizacionInicial ? { numero_cotizacion: cotizacion.trim() || null } : {}),
    };

    f.enviar(
      () =>
        guardarOrden({
          orden,
          ordenId,
          cabecera,
          lineas,
          eliminadas,
          exenta,
          descuento,
          descuentoInicial,
          enUf,
          enUfInicial,
          oficina,
          eraOficina,
          listaEnPesos,
          alCrear: (id) => void respaldos.subirA(id),
        }),
      () => {
        olvidarGuardado(claveGuardado);
        alGuardado(ordenId);
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? `Orden ${orden.numero}` : "Nueva orden de compra"}
        descripcion={
          editando
            ? "El estado se actualiza solo según lo que se vaya recibiendo y facturando."
            : "El número viene propuesto con el siguiente de la serie. Puedes cambiarlo."
        }
        abierto
        alCerrar={alCerrar}
        ancho="max-w-5xl"
      >
        <form onSubmit={onSubmit}>
          {pendiente && (
            <AvisoPendiente pendiente={pendiente} alRecuperar={recuperar} alDescartar={descartarPendiente} />
          )}
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
              etiqueta="Contrato u Oficina Central"
              requerido
              ayuda="El centro de costo de la compra. De acá sale lo que se imprime como proyecto."
              opciones={opcionesDeContrato(contratos)}
              {...f.campo("contrato_id")}
              alCambiar={cambiarContrato}
            />

            {oficina && (
              <CampoSeleccion
                etiqueta="Centro de costo"
                requerido
                ayuda="Toda la orden va a un solo centro de Oficina Central."
                opciones={opcionesCentro.length > 0 ? opcionesCentro : [{ id: centro, titulo: "General" }]}
                valor={centro}
                alCambiar={setCentro}
              />
            )}

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

          <SeccionProveedor proveedores={proveedores} datos={f.datos} alElegir={elegirProveedor} />

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
            <CampoTexto
              etiqueta="N.º de cotización"
              marcador="Opcional"
              ayuda="El número que el proveedor le puso a su cotización."
              valor={cotizacion}
              alCambiar={setCotizacion}
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
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Moneda de la cotización" className="inline-flex overflow-hidden rounded-full border border-mist-deep text-sm font-semibold">
                  {([["CLP", "Pesos"], ["UF", "UF"]] as const).map(([id, titulo]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={enUf === (id === "UF")}
                      onClick={() => elegirMoneda(id === "UF")}
                      className={`px-4 py-2 transition-colors ${enUf === (id === "UF") ? "bg-cyan-deep text-white" : "text-ink-soft hover:text-ink"}`}
                    >
                      {titulo}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLeyendoPdf((p) => !p)}
                  aria-expanded={leyendoPdf}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-hondo"
                >
                  Leer cotización (PDF)
                </button>
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

            {enUf && (
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-3 text-sm text-ink">
                <label className="flex items-center gap-2 font-semibold">
                  Valor de la UF
                  <CampoPrecio
                    ariaLabel="Valor de la UF en pesos"
                    valor={valorUf}
                    alCambiar={setValorUf}
                    className="w-32 rounded-lg border border-mist-deep bg-white px-2.5 py-1.5 text-right text-sm tabular-nums text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
                  />
                </label>
                <span className="text-xs text-ink-soft">
                  Los precios se escriben en UF y la orden se guarda en pesos con este valor, que queda fijo.
                  {ufHoy ? <> La UF de hoy es {formatearPesosUnitario(ufHoy.valorHoy)}.</> : null}
                </span>
              </div>
            )}

            {leyendoPdf && (
              <LectorCotizacionOrden
                proveedores={proveedores}
                proveedorActual={f.datos.proveedor_id}
                enUf={enUf}
                alAplicar={aplicarLectura}
                alCerrar={() => setLeyendoPdf(false)}
              />
            )}

            {pegando && (
              <PanelPegado
                textoPegado={textoPegado}
                setTextoPegado={setTextoPegado}
                filasPegadas={filasPegadas}
                agregarPegadas={agregarPegadas}
              />
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

            <TablaLineas
              lineas={lineas}
              setLineas={setLineas}
              opcionesCategoria={opcionesCategoria}
              enUf={enUf}
              valorUf={valorUf}
              listaEnPesos={listaEnPesos}
              cambiar={cambiar}
              quitar={quitar}
              alPegarEnCelda={alPegarEnCelda}
            />

            <TotalesOrden
              exenta={exenta}
              setExenta={setExenta}
              descuento={descuento}
              setDescuento={setDescuento}
              subtotal={subtotal}
              neto={neto}
              iva={iva}
              reembolsable={reembolsable}
            />
          </section>

          <Pie
            extra={<SeccionRespaldos respaldos={respaldos} />}
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            textoGuardar={editando ? "Guardar cambios" : "Crear orden"}
            alEliminar={editando ? borrado.abrir : undefined}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar orden de compra"
        detalle={
          esSoporte
            ? `Se va a eliminar ${orden?.numero ?? ""} con TODO lo que cuelga de ella: sus ítems, las recepciones, las facturas de esta orden y sus notas de crédito. El gasto desaparece del mes y del Dashboard. No se puede deshacer.`
            : `Se va a eliminar ${orden?.numero ?? ""}. Se borran también sus ítems, y con ellos el gasto que representaba en el mes. Si ya hay ítems recibidos o facturados, no se podrá borrar: se anula, o se lo pides a Soporte.`
        }
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
