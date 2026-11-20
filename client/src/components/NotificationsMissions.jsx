import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Share, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  etatNotifications,
  activerNotifications,
  desactiverNotifications,
} from "../lib/notifications";

const CLE_MASQUE = "dlc-notifs-bandeau-masque";

/**
 * Activation des notifications « nouvelle mission » sur l'appareil.
 *
 * - variante "bandeau" (planning) : n'apparaît que si l'activation est
 *   possible et pas encore faite ; le convoyeur peut la masquer.
 * - variante "carte" (profil) : toujours visible, permet aussi de couper.
 */
export default function NotificationsMissions({ variante = "carte" }) {
  const [etat, setEtat] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [masque, setMasque] = useState(() => {
    try {
      return localStorage.getItem(CLE_MASQUE) === "1";
    } catch {
      return false;
    }
  });

  const rafraichir = useCallback(() => {
    etatNotifications()
      .then(setEtat)
      .catch(() => setEtat("indisponible"));
  }, []);

  useEffect(rafraichir, [rafraichir]);

  const activer = async () => {
    setEnCours(true);
    try {
      await activerNotifications();
      toast.success("Notifications activées sur cet appareil.");
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          err.message ||
          "Impossible d'activer les notifications.",
      );
    } finally {
      setEnCours(false);
      rafraichir();
    }
  };

  const desactiver = async () => {
    setEnCours(true);
    try {
      await desactiverNotifications();
      toast.success("Notifications coupées sur cet appareil.");
    } finally {
      setEnCours(false);
      rafraichir();
    }
  };

  const masquer = () => {
    setMasque(true);
    try {
      localStorage.setItem(CLE_MASQUE, "1");
    } catch {
      /* stockage indisponible : masqué pour la session */
    }
  };

  if (etat === null) return null;

  if (variante === "bandeau") {
    if (masque || !["inactive", "a-installer"].includes(etat)) return null;
    return (
      <div className="card mb-6 flex items-start gap-3">
        <Bell size={20} className="text-accent-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Soyez prévenu des nouvelles missions</p>
          {etat === "a-installer" ? (
            <InstructionsIphone />
          ) : (
            <>
              <p className="text-sm text-dark-400 mt-1">
                Une notification sur ce téléphone à chaque mission publiée,
                en plus de Telegram. En la touchant, vous arrivez ici, déjà
                connecté.
              </p>
              <button
                type="button"
                onClick={activer}
                disabled={enCours}
                className="btn-primary mt-3"
              >
                <Bell size={16} />
                Activer les notifications
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={masquer}
          aria-label="Masquer"
          className="text-dark-400 hover:text-dark-200 p-1"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Bell size={18} />
        Notifications des missions
      </h2>
      {etat === "active" && (
        <>
          <p className="text-sm text-dark-400 mb-3">
            Activées sur cet appareil : vous êtes prévenu à chaque nouvelle
            mission.
          </p>
          <button
            type="button"
            onClick={desactiver}
            disabled={enCours}
            className="btn-secondary"
          >
            <BellOff size={16} />
            Couper sur cet appareil
          </button>
        </>
      )}
      {etat === "inactive" && (
        <>
          <p className="text-sm text-dark-400 mb-3">
            Recevez une notification sur ce téléphone à chaque mission
            publiée, en plus de Telegram.
          </p>
          <button
            type="button"
            onClick={activer}
            disabled={enCours}
            className="btn-primary"
          >
            <Bell size={16} />
            Activer les notifications
          </button>
        </>
      )}
      {etat === "a-installer" && <InstructionsIphone />}
      {etat === "refusee" && (
        <p className="text-sm text-dark-400">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les
          réglages du téléphone (Réglages → Notifications → DLC), puis
          rouvrez l'application.
        </p>
      )}
      {etat === "indisponible" && (
        <p className="text-sm text-dark-400">
          Ce navigateur ne permet pas les notifications. Sur Android, utilisez
          Chrome ; sur iPhone, ajoutez DLC à l'écran d'accueil depuis Safari.
        </p>
      )}
    </div>
  );
}

function InstructionsIphone() {
  return (
    <div className="text-sm text-dark-400 mt-1 space-y-1">
      <p>Sur iPhone, les notifications passent par l'application installée :</p>
      <ol className="list-decimal pl-5 space-y-0.5">
        <li>
          Ouvrez ce site dans <strong>Safari</strong>.
        </li>
        <li>
          Touchez <Share size={14} className="inline -mt-0.5" />{" "}
          <strong>Partager</strong>, puis{" "}
          <strong>Sur l'écran d'accueil</strong>.
        </li>
        <li>
          Ouvrez DLC depuis l'écran d'accueil et activez les notifications
          ici.
        </li>
      </ol>
      <p className="text-xs">iOS 16.4 ou plus récent.</p>
    </div>
  );
}
