import { useEffect, useState } from "react";
import api from "./api";

// Premier filtre : l'adresse du site. En prod, false d'office.
export const ESTSTAGING =
  import.meta.env.VITE_ENV === "staging" ||
  (typeof window !== "undefined" &&
    (window.location.hostname.includes("staging") ||
      window.location.hostname === "localhost"));

// Second filtre : le serveur doit confirmer être branché sur une base de
// staging. Les deux conditions sont requises pour afficher le banc de test.
let cache = null;
export function useStaging() {
  const [ok, setOk] = useState(cache === true);
  useEffect(() => {
    if (!ESTSTAGING) return;
    if (cache !== null) return setOk(cache);
    api
      .get("/env/staging")
      .then((r) => {
        cache = r.data?.staging === true;
        setOk(cache);
      })
      .catch(() => {
        cache = false;
        setOk(false);
      });
  }, []);
  return ESTSTAGING && ok;
}
