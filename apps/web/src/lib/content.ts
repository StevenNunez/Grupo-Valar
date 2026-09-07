export const empresa = {
  nombre: "Valar",
  razonSocial: "Servicios y Proyectos Valar SpA",
  rut: "77.256.185-7",
  representante: "Francisco Valdés Araya",
  direccion: "Vicente Salgado 81, sector El Huáscar, Antofagasta, Chile",
  // El número no se muestra en ninguna parte del sitio: solo alimenta el enlace
  // de WhatsApp del formulario de contacto (wa.me).
  telefonoRaw: "+56962631156",
  email: "contacto@valar.live",
  // El dominio vive en src/lib/site.ts — no duplicarlo aquí.
  tagline: ["Valor", "sostenible", "para el futuro."],
} as const;

export const clientes = [
  { nombre: "SQM", logo: "/clientes/sqm.webp", ratio: "h-14 sm:h-16" },
  {
    nombre: "Copec",
    logo: "/clientes/copec.webp",
    ratio: "h-6 sm:h-7",
  },
  {
    nombre: "Coca-Cola Andina",
    logo: "/clientes/coca-cola-andina.webp",
    ratio: "h-6 sm:h-7",
  },
  {
    nombre: "Puerto Mejillones",
    logo: "/clientes/puerto-mejillones.webp",
    ratio: "h-10 sm:h-12",
  },
] as const;

export type Servicio = {
  id: string;
  titulo: string;
  resumen: string;
  detalles: string[];
};

export const servicios: Servicio[] = [
  {
    id: "ingenieria",
    titulo: "Proyectos de ingeniería",
    resumen:
      "Desde la concepción hasta la puesta en marcha, incluido el manejo de equipos, personal y presupuesto.",
    detalles: ["Gestión integral EPC", "Control de plazos y costos", "Puesta en marcha"],
  },
  {
    id: "obras-civiles",
    titulo: "Diseño y construcción de obras civiles",
    resumen:
      "Planificamos, creamos y construimos la solución técnica que cada faena necesita.",
    detalles: ["Fundaciones y radieres", "Estructuras y montaje", "Habilitación de plantas"],
  },
  {
    id: "ingenieria-3d",
    titulo: "Ingeniería 3D",
    resumen:
      "Levantamientos con escáner láser para planimetría, maquetas y memorias de cálculo confiables.",
    detalles: ["Escaneo láser", "Planimetría as-built", "Modelación y maquetas"],
  },
  {
    id: "mantenimiento",
    titulo: "Mantenimiento industrial",
    resumen:
      "Equipo multidisciplinario dedicado a mantener los activos en buena condición y extender su vida útil.",
    detalles: ["Eléctrico e instrumentación", "HDPE / CPVC / FRP", "Soldadura y andamios"],
  },
  {
    id: "movimiento-tierra",
    titulo: "Movimiento de tierra",
    resumen:
      "Mejoramiento de terrenos, caminos y plataformas para iniciar las obras apropiadamente.",
    detalles: ["Caminos y plataformas", "Excavaciones y rellenos", "Compactación"],
  },
  {
    id: "arriendo",
    titulo: "Arriendo de equipos",
    resumen:
      "Equipos móviles de iluminación solar y diésel, andamios certificados y equipos menores.",
    detalles: ["Torres de iluminación", "Andamios Layher certificados", "Equipos menores"],
  },
];

export type Proyecto = {
  titulo: string;
  cliente: string;
  descripcion: string;
  imagen: string;
  area: "Obras civiles" | "Movimiento de tierra" | "Mantenimiento" | "Ingeniería 3D";
};

export const proyectos: Proyecto[] = [
  {
    titulo: "Planta TAS fase III",
    cliente: "SQM · PQLC",
    descripcion:
      "Construcción y habilitación de la ampliación de la planta de tratamiento de aguas servidas, etapa III.",
    imagen: "/proyectos/planta-tas.webp",
    area: "Obras civiles",
  },
  {
    titulo: "Caminos y plataformas",
    cliente: "SQM · PQLC",
    descripcion:
      "Movimiento de tierra para la construcción de caminos y plataformas operacionales.",
    imagen: "/proyectos/movimiento-tierra.webp",
    area: "Movimiento de tierra",
  },
  {
    titulo: "Losa brigada de emergencia",
    cliente: "SQM · PQLC",
    descripcion:
      "Losa de hormigón para el estacionamiento de la brigada de emergencia, con demarcación de seguridad.",
    imagen: "/proyectos/losa-brigada.webp",
    area: "Obras civiles",
  },
  {
    titulo: "Postes de monitoreo",
    cliente: "SQM · PQLC",
    descripcion:
      "Montaje y habilitación de postes de monitoreo ambiental en faena.",
    imagen: "/proyectos/postes-monitoreo.webp",
    area: "Obras civiles",
  },
  {
    titulo: "Estación de servicio",
    cliente: "Copec S.A.",
    descripcion:
      "Construcción de estación de servicio y concha acústica, obra completa llave en mano.",
    imagen: "/proyectos/copec-estacion.webp",
    area: "Obras civiles",
  },
  {
    titulo: "Pintura industrial línea 3",
    cliente: "SQM · PQLC",
    descripcion:
      "Pintura industrial en el sector de aeroenfriadores y línea 3 de planta.",
    imagen: "/proyectos/pintura-industrial.webp",
    area: "Mantenimiento",
  },
  {
    titulo: "Galpón de cenizas",
    cliente: "SQM · PQLC",
    descripcion:
      "Normalización eléctrica y recambio de luminarias en condiciones de alta particulación.",
    imagen: "/proyectos/normalizacion-electrica.webp",
    area: "Mantenimiento",
  },
  {
    titulo: "Torres de iluminación",
    cliente: "SQM · PQLC",
    descripcion:
      "Suministro y mantención de torres de iluminación solar y diésel para operación continua.",
    imagen: "/proyectos/torres-iluminacion.webp",
    area: "Mantenimiento",
  },
  {
    titulo: "Confección de radieres",
    cliente: "SQM",
    descripcion:
      "Contrato de confección de radieres: enfierradura, hormigonado y terminación.",
    imagen: "/proyectos/radieres-sqm.webp",
    area: "Obras civiles",
  },
  {
    titulo: "Servicios misceláneos de mantención",
    cliente: "SQM · PQLC",
    descripcion:
      "Electricidad, HDPE/CPVC, FRP, soldadores mecánicos y andamieros en contrato permanente.",
    imagen: "/proyectos/miscelaneos.webp",
    area: "Mantenimiento",
  },
  {
    titulo: "Filtro Trickling",
    cliente: "Coca-Cola Andina",
    descripcion:
      "Reparación del sistema de filtro Trickling y desarrollo de piezas y partes especiales.",
    imagen: "/proyectos/trickling.webp",
    area: "Mantenimiento",
  },
  {
    titulo: "Modelación 3D oficinas PQLC",
    cliente: "SQM",
    descripcion:
      "Desarrollo y modelación 3D para oficinas administrativas y soluciones de arquitectura.",
    imagen: "/proyectos/diseno-3d.webp",
    area: "Ingeniería 3D",
  },
];

export const valores = [
  {
    titulo: "Proyectos de alta calidad",
    texto:
      "Ejecutamos con estándar industrial: procedimientos, control documental y entregables que resisten auditoría.",
  },
  {
    titulo: "Foco en la satisfacción del cliente",
    texto:
      "Conocemos el dolor, las necesidades y las preocupaciones de quien opera la faena. Trabajamos sobre eso.",
  },
  {
    titulo: "Incrementamos la sustentabilidad",
    texto:
      "Maximizamos resultados y minimizamos el impacto: menos residuos, equipos solares y decisiones de largo plazo.",
  },
  {
    titulo: "Profesionales altamente capacitados",
    texto:
      "Equipo multidisciplinario de minería, energía y retail: ingeniería, arquitectura, construcción y gestión.",
  },
];
