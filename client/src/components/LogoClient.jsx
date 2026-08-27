import { useState } from "react";

/**
 * Logo d'un client ou partenaire, avec repli textuel.
 *
 * Les fichiers de logos arrivent au compte-gouttes et dépendent des
 * autorisations de chaque enseigne. Plutôt que d'afficher une image cassée
 * — ou de bloquer la mise en ligne de la section en attendant tous les
 * visuels — on retombe sur le nom composé en typographie de marque.
 */
export default function LogoClient({ src, nom, hauteur = 46 }) {
  const [echec, setEchec] = useState(!src);

  return (
    <div className="logo-card" title={nom}>
      {echec ? (
        <span className="logo-wordmark">{nom}</span>
      ) : (
        <img
          src={src}
          alt={nom}
          loading="lazy"
          onError={() => setEchec(true)}
          style={{ height: hauteur, width: "auto", objectFit: "contain" }}
        />
      )}
    </div>
  );
}
