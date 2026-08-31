import EspaceFactures from "../../components/EspaceFactures";

/**
 * Le convoyeur ne reçoit pas une demande de paiement mais le relevé de
 * ses prestations : le vocabulaire de l'écran suit ce sens.
 */
export default function ConvoyeurFactures() {
  return (
    <EspaceFactures
      titre="Mes factures"
      sousTitre="Les relevés de vos prestations déposés par Drive Line Connect."
      libelleTotal="En attente de règlement"
      libelleDefaut="Relevé de prestations"
    />
  );
}
