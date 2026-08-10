# Valar — Landing page

Sitio de una página para **Servicios y Proyectos Valar SpA** (Antofagasta, Chile).
Contenido, fotografías e identidad visual tomados del brochure corporativo.

## Stack

- Next.js 16 (App Router) + React 19 — exportación estática (`output: "export"`)
- Tailwind CSS 4
- TypeScript
- Se despliega en **Cloudflare Workers** (static assets)

## Desarrollo

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # genera el sitio estático en out/
npm run preview   # build + lo sirve con wrangler, igual que Cloudflare
```

## Deploy en Cloudflare Workers

El sitio no tiene backend: el build produce archivos estáticos en `out/` y
Cloudflare los sirve directamente. No hace falta el adaptador de OpenNext,
ni R2, ni Cloudflare Images.

**Configuración en el dashboard de Cloudflare** (Workers → conectar repositorio de Git):

| Campo               | Valor           |
| ------------------- | --------------- |
| Build command       | `npm run build` |
| Deploy command      | `npx wrangler deploy` |
| Path / root directory | (vacío, la raíz) |

El resto lo toma de `wrangler.jsonc`. Después se conecta el dominio
`grupovalar.cl` en **Workers → el worker → Settings → Domains & Routes**.

Para desplegar desde el computador en vez del repo: `npm run deploy`.

## Estructura

```
src/
  app/
    layout.tsx           metadata y fuentes (Poppins + Inter)
    page.tsx             composición de secciones + JSON-LD
    globals.css          tokens de marca y utilidades
    icon.svg             favicon (isotipo Valar)
    opengraph-image.tsx  imagen de WhatsApp / correo / redes (1200×630)
    robots.ts            robots.txt
    sitemap.ts           sitemap.xml
  components/            una sección por archivo
  lib/
    content.ts           TODO el contenido editable del sitio
    site.ts              dominio de producción (única fuente de verdad)
public/
  proyectos/             fotografías de obra (WebP)
  clientes/              logos de clientes (WebP)
  _headers               cabeceras que aplica Cloudflare
  llms.txt               resumen del sitio para asistentes de IA
```

Para cambiar textos, servicios, proyectos o datos de contacto se edita
únicamente `src/lib/content.ts`. Para cambiar el dominio, `src/lib/site.ts`.

## Imágenes

El sitio no tiene optimizador de imágenes en producción (no hay servidor), así
que **las fotos deben subirse ya comprimidas y al tamaño justo**:

- Hero: 1920 px de ancho máximo, WebP calidad ~60
- Tarjetas de proyectos: 900 px de ancho, WebP calidad ~72
- Logos de clientes: 300 px de ancho, WebP

## Paleta

| Token  | Valor     | Uso                      |
| ------ | --------- | ------------------------ |
| `ink`  | `#1f2124` | Texto y fondos oscuros   |
| `mist` | `#e3e6e8` | Fondos de sección claros |
| `cyan` | `#18a6cd` | Acento de marca          |

## Pendientes

- El formulario de contacto no envía correo desde el servidor: compone el
  mensaje y lo abre en WhatsApp o en el cliente de correo del visitante. Para
  envío real habría que agregar un Worker aparte o un servicio de formularios.
