import { redirect } from "next/navigation";

/** Las garantías viven en Oficina Central; los enlaces viejos caen ahí. */
export default function Pagina() {
  redirect("/control-de-gestion/egresos/oficina-central/garantias/");
}
