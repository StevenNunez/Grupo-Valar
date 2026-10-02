"use client";

import {
  Ancho,
  CampoSeleccion,
  CampoTexto,
  Campos,
  Confirmacion,
  Dialogo,
  Pie,
  useBorrado,
  useFormulario,
} from "../ui/Formulario";
import { actualizar, crear } from "@/lib/crud";
import {
  condicionDeProveedor,
  diasDeCondicion,
  estadosProveedor,
  formatearRut,
  normalizarRut,
  opcionesCondicionPago,
  rutValido,
  siguienteIdProveedor,
  type EstadoProveedor,
  type Proveedor,
} from "@/lib/abastecimiento";

type Borrador = {
  id: string;
  rut: string;
  razon_social: string;
  nombre_fantasia: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  contacto: string;
  correo: string;
  correo_pago: string;
  telefono: string;
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  condicion_pago: string;
  dias_credito: number;
  rubros: string;
  estado: EstadoProveedor;
  observaciones: string;
};

function borradorDe(p: Proveedor | null, todos: Proveedor[]): Borrador {
  if (!p) {
    return {
      id: siguienteIdProveedor(todos),
      rut: "",
      razon_social: "",
      nombre_fantasia: "",
      giro: "",
      direccion: "",
      comuna: "",
      ciudad: "Antofagasta",
      contacto: "",
      correo: "",
      correo_pago: "",
      telefono: "",
      banco: "",
      tipo_cuenta: "",
      numero_cuenta: "",
      condicion_pago: "30 días",
      dias_credito: 30,
      rubros: "",
      estado: "activo",
      observaciones: "",
    };
  }
  return {
    id: p.id,
    rut: p.rut ? formatearRut(p.rut) : "",
    razon_social: p.razonSocial,
    nombre_fantasia: p.nombreFantasia ?? "",
    giro: p.giro ?? "",
    direccion: p.direccion ?? "",
    comuna: p.comuna ?? "",
    ciudad: p.ciudad ?? "",
    contacto: p.contacto ?? "",
    correo: p.correo ?? "",
    correo_pago: p.correoPago ?? "",
    telefono: p.telefono ?? "",
    banco: p.banco ?? "",
    tipo_cuenta: p.tipoCuenta ?? "",
    numero_cuenta: p.numeroCuenta ?? "",
    condicion_pago: p.condicionPago,
    dias_credito: p.diasCredito,
    rubros: p.rubros.join(", "),
    estado: p.estado,
    observaciones: p.observaciones ?? "",
  };
}

const cuentas = [
  { id: "corriente", titulo: "Cuenta corriente" },
  { id: "vista", titulo: "Cuenta vista" },
  { id: "ahorro", titulo: "Cuenta de ahorro" },
  { id: "rut", titulo: "Cuenta RUT" },
];

export function FormularioProveedor({
  proveedor,
  proveedores,
  alCerrar,
  alGuardado,
}: {
  proveedor: Proveedor | null;
  proveedores: Proveedor[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const f = useFormulario<Borrador>(borradorDe(proveedor, proveedores));
  const editando = proveedor !== null;
  const borrado = useBorrado("proveedores", proveedor?.id, () => {
    alGuardado();
    alCerrar();
  });

  const rutEscrito = f.datos.rut.trim();
  // Se avisa al escribir, no al guardar: un dígito verificador malo se corrige
  // en el momento, y después nadie sabe cuál era el RUT bueno.
  const avisoRut =
    rutEscrito.length > 3 && !rutValido(rutEscrito)
      ? "El dígito verificador no calza. Revísalo antes de guardar."
      : undefined;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { id, rubros, ...campos } = f.datos;

    const fila = {
      ...campos,
      rut: normalizarRut(campos.rut) || null,
      nombre_fantasia: campos.nombre_fantasia.trim() || null,
      giro: campos.giro.trim() || null,
      direccion: campos.direccion.trim() || null,
      comuna: campos.comuna.trim() || null,
      ciudad: campos.ciudad.trim() || null,
      contacto: campos.contacto.trim() || null,
      correo: campos.correo.trim() || null,
      correo_pago: campos.correo_pago.trim() || null,
      telefono: campos.telefono.trim() || null,
      banco: campos.banco.trim() || null,
      tipo_cuenta: campos.tipo_cuenta.trim() || null,
      numero_cuenta: campos.numero_cuenta.trim() || null,
      observaciones: campos.observaciones.trim() || null,
      // "Ferretería, EPP, aceros" → tres rubros. Se escribe con comas porque es
      // como los dicta cualquiera, y se guarda como lista para poder filtrar.
      rubros: rubros
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    };

    f.enviar(
      () =>
        editando
          ? actualizar("proveedores", proveedor.id, fila)
          : crear("proveedores", { ...fila, id: id.trim() }),
      () => {
        alGuardado();
        alCerrar();
      },
    );
  }

  return (
    <>
      <Dialogo
        titulo={editando ? "Editar proveedor" : "Nuevo proveedor"}
        descripcion={
          editando
            ? `${proveedor.razonSocial} · cada cambio queda registrado con tu nombre y la hora.`
            : "El RUT es la identidad del proveedor: el nombre cambia, el RUT no. De acá sale el gasto por proveedor."
        }
        abierto
        alCerrar={alCerrar}
      >
        <form onSubmit={onSubmit}>
          <Campos>
            <CampoTexto
              etiqueta="RUT"
              marcador="77.256.185-7"
        ayuda={
                avisoRut ??
                "Se guarda sin puntos. Puede quedar vacío mientras la ficha esté por completar."
              }
              {...f.campo("rut")}
            />

            <CampoSeleccion
              etiqueta="Estado"
              requerido
              opciones={estadosProveedor}
              ayuda="«Por completar» es el que se creó al vuelo y le faltan datos."
              {...f.campo("estado")}
            />

            <Ancho>
              <CampoTexto
                etiqueta="Razón social"
                requerido
                marcador="Comercial Ferretera del Norte SpA"
                {...f.campo("razon_social")}
              />
            </Ancho>

            <CampoTexto
              etiqueta="Nombre de fantasía"
              marcador="Ferretería del Norte"
              {...f.campo("nombre_fantasia")}
            />

            <CampoTexto etiqueta="Giro" marcador="Venta de materiales" {...f.campo("giro")} />

            <Ancho>
              <CampoTexto
                etiqueta="Rubros"
                marcador="Ferretería, EPP, aceros"
                ayuda="Separados por coma. Sirven para saber a quién pedirle cotización."
                {...f.campo("rubros")}
              />
            </Ancho>

            <CampoTexto etiqueta="Contacto" marcador="Marcela Rojas" {...f.campo("contacto")} />
            <CampoTexto
              etiqueta="Correo"
              marcador="ventas@ferreteria.cl"
              {...f.campo("correo")}
            />
            <CampoTexto
              etiqueta="Correo de facturación"
              marcador="cobranza@ferreteria.cl"
              ayuda="A dónde se manda la OC y de dónde llega la factura, si no es el de ventas."
              {...f.campo("correo_pago")}
            />

            <CampoTexto etiqueta="Teléfono" marcador="+56 55 245 1234" {...f.campo("telefono")} />
            <CampoTexto
              etiqueta="Dirección"
              marcador="Av. Pedro Aguirre Cerda 1234"
              {...f.campo("direccion")}
            />
            <CampoTexto etiqueta="Comuna" marcador="Antofagasta" {...f.campo("comuna")} />
            <CampoTexto etiqueta="Ciudad" marcador="Antofagasta" {...f.campo("ciudad")} />

            {/* Un solo control para las dos columnas: los días son con los que
                se calcula el vencimiento y el texto es lo que se imprime en la
                orden. Editándolos por separado se podían contradecir. */}
            <Ancho>
              <CampoSeleccion
                etiqueta="Condición de pago"
                requerido
                opciones={opcionesCondicionPago}
                ayuda="Con esto se calcula el vencimiento de cada factura de este proveedor, y es lo que sale impreso en sus órdenes de compra."
                valor={condicionDeProveedor({
                  condicionPago: f.datos.condicion_pago,
                  diasCredito: f.datos.dias_credito,
                })}
                alCambiar={(v) => {
                  f.cambiar("condicion_pago", v);
                  f.cambiar("dias_credito", diasDeCondicion(v));
                }}
              />
            </Ancho>

            <CampoTexto etiqueta="Banco" marcador="Banco de Chile" {...f.campo("banco")} />
            <CampoSeleccion
              etiqueta="Tipo de cuenta"
              opciones={cuentas}
              {...f.campo("tipo_cuenta")}
            />
            <Ancho>
              <CampoTexto
                etiqueta="N° de cuenta"
                marcador="000-12345-67"
                ayuda="Para pagar sin tener que buscar el correo donde mandaron los datos."
                {...f.campo("numero_cuenta")}
              />
            </Ancho>

            <Ancho>
              <CampoTexto
                etiqueta="Observaciones"
                marcador="Despacha a faena sin costo sobre $200.000"
                {...f.campo("observaciones")}
              />
            </Ancho>
          </Campos>

          <Pie
            error={f.error}
            guardando={f.guardando}
            alCancelar={alCerrar}
            alEliminar={editando ? borrado.abrir : undefined}
            textoGuardar={editando ? "Guardar cambios" : "Crear proveedor"}
          />
        </form>
      </Dialogo>

      <Confirmacion
        abierto={borrado.confirmando}
        titulo="Eliminar proveedor"
        detalle={`Se va a eliminar ${proveedor?.razonSocial}. Si tiene órdenes o facturas asociadas, la base no lo va a permitir: en ese caso márcalo como inactivo.`}
        error={borrado.error}
        procesando={borrado.borrando}
        alCancelar={borrado.cerrar}
        alConfirmar={borrado.confirmar}
      />
    </>
  );
}
