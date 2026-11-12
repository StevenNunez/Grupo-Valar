"use client";

import { mensajeParaPersona } from "@/lib/errores";

import { useEffect, useState } from "react";
import { avisar } from "@/lib/avisos";
import { direccionCompleta } from "@/lib/empresa";
import { useEmpresa } from "@/lib/empresa-cliente";
import { useUsuario } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";

const campo = "mt-2 w-full rounded-xl border border-mist-deep bg-white px-4 py-3.5 text-ink outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";
const etiqueta = "text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft";
const boton = "rounded-full bg-cyan-deep px-7 py-3 font-semibold text-white hover:bg-cyan-hondo disabled:cursor-wait disabled:opacity-70";

/**
 * «Firma de los correos»: lo que cierra cada solicitud de cotización y cada
 * orden de compra que esta persona envía. El nombre sale del perfil; la
 * empresa, la dirección y el sitio, de «Datos de la empresa». Acá solo se
 * escriben el área y el teléfono. La vista previa es la misma firma que llega
 * al proveedor (ver `firmaEnHtml` en `lib/oc-envio/correo.ts`).
 */
export function FirmaCorreoPerfil() {
  const usuario = useUsuario();
  const empresa = useEmpresa();
  const [area, setArea] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargada, setCargada] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    supabase
      .from("perfiles")
      .select("firma_area, firma_telefono")
      .eq("id", usuario.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!vigente) return;
        // Sin la 0111 la consulta falla: queda vacío y el guardado explica qué falta.
        setArea((data?.firma_area as string | null | undefined) ?? "");
        setTelefono((data?.firma_telefono as string | null | undefined) ?? "");
        setCargada(true);
      });
    return () => {
      vigente = false;
    };
  }, [usuario.id]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setTrabajando(true);
    setError(null);
    const { error: falla } = await supabase
      .from("perfiles")
      .update({ firma_area: area.trim() || null, firma_telefono: telefono.trim() || null })
      .eq("id", usuario.id);
    setTrabajando(false);
    if (falla) {
      return setError(/firma_/.test(falla.message) ? "Falta aplicar la migración 0111 en la base." : mensajeParaPersona(falla, "FirmaCorreoPerfil"));
    }
    avisar("Firma de correo guardada");
  }

  return (
    <form onSubmit={guardar} className="rounded-2xl border border-mist-deep bg-white p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold">Firma de los correos</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Cierra las solicitudes de cotización y las órdenes de compra que envíes. Tu nombre, la empresa, la dirección y el
        sitio salen solos; acá completas el área y el teléfono.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="firma-area" className={etiqueta}>Área</label>
          <input id="firma-area" maxLength={80} placeholder="Abastecimiento" value={area} onChange={(e) => setArea(e.target.value)} className={campo} disabled={!cargada} />
        </div>
        <div>
          <label htmlFor="firma-telefono" className={etiqueta}>Teléfono</label>
          <input id="firma-telefono" type="tel" autoComplete="tel" maxLength={40} placeholder="+56 9 1234 5678" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} disabled={!cargada} />
        </div>
      </div>

      <p className={`${etiqueta} mt-7`}>Así se verá</p>
      <div className="mt-3 flex items-center gap-4 rounded-xl border border-mist-deep bg-white p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://www.grupovalar.cl/logo-valar.png" alt="Valar" width={72} height={72} className="h-[72px] w-[72px] rounded-xl" />
        <div className="border-l-2 border-cyan pl-4 text-ink">
          <p className="text-base font-bold">{usuario.nombre}</p>
          <p className="mt-0.5 text-xs">
            {area.trim() && <strong className="italic">{area.trim()} </strong>}
            {empresa.nombreEnOrdenes}
          </p>
          {telefono.trim() && <p className="mt-0.5 text-sm font-bold text-cyan-deep">{telefono.trim()}</p>}
          <p className="mt-0.5 text-[11px] text-ink-soft">{direccionCompleta(empresa)}</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">www.GrupoValar.cl</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={trabajando || !cargada} className={`${boton} mt-6`}>
        {trabajando ? "Guardando…" : "Guardar firma de correo"}
      </button>
    </form>
  );
}
