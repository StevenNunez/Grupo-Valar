"use client";

import { useState } from "react";
import { empresa, servicios } from "@/lib/content";
import { Reveal } from "./Reveal";

/**
 * Sin backend de correo todavía: el formulario compone el mensaje y lo abre
 * en WhatsApp o en el cliente de correo del visitante.
 */
export function Contacto() {
  const [canal, setCanal] = useState<"whatsapp" | "email">("whatsapp");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get("nombre") ?? "");
    const empresaCliente = String(fd.get("empresa") ?? "");
    const servicio = String(fd.get("servicio") ?? "");
    const mensaje = String(fd.get("mensaje") ?? "");

    const cuerpo = [
      `Nombre: ${nombre}`,
      empresaCliente && `Empresa: ${empresaCliente}`,
      `Servicio: ${servicio}`,
      "",
      mensaje,
    ]
      .filter(Boolean)
      .join("\n");

    if (canal === "whatsapp") {
      window.open(
        `https://wa.me/${empresa.telefonoRaw.replace("+", "")}?text=${encodeURIComponent(
          `Hola Valar, quiero cotizar un proyecto.\n\n${cuerpo}`,
        )}`,
        "_blank",
        "noopener",
      );
    } else {
      window.location.href = `mailto:${empresa.email}?subject=${encodeURIComponent(
        `Cotización ${servicio} — ${empresaCliente || nombre}`,
      )}&body=${encodeURIComponent(cuerpo)}`;
    }
  }

  return (
    <section id="contacto" className="bg-mist">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
          <Reveal>
            <p className="text-xs font-medium tracking-brand uppercase text-cyan">Contáctanos</p>
            <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] text-ink">
              Cuéntanos qué
              <br />
              necesitas construir
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              Respondemos con una propuesta técnica y comercial. Empresa inscrita en Sicep.
            </p>

            <dl className="mt-12 space-y-7">
              <Dato label="Email">
                <a className="hover:text-cyan" href={`mailto:${empresa.email}`}>
                  {empresa.email}
                </a>
              </Dato>
              <Dato label="Dirección">{empresa.direccion}</Dato>
              <Dato label="Razón social">
                {empresa.razonSocial} · RUT {empresa.rut}
              </Dato>
            </dl>
          </Reveal>

          <Reveal delay={100}>
            <form onSubmit={onSubmit} className="rounded-2xl bg-white p-8 lg:p-10">
              <div className="grid gap-5 sm:grid-cols-2">
                <Campo label="Nombre" name="nombre" required placeholder="Tu nombre" />
                <Campo label="Empresa" name="empresa" placeholder="Nombre de la empresa" />
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-ink" htmlFor="servicio">
                  Servicio de interés
                </label>
                <select
                  id="servicio"
                  name="servicio"
                  defaultValue={servicios[0].titulo}
                  className="mt-2 w-full rounded-lg border border-mist-deep bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-cyan"
                >
                  {servicios.map((s) => (
                    <option key={s.id}>{s.titulo}</option>
                  ))}
                  <option>Otro / no estoy seguro</option>
                </select>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-ink" htmlFor="mensaje">
                  Mensaje
                </label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={5}
                  required
                  placeholder="Describe brevemente el alcance, la faena y los plazos."
                  className="mt-2 w-full resize-y rounded-lg border border-mist-deep bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-cyan"
                />
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-ink">Enviar por</legend>
                <div className="mt-3 flex gap-2">
                  {(["whatsapp", "email"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCanal(c)}
                      aria-pressed={canal === c}
                      className={`rounded-full border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                        canal === c
                          ? "border-ink bg-ink text-white"
                          : "border-mist-deep text-ink-soft hover:border-ink"
                      }`}
                    >
                      {c === "whatsapp" ? "WhatsApp" : "Email"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button
                type="submit"
                className="mt-8 w-full rounded-full bg-cyan px-6 py-4 font-semibold text-white transition-colors hover:bg-cyan-deep"
              >
                Enviar solicitud
              </button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft/60">
        {label}
      </dt>
      <dd className="mt-1.5 text-lg text-ink">{children}</dd>
    </div>
  );
}

function Campo({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-mist-deep bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-cyan"
      />
    </div>
  );
}
