import { supabase } from "./supabase";

/**
 * Postulaciones de «Trabaja con nosotros» (0113).
 *
 * Las inserta el sitio público; acá solo se leen y se gestionan. El currículum
 * vive en el bucket privado `postulaciones` y se abre con un enlace firmado de
 * pocos minutos: nunca hay una URL permanente al archivo.
 */

export const estadosPostulacion = [
  { id: "nueva", titulo: "Nueva" },
  { id: "en_revision", titulo: "En revisión" },
  { id: "contactada", titulo: "Contactada" },
  { id: "contratada", titulo: "Contratada" },
  { id: "descartada", titulo: "Descartada" },
] as const;

export type EstadoPostulacion = (typeof estadosPostulacion)[number]["id"];

/** Las áreas del formulario del sitio (`FormularioCV.tsx` en apps/web): para filtrar. */
export const areasPostulacion = [
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

/** El aviso de privacidad del sitio promete conservar el CV hasta 24 meses. */
export const MESES_DE_CONSERVACION = 24;

export type Postulacion = {
  id: string;
  creadoEn: string;
  nombre: string;
  correo: string;
  telefono: string;
  ciudad: string;
  area: string;
  experiencia: string;
  mensaje: string | null;
  cvRuta: string;
  cvNombre: string;
  cvTamano: number;
  versionPrivacidad: string;
  estado: EstadoPostulacion;
  notas: string | null;
};

export type FiltrosPostulaciones = {
  texto: string;
  estado: "todos" | EstadoPostulacion;
  area: string;
};

type Fila = Record<string, unknown>;

const aPostulacion = (f: Fila): Postulacion => ({
  id: f.id as string,
  creadoEn: f.creado_en as string,
  nombre: f.nombre as string,
  correo: f.correo as string,
  telefono: f.telefono as string,
  ciudad: f.ciudad as string,
  area: f.area as string,
  experiencia: f.experiencia as string,
  mensaje: (f.mensaje as string | null) ?? null,
  cvRuta: f.cv_ruta as string,
  cvNombre: f.cv_nombre as string,
  cvTamano: Number(f.cv_tamano),
  versionPrivacidad: f.version_privacidad as string,
  estado: f.estado as EstadoPostulacion,
  notas: (f.notas as string | null) ?? null,
});

const sinTabla = (mensaje: string) =>
  /postulaciones/.test(mensaje) && /exist|schema cache/i.test(mensaje) ? "Falta aplicar la migración 0113 en la base." : mensaje;

export async function cargarPaginaPostulaciones(f: FiltrosPostulaciones, desde: number, cuantos: number): Promise<Postulacion[]> {
  let q = supabase.from("postulaciones").select("*").order("creado_en", { ascending: false });
  if (f.estado !== "todos") q = q.eq("estado", f.estado);
  if (f.area !== "todas") q = q.eq("area", f.area);
  // Sin comas ni paréntesis ni comodines: son la sintaxis del filtro `or` de PostgREST.
  const t = f.texto.trim().replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ");
  if (t) q = q.or(`nombre.ilike.%${t}%,correo.ilike.%${t}%,ciudad.ilike.%${t}%,telefono.ilike.%${t}%`);
  const { data, error } = await q.range(desde, desde + cuantos - 1);
  if (error) throw new Error(sinTabla(error.message));
  return (data ?? []).map(aPostulacion);
}

export type ResumenPostulaciones = { total: number; nuevas: number; enRevision: number; contactadas: number; vencidas: number };

export async function cargarResumenPostulaciones(): Promise<ResumenPostulaciones> {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_DE_CONSERVACION);
  const cuenta = async (filtrar?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = filtrar ? filtrar(base()) : base();
    const { count, error } = await q;
    if (error) throw new Error(sinTabla(error.message));
    return count ?? 0;
  };
  const base = () => supabase.from("postulaciones").select("id", { count: "exact", head: true });
  const [total, nuevas, enRevision, contactadas, vencidas] = await Promise.all([
    cuenta(),
    cuenta((q) => q.eq("estado", "nueva")),
    cuenta((q) => q.eq("estado", "en_revision")),
    cuenta((q) => q.eq("estado", "contactada")),
    cuenta((q) => q.lt("creado_en", limite.toISOString())),
  ]);
  return { total, nuevas, enRevision, contactadas, vencidas };
}

export async function guardarGestion(id: string, estado: EstadoPostulacion, notas: string) {
  const { error } = await supabase.from("postulaciones").update({ estado, notas: notas.trim() || null }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Enlace al CV que vale 2 minutos: se abre en una pestaña nueva. */
export async function enlaceDelCV(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from("postulaciones").createSignedUrl(ruta, 120);
  if (error || !data) throw new Error(error?.message ?? "No se pudo abrir el currículum.");
  return data.signedUrl;
}

/** Borra el archivo y la fila (a pedido del postulante o al vencer la conservación). */
export async function eliminarPostulacion(p: Postulacion) {
  const { error: falloArchivo } = await supabase.storage.from("postulaciones").remove([p.cvRuta]);
  if (falloArchivo) throw new Error(`No se pudo borrar el archivo: ${falloArchivo.message}`);
  const { error } = await supabase.from("postulaciones").delete().eq("id", p.id);
  if (error) throw new Error(error.message);
}
