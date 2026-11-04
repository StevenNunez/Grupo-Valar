import type { Metadata } from "next";
import { EnlaceCookies } from "@/components/EnlaceCookies";
import { PaginaInterior, Texto } from "@/components/PaginaInterior";
import { empresa } from "@/lib/content";

export const metadata: Metadata = {
  title: "Política de cookies",
  description: "Qué almacenamiento usa el sitio de Valar y cómo cambiar tus preferencias.",
  alternates: { canonical: "/cookies/" },
};

export default function PoliticaDeCookies() {
  return (
    <PaginaInterior
      etiqueta="Legal"
      titulo="Política de cookies"
      bajada="Qué guarda este sitio en tu navegador y cómo puedes controlarlo."
    >
      <Texto>
        <p>
          <strong>Última actualización:</strong> 04-11-2026.
        </p>

        <h2>1. Qué son</h2>
        <p>
          Las cookies y tecnologías similares (como el almacenamiento local del navegador) son pequeños datos que un
          sitio guarda en tu equipo para recordar información entre visitas o páginas.
        </p>

        <h2>2. Qué usamos</h2>
        <p>
          Hoy este sitio <strong>no usa cookies de publicidad, de seguimiento ni de estadísticas</strong> y no carga
          herramientas de terceros que lo hagan. Solo usa almacenamiento técnico, necesario para que funcione:
        </p>
        <div className="overflow-x-auto rounded-xl border border-mist-deep">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-mist text-xs uppercase tracking-wider text-ink">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Para qué sirve</th>
                <th className="px-4 py-3">Duración</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-mist [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">
              <tr>
                <td className="font-mono text-xs">valar-splash</td>
                <td>Sesión (técnico)</td>
                <td>Recordar que ya viste la animación de entrada para no repetirla.</td>
                <td>Hasta cerrar la pestaña</td>
              </tr>
              <tr>
                <td className="font-mono text-xs">valar-cookies</td>
                <td>Local (técnico)</td>
                <td>Guardar la elección que haces en el panel de preferencias.</td>
                <td>Hasta que la cambies o borres los datos del sitio</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Las tipografías del sitio se sirven desde nuestro propio dominio, por lo que no se contacta a Google Fonts
          al visitarlo.
        </p>

        <h2>3. Estadísticas</h2>
        <p>
          Si en el futuro incorporamos una herramienta de medición, la declararemos aquí y solo se activará si tú la
          aceptas en el panel de preferencias.
        </p>

        <h2>4. Cómo cambiar tus preferencias</h2>
        <p>
          Puedes abrir el panel cuando quieras: <EnlaceCookies className="font-semibold text-cyan-deep underline underline-offset-2" />.
          También puedes borrar los datos del sitio desde la configuración de tu navegador; si lo haces, el sitio
          volverá a preguntarte.
        </p>

        <h2>5. Contacto</h2>
        <p>
          Consultas: <a href={`mailto:${empresa.email}`}>{empresa.email}</a>. Más sobre cómo tratamos tus datos en la{" "}
          <a href="/privacidad/">política de privacidad</a>.
        </p>
      </Texto>
    </PaginaInterior>
  );
}
