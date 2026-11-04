import type { Metadata } from "next";
import { EnlaceCookies } from "@/components/EnlaceCookies";
import { PaginaInterior, Texto } from "@/components/PaginaInterior";
import { empresa } from "@/lib/content";

export const metadata: Metadata = {
  title: "Política de cookies",
  description: "Qué almacenamiento usa el sitio de Valar y cómo cambiar tus preferencias.",
  alternates: { canonical: "/cookies/" },
};

const almacenamiento = [
  { nombre: "valar-splash", tipo: "Sesión (técnico)", para: "Recordar que ya viste la animación de entrada para no repetirla.", duracion: "Hasta cerrar la pestaña" },
  { nombre: "valar-cookies", tipo: "Local (técnico)", para: "Guardar la elección que haces en el panel de preferencias.", duracion: "Hasta que la cambies o borres los datos del sitio" },
];

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
        {/* Escritorio: tabla. Teléfono: una tarjeta por cookie, sin scroll lateral. */}
        <div className="hidden overflow-x-auto rounded-xl border border-mist-deep md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-mist text-xs uppercase tracking-wider text-ink">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Para qué sirve</th>
                <th className="px-4 py-3">Duración</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-mist [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">
              {almacenamiento.map((c) => (
                <tr key={c.nombre}>
                  <td className="font-mono text-xs">{c.nombre}</td>
                  <td>{c.tipo}</td>
                  <td>{c.para}</td>
                  <td>{c.duracion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="grid gap-3 md:hidden">
          {almacenamiento.map((c) => (
            <li key={c.nombre} className="ml-0 list-none rounded-xl border border-mist-deep p-4">
              <p className="font-mono text-xs font-semibold text-ink">{c.nombre}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-ink-soft/80">{c.tipo}</p>
              <p className="mt-2 text-sm">{c.para}</p>
              <p className="mt-2 text-xs text-ink-soft/80">Duración: {c.duracion}</p>
            </li>
          ))}
        </ul>
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
