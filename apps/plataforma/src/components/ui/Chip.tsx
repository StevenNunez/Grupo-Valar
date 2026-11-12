/**
 * Etiqueta de estado.
 *
 * El color va siempre acompañado de texto y de un símbolo: nadie tiene que
 * distinguir un verde de un ámbar para entender la fila. Los tonos son
 * reservados —bueno, aviso, crítico, neutro— y no se usan para nada más.
 */

export type Tono = "bueno" | "aviso" | "critico" | "neutro" | "info";

const tonos: Record<Tono, { texto: string; fondo: string; simbolo: string }> = {
  bueno: { texto: "text-exito", fondo: "bg-exito-suave", simbolo: "●" },
  aviso: { texto: "text-alerta", fondo: "bg-alerta-suave", simbolo: "▲" },
  critico: { texto: "text-peligro", fondo: "bg-peligro-suave", simbolo: "■" },
  info: { texto: "text-cyan-deep", fondo: "bg-cyan/10", simbolo: "◆" },
  neutro: { texto: "text-ink-soft", fondo: "bg-mist", simbolo: "○" },
};

export function Chip({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  // Un tono desconocido (dato nuevo que la pantalla aún no conoce) no debe tumbar la página.
  const t = tonos[tono] ?? tonos.neutro;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${t.fondo} ${t.texto}`}
    >
      <span aria-hidden="true">{t.simbolo}</span>
      {children}
    </span>
  );
}

/** Chip sin color de estado: sirve para clasificar, no para alertar. */
export function Etiqueta({
  children,
  destacada = false,
}: {
  children: React.ReactNode;
  destacada?: boolean;
}) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${
        destacada
          ? "border-cyan/30 bg-cyan/10 text-cyan-deep"
          : "border-mist-deep text-ink-soft"
      }`}
    >
      {children}
    </span>
  );
}
