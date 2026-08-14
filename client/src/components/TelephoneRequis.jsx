import { useState } from "react";
import { Smartphone, Loader2, ShieldCheck } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

/**
 * Vérifie qu'un numéro est un mobile joignable sur WhatsApp.
 * Reproduit la règle du serveur : les fixes français sont refusés.
 */
function estMobileValide(saisie) {
  const chiffres = saisie.replace(/\D/g, "");
  if (!chiffres) return false;
  if (/^0[67]\d{8}$/.test(chiffres)) return true;
  if (/^(?:00)?330?[67]\d{8}$/.test(chiffres)) return true;
  // Numéro étranger : on ne présume pas des plans de numérotation.
  return (
    !chiffres.startsWith("33") &&
    !/^0[1-5,9]/.test(chiffres) &&
    chiffres.length >= 10 &&
    chiffres.length <= 15
  );
}

/**
 * Écran bloquant invitant un convoyeur à renseigner son mobile.
 *
 * Les missions disponibles étant annoncées par WhatsApp, un convoyeur
 * sans numéro ne serait jamais prévenu : on ne le laisse pas entrer
 * dans l'application tant que le profil est incomplet.
 */
export default function TelephoneRequis() {
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [envoi, setEnvoi] = useState(false);

  const valide = estMobileValide(phone);

  const enregistrer = async (e) => {
    e.preventDefault();
    if (!valide) {
      toast.error("Numéro de mobile invalide. Exemple : 06 12 34 56 78.");
      return;
    }

    setEnvoi(true);
    try {
      const { data } = await api.put("/convoyeur/telephone", {
        phone: phone.trim(),
      });
      setUser((precedent) => ({ ...precedent, phone: data.user.phone }));
      toast.success(data.message || "Numéro enregistré.");
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Impossible d'enregistrer le numéro.",
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="w-14 h-14 rounded-2xl bg-primary-600/15 flex items-center justify-center mb-5">
          <Smartphone size={26} className="text-primary-400" />
        </div>

        <h1 className="text-xl font-bold text-slate-100 mb-2">
          Un dernier détail
        </h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Renseignez votre numéro de mobile pour accéder aux missions. Les
          nouvelles missions sont annoncées par WhatsApp : sans numéro, vous ne
          seriez pas prévenu.
        </p>

        <form onSubmit={enregistrer}>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Numéro de mobile
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-primary-500 focus:outline-none transition-colors"
          />
          <p className="text-xs text-slate-500 mt-2">
            Mobile uniquement (06 ou 07). Les numéros fixes ne reçoivent pas
            WhatsApp.
          </p>

          <button
            type="submit"
            disabled={!valide || envoi}
            className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {envoi ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Enregistrement…
              </>
            ) : (
              "Continuer"
            )}
          </button>
        </form>

        <div className="flex items-start gap-2 mt-6 pt-6 border-t border-slate-800">
          <ShieldCheck size={16} className="text-slate-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Votre numéro sert uniquement aux alertes de mission. Il n'est jamais
            communiqué aux clients.
          </p>
        </div>
      </div>
    </div>
  );
}
