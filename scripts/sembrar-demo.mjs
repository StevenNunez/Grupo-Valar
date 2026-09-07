/**
 * Siembra el usuario demo y los datos de Control de Gestión.
 *
 *   npm run sembrar
 *
 * Es idempotente: se puede correr las veces que haga falta sin duplicar nada.
 *
 * Usa la clave `service_role`, que se salta RLS. Por eso este script vive en la
 * raíz del repo y NO dentro de apps/plataforma: así la clave nunca queda en la
 * carpeta que Next compila. Las credenciales salen de .env.local, jamás
 * escritas acá.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const correoDemo = process.env.DEMO_EMAIL ?? "demo@grupovalar.cl";
const passwordDemo = process.env.DEMO_PASSWORD;

if (!url || !serviceRole) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local (raíz del repo).",
  );
  process.exit(1);
}

if (!passwordDemo) {
  console.error(
    "Falta DEMO_PASSWORD en .env.local (raíz del repo).\n" +
      "Agrega una línea así, con la contraseña que quieras para la cuenta demo:\n\n" +
      "  DEMO_PASSWORD=una-clave-larga-que-elijas-tu\n",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ── Usuario demo ─────────────────────────────────────────────────────────── */

async function sembrarUsuario() {
  // `listUsers` pagina; buscamos por correo en la primera página, que alcanza
  // de sobra mientras la plataforma tenga un puñado de cuentas.
  const { data: lista, error: falloLista } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (falloLista) throw falloLista;

  const existente = lista.users.find((u) => u.email === correoDemo);

  const metadatos = {
    nombre: "Usuario Demo",
    cargo: "Control de Gestión",
    rol: "gestion",
  };

  if (existente) {
    const { error } = await supabase.auth.admin.updateUserById(existente.id, {
      password: passwordDemo,
      user_metadata: metadatos,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`✓ Usuario demo actualizado (${correoDemo})`);
    return existente.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: correoDemo,
    password: passwordDemo,
    // Sin correo de confirmación: es una cuenta de servicio, no una persona.
    email_confirm: true,
    user_metadata: metadatos,
  });
  if (error) throw error;
  console.log(`✓ Usuario demo creado (${correoDemo})`);
  return data.user.id;
}

/** El trigger crea el perfil; acá nos aseguramos del nombre, cargo y rol. */
async function sembrarPerfil(id) {
  const { error } = await supabase.from("perfiles").upsert(
    {
      id,
      nombre: "Usuario Demo",
      cargo: "Control de Gestión",
      rol: "gestion",
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log("✓ Perfil del usuario demo al día");
}

/* ── Datos del módulo ─────────────────────────────────────────────────────── */

const contratos = [
  {
    id: "C-2601",
    nombre: "Fundaciones planta de cal",
    cliente: "SQM",
    faena: "Coya Sur",
    avance: 82,
    presupuesto: 1_240_000_000,
    costo_real: 1_058_000_000,
    estado: "en-plazo",
    termino: "2026-11-28",
  },
  {
    id: "C-2604",
    nombre: "Mantenimiento estanques y pretiles",
    cliente: "Copec",
    faena: "Terminal Antofagasta",
    avance: 64,
    presupuesto: 486_000_000,
    costo_real: 351_000_000,
    estado: "en-plazo",
    termino: "2026-12-19",
  },
  {
    id: "C-2607",
    nombre: "Movimiento de tierra acceso norte",
    cliente: "Puerto Mejillones",
    faena: "Mejillones",
    avance: 47,
    presupuesto: 918_000_000,
    costo_real: 742_000_000,
    estado: "en-riesgo",
    termino: "2027-02-06",
  },
  {
    id: "C-2609",
    nombre: "Habilitación línea de embotellado",
    cliente: "Coca-Cola Andina",
    faena: "Planta Antofagasta",
    avance: 35,
    presupuesto: 312_000_000,
    costo_real: 289_000_000,
    estado: "atrasado",
    termino: "2027-01-15",
  },
  {
    id: "C-2612",
    nombre: "Levantamiento 3D correa transportadora",
    cliente: "SQM",
    faena: "Nueva Victoria",
    avance: 100,
    presupuesto: 148_000_000,
    costo_real: 131_000_000,
    estado: "cerrado",
    termino: "2026-08-30",
  },
  {
    id: "C-2615",
    nombre: "Arriendo torres de iluminación y andamios",
    cliente: "Puerto Mejillones",
    faena: "Mejillones",
    avance: 71,
    presupuesto: 224_000_000,
    costo_real: 168_000_000,
    estado: "en-plazo",
    termino: "2026-12-31",
  },
];

const facturacion = [
  { periodo: "2026-01-01", monto: 218_000_000 },
  { periodo: "2026-02-01", monto: 196_000_000 },
  { periodo: "2026-03-01", monto: 264_000_000 },
  { periodo: "2026-04-01", monto: 301_000_000 },
  { periodo: "2026-05-01", monto: 288_000_000 },
  { periodo: "2026-06-01", monto: 342_000_000 },
  { periodo: "2026-07-01", monto: 376_000_000 },
  { periodo: "2026-08-01", monto: 358_000_000 },
  { periodo: "2026-09-01", monto: 394_000_000 },
];

async function sembrarDatos() {
  const { error: falloContratos } = await supabase
    .from("contratos")
    .upsert(contratos, { onConflict: "id" });
  if (falloContratos) throw falloContratos;
  console.log(`✓ ${contratos.length} contratos sembrados`);

  const { error: falloFacturacion } = await supabase
    .from("facturacion")
    .upsert(facturacion, { onConflict: "periodo" });
  if (falloFacturacion) throw falloFacturacion;
  console.log(`✓ ${facturacion.length} meses de facturación sembrados`);

  const { error: falloSeguridad } = await supabase.from("seguridad").upsert(
    {
      id: true,
      dias_sin_accidentes: 428,
      hh_acumuladas: 214_600,
      ultima_auditoria: "2026-07-22",
    },
    { onConflict: "id" },
  );
  if (falloSeguridad) throw falloSeguridad;
  console.log("✓ Indicadores de seguridad sembrados");
}

/* ── Corrida ──────────────────────────────────────────────────────────────── */

try {
  const id = await sembrarUsuario();
  await sembrarPerfil(id);
  await sembrarDatos();
  console.log(`\nListo. Entra con ${correoDemo} y la contraseña de DEMO_PASSWORD.`);
} catch (e) {
  console.error("\n✗ Falló la siembra:", e.message ?? e);
  if (/relation .* does not exist/i.test(e.message ?? "")) {
    console.error(
      "  Parece que falta aplicar el esquema: pega supabase/migraciones/0001_control_de_gestion.sql\n" +
        "  en el SQL Editor de Supabase y vuelve a correr esto.",
    );
  }
  process.exit(1);
}
