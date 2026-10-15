"use client";

/**
 * Avisos breves de confirmación ("Cambios guardados"). Cualquier parte de la app
 * llama a `avisar`; `components/ui/Avisos` los muestra. Va por un evento de la
 * ventana para no tener que pasar nada por props ni montar un contexto.
 */
export const EVENTO_AVISO = "plataforma:aviso";

export function avisar(mensaje: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_AVISO, { detail: mensaje }));
}
