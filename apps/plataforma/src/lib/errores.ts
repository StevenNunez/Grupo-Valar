"use client";

import { supabase } from "./supabase";

/**
 * Los errores, del lado de la pantalla.
 *
 *   mensajeParaPersona(e, donde)  lo que se le muestra a quien usa la
 *                                 plataforma: en castellano y diciendo qué hacer.
 *                                 Los errores que no sabe explicar los reporta.
 *   reportarError(donde, e)       manda el error al registro (api/errores), sin
 *                                 esperar respuesta y sin lanzar nunca.
 *
 * Los mensajes que escribimos nosotros («Ya se le pidió cotización a este
 * proveedor…») pasan tal cual: solo se traduce lo que viene en inglés de
 * Postgres, PostgREST o el navegador.
 */

/**
 * Un error que es de un campo en particular. Si una acción de guardado lo lanza
 * dentro de `useFormulario`, el campo queda marcado en rojo con este mensaje al
 * lado y el foco va a él:
 *
 *   if (fin < inicio) throw new ErrorDeCampo("fecha_fin", "Termina antes de empezar.");
 */
export class ErrorDeCampo extends Error {
  constructor(
    public campo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeCampo";
  }
}

export function textoDeError(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

type Regla = {
  si: RegExp;
  mensaje: string;
  /** Vale la pena que Teo Labs se entere (no es un error esperable del uso). */
  reportar?: boolean;
};

const REGLAS: Regla[] = [
  {
    si: /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i,
    mensaje: "No se pudo conectar. Revisa tu conexión a internet y vuelve a intentar.",
  },
  {
    si: /jwt expired|invalid jwt|refresh token|session.*(expired|missing)|not authenticated/i,
    mensaje: "Tu sesión expiró. Vuelve a ingresar para seguir.",
  },
  {
    si: /statement timeout|canceling statement|timed out|\b(502|503|504|520|522|524)\b/i,
    mensaje: "La base de datos tardó más de lo normal en responder. Suele ser pasajero: prueba de nuevo en unos segundos.",
    reportar: true,
  },
  {
    si: /row-level security|permission denied|42501|not allowed|insufficient privilege/i,
    mensaje: "Tu acceso no permite hacer esto. Si lo necesitas, pídeselo a quien administra la plataforma.",
  },
  {
    si: /duplicate key|already exists|23505/i,
    mensaje: "Ya existe un registro con ese mismo número o código. Revisa que no lo hayas cargado antes.",
  },
  {
    si: /is still referenced|update or delete on table/i,
    mensaje: "No se puede borrar porque hay otros registros que dependen de este. Bórralos o desvincúlalos primero.",
  },
  {
    si: /is not present in table|violates foreign key/i,
    mensaje: "Uno de los datos elegidos ya no existe. Recarga la página y vuelve a elegirlo.",
  },
  {
    si: /null value in column|violates not-null|23502/i,
    mensaje: "Falta completar un dato obligatorio. Revisa los campos marcados con asterisco.",
  },
  {
    si: /violates check constraint|23514/i,
    mensaje: "Uno de los valores no es válido para este registro. Revisa montos, fechas y cantidades.",
  },
  {
    si: /invalid input syntax|22P02|invalid date|date\/time field value out of range|22007|22008/i,
    mensaje: "Uno de los valores no tiene el formato correcto (por ejemplo, una fecha o un número).",
  },
  {
    si: /out of range|22003/i,
    mensaje: "Uno de los números es demasiado grande. Revisa que no tenga dígitos de más.",
  },
  {
    si: /schema cache|does not exist|could not find the|PGRST20[0-9]|42P01|42703|42883/i,
    mensaje: "Falta aplicar una actualización de la base de datos. Avísale a Teo Labs para que la deje lista.",
    reportar: true,
  },
  {
    si: /payload too large|request entity too large|413/i,
    mensaje: "El archivo es demasiado grande. Prueba con uno más liviano.",
  },
];

/** Inglés técnico que no escribimos nosotros: si no calza ninguna regla, mejor no mostrarlo crudo. */
const EN_INGLES = /\b(error|failed|violates|column|relation|function|syntax|invalid|unexpected|cannot|undefined|null|exception|unknown|denied|constraint|is not)\b/i;
const CASTELLANO = /[áéíóúñ¿¡]|\b(no se|el|la|los|las|de|para|una?|que|ya|falta)\b/i;

const GENERICO = "Algo no salió bien. Prueba de nuevo y, si sigue pasando, avísale a Teo Labs: ya quedó registrado.";

/** Qué decirle a la persona y si conviene reportarlo. Sin efectos: se puede llamar al dibujar. */
export function explicarError(e: unknown): { mensaje: string; reportar: boolean } {
  const texto = textoDeError(e);
  for (const r of REGLAS) {
    if (r.si.test(texto)) return { mensaje: r.mensaje, reportar: !!r.reportar };
  }
  if (!texto.trim() || (EN_INGLES.test(texto) && !CASTELLANO.test(texto))) return { mensaje: GENERICO, reportar: true };
  return { mensaje: texto, reportar: false };
}

/** Para mostrar en pantalla al atrapar un error: lo explica y, si hace falta, lo reporta. */
export function mensajeParaPersona(e: unknown, donde = "pantalla"): string {
  const { mensaje, reportar } = explicarError(e);
  if (reportar) reportarError(donde, e);
  return mensaje;
}

/* El mismo error de la misma pantalla se reporta una vez por sesión del navegador. */
const yaReportados = new Set<string>();

export function reportarError(donde: string, e: unknown) {
  if (typeof window === "undefined") return;
  const mensaje = textoDeError(e).slice(0, 2000);
  const clave = `${donde}|${mensaje}`;
  if (yaReportados.has(clave) || yaReportados.size > 200) return;
  yaReportados.add(clave);

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      await fetch("/api/errores/", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          donde,
          mensaje,
          pila: e instanceof Error ? e.stack?.slice(0, 4000) : undefined,
          pagina: window.location.pathname,
        }),
      });
    } catch {
      // Sin conexión no hay cómo avisar; no vale la pena reintentar.
    }
  })();
}
