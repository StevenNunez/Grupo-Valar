"use client";

import { supabase } from "./supabase";

/**
 * Respaldos adjuntos a un registro.
 *
 * El archivo vive en el bucket privado `respaldos` de Supabase Storage; acá
 * queda la ficha que dice de qué registro cuelga (ver
 * `supabase/migraciones/0012_respaldos_adjuntos.sql`).
 *
 * Son dos escrituras que tienen que ir juntas, y el orden importa: primero el
 * archivo, después la ficha. Si falla la ficha, se borra el archivo recién
 * subido; si se hiciera al revés quedarían fichas apuntando a la nada, que es
 * lo que se ve en pantalla.
 */

export const BUCKET = "respaldos";

/** Lo que Storage acepta, igual que la lista del bucket en la migración. */
export const TIPOS_ACEPTADOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

export const TAMANO_MAXIMO = 25 * 1024 * 1024;

export type Adjunto = {
  id: string;
  tabla: string;
  registroId: string;
  nombre: string;
  ruta: string;
  tipo: string | null;
  tamano: number;
  descripcion: string | null;
  creadoEn: string;
};

type FilaAdjunto = {
  id: string;
  tabla: string;
  registro_id: string;
  nombre: string;
  ruta: string;
  tipo: string | null;
  tamano: number;
  descripcion: string | null;
  creado_en: string;
};

function mapear(f: FilaAdjunto): Adjunto {
  return {
    id: f.id,
    tabla: f.tabla,
    registroId: f.registro_id,
    nombre: f.nombre,
    ruta: f.ruta,
    tipo: f.tipo,
    tamano: f.tamano,
    descripcion: f.descripcion,
    creadoEn: f.creado_en,
  };
}

export async function cargarAdjuntos(tabla: string, registroId: string) {
  const { data, error } = await supabase
    .from("adjuntos")
    .select("*")
    .eq("tabla", tabla)
    .eq("registro_id", registroId)
    .order("creado_en", { ascending: false });

  if (error) throw new Error(traducir(error.message));
  return ((data ?? []) as FilaAdjunto[]).map(mapear);
}

/** Cuántos respaldos tiene cada registro de una tabla, para el clip de la fila. */
export async function contarAdjuntos(tabla: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("adjuntos_por_registro")
    .select("registro_id, cuantos")
    .eq("tabla", tabla);

  // Que falte la cuenta no puede tumbar la pantalla: es un adorno de la fila.
  if (error) return new Map();

  return new Map(
    ((data ?? []) as { registro_id: string; cuantos: number }[]).map((f) => [
      f.registro_id,
      Number(f.cuantos),
    ]),
  );
}

/**
 * El nombre con que el archivo queda guardado.
 *
 * Storage acepta un juego de caracteres acotado en las rutas, así que los
 * acentos, los espacios y los paréntesis —que abundan en los nombres reales:
 * "Factura N° 1234 (Valar).pdf"— se reemplazan. El nombre original no se
 * pierde: viaja en la columna `nombre` y es el que se ve en pantalla.
 *
 * Delante va la marca de tiempo para que subir dos veces el mismo archivo no
 * pise la versión anterior.
 */
function rutaPara(tabla: string, registroId: string, nombre: string) {
  const sano = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // las tildes que dejó el NFD
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80);

  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  const registro = registroId.replace(/[^a-zA-Z0-9._-]+/g, "-");

  return `${tabla}/${registro}/${marca}-${sano || "archivo"}`;
}

export async function subirAdjunto({
  tabla,
  registroId,
  archivo,
  descripcion,
}: {
  tabla: string;
  registroId: string;
  archivo: File;
  descripcion?: string;
}) {
  if (archivo.size > TAMANO_MAXIMO) {
    throw new Error(
      `"${archivo.name}" pesa ${formatearPeso(archivo.size)}. El máximo por archivo es 25 MB.`,
    );
  }

  const ruta = rutaPara(tabla, registroId, archivo.name);

  const subida = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: archivo.type || "application/octet-stream",
    upsert: false,
  });
  if (subida.error) throw new Error(traducir(subida.error.message));

  const { error } = await supabase.from("adjuntos").insert({
    tabla,
    registro_id: registroId,
    nombre: archivo.name,
    ruta,
    tipo: archivo.type || null,
    tamano: archivo.size,
    descripcion: descripcion?.trim() || null,
  });

  if (error) {
    // La ficha no entró: el archivo no puede quedar suelto en el bucket.
    await supabase.storage.from(BUCKET).remove([ruta]);
    throw new Error(traducir(error.message));
  }
}

export async function borrarAdjunto(adjunto: Adjunto) {
  const { error } = await supabase.from("adjuntos").delete().eq("id", adjunto.id);
  if (error) throw new Error(traducir(error.message));

  // El archivo se va después de la ficha: si esto falla, queda un archivo
  // huérfano ocupando espacio, que es mucho menos grave que una ficha que
  // apunta a un archivo borrado.
  await supabase.storage.from(BUCKET).remove([adjunto.ruta]);
}

/**
 * Un enlace temporal para abrir o descargar el archivo.
 *
 * El bucket es privado, así que no hay URL permanente: se pide una firmada con
 * la sesión de quien está mirando, y vale una hora.
 */
export async function enlaceDeAdjunto(adjunto: Adjunto, descargar = false) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(adjunto.ruta, 3600, descargar ? { download: adjunto.nombre } : undefined);

  if (error) throw new Error(traducir(error.message));
  return data.signedUrl;
}

export function formatearPeso(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Qué es el archivo, en una palabra, para el ícono y el texto de la lista. */
export function claseDe(adjunto: Adjunto): "pdf" | "excel" | "word" | "imagen" | "archivo" {
  const t = adjunto.tipo ?? "";
  const n = adjunto.nombre.toLowerCase();

  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (t.includes("spreadsheet") || t === "application/vnd.ms-excel" || /\.(xlsx?|csv)$/.test(n))
    return "excel";
  if (t.includes("word") || /\.docx?$/.test(n)) return "word";
  if (t.startsWith("image/")) return "imagen";
  return "archivo";
}

function traducir(mensaje: string) {
  if (/violates row-level security|permission denied|Unauthorized/i.test(mensaje)) {
    return "Tu acceso no permite subir o borrar respaldos de este registro.";
  }
  if (/mime type|not supported/i.test(mensaje)) {
    return "Ese tipo de archivo no se acepta. Sube un PDF, un Excel, un Word o una foto.";
  }
  if (/exceeded the maximum allowed size|Payload too large/i.test(mensaje)) {
    return "El archivo pasa del máximo de 25 MB.";
  }
  if (/Bucket not found|schema cache|does not exist|Could not find the table/i.test(mensaje)) {
    return (
      "Los respaldos todavía no están habilitados en la base. Falta aplicar " +
      "supabase/migraciones/0012_respaldos_adjuntos.sql en el SQL Editor de Supabase."
    );
  }
  if (/duplicate|already exists/i.test(mensaje)) {
    return "Ese archivo ya está subido en este registro.";
  }
  return mensaje;
}
