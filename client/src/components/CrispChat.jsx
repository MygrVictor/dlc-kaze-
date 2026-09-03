import { useEffect } from "react";

/**
 * Messagerie Crisp, réservée à l'espace client.
 *
 * Le script n'est pas placé dans `index.html` : il s'y chargerait pour
 * tout le monde — visiteurs anonymes, convoyeurs, administrateurs —
 * alors que la conversation ne concerne que les clients connectés. Le
 * monter à la demande évite aussi de peser sur le temps de chargement
 * de la vitrine, qui est la page la plus consultée.
 *
 * L'identité est transmise à Crisp pour que l'équipe sache à qui elle
 * répond sans avoir à le demander.
 */
export default function CrispChat({ user }) {
  const websiteId = import.meta.env.VITE_CRISP_WEBSITE_ID;

  useEffect(() => {
    // Sans identifiant configuré, on ne fait rien : mieux vaut pas de
    // messagerie qu'un script mort qui échoue à chaque chargement.
    if (!websiteId) return;

    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = websiteId;

    // Le script n'est injecté qu'une fois : React remonte les composants
    // à chaque navigation, et autant de balises empileraient autant de
    // widgets.
    if (!document.getElementById("crisp-script")) {
      const script = document.createElement("script");
      script.id = "crisp-script";
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      document.head.appendChild(script);
    }

    window.$crisp.push(["do", "chat:show"]);

    // Le widget survit au démontage — il est attaché au document, pas à
    // React. On le masque donc en quittant l'espace client, sans quoi il
    // suivrait l'utilisateur jusque sur la page de connexion.
    return () => window.$crisp?.push(["do", "chat:hide"]);
  }, [websiteId]);

  useEffect(() => {
    if (!websiteId || !user) return;
    window.$crisp = window.$crisp || [];
    if (user.email) window.$crisp.push(["set", "user:email", [user.email]]);
    if (user.full_name)
      window.$crisp.push(["set", "user:nickname", [user.full_name]]);
    if (user.phone) window.$crisp.push(["set", "user:phone", [user.phone]]);
    if (user.company)
      window.$crisp.push(["set", "user:company", [user.company]]);
  }, [websiteId, user]);

  return null;
}
