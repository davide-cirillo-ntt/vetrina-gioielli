// =============================================================
//  Dashboard — logica del flusso
//  Solo moduli ES nativi: nessun build step, nessuna libreria.
// =============================================================

import { CONFIG } from "../config.js";
import {
  verifyToken,
  loadProducts,
  publishProduct,
  deleteProduct,
  indirizzoSito,
  nomeRepository,
} from "./lib/github-store.js";

// Le due credenziali hanno scopi diversi e vanno tenute separate anche qui,
// non solo nei testi: si cancellano insieme, ma non si confondono mai.
const CHIAVE_GITHUB = "vetrina.codiceAccesso";
const CHIAVE_GEMINI = "vetrina.chiaveDescrizione";
const CHIAVE_BOZZA = "vetrina.bozza";

const SEGNAPOSTO = "../images/products/placeholder.svg";

const el = (id) => document.getElementById(id);

const dom = {
  striscia: el("striscia"),

  // accesso
  schermataAccesso: el("schermata-accesso"),
  moduloAccesso: el("modulo-accesso"),
  campoCodice: el("campo-codice"),
  erroreAccesso: el("errore-accesso"),
  bottoneEntra: el("bottone-entra"),
  linkCreaCodice: el("link-crea-codice"),
  nomeRepository: el("nome-repository"),

  // struttura
  schermataApp: el("schermata-app"),
  nomeNegozio: el("nome-negozio"),
  schede: el("schede"),
  viste: {
    aggiungi: el("vista-aggiungi"),
    catalogo: el("vista-catalogo"),
    impostazioni: el("vista-impostazioni"),
  },

  // passo 1
  sceltaFoto: el("scelta-foto"),
  campoFotocamera: el("campo-fotocamera"),
  campoGalleria: el("campo-galleria"),
  lavorazioneFoto: el("lavorazione-foto"),
  esitoFoto: el("esito-foto"),
  fotoDopo: el("foto-dopo"),
  fotoPrima: el("foto-prima"),
  etichettaProvino: el("etichetta-provino"),
  bottoneConfronta: el("bottone-confronta"),
  bottoneCambiaFoto: el("bottone-cambia-foto"),
  risparmio: el("risparmio"),
  erroreFoto: el("errore-foto"),

  // passo 2
  passoDescrizione: el("passo-descrizione"),
  aiAttiva: el("ai-attiva"),
  aiSpenta: el("ai-spenta"),
  campoIndizi: el("campo-indizi"),
  bottoneProponi: el("bottone-proponi"),
  bottoneAttivaAi: el("bottone-attiva-ai"),
  pannelloChiave: el("pannello-chiave"),
  campoChiave: el("campo-chiave"),
  bottoneSalvaChiave: el("bottone-salva-chiave"),
  lavorazioneAi: el("lavorazione-ai"),
  notaAi: el("nota-ai"),

  // passo 3
  passoScheda: el("passo-scheda"),
  campoNome: el("campo-nome"),
  campoDescrizione: el("campo-descrizione"),
  bottoneRiprovaAi: el("bottone-riprova-ai"),
  campoCategoria: el("campo-categoria"),
  campoMateriali: el("campo-materiali"),
  campoTag: el("campo-tag"),
  campoPrezzo: el("campo-prezzo"),
  campoSuRichiesta: el("campo-su-richiesta"),
  campoDisponibile: el("campo-disponibile"),
  campoEvidenza: el("campo-evidenza"),
  simboloValuta: el("simbolo-valuta"),
  erroreScheda: el("errore-scheda"),

  // passo 4
  passoPubblica: el("passo-pubblica"),
  avanzamento: el("avanzamento"),
  barra: el("barra"),
  barraPieno: el("barra-pieno"),
  avanzamentoTesto: el("avanzamento-testo"),
  riuscito: el("riuscito"),
  riuscitoTesto: el("riuscito-testo"),
  linkGioiello: el("link-gioiello"),
  bottoneAltro: el("bottone-altro"),
  errorePubblica: el("errore-pubblica"),
  azione: el("azione"),
  bottonePubblica: el("bottone-pubblica"),
  bottoneAnnulla: el("bottone-annulla"),

  // catalogo
  conteggio: el("conteggio"),
  erroreCatalogo: el("errore-catalogo"),
  elenco: el("elenco"),
  bottoneRicarica: el("bottone-ricarica"),

  // impostazioni
  statoGithub: el("stato-github"),
  statoGemini: el("stato-gemini"),
  campoChiaveImpostazioni: el("campo-chiave-impostazioni"),
  bottoneSalvaChiave2: el("bottone-salva-chiave-2"),
  bottoneTogliChiave: el("bottone-togli-chiave"),
  notaChiaveSalvata: el("nota-chiave-salvata"),
  bottoneEsci: el("bottone-esci"),

  // finestra
  finestraElimina: el("finestra-elimina"),
  nomeDaEliminare: el("nome-da-eliminare"),
  erroreElimina: el("errore-elimina"),
  bottoneNonEliminare: el("bottone-non-eliminare"),
  bottoneElimina: el("bottone-elimina"),
};

const stato = {
  codice: "",
  chiaveAi: "",
  utente: "",
  foto: null, // EnhancedImage, oppure un oggetto equivalente di ripiego
  urlOriginale: "", // object URL della foto scelta, per il confronto
  mostraPrima: false,
  prodotti: [],
  daEliminare: null,
  inCorso: false, // blocca il doppio invio
  annullaAi: null, // AbortController della proposta in corso
  fotoPersa: false, // bozza recuperata senza la foto
};

// =============================================================
//  Utilità
// =============================================================

function mostra(elemento, visibile = true) {
  if (elemento) elemento.hidden = !visibile;
}

function scriviErrore(elemento, messaggio) {
  if (!elemento) return;
  elemento.textContent = messaggio || "";
  elemento.hidden = !messaggio;
}

/**
 * Il rosso deve voler dire "qualcosa è andato storto". Un avviso benigno,
 * come "la foto non è stata migliorata ma si pubblica lo stesso", va detto
 * con il tono neutro, altrimenti si spaventa l'utente per nulla.
 */
function scriviNota(elemento, messaggio) {
  if (!elemento) return;
  elemento.className = "avviso avviso--nota";
  elemento.textContent = messaggio || "";
  elemento.hidden = !messaggio;
}

function scriviAllarme(elemento, messaggio) {
  if (!elemento) return;
  elemento.className = "avviso avviso--errore";
  elemento.textContent = messaggio || "";
  elemento.hidden = !messaggio;
}

/**
 * I moduli e le API lanciano errori di tipo diverso. Qui si estrae un
 * messaggio già scritto in italiano, e se non c'è si ripiega su una frase
 * comprensibile: l'utente non deve mai leggere un dettaglio tecnico.
 */
function messaggioDi(errore, ripiego) {
  const testo = typeof errore?.message === "string" ? errore.message.trim() : "";
  // Un messaggio utile è una frase, non un oggetto o un codice.
  if (testo && !/^\[object|^undefined$|^null$/i.test(testo)) return testo;
  return ripiego;
}

function pesoLeggibile(byte) {
  const numero = Number(byte);
  if (!Number.isFinite(numero) || numero <= 0) return "";
  if (numero < 1024) return `${Math.round(numero)} B`;
  if (numero < 1024 * 1024) return `${Math.round(numero / 1024)} KB`;
  return `${(numero / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function inElenco(testo) {
  return String(testo || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const formattatore = (() => {
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: CONFIG.currency || "EUR",
    });
  } catch {
    return null;
  }
})();

function formattaPrezzo(prezzo) {
  const numero = Number(prezzo);
  if (!Number.isFinite(numero)) return "Prezzo su richiesta";
  if (!formattatore) return `${numero} ${CONFIG.currencySymbol || ""}`.trim();
  return formattatore.format(numero);
}

function senzaConnessione() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// =============================================================
//  Credenziali
// =============================================================

function leggiCredenziali() {
  try {
    stato.codice = localStorage.getItem(CHIAVE_GITHUB) || "";
    stato.chiaveAi = localStorage.getItem(CHIAVE_GEMINI) || "";
  } catch {
    // Navigazione privata o archiviazione bloccata: si lavora comunque,
    // solo senza ricordare le credenziali al prossimo avvio.
    stato.codice = "";
    stato.chiaveAi = "";
  }
}

function salva(chiave, valore) {
  try {
    if (valore) localStorage.setItem(chiave, valore);
    else localStorage.removeItem(chiave);
  } catch {
    /* archiviazione non disponibile: si prosegue senza ricordare */
  }
}

function dimenticaTutto() {
  salva(CHIAVE_GITHUB, "");
  salva(CHIAVE_GEMINI, "");
  try {
    sessionStorage.removeItem(CHIAVE_BOZZA);
  } catch {
    /* niente da fare */
  }
  stato.codice = "";
  stato.chiaveAi = "";
  stato.utente = "";
}

function aggiornaStatoCredenziali() {
  dom.statoGithub.textContent = stato.utente
    ? `Collegato come ${stato.utente}`
    : "Non collegato";
  dom.statoGithub.className = `stato ${stato.utente ? "stato--attivo" : "stato--spento"}`;

  const attiva = Boolean(stato.chiaveAi);
  dom.statoGemini.textContent = attiva
    ? "Attiva — la chiave è salvata su questo telefono"
    : "Non attiva — scrivi tu nome e descrizione";
  dom.statoGemini.className = `stato ${attiva ? "stato--attivo" : "stato--spento"}`;

  mostra(dom.aiAttiva, attiva);
  mostra(dom.aiSpenta, !attiva);
  mostra(dom.bottoneRiprovaAi, attiva && Boolean(stato.foto));
}

// =============================================================
//  Bozza: non perdere il lavoro se la pagina si ricarica
// =============================================================

function raccogliBozza() {
  return {
    nome: dom.campoNome.value,
    descrizione: dom.campoDescrizione.value,
    categoria: dom.campoCategoria.value,
    materiali: dom.campoMateriali.value,
    tag: dom.campoTag.value,
    prezzo: dom.campoPrezzo.value,
    suRichiesta: dom.campoSuRichiesta.checked,
    disponibile: dom.campoDisponibile.checked,
    evidenza: dom.campoEvidenza.checked,
    indizi: dom.campoIndizi.value,
  };
}

function salvaBozza() {
  if (stato.inCorso) return;

  const bozza = raccogliBozza();
  const vuota =
    !bozza.nome && !bozza.descrizione && !bozza.materiali && !bozza.tag && !stato.foto;
  if (vuota) {
    try {
      sessionStorage.removeItem(CHIAVE_BOZZA);
    } catch {
      /* niente da fare */
    }
    return;
  }

  // Prima si tenta con la foto. Una foto migliorata pesa poche centinaia di
  // KB, ma in base64 può comunque non entrare nella quota: in quel caso si
  // salvano almeno i testi, che sono il lavoro più prezioso.
  const conFoto = {
    ...bozza,
    foto: stato.foto
      ? {
          dataUrl: stato.foto.dataUrl,
          mimeType: stato.foto.mimeType,
          extension: stato.foto.extension,
          width: stato.foto.width,
          height: stato.foto.height,
          originalBytes: stato.foto.originalBytes,
          bytes: stato.foto.bytes,
        }
      : null,
  };

  try {
    sessionStorage.setItem(CHIAVE_BOZZA, JSON.stringify(conFoto));
  } catch {
    try {
      sessionStorage.setItem(CHIAVE_BOZZA, JSON.stringify({ ...bozza, foto: null }));
    } catch {
      /* nemmeno i testi entrano: si prosegue senza rete di sicurezza */
    }
  }
}

/** Ricostruisce un Blob da un data URL, per riusare la foto della bozza. */
async function blobDaDataUrl(dataUrl) {
  const risposta = await fetch(dataUrl);
  return risposta.blob();
}

async function recuperaBozza() {
  let bozza;
  try {
    const grezza = sessionStorage.getItem(CHIAVE_BOZZA);
    if (!grezza) return;
    bozza = JSON.parse(grezza);
  } catch {
    return;
  }
  if (!bozza || typeof bozza !== "object") return;

  dom.campoNome.value = bozza.nome || "";
  dom.campoDescrizione.value = bozza.descrizione || "";
  dom.campoMateriali.value = bozza.materiali || "";
  dom.campoTag.value = bozza.tag || "";
  dom.campoPrezzo.value = bozza.prezzo || "";
  dom.campoIndizi.value = bozza.indizi || "";
  dom.campoSuRichiesta.checked = Boolean(bozza.suRichiesta);
  dom.campoDisponibile.checked = bozza.disponibile !== false;
  dom.campoEvidenza.checked = Boolean(bozza.evidenza);
  if (bozza.categoria) dom.campoCategoria.value = bozza.categoria;

  if (bozza.foto?.dataUrl) {
    try {
      const blob = await blobDaDataUrl(bozza.foto.dataUrl);
      stato.foto = { ...bozza.foto, blob };
      stato.urlOriginale = "";
      mostraFoto({ conConfronto: false });
      scriviErrore(
        dom.notaAi,
        "Ho ritrovato quello che stavi scrivendo: controlla e pubblica pure."
      );
      mostra(dom.notaAi, true);
    } catch {
      segnalaFotoPersa();
    }
  } else if (bozza.nome || bozza.descrizione) {
    segnalaFotoPersa();
  }

  apriPassiSuccessivi();
}

function segnalaFotoPersa() {
  stato.fotoPersa = true;
  scriviNota(
    dom.erroreFoto,
    "Ho ritrovato i testi che stavi scrivendo, ma non la foto: sceglila di nuovo."
  );
}

// =============================================================
//  Passo 1 — la foto
// =============================================================

function liberaUrlOriginale() {
  if (stato.urlOriginale) {
    URL.revokeObjectURL(stato.urlOriginale);
    stato.urlOriginale = "";
  }
}

/**
 * Il modulo delle foto è pesante e serve solo quando si sceglie un'immagine:
 * caricarlo qui evita di rallentare l'avvio della dashboard.
 *
 * Si distingue fra due guasti diversi, perché vanno trattati all'opposto:
 * se è il modulo a mancare si ripiega sulla foto originale, mentre se è il
 * modulo a rifiutare il file il suo messaggio è già scritto per l'utente
 * e va mostrato.
 *
 * C'è anche un guardiano sul tempo. L'elaborazione dura qualche centinaio
 * di millisecondi, ma dipende da funzioni del browser che in casi limite
 * possono non richiamare mai (per esempio la codifica di una tela molto
 * grande su un telefono senza memoria). Senza questa rete di sicurezza la
 * dashboard resterebbe con la rotella che gira e nessuna via d'uscita.
 */
const ATTESA_MASSIMA_FOTO = 20000;

async function migliora(file) {
  let modulo;
  try {
    modulo = await import("./lib/image-enhance.js");
  } catch (errore) {
    const guasto = new Error("Modulo delle foto non raggiungibile.");
    guasto.moduloAssente = true;
    guasto.causa = errore;
    throw guasto;
  }

  if (typeof modulo?.enhanceImage !== "function") {
    const guasto = new Error("Modulo delle foto incompleto.");
    guasto.moduloAssente = true;
    throw guasto;
  }

  let orologio;
  const scadenza = new Promise((_, rifiuta) => {
    orologio = setTimeout(() => {
      const guasto = new Error("Elaborazione della foto troppo lenta.");
      guasto.moduloAssente = true; // stesso trattamento: si usa la foto originale
      rifiuta(guasto);
    }, ATTESA_MASSIMA_FOTO);
  });

  try {
    return await Promise.race([modulo.enhanceImage(file), scadenza]);
  } finally {
    clearTimeout(orologio);
  }
}

/** Ripiego usato se il modulo delle foto non è proprio raggiungibile. */
function fotoNonElaborata(file) {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () =>
      risolvi({
        blob: file,
        dataUrl: String(lettore.result || ""),
        mimeType: file.type || "image/jpeg",
        extension: (file.type || "").includes("png") ? "png" : "jpg",
        width: 0,
        height: 0,
        originalBytes: file.size,
        bytes: file.size,
      });
    lettore.onerror = () => rifiuta(new Error("Non riesco a leggere questa foto."));
    lettore.readAsDataURL(file);
  });
}

async function scegliFoto(file) {
  if (!file) return;

  scriviErrore(dom.erroreFoto, "");
  scriviErrore(dom.errorePubblica, "");
  mostra(dom.riuscito, false);
  stato.fotoPersa = false;

  // L'originale serve al confronto "com'era". Un object URL costa molto meno
  // memoria di un data URL, importante su un telefono con una foto da 4 MB.
  liberaUrlOriginale();
  stato.urlOriginale = URL.createObjectURL(file);

  mostra(dom.esitoFoto, false);
  mostra(dom.lavorazioneFoto, true);

  let ripiegato = false;

  try {
    stato.foto = await migliora(file);
  } catch (errore) {
    if (errore?.moduloAssente) {
      // Il miglioramento non è disponibile, ma la foto sì: si pubblica
      // com'è invece di fermare tutto.
      try {
        stato.foto = await fotoNonElaborata(file);
        ripiegato = true;
      } catch {
        mostra(dom.lavorazioneFoto, false);
        liberaUrlOriginale();
        stato.foto = null;
        scriviAllarme(dom.erroreFoto, "Non riesco a leggere questa foto. Provane un'altra.");
        return;
      }
    } else {
      mostra(dom.lavorazioneFoto, false);
      liberaUrlOriginale();
      stato.foto = null;
      scriviAllarme(
        dom.erroreFoto,
        messaggioDi(errore, "Non riesco a leggere questa foto. Provane un'altra.")
      );
      return;
    }
  }

  mostra(dom.lavorazioneFoto, false);
  mostraFoto({ conConfronto: !ripiegato });

  if (ripiegato) {
    scriviNota(
      dom.erroreFoto,
      "Non sono riuscito a migliorare la foto: la pubblico così com'è. Va benissimo lo stesso."
    );
  }

  apriPassiSuccessivi();
  salvaBozza();

  // Con la chiave attiva la proposta parte da sola: è il percorso più corto
  // fra lo scatto e la pubblicazione.
  if (stato.chiaveAi) proponiDescrizione();
}

function mostraFoto({ conConfronto }) {
  if (!stato.foto) return;

  dom.fotoDopo.src = stato.foto.dataUrl;
  mostra(dom.esitoFoto, true);
  mostra(dom.sceltaFoto, false);

  const haOriginale = Boolean(stato.urlOriginale) && conConfronto;
  if (haOriginale) {
    dom.fotoPrima.src = stato.urlOriginale;
  }
  mostra(dom.bottoneConfronta, haOriginale);
  stato.mostraPrima = false;
  mostra(dom.fotoPrima, false);
  dom.etichettaProvino.textContent = "Dopo";

  // Il risparmio si annuncia solo se c'è davvero stato.
  const risparmiati = Number(stato.foto.originalBytes) - Number(stato.foto.bytes);
  const misure =
    stato.foto.width > 0 && stato.foto.height > 0
      ? `${stato.foto.width} × ${stato.foto.height} px`
      : "";

  if (risparmiati > 1024) {
    const quota = Math.round((risparmiati / stato.foto.originalBytes) * 100);
    dom.risparmio.textContent =
      `Foto pronta: da ${pesoLeggibile(stato.foto.originalBytes)} ` +
      `a ${pesoLeggibile(stato.foto.bytes)}, il ${quota}% in meno` +
      (misure ? ` — ${misure}` : "") +
      ".";
    mostra(dom.risparmio, true);
  } else if (misure) {
    dom.risparmio.textContent = `Foto pronta — ${misure}, ${pesoLeggibile(stato.foto.bytes)}.`;
    mostra(dom.risparmio, true);
  } else {
    dom.risparmio.textContent = `Foto pronta — ${pesoLeggibile(stato.foto.bytes)}.`;
    mostra(dom.risparmio, true);
  }
}

function alternaConfronto() {
  stato.mostraPrima = !stato.mostraPrima;
  mostra(dom.fotoPrima, stato.mostraPrima);
  dom.etichettaProvino.textContent = stato.mostraPrima ? "Prima" : "Dopo";
  dom.bottoneConfronta.textContent = stato.mostraPrima ? "Vedi com'è ora" : "Vedi com'era";
}

function cambiaFoto() {
  mostra(dom.sceltaFoto, true);
  mostra(dom.esitoFoto, false);
  dom.campoFotocamera.value = "";
  dom.campoGalleria.value = "";
}

function apriPassiSuccessivi() {
  const pronto = Boolean(stato.foto);
  mostra(dom.passoDescrizione, pronto);
  mostra(dom.passoScheda, pronto);
  mostra(dom.passoPubblica, pronto);
  mostra(dom.azione, pronto);
  mostra(dom.bottoneRiprovaAi, pronto && Boolean(stato.chiaveAi));
}

// =============================================================
//  Passo 2 — la descrizione automatica
// =============================================================

function indiziCorrenti() {
  const indizi = {};
  const categoria = dom.campoCategoria.value;
  const materiali = dom.campoMateriali.value.trim();
  const note = dom.campoIndizi.value.trim();

  if (categoria) indizi.category = categoria;
  if (materiali) indizi.materials = materiali;
  if (note) indizi.notes = note;
  return indizi;
}

async function proponiDescrizione() {
  if (!stato.foto || !stato.chiaveAi) return;

  if (senzaConnessione()) {
    scriviErrore(dom.notaAi, "Senza connessione non posso proporre il testo. Scrivilo pure a mano.");
    return;
  }

  // Una proposta precedente ancora in volo non serve più.
  stato.annullaAi?.abort();
  const controllo = new AbortController();
  stato.annullaAi = controllo;

  scriviErrore(dom.notaAi, "");
  mostra(dom.lavorazioneAi, true);
  dom.bottoneProponi.disabled = true;
  dom.bottoneRiprovaAi.disabled = true;

  try {
    // Import dinamico dentro try/catch: se il modulo non c'è, o cambia, la
    // dashboard continua a funzionare con la compilazione manuale.
    const modulo = await import("./lib/ai-describe.js");
    const proposta = await modulo.generateDescription({
      imageDataUrl: stato.foto.dataUrl,
      hints: indiziCorrenti(),
      token: stato.chiaveAi,
      signal: controllo.signal,
    });

    if (controllo.signal.aborted) return;
    applicaProposta(proposta);
    scriviErrore(dom.notaAi, "Ecco una proposta. Correggi quello che non ti convince.");
  } catch (errore) {
    if (errore?.name === "AbortError") return;
    // I messaggi del modulo sono già scritti in italiano per chi legge:
    // si mostrano così come sono.
    scriviErrore(
      dom.notaAi,
      messaggioDi(
        errore,
        "La proposta automatica non è disponibile. Scrivi pure nome e descrizione a mano."
      )
    );
  } finally {
    if (stato.annullaAi === controllo) stato.annullaAi = null;
    mostra(dom.lavorazioneAi, false);
    dom.bottoneProponi.disabled = false;
    dom.bottoneRiprovaAi.disabled = false;
  }
}

/**
 * La proposta riempie solo i campi che l'utente non ha già scritto: quello
 * che ha digitato lui non viene mai sovrascritto senza chiederglielo.
 */
function applicaProposta(proposta) {
  if (!proposta) return;

  if (proposta.name) dom.campoNome.value = proposta.name;
  if (proposta.description) dom.campoDescrizione.value = proposta.description;

  if (Array.isArray(proposta.materials) && proposta.materials.length && !dom.campoMateriali.value.trim()) {
    dom.campoMateriali.value = proposta.materials.join(", ");
  }
  if (Array.isArray(proposta.tags) && proposta.tags.length && !dom.campoTag.value.trim()) {
    dom.campoTag.value = proposta.tags.join(", ");
  }
  if (proposta.category) {
    const esiste = [...dom.campoCategoria.options].some((o) => o.value === proposta.category);
    if (esiste) dom.campoCategoria.value = proposta.category;
  }

  salvaBozza();
}

function salvaChiaveAi(valore, campoOrigine) {
  const pulita = String(valore || "").trim();
  if (!pulita) {
    scriviErrore(dom.notaAi, "Incolla la chiave per attivare la descrizione automatica.");
    return;
  }

  stato.chiaveAi = pulita;
  salva(CHIAVE_GEMINI, pulita);
  if (campoOrigine) campoOrigine.value = "";
  dom.campoChiave.value = "";
  dom.campoChiaveImpostazioni.value = "";

  mostra(dom.pannelloChiave, false);
  aggiornaStatoCredenziali();
  dom.notaChiaveSalvata.textContent = "Chiave salvata.";

  if (stato.foto) proponiDescrizione();
}

// =============================================================
//  Passo 3 — la scheda
// =============================================================

function riempiCategorie() {
  const categorie = Array.isArray(CONFIG.categories) ? CONFIG.categories : [];
  const frammento = document.createDocumentFragment();
  for (const categoria of categorie) {
    const opzione = document.createElement("option");
    opzione.value = categoria.id;
    opzione.textContent = categoria.label;
    frammento.append(opzione);
  }
  dom.campoCategoria.replaceChildren(frammento);
}

function segnalaCampo(campo, errato) {
  campo.classList.toggle("controllo--errato", errato);
}

function validaScheda() {
  segnalaCampo(dom.campoNome, false);
  segnalaCampo(dom.campoDescrizione, false);

  if (!stato.foto) {
    scriviErrore(dom.erroreScheda, "Manca la foto: scattala o scegline una dalla galleria.");
    dom.sceltaFoto.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  if (!dom.campoNome.value.trim()) {
    scriviErrore(dom.erroreScheda, "Manca il nome del gioiello.");
    segnalaCampo(dom.campoNome, true);
    dom.campoNome.focus();
    return false;
  }

  if (!dom.campoDescrizione.value.trim()) {
    scriviErrore(dom.erroreScheda, "Manca la descrizione. Bastano due frasi.");
    segnalaCampo(dom.campoDescrizione, true);
    dom.campoDescrizione.focus();
    return false;
  }

  scriviErrore(dom.erroreScheda, "");
  return true;
}

function prodottoDaiCampi() {
  const prezzoGrezzo = Number(dom.campoPrezzo.value);
  const suRichiesta = dom.campoSuRichiesta.checked;

  return {
    name: dom.campoNome.value.trim(),
    description: dom.campoDescrizione.value.trim(),
    category: dom.campoCategoria.value || "altro",
    price: suRichiesta || !Number.isFinite(prezzoGrezzo) || dom.campoPrezzo.value === ""
      ? null
      : prezzoGrezzo,
    materials: inElenco(dom.campoMateriali.value),
    tags: inElenco(dom.campoTag.value).map((t) => t.toLowerCase()),
    available: dom.campoDisponibile.checked,
    featured: dom.campoEvidenza.checked,
  };
}

// =============================================================
//  Passo 4 — pubblicazione
// =============================================================

// L'avanzamento è indicativo: serve a far capire che qualcosa sta
// succedendo, non a misurare i byte.
const QUOTE = {
  "Preparo la foto…": 10,
  "Carico la foto…": 40,
  "Aggiorno il catalogo…": 65,
  "Riprovo ad aggiornare il catalogo…": 65,
  "Pubblico…": 85,
  "Elimino…": 85,
  "Fatto.": 100,
};

function segnaAvanzamento(passaggio) {
  const quota = QUOTE[passaggio] ?? 50;
  dom.barraPieno.style.width = `${quota}%`;
  dom.barra.setAttribute("aria-valuenow", String(quota));
  dom.avanzamentoTesto.textContent = passaggio;
}

async function pubblica() {
  if (stato.inCorso) return;
  if (!validaScheda()) return;

  if (senzaConnessione()) {
    scriviErrore(
      dom.errorePubblica,
      "Non c'è connessione. Appena torna la rete, premi di nuovo Pubblica: quello che hai scritto resta qui."
    );
    return;
  }

  stato.inCorso = true;
  dom.bottonePubblica.disabled = true;
  dom.bottonePubblica.textContent = "Sto pubblicando…";
  scriviErrore(dom.errorePubblica, "");
  mostra(dom.riuscito, false);
  mostra(dom.avanzamento, true);
  segnaAvanzamento("Preparo la foto…");
  dom.passoPubblica.scrollIntoView({ behavior: "smooth", block: "center" });

  try {
    const esito = await publishProduct({
      token: stato.codice,
      product: prodottoDaiCampi(),
      imageBlob: stato.foto.blob,
      imageExtension: stato.foto.extension,
      onProgress: segnaAvanzamento,
    });

    mostra(dom.avanzamento, false);
    dom.riuscitoTesto.textContent =
      `${esito.product.name} è stato pubblicato. Il sito ci mette circa un minuto ` +
      "ad aggiornarsi: se non lo vedi subito, aspetta un attimo e ricarica.";
    dom.linkGioiello.href = indirizzoSito();
    mostra(dom.riuscito, true);
    mostra(dom.azione, false);

    try {
      sessionStorage.removeItem(CHIAVE_BOZZA);
    } catch {
      /* niente da fare */
    }

    // Il catalogo in memoria è ormai vecchio: si ricarica alla prossima apertura.
    stato.prodotti = [];
  } catch (errore) {
    mostra(dom.avanzamento, false);
    scriviErrore(
      dom.errorePubblica,
      messaggioDi(errore, "Non sono riuscito a pubblicare. Riprova fra un momento.")
    );
    if (errore?.codice === "credenziale") tornaAllAccesso();
  } finally {
    stato.inCorso = false;
    dom.bottonePubblica.disabled = false;
    dom.bottonePubblica.textContent = "Pubblica il gioiello";
  }
}

function ricomincia() {
  stato.annullaAi?.abort();
  stato.annullaAi = null;
  stato.foto = null;
  stato.fotoPersa = false;
  liberaUrlOriginale();

  dom.campoNome.value = "";
  dom.campoDescrizione.value = "";
  dom.campoMateriali.value = "";
  dom.campoTag.value = "";
  dom.campoPrezzo.value = "";
  dom.campoIndizi.value = "";
  dom.campoSuRichiesta.checked = false;
  dom.campoDisponibile.checked = true;
  dom.campoEvidenza.checked = false;
  if (dom.campoCategoria.options.length) dom.campoCategoria.selectedIndex = 0;

  segnalaCampo(dom.campoNome, false);
  segnalaCampo(dom.campoDescrizione, false);

  dom.campoFotocamera.value = "";
  dom.campoGalleria.value = "";
  dom.fotoDopo.removeAttribute("src");
  dom.fotoPrima.removeAttribute("src");

  scriviErrore(dom.erroreFoto, "");
  scriviErrore(dom.erroreScheda, "");
  scriviErrore(dom.errorePubblica, "");
  scriviErrore(dom.notaAi, "");
  mostra(dom.riuscito, false);
  mostra(dom.avanzamento, false);
  mostra(dom.esitoFoto, false);
  mostra(dom.sceltaFoto, true);
  apriPassiSuccessivi();

  try {
    sessionStorage.removeItem(CHIAVE_BOZZA);
  } catch {
    /* niente da fare */
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =============================================================
//  Catalogo
// =============================================================

function percorsoFoto(prodotto) {
  const immagini = Array.isArray(prodotto.images) ? prodotto.images : [];
  const prima = immagini.find((p) => typeof p === "string" && p.trim());
  // I percorsi nel catalogo sono relativi alla radice del sito; la dashboard
  // sta in admin/, quindi vanno riportati indietro di un livello.
  return prima ? `../${prima.trim()}` : SEGNAPOSTO;
}

function rigaProdotto(prodotto) {
  const riga = document.createElement("li");
  riga.className = "voce";

  const foto = document.createElement("img");
  foto.className = "voce__foto";
  foto.loading = "lazy";
  foto.alt = "";
  foto.src = percorsoFoto(prodotto);
  foto.addEventListener(
    "error",
    () => {
      if (!foto.src.endsWith("placeholder.svg")) foto.src = SEGNAPOSTO;
    },
    { once: true }
  );

  const testi = document.createElement("div");
  testi.className = "voce__testi";

  const nome = document.createElement("p");
  nome.className = "voce__nome";
  nome.textContent = prodotto.name;

  const dettagli = document.createElement("p");
  dettagli.className = "voce__dettagli";
  const pezzi = [formattaPrezzo(prodotto.price)];
  if (prodotto.available === false) pezzi.push("venduto");
  if (prodotto.featured) pezzi.push("in evidenza");
  dettagli.textContent = pezzi.join(" · ");

  testi.append(nome, dettagli);

  const elimina = document.createElement("button");
  elimina.className = "voce__elimina";
  elimina.type = "button";
  elimina.setAttribute("aria-label", `Elimina ${prodotto.name}`);
  elimina.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  elimina.addEventListener("click", () => chiediConferma(prodotto));

  riga.append(foto, testi, elimina);
  return riga;
}

async function caricaCatalogo() {
  dom.conteggio.textContent = "Carico…";
  scriviErrore(dom.erroreCatalogo, "");
  dom.bottoneRicarica.disabled = true;

  try {
    const { products } = await loadProducts(stato.codice);
    stato.prodotti = products;

    const frammento = document.createDocumentFragment();
    for (const prodotto of products) {
      if (prodotto && prodotto.id && prodotto.name) frammento.append(rigaProdotto(prodotto));
    }
    dom.elenco.replaceChildren(frammento);

    if (products.length === 0) {
      dom.conteggio.textContent = "Non c'è ancora nessun gioiello. Aggiungi il primo.";
    } else if (products.length === 1) {
      dom.conteggio.textContent = "1 gioiello pubblicato.";
    } else {
      dom.conteggio.textContent = `${products.length} gioielli pubblicati.`;
    }
  } catch (errore) {
    dom.elenco.replaceChildren();
    dom.conteggio.textContent = "";
    scriviErrore(
      dom.erroreCatalogo,
      messaggioDi(errore, "Non riesco a leggere il catalogo. Riprova fra un momento.")
    );
    if (errore?.codice === "credenziale") tornaAllAccesso();
  } finally {
    dom.bottoneRicarica.disabled = false;
  }
}

function chiediConferma(prodotto) {
  stato.daEliminare = prodotto;
  dom.nomeDaEliminare.textContent = prodotto.name;
  scriviErrore(dom.erroreElimina, "");
  dom.bottoneElimina.disabled = false;
  dom.bottoneElimina.textContent = "Sì, elimina";
  if (typeof dom.finestraElimina.showModal === "function") {
    dom.finestraElimina.showModal();
  }
}

async function confermaEliminazione() {
  const prodotto = stato.daEliminare;
  if (!prodotto || stato.inCorso) return;

  if (senzaConnessione()) {
    scriviErrore(dom.erroreElimina, "Non c'è connessione. Riprova quando torna la rete.");
    return;
  }

  stato.inCorso = true;
  dom.bottoneElimina.disabled = true;
  dom.bottoneElimina.textContent = "Sto eliminando…";
  scriviErrore(dom.erroreElimina, "");

  try {
    await deleteProduct({ token: stato.codice, id: prodotto.id });
    dom.finestraElimina.close();
    stato.daEliminare = null;
    await caricaCatalogo();
  } catch (errore) {
    scriviErrore(
      dom.erroreElimina,
      messaggioDi(errore, "Non sono riuscito a eliminarlo. Riprova fra un momento.")
    );
    dom.bottoneElimina.disabled = false;
    dom.bottoneElimina.textContent = "Sì, elimina";
  } finally {
    stato.inCorso = false;
  }
}

// =============================================================
//  Navigazione fra le viste
// =============================================================

function apriVista(nome) {
  for (const [chiave, elemento] of Object.entries(dom.viste)) {
    mostra(elemento, chiave === nome);
  }
  for (const bottone of dom.schede.querySelectorAll(".scheda")) {
    const attiva = bottone.dataset.vista === nome;
    if (attiva) bottone.setAttribute("aria-current", "true");
    else bottone.removeAttribute("aria-current");
  }

  // La barra di pubblicazione appartiene solo alla vista "Aggiungi".
  mostra(dom.azione, nome === "aggiungi" && Boolean(stato.foto) && dom.riuscito.hidden);

  if (nome === "catalogo" && stato.prodotti.length === 0) caricaCatalogo();
  window.scrollTo({ top: 0 });
}

// =============================================================
//  Accesso
// =============================================================

function mostraDashboard() {
  mostra(dom.schermataAccesso, false);
  mostra(dom.schermataApp, true);
  aggiornaStatoCredenziali();
  apriVista("aggiungi");
}

function tornaAllAccesso() {
  mostra(dom.schermataApp, false);
  mostra(dom.schermataAccesso, true);
  dom.campoCodice.value = "";
}

async function entra(codice) {
  scriviErrore(dom.erroreAccesso, "");

  if (senzaConnessione()) {
    scriviErrore(dom.erroreAccesso, "Non c'è connessione: non posso controllare il codice.");
    return false;
  }

  dom.bottoneEntra.disabled = true;
  dom.bottoneEntra.textContent = "Controllo…";

  try {
    const { login, canWrite } = await verifyToken(codice);

    if (!canWrite) {
      scriviErrore(
        dom.erroreAccesso,
        "Questo codice può solo leggere il sito. Creane uno nuovo mettendo " +
          '"Contents" su "Read and write".'
      );
      return false;
    }

    stato.codice = String(codice).trim();
    stato.utente = login;
    salva(CHIAVE_GITHUB, stato.codice);
    mostraDashboard();
    await recuperaBozza();
    return true;
  } catch (errore) {
    scriviErrore(
      dom.erroreAccesso,
      messaggioDi(errore, "Non sono riuscito a controllare il codice. Riprova.")
    );
    return false;
  } finally {
    dom.bottoneEntra.disabled = false;
    dom.bottoneEntra.textContent = "Entra";
  }
}

function esci() {
  stato.annullaAi?.abort();
  dimenticaTutto();
  stato.prodotti = [];
  ricomincia();
  aggiornaStatoCredenziali();
  tornaAllAccesso();
}

// =============================================================
//  Identità del negozio
// =============================================================

function applicaIdentita() {
  document.title = `Dashboard — ${CONFIG.shopName}`;
  dom.nomeNegozio.textContent = CONFIG.shopName;
  dom.simboloValuta.textContent = CONFIG.currencySymbol || "€";
  dom.nomeRepository.textContent = nomeRepository();

  // Il collegamento porta già alla pagina giusta, con il nome del repository
  // in evidenza: un passaggio in meno da sbagliare.
  dom.linkCreaCodice.href =
    "https://github.com/settings/personal-access-tokens/new?name=" +
    encodeURIComponent(`Dashboard ${CONFIG.shopName}`) +
    "&description=" +
    encodeURIComponent("Pubblica i gioielli dal telefono");
}

// =============================================================
//  Connessione
// =============================================================

function aggiornaConnessione() {
  if (senzaConnessione()) {
    dom.striscia.textContent = "Sei senza connessione: puoi scrivere, ma non pubblicare.";
    mostra(dom.striscia, true);
  } else {
    mostra(dom.striscia, false);
  }
}

// =============================================================
//  Eventi
// =============================================================

function collegaEventi() {
  dom.moduloAccesso.addEventListener("submit", (evento) => {
    evento.preventDefault();
    entra(dom.campoCodice.value);
  });

  dom.schede.addEventListener("click", (evento) => {
    const bottone = evento.target.closest(".scheda");
    if (bottone) apriVista(bottone.dataset.vista);
  });

  const scelta = (evento) => scegliFoto(evento.target.files?.[0]);
  dom.campoFotocamera.addEventListener("change", scelta);
  dom.campoGalleria.addEventListener("change", scelta);
  dom.bottoneConfronta.addEventListener("click", alternaConfronto);
  dom.bottoneCambiaFoto.addEventListener("click", cambiaFoto);

  dom.bottoneProponi.addEventListener("click", proponiDescrizione);
  dom.bottoneRiprovaAi.addEventListener("click", proponiDescrizione);
  dom.bottoneAttivaAi.addEventListener("click", () => {
    mostra(dom.pannelloChiave, true);
    dom.campoChiave.focus();
  });
  dom.bottoneSalvaChiave.addEventListener("click", () => salvaChiaveAi(dom.campoChiave.value));
  dom.bottoneSalvaChiave2.addEventListener("click", () =>
    salvaChiaveAi(dom.campoChiaveImpostazioni.value)
  );
  dom.bottoneTogliChiave.addEventListener("click", () => {
    stato.chiaveAi = "";
    salva(CHIAVE_GEMINI, "");
    dom.campoChiaveImpostazioni.value = "";
    dom.notaChiaveSalvata.textContent = "Chiave rimossa.";
    aggiornaStatoCredenziali();
  });

  dom.bottonePubblica.addEventListener("click", pubblica);
  dom.bottoneAnnulla.addEventListener("click", ricomincia);
  dom.bottoneAltro.addEventListener("click", ricomincia);

  dom.bottoneRicarica.addEventListener("click", caricaCatalogo);
  dom.bottoneElimina.addEventListener("click", confermaEliminazione);
  dom.bottoneNonEliminare.addEventListener("click", () => dom.finestraElimina.close());
  dom.finestraElimina.addEventListener("close", () => {
    stato.daEliminare = null;
  });

  dom.bottoneEsci.addEventListener("click", esci);

  // La bozza si salva mentre si scrive: se la pagina si ricarica, il lavoro
  // è ancora lì.
  for (const campo of [
    dom.campoNome,
    dom.campoDescrizione,
    dom.campoMateriali,
    dom.campoTag,
    dom.campoPrezzo,
    dom.campoIndizi,
  ]) {
    campo.addEventListener("input", salvaBozza);
  }
  for (const campo of [
    dom.campoCategoria,
    dom.campoSuRichiesta,
    dom.campoDisponibile,
    dom.campoEvidenza,
  ]) {
    campo.addEventListener("change", salvaBozza);
  }

  window.addEventListener("online", aggiornaConnessione);
  window.addEventListener("offline", aggiornaConnessione);
  window.addEventListener("pagehide", salvaBozza);
}

// =============================================================
//  Avvio
// =============================================================

async function avvia() {
  applicaIdentita();
  riempiCategorie();
  collegaEventi();
  aggiornaConnessione();
  leggiCredenziali();

  if (!stato.codice) {
    tornaAllAccesso();
    return;
  }

  // Un codice salvato può essere stato revocato o scaduto: si controlla
  // prima di mostrare una dashboard che poi non funzionerebbe.
  try {
    const { login, canWrite } = await verifyToken(stato.codice);
    if (!canWrite) throw new Error("permessi insufficienti");
    stato.utente = login;
    mostraDashboard();
    await recuperaBozza();
  } catch (errore) {
    if (errore?.codice === "offline") {
      // Senza rete non si può verificare, ma non è colpa del codice:
      // si entra lo stesso e si pubblicherà quando torna la connessione.
      mostraDashboard();
      await recuperaBozza();
      return;
    }
    dimenticaTutto();
    tornaAllAccesso();
    scriviErrore(
      dom.erroreAccesso,
      "Il codice salvato non è più valido. Incollane uno nuovo."
    );
  }
}

avvia();
