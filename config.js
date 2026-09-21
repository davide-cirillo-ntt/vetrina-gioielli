// =============================================================
//  CONFIGURAZIONE DEL NEGOZIO — modifica solo questo file
// =============================================================
// NOTA: questo è un progetto dimostrativo, nato per sperimentare lo sviluppo
// assistito dall'intelligenza artificiale. Non esiste un negozio reale: i dati
// qui sotto sono segnaposto e i gioielli pubblicati non sono in vendita.
//
// Dopo ogni modifica salva e fai commit: il sito si aggiorna da solo.

export const CONFIG = {
  // --- Identità del negozio -----------------------------------
  shopName: "Nome Gioielleria",
  tagline: "Gioielli fatti a mano",
  description:
    "Piccola selezione di gioielli scelti e realizzati con cura.",

  // --- Contatti -----------------------------------------------
  // Numero WhatsApp in formato internazionale SENZA + e SENZA spazi.
  // Esempio per l'Italia: "393401234567"
  whatsapp: "393000000000",
  email: "info@esempio.it",
  instagram: "", // solo lo username, senza @. Lascia "" per nascondere
  address: "",   // es. "Via Roma 1, Napoli". Lascia "" per nascondere

  // --- Repository GitHub (usato dalla dashboard) ---------------
  github: {
    owner: "davide-cirillo-ntt",
    repo: "vetrina-gioielli",
    branch: "main",
  },

  // --- Catalogo ------------------------------------------------
  currency: "EUR",
  currencySymbol: "€",
  // Mostra i prezzi in vetrina. Se false compare "Prezzo su richiesta".
  showPrices: true,

  // Le categorie del menu. "id" finisce nei dati, "label" è ciò che si vede.
  categories: [
    { id: "anelli", label: "Anelli" },
    { id: "collane", label: "Collane" },
    { id: "bracciali", label: "Bracciali" },
    { id: "orecchini", label: "Orecchini" },
    { id: "altro", label: "Altro" },
  ],
};

export default CONFIG;
