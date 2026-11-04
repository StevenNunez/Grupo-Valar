import type { Metadata } from "next";
import { PaginaInterior } from "@/components/PaginaInterior";
import { emailPostulaciones } from "@/lib/site";

export const metadata: Metadata = {
  title: "Trabaja con nosotros",
  description:
    "Envía tu currículum a Valar. Construimos obras civiles, mantenimiento industrial y movimiento de tierra en Antofagasta; te contactaremos cuando haya un proceso que calce con tu perfil.",
  alternates: { canonical: "/trabaja-con-nosotros/" },
};

const asunto = "Postulación — Trabaja con nosotros";
const cuerpo = [
  "Hola, quiero postular a Valar.",
  "",
  "Nombre completo:",
  "Teléfono:",
  "Ciudad:",
  "Área de interés:",
  "",
  "Adjunto mi currículum.",
].join("\n");

const pasos = [
  { n: "1", titulo: "Escríbenos", texto: "Envía un correo con tu nombre, teléfono, ciudad y el área en que te gustaría trabajar." },
  { n: "2", titulo: "Adjunta tu CV", texto: "En PDF o Word. Si tienes certificaciones o licencias vigentes, súmalas al mismo correo." },
  { n: "3", titulo: "Te contactamos", texto: "Guardamos tu postulación y te llamamos cuando haya una obra o servicio que calce con tu perfil." },
];

export default function TrabajaConNosotros() {
  const enlace = `mailto:${emailPostulaciones}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

  return (
    <PaginaInterior
      etiqueta="Trabaja con nosotros"
      titulo="Súmate al equipo de Valar"
      bajada="Mantenemos una base de postulantes. Envíanos tu currículum y, cuando necesitemos personal para una obra o servicio, te contactaremos."
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {pasos.map((p) => (
          <li key={p.n} className="rounded-2xl border border-mist-deep p-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan/10 font-display text-sm font-semibold text-cyan-deep">
              {p.n}
            </span>
            <p className="mt-4 font-display text-lg font-semibold text-ink">{p.titulo}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.texto}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-2xl bg-ink p-7 text-white sm:p-10">
        <p className="font-display text-xl font-semibold sm:text-2xl">Envía tu currículum a</p>
        <a
          href={enlace}
          className="mt-3 block break-all font-display text-2xl font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:text-white sm:text-3xl"
        >
          {emailPostulaciones}
        </a>
        <a
          href={enlace}
          className="mt-7 inline-block w-full rounded-full bg-cyan px-8 py-3.5 text-center font-semibold text-white transition-colors hover:bg-cyan-deep sm:w-auto"
        >
          Escribir ahora
        </a>
        <p className="mt-6 text-xs leading-relaxed text-white/60">
          Al enviar tu currículum aceptas que lo guardemos para contactarte por procesos de selección, según nuestra{" "}
          <a href="/privacidad/" className="underline underline-offset-2 hover:text-white">
            política de privacidad
          </a>
          . Puedes pedirnos que lo eliminemos cuando quieras.
        </p>
      </div>
    </PaginaInterior>
  );
}
