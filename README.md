<div align="center">

# GRUPO VALAR

**La faena, del contrato a la última factura**

Sitio corporativo y plataforma de gestión de **Servicios y Proyectos Valar SpA** — Antofagasta, Chile.

Un producto de **[Teo Labs](https://www.teolabs.app)** ®

</div>

---

## De qué se trata

Valar construye, mantiene y arrienda equipos para la minería y la industria del norte de
Chile. Cada contrato es un mundo: Misceláneos cobra por horas hombre, Torres cobra en UF,
Carpas cobra por avance y le retienen una parte. Y durante años todo eso vivió en
planillas: una para el control de gestión, otra para el pago a proveedores, otra para las
solicitudes de faena, cada una con su propia versión de la verdad.

El problema no son las planillas. Es lo que no pueden responder sin que alguien se siente
una tarde a cruzarlas:

> ¿Cuánto dejó de margen el contrato de Torres este mes, y en qué se fue el costo?
> ¿Esta solicitud de faena ya está aprobada, cotizada, comprada o recibida?
> ¿Qué facturas se pagan este jueves, y a cuál proveedor le falta la cuenta bancaria?
> ¿Quién cambió ese estado de pago, y qué decía antes?

**Este repositorio responde esas preguntas.** Son dos aplicaciones:

| App | Dominio | Qué es |
|---|---|---|
| `apps/web` | [www.grupovalar.cl](https://www.grupovalar.cl) | El sitio público: quiénes son, qué hacen, qué han construido y cómo contactarlos. |
| `apps/plataforma` | [plataforma.grupovalar.cl](https://plataforma.grupovalar.cl) | La plataforma interna: control de gestión y abastecimiento, con acceso por módulo y por contrato. |

---

## La plataforma

### Control de Gestión

| Sección | Qué hace |
|---|---|
| **Dashboard** | Venta, costo y margen por contrato y por mes, contra la meta. Real contra presupuesto por categoría. Cinco gráficos de la misma información y un informe listo para imprimir o guardar como PDF. |
| **Contratos** | Cada contrato con sus anexos (monto y plazo), sus categorías de costo con presupuesto mensual y su **plantilla propia**: los campos que pide ese mandante y el formato de su Estado de Pago. |
| **Ingresos** | El ciclo completo del ingreso: Estado de Pago → OC del mandante → factura. El EDP sale en PDF con el formato de cada contrato: Misceláneos (ordinarios, extraordinarios y HH), Torres (conceptos en UF convertidos con la UF del período), Carpas (avance real y programado, retenciones desglosadas). |
| **Egresos** | Compras y servicios con terceros, costo de personal (haberes, HH extra, leyes sociales) y egresos de oficina central, separados de los contratos. |

### Abastecimiento

| Sección | Qué hace |
|---|---|
| **Panel** | No es un tablero de cifras: es la lista de lo que está esperando a alguien hoy —una firma, una cotización, una recepción— y cuánto lleva esperando. |
| **Solicitudes** | Lo que pide la faena, con aprobación firmada. Desde ahí se piden cotizaciones por correo, se cargan (o se **leen del PDF del proveedor**, en el propio navegador) y se comparan por costo puesto en obra, flete incluido. |
| **Órdenes de compra** | Se generan desde la cotización elegida, con el formato de OC de Valar. La recepción es por cantidad, no todo o nada: llegaron 10 de 30 y eso es lo que dice. |
| **Pagos** | Las cuentas por pagar con la regla de Valar: **sin factura no se paga**. Se agenda por semana, se retiene lo que tiene un problema, y sale el cuadro de pago con la nómina en el formato que pide el banco. |
| **Artículos y proveedores** | El catálogo con sus dos nombres —el que dice la faena y el técnico— y el maestro de proveedores con sus datos bancarios. |

### Usuarios y accesos

El **cargo** dice quién es cada persona; el **acceso** dice qué puede hacer, módulo por
módulo:

| Nivel | Qué puede |
|---|---|
| **Administrador** | Todo en su módulo, e invita gente a ese módulo. |
| **Usuario** | Ingresa datos. Se le pueden sumar permisos puntuales. |
| **Visualizador** | Solo mira, y solo las secciones que se le habiliten. |
| **Personalizado** | Permiso por permiso. |

Cada acceso puede abarcar **todos los contratos o solo algunos**. Quien tiene un solo
módulo entra directo a él y no ve los demás. Por encima está el Administrador general,
que ve todo, y una pantalla de **quién ve qué** para revisarlo de un vistazo.

---

## El recorrido de una compra

```
  Solicitud     ──►  la faena pide lo que falta, para un contrato y una categoría
       │
  Aprobación    ──►  firma quien tiene el permiso; la firma queda con nombre y cargo
       │
  Cotización    ──►  se pide por correo; el proveedor responde a quien la pidió
       │             se compara por costo puesto en obra, no por precio de lista
  Orden         ──►  se genera desde la cotización elegida; el flete viaja como
       │             una línea más para que llegue al costo del contrato
  Recepción     ──►  se anota lo que llega, por cantidad
       │
  Factura       ──►  desbloquea el pago; sin ella la deuda existe pero no se paga
       │
  Pago          ──►  se agenda en una semana y sale en el cuadro del banco
       │
  Margen        ──►  el costo ya está en el contrato: el Dashboard lo muestra solo
```

Nadie vuelve a teclear un dato que ya existe: cada paso parte de lo que dejó el anterior.

---

## Las decisiones que sostienen el sistema

**1. La seguridad vive en la base de datos, no en la pantalla.**
La plataforma no tiene servidor: el navegador habla directo con Supabase, y la clave que
viaja en el código es pública a propósito. Lo que protege los datos son las políticas RLS
de Postgres: qué empresa, qué módulo, qué sección y qué contrato. Si la pantalla muestra un
botón que no corresponde, la base igual dice que no.

**2. Varias empresas, ningún dato cruzado.**
Cada fila pertenece a una empresa y la llave primaria la incluye. Una fila no puede
apuntar a un registro de otra empresa: no es una regla que alguien pueda olvidar, es la
estructura. La empresa de demostración es un inquilino más, con datos propios.

**3. Quién hizo qué lo anota la base, no la aplicación.**
Un trigger estampa el autor de cada registro y escribe cada alta, edición y borrado en la
bitácora. La app no puede firmar a nombre de otro, y los cambios hechos desde el editor de
Supabase también quedan registrados.

**4. El Dashboard no guarda números propios.**
Venta, costo y margen salen de vistas que suman lo cargado en Ingresos y Egresos. Si un
total no cuadra, el error está donde se cargó el dato, y ahí se corrige una sola vez.

**5. Cada contrato cobra a su manera.**
Los campos que pide cada mandante son datos, no código: se agregan desde la pantalla del
contrato. Los importes comunes siguen en columnas tipadas para que el Dashboard los sume;
lo propio de cada contrato se guarda aparte.

---

## El sitio público

Una página que presenta a Valar con la identidad de su brochure: propósito, servicios
(ingeniería, obras civiles, modelación 3D, mantenimiento industrial, movimiento de tierra,
arriendo de equipos), proyectos realizados, clientes, valores y sostenibilidad. El
contacto se arma en el navegador y se envía por WhatsApp o por correo.

Pensado para que lo encuentren: metadatos, datos estructurados JSON-LD, sitemap, robots,
`llms.txt` para asistentes de IA e imagen para compartir en WhatsApp y redes.

Todo el contenido editable —textos, servicios, proyectos, contacto— vive en un solo
archivo: `apps/web/src/lib/content.ts`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript |
| Render | Exportación estática (`output: "export"`): sin servidor en ninguna de las dos apps |
| Base de datos | PostgreSQL en Supabase, con RLS por empresa, módulo, sección y contrato |
| Auth | Supabase Auth: invitación por correo, recuperación de clave |
| Correo | Edge Function de Supabase con SMTP (invitaciones y solicitudes de cotización) |
| Archivos | Supabase Storage, privado, con enlaces firmados |
| Documentos | Impresión del navegador (EDP, OC, informe, cuadro de pago) y pdf.js para leer cotizaciones |
| Gráficos | SVG hecho a mano, sin librería |
| Deploy | Cloudflare Workers (static assets), un Worker por app |
| Monorepo | npm workspaces: una instalación y un lockfile para las dos apps |

---

## Puesta en marcha

```bash
npm install                  # instala las dos apps de una vez

cp apps/plataforma/.env.example apps/plataforma/.env.local   # URL y clave pública de Supabase

npm run dev                  # sitio público      → http://localhost:3000
npm run dev:plataforma       # plataforma interna → http://localhost:3000

npm run build                # compila las dos
npm run lint                 # revisa las dos
```

Next **solo lee el `.env.local` de la carpeta de cada app**: uno en la raíz no le sirve a
la plataforma.

Las **migraciones no se aplican solas.** Viven en `supabase/migraciones/` numeradas y se
pegan en el SQL Editor de Supabase, en orden. La función de correo se despliega con
`npx supabase functions deploy correo`.

> **No borres `package-lock.json` para regenerarlo.** Guarda los binarios nativos de
> **todas** las plataformas (entre ellos `lightningcss` y `@tailwindcss/oxide` para
> Linux). Rehecho desde cero en Windows solo anota los de Windows y el build de
> Cloudflare falla con `Cannot find module '../lightningcss.linux-x64-gnu.node'`. Para
> repararlo: recuperar el lockfile de un commit anterior y correr `npm install` encima.

---

## Estructura

```
apps/web/                        sitio público
├── src/app/                     página, imagen OG, robots, sitemap
├── src/components/              una sección por archivo
├── src/lib/content.ts           todo el contenido editable
└── public/                      fotos, logos, llms.txt

apps/plataforma/                 plataforma interna
├── src/app/
│   ├── page.tsx                 ingreso
│   ├── recuperar/, restablecer/ recuperación de clave
│   └── (privado)/               todo lo que pide sesión
│       ├── modulos/             inicio: los módulos de cada persona
│       ├── control-de-gestion/  dashboard, contratos, ingresos, egresos
│       ├── abastecimiento/      panel, solicitudes, órdenes, pagos, artículos, proveedores
│       └── usuarios/            usuarios, accesos, cargos e invitaciones
├── src/components/              vistas, formularios, documentos imprimibles
└── src/lib/                     consultas por dominio, sesión y permisos

supabase/
├── migraciones/                 esquema, vistas y políticas RLS, en orden
├── functions/correo/            invitaciones y solicitudes de cotización
└── correos/                     plantillas de los correos de acceso
```

---

## Deploy

Ninguna de las dos apps tiene backend: el build produce archivos estáticos en `out/` y
Cloudflare los sirve directo.

```bash
npm run deploy:web           # → www.grupovalar.cl
npm run deploy:plataforma    # → plataforma.grupovalar.cl
```

Desde el dashboard (Workers → conectar repositorio), un proyecto por app:

| Campo | `web` | `plataforma` |
|---|---|---|
| Root directory | `apps/web` | `apps/plataforma` |
| Build command | `npm run build` | `npm run build` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |

Sin optimizador de imágenes en producción, **las fotos se suben ya comprimidas**: hero a
1920 px y WebP ~60, tarjetas de proyecto a 900 px y WebP ~72, logos de clientes a 300 px.

---

## Seguridad

- Los `.env.local` **nunca** se suben. La única plantilla versionada es
  `apps/plataforma/.env.example`, con las dos claves públicas que el build incrusta.
- La clave `service_role` se salta RLS: vive solo en la Edge Function, nunca en el
  navegador. La función pregunta los permisos con la sesión de quien llama y recién
  después usa sus privilegios.
- Los archivos adjuntos se leen solo si se puede ver el registro al que pertenecen, y
  solo con enlace firmado y temporal.
- Una invitación vence a los 7 días. Un administrador de módulo solo puede dar acceso a
  su módulo y a los contratos que él mismo ve.

---

<div align="center">

### Construido por Teo Labs

Diseño, arquitectura e ingeniería de **[Teo Labs](https://www.teolabs.app)** ®

*Software que entiende la faena.*

</div>
