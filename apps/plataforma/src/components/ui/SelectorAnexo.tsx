"use client";

import { useEffect, useState } from "react";
import { CampoSeleccion } from "./Formulario";
import { cargarAnexos, etiquetaAnexo, type Anexo } from "@/lib/anexos";

/**
 * "Se carga contra": el contrato base o uno de sus anexos vigentes (0059).
 *
 * Un anexo puede ser otro negocio dentro del contrato (el Anexo N°2 de
 * Misceláneos es "Carpas"): lo que se le carga sale en su propio resultado.
 * Si el contrato no tiene anexos vigentes, no aparece y todo va a la base.
 *
 * `valor` vacío = contrato base. Si se cambia de contrato y el anexo elegido
 * no es del nuevo, se suelta solo.
 */
export function SelectorAnexo({
  contratoId,
  valor,
  alCambiar,
  ayuda = "Lo que se carga a un anexo sale en su propio resultado, separado del contrato base.",
  alCargar,
}: {
  contratoId: string;
  valor: string;
  alCambiar: (anexoId: string) => void;
  ayuda?: string;
  /** Para quien necesita los anexos (ej. imprimir el proyecto de una OC). */
  alCargar?: (anexos: Anexo[]) => void;
}) {
  const [anexos, setAnexos] = useState<{ contratoId: string; lista: Anexo[] }>({ contratoId: "", lista: [] });

  useEffect(() => {
    if (!contratoId) return;
    let vigente = true;
    cargarAnexos(contratoId)
      .then((lista) => {
        if (!vigente) return;
        const vigentes = lista.filter((a) => a.estado === "vigente" || a.id === valor);
        setAnexos({ contratoId, lista: vigentes });
        alCargar?.(vigentes);
        if (valor && !vigentes.some((a) => a.id === valor)) alCambiar("");
      })
      .catch(() => vigente && setAnexos({ contratoId, lista: [] }));
    return () => {
      vigente = false;
    };
    // Solo al cambiar de contrato: `valor` y los callbacks no deben volver a pedirlos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);

  const lista = anexos.contratoId === contratoId ? anexos.lista : [];
  if (lista.length === 0) return null;

  return (
    <CampoSeleccion
      etiqueta="Se carga contra"
      opciones={[{ id: "", titulo: "Contrato base" }, ...lista.map((a) => ({ id: a.id, titulo: etiquetaAnexo(a) }))]}
      ayuda={ayuda}
      valor={valor}
      alCambiar={alCambiar}
    />
  );
}
