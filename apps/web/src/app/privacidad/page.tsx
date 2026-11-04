import type { Metadata } from "next";
import { PaginaInterior, Texto } from "@/components/PaginaInterior";
import { empresa } from "@/lib/content";
import { emailPostulaciones, versionPrivacidad } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo Valar trata los datos personales de quienes visitan el sitio, nos contactan o postulan a trabajar con nosotros.",
  alternates: { canonical: "/privacidad/" },
};

export default function Privacidad() {
  return (
    <PaginaInterior
      etiqueta="Legal"
      titulo="Política de privacidad"
      bajada="Qué datos personales tratamos, para qué, por cuánto tiempo y cómo puedes ejercer tus derechos."
    >
      <Texto>
        <p>
          <strong>Última actualización:</strong> {versionPrivacidad.split("-").reverse().join("-")}.
        </p>

        <h2>1. Quién es el responsable</h2>
        <p>
          El responsable del tratamiento de tus datos es <strong>{empresa.razonSocial}</strong>, RUT {empresa.rut}, con
          domicilio en {empresa.direccion}. Para cualquier consulta sobre esta política escríbenos a{" "}
          <a href={`mailto:${empresa.email}`}>{empresa.email}</a>.
        </p>

        <h2>2. Qué datos tratamos y para qué</h2>
        <p>Solo tratamos los datos que tú nos entregas, en dos situaciones:</p>
        <ul>
          <li>
            <strong>Trabaja con nosotros.</strong> Cuando nos envías tu currículum por correo a{" "}
            <a href={`mailto:${emailPostulaciones}`}>{emailPostulaciones}</a>: tu nombre, tu correo y los datos que tú
            decidas incluir (teléfono, ciudad, historial laboral, estudios, certificaciones o fotografía). Los usamos para
            evaluar tu candidatura y para contactarte por procesos de selección actuales o futuros.
          </li>
          <li>
            <strong>Contacto comercial.</strong> El formulario de contacto del sitio no envía tus datos a nuestros
            servidores: arma el mensaje y lo abre en tu WhatsApp o en tu programa de correo, y lo envías tú. Lo que
            escribes nos llega por ese canal y lo usamos solo para responderte.
          </li>
        </ul>
        <p>No pedimos datos sensibles en ningún formulario y te pedimos no incluirlos en tu currículum si no son necesarios.</p>

        <h2>3. Base de tratamiento</h2>
        <p>
          Tratamos los datos de tu postulación con tu <strong>consentimiento</strong>, que das al enviarnos tu
          currículum y puedes retirar en cualquier momento. Los datos de contacto comercial los tratamos para responder
          tu solicitud.
        </p>

        <h2>4. Quién accede a tus datos</h2>
        <ul>
          <li>El personal de Valar que gestiona la selección de personal y la administración.</li>
          <li>
            Proveedores tecnológicos que nos prestan servicio y que tratan los datos solo por encargo nuestro: el
            servicio de correo electrónico donde recibimos tu currículum y el alojamiento del sitio (Cloudflare). Esto
            puede implicar almacenamiento en servidores fuera de Chile.
          </li>
        </ul>
        <p>No vendemos ni cedemos tus datos a terceros para fines comerciales.</p>

        <h2>5. Cuánto tiempo los conservamos</h2>
        <p>
          Conservamos tu postulación por un máximo de <strong>24 meses</strong> desde que la enviaste, para considerarte
          en procesos de selección. Después la eliminamos, salvo que nos pidas mantenerla. Puedes pedir que la
          eliminemos antes en cualquier momento escribiéndonos.
        </p>

        <h2>6. Tus derechos</h2>
        <p>
          Puedes pedirnos acceder a tus datos, rectificarlos, eliminarlos, oponerte a su tratamiento, bloquearlos y
          solicitar su portabilidad, conforme a la Ley N° 19.628 sobre protección de la vida privada y, desde su entrada
          en vigencia, la Ley N° 21.719. Escríbenos a <a href={`mailto:${empresa.email}`}>{empresa.email}</a> indicando
          el correo con el que postulaste; respondemos dentro de los plazos legales.
        </p>

        <h2>7. Seguridad</h2>
        <p>
          Tu currículum llega a una casilla de correo de Valar a la que accede solo personal autorizado, y no lo
          publicamos en ninguna parte. Ningún sistema es infalible, pero aplicamos medidas razonables para proteger tus
          datos.
        </p>

        <h2>8. Cookies</h2>
        <p>
          El sitio usa solo almacenamiento técnico necesario. Detalle y preferencias en la{" "}
          <a href="/cookies/">política de cookies</a>.
        </p>

        <h2>9. Cambios en esta política</h2>
        <p>
          Si la modificamos, publicaremos la nueva versión en esta página con su fecha.
        </p>
      </Texto>
    </PaginaInterior>
  );
}
