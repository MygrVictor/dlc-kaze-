import { useState } from "react";

/**
 * Logo d'un client ou partenaire, avec repli textuel.
 *
 * Les fichiers de logos arrivent au compte-gouttes et dépendent des
 * autorisations de chaque enseigne. Plutôt que d'afficher une image cassée
 * — ou de bloquer la mise en ligne de la section en attendant tous les
 * visuels — on retombe sur le nom composé en typographie de marque.
 *
 * Les logos fournis ont des proportions très inégales : une pastille ronde
 * côtoie un lettrage tout en longueur. On les inscrit donc dans une zone de
 * dimensions fixes, à l'intérieur de laquelle l'image se réduit sans se
 * déformer. Chaque marque occupe ainsi la même surface visuelle, quelle que
 * soit la forme de son logo.
 *
 * `echelle` rattrape les cas particuliers : certains fichiers intègrent une
 * marge blanche généreuse et paraissent alors plus petits que leurs voisins
 * à emprise égale. Un léger agrandissement rétablit l'équilibre optique.
 */
export default function LogoClient({ src, nom, echelle = 1 }) {
  const [echec, setEchec] = useState(!src);

  return (
    <div className="logo-card" title={nom}>
      {echec ? (
        <span className="logo-wordmark">{nom}</span>
      ) : (
        <img
          className="logo-image"
          src={src}
          alt={nom}
          loading="lazy"
          onError={() => setEchec(true)}
          style={echelle === 1 ? undefined : { transform: `scale(${echelle})` }}
        />
      )}
    </div>
  );
}
