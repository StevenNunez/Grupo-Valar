import type { Instrumentation } from "next";

/**
 * Los errores del servidor que nadie atrapó (una ruta de la API o una página
 * que revienta) van al registro de errores. Los que una ruta sí atrapa y
 * contesta con un mensaje los anota ella misma con `anotarError`.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { anotarError } = await import("./lib/errores-servidor");
  await anotarError({
    origen: "servidor",
    donde: `${context.routeType} ${context.routePath}`,
    error: err,
    detalle: {
      metodo: request.method,
      ruta: request.path,
      digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
    },
  });
};
