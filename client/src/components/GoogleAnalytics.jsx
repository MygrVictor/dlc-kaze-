import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Google Analytics 4 sur le site vitrine, avec bandeau de consentement.
 *
 * Le RGPD impose l'accord du visiteur avant tout cookie de mesure : le
 * script n'est chargé qu'après « Accepter ». Le choix est mémorisé un an
 * environ dans localStorage. Sans identifiant VITE_GA_ID, rien ne
 * s'affiche (environnement local, tests).
 */
const CLE = "dlc-consentement-ga";

function chargerGA(id) {
  if (document.getElementById("ga-script")) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  // send_page_view désactivé : on envoie nous-mêmes chaque page, l'appli
  // étant une SPA dont l'URL change sans rechargement.
  window.gtag("config", id, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement("script");
  s.id = "ga-script";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
}

export default function GoogleAnalytics() {
  const id = import.meta.env.VITE_GA_ID;
  const { pathname, search } = useLocation();
  const [choix, setChoix] = useState(() => {
    try {
      return localStorage.getItem(CLE);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (id && choix === "oui") chargerGA(id);
  }, [id, choix]);

  useEffect(() => {
    if (!id || choix !== "oui" || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [id, choix, pathname, search]);

  if (!id || choix) return null;

  const repondre = (v) => {
    try {
      localStorage.setItem(CLE, v);
    } catch {
      /* navigation privée : choix valable pour la session seulement */
    }
    setChoix(v);
  };

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-md z-50 rounded-xl shadow-2xl p-5"
      style={{ background: "#0b1d3a", color: "#fff" }}
    >
      <p className="text-sm leading-relaxed" style={{ color: "#c3cee0" }}>
        Nous utilisons des cookies de mesure d'audience (Google Analytics) pour
        comprendre la fréquentation du site. Aucun cookie publicitaire.
      </p>
      <div className="mt-4 flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => repondre("non")}
          className="px-4 py-2 text-sm rounded-lg border"
          style={{ borderColor: "rgba(255,255,255,0.3)" }}
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={() => repondre("oui")}
          className="px-4 py-2 text-sm font-semibold rounded-lg"
          style={{ background: "#fff", color: "#0b1d3a" }}
        >
          Accepter
        </button>
      </div>
    </div>
  );
}
