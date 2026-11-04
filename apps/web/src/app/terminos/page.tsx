import type { Metadata } from "next";
import { PaginaInterior, Texto } from "@/components/PaginaInterior";
import { empresa } from "@/lib/content";
import { plataformaUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Condiciones de uso del sitio web de Valar.",
  alternates: { canonical: "/terminos/" },
};

export default function Terminos() {
  return (
    <PaginaInterior
      etiqueta="Legal"
      titulo="Términos de uso"
      bajada="Las condiciones para usar este sitio. Al navegarlo las aceptas."
    >
      <Texto>
        <p>
          <strong>Última actualización:</strong> 04-11-2026. Este sitio es operado por{" "}
          <strong>{empresa.razonSocial}</strong> (RUT {empresa.rut}), {empresa.direccion}.
        </p>

        <h2>1. Información del sitio</h2>
        <p>
          El contenido (servicios, proyectos, cifras y clientes) es referencial y busca dar a conocer a la empresa.
          No constituye una oferta, cotización ni compromiso contractual: las condiciones de cualquier servicio se
          formalizan por escrito entre las partes. Procuramos mantenerlo al día, pero puede contener errores u omisiones.
        </p>

        <h2>2. Propiedad intelectual</h2>
        <p>
          La marca Valar, el logotipo, los textos, el diseño y las fotografías pertenecen a {empresa.razonSocial} o a
          quienes nos autorizaron su uso. Los logotipos de clientes y de terceros pertenecen a sus titulares y se
          muestran solo para indicar proyectos realizados. No puedes copiar, modificar ni reutilizar estos materiales
          sin autorización escrita.
        </p>

        <h2>3. Uso permitido</h2>
        <p>Te comprometes a usar el sitio de buena fe y a no:</p>
        <ul>
          <li>intentar acceder sin autorización a sistemas, datos o cuentas de Valar o de terceros;</li>
          <li>enviar archivos con virus o contenido malicioso, ilícito o que no te pertenezca;</li>
          <li>usar el formulario de postulación con datos de otra persona sin su autorización;</li>
          <li>sobrecargar el sitio ni extraer su contenido de forma automatizada.</li>
        </ul>

        <h2>4. Trabaja con nosotros</h2>
        <p>
          Enviar tu currículum no implica una oferta de empleo ni obliga a Valar a contactarte. Declaras que los datos
          que entregas son verdaderos y que puedes compartirlos. El tratamiento de esos datos se rige por la{" "}
          <a href="/privacidad/">política de privacidad</a>.
        </p>

        <h2>5. Plataforma Valar</h2>
        <p>
          El acceso a <a href={plataformaUrl}>Plataforma Valar</a> es privado y exclusivo para personas autorizadas por
          la empresa. Sus credenciales son personales e intransferibles.
        </p>

        <h2>6. Enlaces a terceros</h2>
        <p>
          El sitio puede enlazar a páginas de terceros (por ejemplo, redes sociales o Pagnol). No controlamos su
          contenido ni sus políticas y no respondemos por ellos.
        </p>

        <h2>7. Responsabilidad</h2>
        <p>
          El sitio se ofrece «tal como está». En la medida que la ley lo permite, Valar no responde por interrupciones,
          fallas técnicas ni por decisiones tomadas solo con la información de este sitio.
        </p>

        <h2>8. Cambios</h2>
        <p>
          Podemos actualizar estos términos; la versión vigente es la publicada en esta página, con su fecha.
        </p>

        <h2>9. Ley aplicable y contacto</h2>
        <p>
          Estos términos se rigen por las leyes de Chile y cualquier controversia se someterá a los tribunales
          ordinarios de Antofagasta. Consultas: <a href={`mailto:${empresa.email}`}>{empresa.email}</a>.
        </p>
      </Texto>
    </PaginaInterior>
  );
}
