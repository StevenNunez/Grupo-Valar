# Grupo Valar

Repositorio de **Servicios y Proyectos Valar SpA** (Antofagasta, Chile). Son dos
aplicaciones independientes que comparten repositorio, no código:

| App | Dominio | Qué es |
| --- | --- | --- |
| `apps/web` | `www.grupovalar.cl` | Sitio público. Contenido e identidad del brochure corporativo. |
| `apps/plataforma` | `plataforma.grupovalar.cl` | Plataforma interna. Login y módulos de gestión. |

**Por qué separadas:** `output: "export"` es una decisión de app completa. Con
las dos juntas, darle servidor a la plataforma obligaba a cambiar también el
sitio público —y con él su deploy y su SEO—. Separadas, cada una elige su
runtime sin arrastrar a la otra. Las pocas piezas de marca compartidas (el
isotipo en `components/Logo.tsx`, los tokens de color en `globals.css`) están
**copiadas a propósito**: si cambian, se cambian en los dos lugares.

## Stack

- Next.js 16 (App Router) + React 19 — exportación estática (`output: "export"`)
- Tailwind CSS 4
- TypeScript
- npm workspaces (una instalación y un lockfile para las dos apps)
- Se despliega en **Cloudflare Workers** (static assets), un Worker por app

## Desarrollo

```bash
npm install                # instala las dos apps de una vez

npm run dev                # sitio público      → http://localhost:3000
npm run dev:plataforma     # plataforma interna → http://localhost:3000

npm run build              # compila las dos
npm run lint               # revisa las dos
```

Para trabajar en una sola app: `npm run <script> -w web` o `-w plataforma`.

> **No borres `package-lock.json` para regenerarlo.** Guarda los binarios
> nativos de **todas** las plataformas (54 paquetes de Linux, entre ellos
> `lightningcss` y `@tailwindcss/oxide`). Al rehacerlo desde cero en Windows,
> npm solo anota los de Windows y **el build de Cloudflare falla** con
> `Cannot find module '../lightningcss.linux-x64-gnu.node'`. Si hay que
> repararlo: recuperar el lockfile de un commit anterior
> (`git show <commit>:package-lock.json > package-lock.json`) y correr
> `npm install` encima, que conserva las entradas de Linux.

## Supabase (backend de la plataforma)

La plataforma no tiene servidor: el navegador habla directo con Supabase. **La
seguridad vive en las políticas RLS de Postgres**, no en el código del cliente:
la clave publishable viaja dentro del bundle a propósito, y sin una política que
lo permita no devuelve una sola fila.

Puesta en marcha, una sola vez:

```bash
cp .env.example .env.local                       # claves para los scripts
cp apps/plataforma/.env.example apps/plataforma/.env.local   # claves de la app
```

Ojo con los dos archivos: Next **solo lee el `.env.local` de la carpeta de cada
app**, así que el de la raíz no le sirve a la plataforma. La `service_role` se
queda a propósito en el de la raíz, fuera de lo que Next compila.

1. Supabase → **SQL Editor** → pegar `supabase/migraciones/0001_control_de_gestion.sql` → Run.
2. `npm run sembrar` — crea el usuario demo y siembra los datos del módulo. Idempotente.
3. `npm run verificar` — comprueba que sin sesión no se ve nada y con sesión sí.

`npm run verificar` conviene correrlo cada vez que se toque una política.

## Deploy en Cloudflare Workers

Ninguna de las dos apps tiene backend: el build produce archivos estáticos en
`out/` y Cloudflare los sirve directamente. Las solicitudes a archivos estáticos
son gratis e ilimitadas, así que no hace falta el adaptador de OpenNext.

```bash
npm run deploy:web          # → www.grupovalar.cl
npm run deploy:plataforma   # → plataforma.grupovalar.cl
```

**Desde el dashboard** (Workers → conectar repositorio de Git), un proyecto por app:

| Campo | `web` | `plataforma` |
| --- | --- | --- |
| Root directory | `apps/web` | `apps/plataforma` |
| Build command | `npm run build` | `npm run build` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |

El dominio de la plataforma va declarado en su `wrangler.jsonc` como
`custom_domain`: Cloudflare crea el registro DNS y emite el certificado solo al
desplegar. El del sitio público se conectó a mano en su día y sigue igual.

## Estructura

```
apps/web/                     Sitio público
  src/app/
    page.tsx                  composición de secciones + JSON-LD
    globals.css               tokens de marca, intro y utilidades
    opengraph-image.tsx       imagen de WhatsApp / correo / redes (1200×630)
    robots.ts, sitemap.ts
  src/components/             una sección por archivo
  src/lib/
    content.ts                TODO el contenido editable del sitio
    site.ts                   dominios (sitio y plataforma)
  public/                     fotos, logos, _headers, llms.txt

apps/plataforma/              Plataforma interna
  src/app/
    page.tsx                  login (raíz del subdominio)
    (panel)/                  grupo de rutas tras el login; no sale en la URL
      layout.tsx              marco: menú lateral y barra superior
      modulos/                índice de módulos
      control-de-gestion/     primer módulo
  src/components/
  src/lib/
    supabase.ts               cliente del navegador (clave publishable)
    sesion.ts                 Supabase Auth + perfil del usuario
    modulos.ts                registro de módulos y su estado
    control-de-gestion.ts     consultas del módulo y formato chileno

supabase/migraciones/         esquema y políticas RLS (se pegan en el SQL Editor)
scripts/
  sembrar-demo.mjs            usuario demo + datos de ejemplo (idempotente)
  verificar-rls.mjs           comprueba que las políticas hacen lo que dicen
```

Para cambiar textos, servicios, proyectos o datos de contacto del sitio público
se edita únicamente `apps/web/src/lib/content.ts`.

## Imágenes

Ninguna app tiene optimizador de imágenes en producción (no hay servidor), así
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

- La plataforma **lee** datos pero todavía no permite editarlos desde la
  interfaz: los contratos se cargan por ahora desde el script de siembra o
  desde el editor de tablas de Supabase.
- Los documentos (subida y generación) están sin empezar. Cuando lleguen:
  Supabase Storage primero; R2 solo si el 1 GB o los 5 GB de egress aprietan.
- El formulario de contacto del sitio público no envía correo desde el
  servidor: compone el mensaje y lo abre en WhatsApp o en el cliente de correo
  del visitante.
