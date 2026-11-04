"use client";

import { useState } from "react";
import { empresa } from "@/lib/content";
import { supabaseAnon, supabaseUrl, versionPrivacidad } from "@/lib/site";

/**
 * Postulación espontánea. El archivo se sube a un espacio privado de Supabase y
 * los datos se insertan en `postulaciones` (migración 0113). Con la clave pública
 * (`anon`) un visitante puede SOLO eso: no lee, no lista, no borra. Lo ve el
 * personal de Valar en la Plataforma.
 *
 * El id lo genera el navegador porque el visitante no puede leer lo que inserta:
 * así el archivo y la fila quedan unidos por el mismo id.
 */

const AREAS = [
  "Obras civiles",
  "Mantenimiento industrial",
  "Movimiento de tierra",
  "Operador de maquinaria o equipos",
  "Andamios y montaje",
  "Prevención de riesgos",
  "Ingeniería y proyectos",
  "Administración y oficina",
  "Otra área",
];

const EXPERIENCIA = ["Sin experiencia", "Menos de 2 años", "2 a 5 años", "5 a 10 años", "Más de 10 años"];

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONES = ["pdf", "doc", "docx"];

const campo =
  "mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 text-ink outline-none transition-colors focus:border-cyan focus:ring-2 focus:ring-cyan/20";
const etiqueta = "text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft";

const nombreSeguro = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);

export function FormularioCV() {
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);

  const configurado = Boolean(supabaseUrl && supabaseAnon);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);

    // Trampa para robots: un campo que una persona no ve ni llena.
    if (String(f.get("sitio_web") ?? "") !== "") {
      setListo(true);
      return;
    }

    if (!archivo) return setError("Adjunta tu currículum.");
    const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES.includes(ext)) return setError("El currículum debe ser PDF, DOC o DOCX.");
    if (archivo.size > MAX_BYTES) return setError("El archivo pesa más de 5 MB. Comprímelo e inténtalo de nuevo.");
    if (archivo.size === 0) return setError("El archivo está vacío.");
    if (f.get("acepto") !== "on") return setError("Debes aceptar la política de privacidad para enviar tu postulación.");

    setEnviando(true);
    const id = crypto.randomUUID();
    const ruta = `${id}/${nombreSeguro(archivo.name)}`;
    const cabeceras = { apikey: supabaseAnon, Authorization: `Bearer ${supabaseAnon}` };

    try {
      const subida = await fetch(`${supabaseUrl}/storage/v1/object/postulaciones/${ruta}`, {
        method: "POST",
        headers: { ...cabeceras, "Content-Type": archivo.type || "application/octet-stream", "x-upsert": "false" },
        body: archivo,
      });
      if (!subida.ok) throw new Error("No se pudo subir el archivo.");

      const fila = await fetch(`${supabaseUrl}/rest/v1/postulaciones`, {
        method: "POST",
        headers: { ...cabeceras, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          id,
          nombre: String(f.get("nombre") ?? "").trim(),
          correo: String(f.get("correo") ?? "").trim().toLowerCase(),
          telefono: String(f.get("telefono") ?? "").trim(),
          ciudad: String(f.get("ciudad") ?? "").trim(),
          area: String(f.get("area") ?? ""),
          experiencia: String(f.get("experiencia") ?? ""),
          mensaje: String(f.get("mensaje") ?? "").trim() || null,
          cv_ruta: ruta,
          cv_nombre: archivo.name.slice(0, 200),
          cv_tamano: archivo.size,
          version_privacidad: versionPrivacidad,
        }),
      });
      if (!fila.ok) {
        // La base rechaza, entre otras cosas, el exceso de envíos desde un mismo correo.
        const cuerpo = await fila.text();
        throw new Error(/demasiadas/i.test(cuerpo) ? "Ya recibimos varias postulaciones con este correo. Te contactaremos si hay un proceso que calce." : "No se pudo guardar tu postulación.");
      }
      setListo(true);
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : "No se pudo enviar.") +
          ` Puedes intentar de nuevo o escribirnos a ${empresa.email}.`,
      );
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div role="status" className="rounded-2xl border border-mist-deep bg-mist/50 p-8 text-center sm:p-12">
        <p className="font-display text-2xl font-semibold text-ink">¡Gracias por postular!</p>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-soft">
          Recibimos tu currículum. Lo guardaremos en nuestra base y te contactaremos cuando haya un proceso de selección
          que calce con tu perfil.
        </p>
        <a href="/" className="mt-7 inline-block rounded-full bg-cyan px-6 py-3 font-semibold text-white transition-colors hover:bg-cyan-deep">
          Volver al inicio
        </a>
      </div>
    );
  }

  if (!configurado) {
    return (
      <div className="rounded-2xl border border-mist-deep bg-mist/50 p-8 text-ink-soft">
        El formulario no está disponible en este momento. Envíanos tu currículum a{" "}
        <a className="font-semibold text-cyan-deep underline" href={`mailto:${empresa.email}?subject=Postulación`}>
          {empresa.email}
        </a>
        .
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="grid gap-6 sm:grid-cols-2" noValidate={false}>
      {/* Trampa para robots (ver arriba). Fuera de pantalla, sin foco ni autocompletado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar
          <input name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="sm:col-span-2">
        <span className={etiqueta}>Nombre completo *</span>
        <input name="nombre" required maxLength={120} autoComplete="name" className={campo} />
      </label>

      <label>
        <span className={etiqueta}>Correo *</span>
        <input name="correo" type="email" required maxLength={160} autoComplete="email" className={campo} />
      </label>

      <label>
        <span className={etiqueta}>Teléfono *</span>
        <input name="telefono" type="tel" required maxLength={30} autoComplete="tel" placeholder="+56 9 1234 5678" className={campo} />
      </label>

      <label>
        <span className={etiqueta}>Ciudad *</span>
        <input name="ciudad" required maxLength={80} autoComplete="address-level2" placeholder="Antofagasta" className={campo} />
      </label>

      <label>
        <span className={etiqueta}>Área de interés *</span>
        <select name="area" required defaultValue="" className={campo}>
          <option value="" disabled>
            Elige un área
          </option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>

      <label className="sm:col-span-2">
        <span className={etiqueta}>Años de experiencia *</span>
        <select name="experiencia" required defaultValue="" className={campo}>
          <option value="" disabled>
            Elige una opción
          </option>
          {EXPERIENCIA.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>

      <label className="sm:col-span-2">
        <span className={etiqueta}>Cuéntanos algo más (opcional)</span>
        <textarea name="mensaje" rows={4} maxLength={1500} className={campo} placeholder="Cargos anteriores, certificaciones, disponibilidad para trabajar en faena…" />
      </label>

      <div className="sm:col-span-2">
        <span className={etiqueta}>Currículum (PDF, DOC o DOCX, hasta 5 MB) *</span>
        <input
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className={`${campo} file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white`}
        />
        {archivo && (
          <p className="mt-2 text-xs text-ink-soft">
            {archivo.name} · {(archivo.size / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 sm:col-span-2">
        <input name="acepto" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-cyan" />
        <span className="text-sm leading-relaxed text-ink-soft">
          Acepto que Valar guarde mis datos y mi currículum para contactarme por procesos de selección, según la{" "}
          <a href="/privacidad/" target="_blank" className="font-semibold text-cyan-deep underline underline-offset-2">
            política de privacidad
          </a>
          . Puedo pedir que los elimine cuando quiera.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-full bg-cyan px-8 py-3.5 font-semibold text-white transition-colors hover:bg-cyan-deep disabled:cursor-wait disabled:opacity-70"
        >
          {enviando ? "Enviando…" : "Enviar postulación"}
        </button>
      </div>
    </form>
  );
}
