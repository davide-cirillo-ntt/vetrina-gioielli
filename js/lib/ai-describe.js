/**
 * SEGNAPOSTO — sostituito dal lavoro su foto e AI.
 * Vedi docs/CONTRACTS.md sezione 3 per la firma definitiva.
 * Chi consuma questo modulo deve sempre gestire l'errore e permettere
 * la compilazione manuale della scheda.
 */
export async function generateDescription() {
  throw new Error(
    "La generazione automatica della descrizione non è ancora attiva. " +
      "Puoi scrivere la descrizione a mano."
  );
}
