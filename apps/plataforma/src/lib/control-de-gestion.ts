"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Datos del módulo Control de Gestión, leídos de Supabase.
 *
 * Las consultas no llevan filtro de usuario a propósito: quién puede ver qué lo
 * deciden las políticas RLS (ver `supabase/migraciones/`). Sin sesión, estas
 * mismas consultas devuelven cero filas.
 *
 * Todos los montos van en pesos chilenos, sin decimales.
 */

export type Periodo = "trimestre" | "semestre" | "anio";

export const periodos: { id: Periodo; etiqueta: string }[] = [
  { id: "trimestre", etiqueta: "Últimos 3 meses" },
  { id: "semestre", etiqueta: "Últimos 6 meses" },
  { id: "anio", etiqueta: "Todo el año" },
];

/** Cuántos meses toma cada período del final de la serie. */
export function mesesDelPeriodo(periodo: Periodo, disponibles: number) {
  if (periodo === "trimestre") return Math.min(3, disponibles);
  if (periodo === "semestre") return Math.min(6, disponibles);
  return disponibles;
}

export type EstadoContrato = "en-plazo" | "en-riesgo" | "atrasado" | "cerrado";

export type Contrato = {
  id: string;
  nombre: string;
  cliente: string;
  faena: string;
  /** Avance físico informado, 0–100. */
  avance: number;
  presupuesto: number;
  costoReal: number;
  estado: EstadoContrato;
  /** Término contractual, ISO corto. */
  termino: string;
};

export type MesFacturado = {
  /** Día 1 del mes, en ISO. */
  periodo: string;
  /** "Ene", "Feb"… para el eje del gráfico. */
  etiqueta: string;
  monto: number;
};

export type Seguridad = {
  diasSinAccidentes: number;
  hhAcumuladas: number;
  ultimaAuditoria: string | null;
};

export type Datos = {
  contratos: Contrato[];
  facturacion: MesFacturado[];
  seguridad: Seguridad | null;
};

/* ── Consultas ───────────────────────────────────────────────────────────── */

/* Las filas llegan en snake_case desde Postgres; la app trabaja en camelCase. */

type FilaContrato = {
  id: string;
  nombre: string;
  cliente: string;
  faena: string;
  avance: number;
  presupuesto: number;
  costo_real: number;
  estado: EstadoContrato;
  termino: string;
};

type FilaFacturacion = { periodo: string; monto: number };

type FilaSeguridad = {
  dias_sin_accidentes: number;
  hh_acumuladas: number;
  ultima_auditoria: string | null;
};

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function etiquetaDeMes(iso: string) {
  // Cortamos la cadena en vez de usar `new Date`: así el mes no se corre por
  // zona horaria (en Chile, un `2026-09-01` en UTC se leería como agosto).
  const mes = Number(iso.slice(5, 7));
  return MESES[mes - 1] ?? iso;
}

export async function cargarDatos(): Promise<Datos> {
  const [contratos, facturacion, seguridad] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, nombre, cliente, faena, avance, presupuesto, costo_real, estado, termino")
      .order("termino", { ascending: true }),
    supabase
      .from("facturacion")
      .select("periodo, monto")
      .order("periodo", { ascending: true }),
    supabase
      .from("seguridad")
      .select("dias_sin_accidentes, hh_acumuladas, ultima_auditoria")
      .maybeSingle(),
  ]);

  const fallo = contratos.error ?? facturacion.error ?? seguridad.error;
  if (fallo) throw new Error(fallo.message);

  return {
    contratos: ((contratos.data ?? []) as FilaContrato[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cliente: c.cliente,
      faena: c.faena,
      avance: c.avance,
      presupuesto: c.presupuesto,
      costoReal: c.costo_real,
      estado: c.estado,
      termino: c.termino,
    })),
    facturacion: ((facturacion.data ?? []) as FilaFacturacion[]).map((f) => ({
      periodo: f.periodo,
      etiqueta: etiquetaDeMes(f.periodo),
      monto: f.monto,
    })),
    seguridad: seguridad.data
      ? {
          diasSinAccidentes: (seguridad.data as FilaSeguridad).dias_sin_accidentes,
          hhAcumuladas: (seguridad.data as FilaSeguridad).hh_acumuladas,
          ultimaAuditoria: (seguridad.data as FilaSeguridad).ultima_auditoria,
        }
      : null,
  };
}

export type EstadoDatos =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; datos: Datos };

export function useControlDeGestion(): EstadoDatos {
  const [estado, setEstado] = useState<EstadoDatos>({ estado: "cargando" });

  useEffect(() => {
    let vigente = true;

    cargarDatos()
      .then((datos) => {
        if (vigente) setEstado({ estado: "listo", datos });
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        const mensaje = e instanceof Error ? e.message : String(e);
        setEstado({ estado: "error", mensaje });
      });

    return () => {
      vigente = false;
    };
  }, []);

  return estado;
}

/* ── Formato chileno ─────────────────────────────────────────────────────── */

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const formatearPesos = (monto: number) => clp.format(monto);

/** Versión corta para ejes y tarjetas: "$1.240 M". */
export function formatearMillones(monto: number) {
  const millones = monto / 1_000_000;
  const decimales = millones >= 100 ? 0 : 1;
  return `$${millones.toLocaleString("es-CL", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} M`;
}

export function formatearFecha(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
