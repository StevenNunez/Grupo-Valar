"use client";

/** Texto sin tildes ni mayúsculas, para comparar lo que se escribe con lo que hay. */
export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ¿Calzan todas las palabras escritas con alguno de los campos? "emaresa 1138"
 * encuentra una OC de EMARESA cuyo número termina en 1138. Sin texto, todo calza.
 */
export function coincide(texto: string, campos: (string | number | null | undefined)[]) {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const donde = sinTildes(campos.filter((c) => c !== null && c !== undefined && c !== "").join(" "));
  return palabras.every((p) => donde.includes(p));
}

/** La caja de búsqueda sobre las tablas del módulo. */
export function Buscador({
  valor,
  alCambiar,
  placeholder,
  etiqueta,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  placeholder: string;
  etiqueta: string;
}) {
  return (
    <div className="border-b border-mist px-6 py-4 lg:px-8">
      <input
        type="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="w-full min-w-[16rem] rounded-full border border-mist-deep bg-white px-4 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
      />
    </div>
  );
}
