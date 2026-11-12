import { describe, expect, it } from "vitest";
import { todasLasFilas, traerTodo } from "./paginar";

/** Una tabla de mentira que, como PostgREST, devuelve como mucho 1000 filas por pedido. */
function tabla(cuantas: number) {
  const pedidos: [number, number][] = [];
  const tanda = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    const filas = Array.from({ length: Math.max(0, Math.min(hasta, cuantas - 1) - desde + 1) }, (_, i) => ({ id: desde + i }));
    return { data: filas, error: null };
  };
  return { tanda, pedidos };
}

describe("traerTodo: listas completas aunque pasen las 1000 filas", () => {
  it("pide por tandas hasta agotar", async () => {
    const t = tabla(2500);
    const filas = await traerTodo(t.tanda);
    expect(filas).toHaveLength(2500);
    expect(t.pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("con menos de 1000 filas es un solo pedido", async () => {
    const t = tabla(40);
    expect(await traerTodo(t.tanda)).toHaveLength(40);
    expect(t.pedidos).toHaveLength(1);
  });

  it("exactamente 1000 filas: pide una más para saber que terminó", async () => {
    const t = tabla(1000);
    expect(await traerTodo(t.tanda)).toHaveLength(1000);
    expect(t.pedidos).toHaveLength(2);
  });

  it("un error en cualquier tanda corta todo (no devuelve una lista a medias)", async () => {
    let n = 0;
    const tanda = async () => (n++ === 0 ? { data: Array(1000).fill({}), error: null } : { data: null, error: { message: "timeout" } });
    await expect(traerTodo(tanda)).rejects.toThrow("timeout");
  });
});

describe("todasLasFilas: misma forma que Supabase", () => {
  it("devuelve { data, error } en vez de lanzar", async () => {
    const r = await todasLasFilas(async () => ({ data: null, error: { message: "sin permiso" } }));
    expect(r).toEqual({ data: null, error: { message: "sin permiso" } });
  });
});
