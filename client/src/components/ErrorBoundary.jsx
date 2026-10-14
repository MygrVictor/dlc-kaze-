import React from "react";

/**
 * Sans ce garde-fou, la moindre erreur de rendu React démonte toute
 * l'application : l'utilisateur ne voit qu'une page blanche et rien ne
 * remonte côté serveur. On affiche à la place l'erreur exacte, que l'on
 * peut copier pour diagnostic, et un bouton pour recharger.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error("[ErrorBoundary]", erreur, info?.componentStack);

    // Après un déploiement, un onglet resté ouvert réclame des fichiers JS
    // qui n'existent plus : un rechargement suffit. Une seule tentative,
    // pour ne pas boucler si l'erreur persiste.
    const message = String(erreur?.message || "");
    if (
      /dynamically imported module|Loading chunk|Importing a module script/i.test(
        message,
      ) &&
      !sessionStorage.getItem("rechargement-auto")
    ) {
      sessionStorage.setItem("rechargement-auto", "1");
      window.location.reload();
    }
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-dark-900 text-white">
        <div className="max-w-lg w-full card bg-dark-800 border-dark-600">
          <h1 className="text-lg font-bold mb-2">Une erreur est survenue</h1>
          <p className="text-sm text-dark-300 mb-4">
            L'affichage a été interrompu. Rechargez la page ; si le problème
            revient, transmettez le message ci-dessous à l'équipe technique.
          </p>
          <pre className="text-xs bg-dark-900 p-3 rounded-lg overflow-auto max-h-48 mb-4 whitespace-pre-wrap">
            {String(erreur?.stack || erreur?.message || erreur)}
          </pre>
          <button
            className="btn-primary w-full"
            onClick={() => {
              sessionStorage.removeItem("rechargement-auto");
              window.location.reload();
            }}
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
