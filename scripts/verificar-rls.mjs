/**
 * Comprueba que las políticas RLS hacen lo que decimos que hacen.
 *
 *   npm run verificar
 *
 * Usa SOLO la clave publishable, la misma que va en el navegador. Hace dos
 * pasadas:
 *
 *   1. Sin sesión  → no debe ver NADA. Si ve algo, la plataforma está abierta.
 *   2. Con la cuenta demo → debe ver los datos.
 *
 * Vale la pena correrlo después de tocar cualquier política.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const correo = process.env.DEMO_EMAIL ?? "demo@grupovalar.cl";
const password = process.env.DEMO_PASSWORD;

if (!url || !anon) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.");
  process.exit(1);
}

const TABLAS = ["contratos", "facturacion", "seguridad", "perfiles"];

async function contar(cliente, tabla) {
  const { data, error } = await cliente.from(tabla).select("*").limit(50);
  if (error) return { bloqueado: true, detalle: error.message, filas: 0 };
  return { bloqueado: false, filas: data.length };
}

let problemas = 0;

/* ── 1. Sin sesión: no debe ver nada ──────────────────────────────────────── */

console.log("\n1) Anónimo (sin iniciar sesión)\n");
const anonimo = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const tabla of TABLAS) {
  const r = await contar(anonimo, tabla);
  if (r.bloqueado) {
    console.log(`   ✓ ${tabla.padEnd(12)} bloqueado (${r.detalle})`);
  } else if (r.filas === 0) {
    console.log(`   ✓ ${tabla.padEnd(12)} 0 filas — RLS filtrando`);
  } else {
    console.log(`   ✗ ${tabla.padEnd(12)} ${r.filas} FILAS VISIBLES SIN SESIÓN`);
    problemas++;
  }
}

/* ── 2. Con la cuenta demo: sí debe ver ───────────────────────────────────── */

if (!password) {
  console.log("\n2) Cuenta demo: omitido (falta DEMO_PASSWORD en .env.local)\n");
} else {
  console.log("\n2) Con la cuenta demo\n");
  const conSesion = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await conSesion.auth.signInWithPassword({ email: correo, password });

  if (error) {
    console.log(`   ✗ No se pudo iniciar sesión: ${error.message}`);
    console.log("     ¿Ya corriste `npm run sembrar`?");
    problemas++;
  } else {
    for (const tabla of TABLAS) {
      const r = await contar(conSesion, tabla);
      if (r.bloqueado) {
        console.log(`   ✗ ${tabla.padEnd(12)} bloqueado con sesión (${r.detalle})`);
        problemas++;
      } else if (r.filas === 0) {
        console.log(`   · ${tabla.padEnd(12)} 0 filas (sin datos sembrados todavía)`);
      } else {
        console.log(`   ✓ ${tabla.padEnd(12)} ${r.filas} filas visibles`);
      }
    }
    await conSesion.auth.signOut();
  }
}

console.log(
  problemas === 0
    ? "\nTodo en orden: sin sesión no se ve nada, con sesión sí.\n"
    : `\n${problemas} problema(s). Revisa las políticas en supabase/migraciones/.\n`,
);
process.exit(problemas === 0 ? 0 : 1);
