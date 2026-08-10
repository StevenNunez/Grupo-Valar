import { ImageResponse } from "next/og";
import { empresa } from "@/lib/content";

export const alt =
  "Valar — Ingeniería, obras civiles y mantenimiento industrial en Antofagasta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Se genera una sola vez durante el build, no por request (sitio estático). */
export const dynamic = "force-static";

/**
 * Imagen que se ve al compartir el sitio por WhatsApp, correo, LinkedIn, etc.
 * Se genera en el servidor, así que nunca queda un archivo suelto que se pueda borrar.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1f2124",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* Isotipo gigante como marca de agua, igual que la portada del brochure */}
        <svg
          viewBox="0 0 275.01 142.45"
          width={760}
          height={394}
          fill="#ffffff"
          style={{ position: "absolute", right: -180, bottom: -70, opacity: 0.045 }}
        >
          <path d="M117.48 3.15L150.62 3.15L107.48 120.46C102.59 133.67 90.35 142.45 75.54 142.45C61.48 142.45 48.18 133.67 43.29 120.61L0 3.15L33.15 3.15L67.34 95.69C69.68 102.15 72.76 105.45 75.54 105.45C78.39 105.45 81.17 102.15 83.5 95.47L117.48 3.15Z" />
          <path d="M199.93 36.92C197.15 36.92 194.07 40.22 191.74 46.68L157.54 139.22L124.39 139.22L167.69 21.77C172.57 8.7 185.87 0 199.93 0C214.74 0 226.99 8.7 231.87 21.92L275.01 139.22L241.87 139.22L207.89 46.83C205.57 40.22 202.86 36.92 199.93 36.92Z" />
        </svg>

        {/* Logo: isotipo + logotipo */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg viewBox="0 0 275.01 142.45" width={116} height={60} fill="#ffffff">
            <path d="M117.48 3.15L150.62 3.15L107.48 120.46C102.59 133.67 90.35 142.45 75.54 142.45C61.48 142.45 48.18 133.67 43.29 120.61L0 3.15L33.15 3.15L67.34 95.69C69.68 102.15 72.76 105.45 75.54 105.45C78.39 105.45 81.17 102.15 83.5 95.47L117.48 3.15Z" />
            <path d="M199.93 36.92C197.15 36.92 194.07 40.22 191.74 46.68L157.54 139.22L124.39 139.22L167.69 21.77C172.57 8.7 185.87 0 199.93 0C214.74 0 226.99 8.7 231.87 21.92L275.01 139.22L241.87 139.22L207.89 46.83C205.57 40.22 202.86 36.92 199.93 36.92Z" />
          </svg>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: 14,
            }}
          >
            VALAR
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            Valor sostenible
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#8b9096",
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            para el futuro.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 27,
              color: "#c2c7cc",
              maxWidth: 820,
              lineHeight: 1.4,
            }}
          >
            Ingeniería, obras civiles y mantenimiento industrial para minería, energía y
            retail.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 64, height: 5, background: "#18a6cd" }} />
          <div style={{ fontSize: 24, color: "#ffffff", letterSpacing: 3 }}>
            ANTOFAGASTA · CHILE
          </div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ fontSize: 24, color: "#8b9096" }}>{empresa.telefono}</div>
        </div>
      </div>
    ),
    size,
  );
}
