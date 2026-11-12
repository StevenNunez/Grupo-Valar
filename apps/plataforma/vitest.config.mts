import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Pruebas de la lógica que no depende de la pantalla: montos, IVA, nómina del
 * banco, lectura de cotizaciones y del SII, mensajes de error.
 *
 *   npm test            (una pasada)
 *   npm run test:mirar  (se repiten al guardar)
 *
 * Las claves de Supabase son de mentira: el cliente se crea, pero ninguna
 * prueba habla con la base.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-prueba",
      TZ: "America/Santiago",
    },
  },
});
