import type { Metadata } from "next";
import { FormularioAcceso } from "@/components/FormularioAcceso";
import { Logo, LogoMark } from "@/components/Logo";
import { empresa } from "@/lib/empresa";

export const metadata: Metadata = {
  // Título completo a mano: la plantilla del layout raíz no alcanza a la página
  // de su mismo segmento, así que acá "Acceso" quedaría solo en la pestaña.
  title: "Acceso | Plataforma Valar",
  description: `Ingreso de usuarios a la plataforma interna de ${empresa.razonSocial}.`,
};

/** Puerta de entrada del subdominio: quien llega sin sesión, llega acá. */
export default function AccesoPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca. En móvil se reduce a una franja sobre el formulario. */}
      <section className="relative isolate overflow-hidden bg-ink px-6 py-12 text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-16">
        <LogoMark className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-auto text-white/5" />

        <Logo className="text-2xl" />

        <div className="mt-12 lg:mt-0">
          <p className="text-xs font-medium tracking-brand text-cyan uppercase">
            Plataforma interna
          </p>
          <h1 className="mt-5 max-w-md font-display text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.02]">
            Plataforma
            <br />
            <span className="text-white/55">Valar.</span>
          </h1>
          <p className="mt-6 max-w-sm leading-relaxed text-white/70">
            Control de gestión de contratos, avance físico y costos de faena, en un
            solo lugar y con la información del día.
          </p>
        </div>

        <p className="mt-12 hidden text-xs text-white/40 lg:block">
          Uso exclusivo del personal autorizado de {empresa.razonSocial}.
        </p>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center px-6 py-14 lg:px-14">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl font-semibold text-ink">
            Iniciar sesión
          </h2>
          <p className="mt-3 text-ink-soft">
            Ingresa con tu correo corporativo para entrar a los módulos.
          </p>

          <FormularioAcceso />
        </div>
      </section>
    </main>
  );
}
