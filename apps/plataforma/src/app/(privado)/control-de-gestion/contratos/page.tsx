import { redirect } from "next/navigation";

/** Los enlaces viejos a /contratos caen en la vista de vigentes. */
export default function Pagina() {
  redirect("/control-de-gestion/contratos/vigentes/");
}
