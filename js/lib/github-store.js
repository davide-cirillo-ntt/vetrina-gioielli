// =============================================================
//  Scrittura su GitHub direttamente dal browser
//  Firma definita in docs/CONTRACTS.md sezione 4.
//  Solo moduli ES nativi e fetch: nessuna libreria, nessun SDK.
// =============================================================
//
//  Tutto passa dalla Git Data API (blob -> tree -> commit -> update ref)
//  perché immagine e catalogo devono finire in UN SOLO commit. Con due
//  commit separati, un'interruzione a metà lascerebbe il sito incoerente:
//  una scheda che punta a una foto inesistente, o una foto orfana.

import { CONFIG } from "../../config.js";

const API = "https://api.github.com";
const OWNER = CONFIG.github.owner;
const REPO = CONFIG.github.repo;
const BRANCH = CONFIG.github.branch;

const PERCORSO_CATALOGO = "data/products.json";
const CARTELLA_IMMAGINI = "images/products";
/** Immagine di ripiego condivisa con la vetrina: non va mai cancellata. */
const SEGNAPOSTO = "images/products/placeholder.svg";
const MODO_FILE = "100644";

// =============================================================
//  Errori leggibili
// =============================================================

/**
 * Errore già scritto in italiano, pronto da mostrare a chi non è tecnico.
 * `codice` serve alla dashboard per decidere cosa fare, per esempio tornare
 * alla schermata di accesso quando la credenziale non è più valida.
 */
export class ErroreGitHub extends Error {
  constructor(messaggio, { codice = "generico", stato = 0, causa } = {}) {
    super(messaggio);
    this.name = "ErroreGitHub";
    this.codice = codice;
    this.stato = stato;
    if (causa) this.causa = causa;
  }
}

function erroreDiRete(causa) {
  return new ErroreGitHub(
    "Non riesco a raggiungere GitHub. Controlla la connessione e riprova.",
    { codice: "offline", causa }
  );
}

function traduciStato(stato, dettaglio = "") {
  const testo = String(dettaglio || "").toLowerCase();

  if (stato === 401) {
    return new ErroreGitHub(
      "Il codice di accesso non è valido o è scaduto. Esci e inseriscine uno nuovo.",
      { codice: "credenziale", stato }
    );
  }

  if (stato === 403) {
    // GitHub usa 403 sia per "non puoi" sia per "hai chiesto troppo".
    if (testo.includes("rate limit") || testo.includes("abuse")) {
      return new ErroreGitHub(
        "Hai fatto troppe operazioni di seguito. Aspetta qualche minuto e riprova.",
        { codice: "limite", stato }
      );
    }
    return new ErroreGitHub(
      "Il codice di accesso non ha il permesso di scrivere sul sito. " +
        'Quando lo crei, metti "Contents" su "Read and write".',
      { codice: "permessi", stato }
    );
  }

  if (stato === 404) {
    return new ErroreGitHub(
      "Non trovo l'archivio del sito. Controlla che il codice di accesso sia " +
        "abilitato proprio su questo repository.",
      { codice: "non-trovato", stato }
    );
  }

  if (stato === 409 || stato === 422) {
    return new ErroreGitHub(
      "Nel frattempo il catalogo è cambiato. Riprova fra un momento.",
      { codice: "conflitto", stato }
    );
  }

  if (stato === 429) {
    return new ErroreGitHub(
      "Troppe richieste in poco tempo. Aspetta qualche minuto e riprova.",
      { codice: "limite", stato }
    );
  }

  if (stato >= 500) {
    return new ErroreGitHub(
      "GitHub in questo momento non risponde. Riprova fra qualche minuto.",
      { codice: "server", stato }
    );
  }

  return new ErroreGitHub(
    "Qualcosa non ha funzionato durante il salvataggio. Riprova.",
    { codice: "generico", stato }
  );
}

// =============================================================
//  Chiamate HTTP
// =============================================================

async function api(percorso, { token, metodo = "GET", corpo, signal } = {}) {
  // Controllo a costo zero: se il telefono è in aereo si evita l'attesa
  // del timeout di rete e si dà subito il messaggio giusto.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw erroreDiRete();
  }

  const opzioni = {
    method: metodo,
    // GitHub risponde con "Cache-Control: private, max-age=60" sulle letture
    // autenticate. Senza questo, subito dopo aver pubblicato o eliminato si
    // rileggerebbe per un minuto la versione vecchia del catalogo, e
    // sembrerebbe che l'operazione non sia andata a buon fine.
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    signal,
  };
  if (corpo) opzioni.body = JSON.stringify(corpo);

  let risposta;
  try {
    risposta = await fetch(`${API}${percorso}`, opzioni);
  } catch (errore) {
    if (errore?.name === "AbortError") throw errore;
    throw erroreDiRete(errore);
  }

  if (!risposta.ok) {
    // Il dettaglio tecnico serve solo a scegliere il messaggio giusto,
    // non viene mai mostrato così com'è.
    let dettaglio = "";
    try {
      dettaglio = (await risposta.text()).slice(0, 500);
    } catch {
      /* il corpo può mancare: non cambia nulla */
    }
    throw traduciStato(risposta.status, dettaglio);
  }

  if (risposta.status === 204) return null;

  try {
    return await risposta.json();
  } catch (errore) {
    throw new ErroreGitHub("Risposta di GitHub non leggibile. Riprova.", {
      codice: "generico",
      causa: errore,
    });
  }
}

// =============================================================
//  Codifiche
// =============================================================

/**
 * base64 di un Blob.
 *
 * `btoa` va evitato qui: su una foto da qualche megabyte bisognerebbe prima
 * costruire una stringa binaria lunghissima, e farlo con `String.fromCharCode`
 * applicato a tutto l'array esaurisce lo stack sui telefoni. `readAsDataURL`
 * fa lo stesso lavoro nel motore del browser, poi basta togliere il prefisso
 * "data:<tipo>;base64,".
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobInBase64(blob) {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => {
      const risultato = String(lettore.result || "");
      const virgola = risultato.indexOf(",");
      if (virgola === -1) {
        rifiuta(new ErroreGitHub("Non riesco a leggere la foto. Provala a scegliere di nuovo."));
        return;
      }
      risolvi(risultato.slice(virgola + 1));
    };
    lettore.onerror = () =>
      rifiuta(new ErroreGitHub("Non riesco a leggere la foto. Provala a scegliere di nuovo."));
    lettore.readAsDataURL(blob);
  });
}

/** base64 di un testo UTF-8, a blocchi per non far esplodere `btoa`. */
function testoInBase64(testo) {
  const byte = new TextEncoder().encode(testo);
  let binario = "";
  const BLOCCO = 0x8000;
  for (let i = 0; i < byte.length; i += BLOCCO) {
    binario += String.fromCharCode.apply(null, byte.subarray(i, i + BLOCCO));
  }
  return btoa(binario);
}

/** Inverso del precedente: serve a rileggere `products.json`. */
function base64InTesto(base64) {
  const pulito = String(base64 || "").replace(/\s/g, "");
  const binario = atob(pulito);
  const byte = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) byte[i] = binario.charCodeAt(i);
  return new TextDecoder("utf-8").decode(byte);
}

// =============================================================
//  Nomi dei file
// =============================================================

/**
 * "Anello Aurora à luce" -> "anello-aurora-a-luce"
 *
 * Gli accenti italiani vengono prima scomposti con NFD (à diventa "a" più il
 * segno) e poi ripuliti, così restano lettere vere invece di sparire.
 */
export function slug(testo) {
  return String(testo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Timestamp compatto in base 36: corto ma ordinabile nel tempo. */
function timestampCorto() {
  return Date.now().toString(36);
}

function percorsoImmagine(nomeProdotto, estensione) {
  const base = slug(nomeProdotto) || "gioiello";
  const ext = slug(estensione) || "jpg";
  return `${CARTELLA_IMMAGINI}/${base}-${timestampCorto()}.${ext}`;
}

/** Id univoco rispetto al catalogo già presente: slug + contatore a 4 cifre. */
function generaId(nome, prodottiEsistenti) {
  const base = slug(nome) || "gioiello";
  const presi = new Set(prodottiEsistenti.map((p) => p && p.id));
  let contatore = prodottiEsistenti.length + 1;
  let id = `${base}-${String(contatore).padStart(4, "0")}`;
  while (presi.has(id)) {
    contatore += 1;
    id = `${base}-${String(contatore).padStart(4, "0")}`;
  }
  return id;
}

// =============================================================
//  1. Verifica della credenziale
// =============================================================

/**
 * @param {string} token
 * @returns {Promise<{login: string, canWrite: boolean}>}
 */
export async function verifyToken(token) {
  const pulito = String(token || "").trim();
  if (!pulito) {
    throw new ErroreGitHub("Incolla il codice di accesso per continuare.", {
      codice: "credenziale",
    });
  }

  const utente = await api("/user", { token: pulito });
  const deposito = await api(`/repos/${OWNER}/${REPO}`, { token: pulito });

  const permessi = deposito.permissions || {};
  const canWrite = Boolean(permessi.push || permessi.admin || permessi.maintain);

  return { login: utente.login || "utente", canWrite };
}

// =============================================================
//  2. Lettura del catalogo
// =============================================================

function normalizzaCatalogo(grezzo) {
  const base =
    grezzo && typeof grezzo === "object" && !Array.isArray(grezzo)
      ? grezzo
      : { schemaVersion: 1, products: [] };

  return {
    schemaVersion: base.schemaVersion || 1,
    updatedAt: base.updatedAt || new Date().toISOString(),
    products: Array.isArray(base.products) ? base.products : [],
  };
}

async function leggiCatalogo(token, riferimento = BRANCH) {
  const risposta = await api(
    `/repos/${OWNER}/${REPO}/contents/${PERCORSO_CATALOGO}?ref=${encodeURIComponent(riferimento)}`,
    { token }
  );

  let grezzo;
  try {
    grezzo = JSON.parse(base64InTesto(risposta.content));
  } catch (errore) {
    throw new ErroreGitHub(
      "Il file del catalogo non è leggibile. Contatta chi ti ha preparato il sito.",
      { codice: "catalogo", causa: errore }
    );
  }

  return { raw: normalizzaCatalogo(grezzo), sha: risposta.sha };
}

/**
 * @param {string} token
 * @returns {Promise<{products: object[], sha: string, raw: object}>}
 */
export async function loadProducts(token) {
  const { raw, sha } = await leggiCatalogo(token);
  return { products: raw.products, sha, raw };
}

// =============================================================
//  3. Scrittura atomica
// =============================================================

async function creaBlob(token, contenuto) {
  const blob = await api(`/repos/${OWNER}/${REPO}/git/blobs`, {
    token,
    metodo: "POST",
    corpo: { content: contenuto, encoding: "base64" },
  });
  return blob.sha;
}

/**
 * Vertice attuale del branch.
 *
 * Va letto PRIMA del catalogo. Se si leggesse il catalogo per primo e il ref
 * per secondo, un commit arrivato nel frattempo finirebbe dentro `base_tree`
 * mentre il JSON in mano sarebbe già vecchio: si cancellerebbe in silenzio il
 * lavoro di qualcun altro, e la PATCH riuscirebbe senza accorgersene.
 * Ancorando la lettura a questo commit, qualunque modifica concorrente sposta
 * il ref e fa fallire la PATCH, che è esattamente il segnale che serve.
 *
 * @returns {Promise<{shaCommit: string, shaAlbero: string}>}
 */
async function leggiVertice(token) {
  const ref = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, { token });
  const shaCommit = ref.object.sha;
  const commit = await api(`/repos/${OWNER}/${REPO}/git/commits/${shaCommit}`, { token });
  return { shaCommit, shaAlbero: commit.tree.sha };
}

/**
 * Crea il commit unico e lo rende visibile.
 *
 * Fino alla PATCH finale nulla è pubblicato: blob, albero e commit restano
 * oggetti orfani che GitHub raccoglie da solo. Se la rete cade a metà, il sito
 * resta esattamente com'era. La PATCH è l'unico istante in cui immagine e
 * catalogo diventano reali, e lo diventano insieme.
 *
 * `force: false` fa fallire l'aggiornamento se il ref si è mosso: è il
 * rilevamento del conflitto.
 *
 * @param {object} p
 * @param {string} p.token
 * @param {string} p.shaCommit  commit su cui ci si appoggia, e futuro genitore
 * @param {string} p.shaAlbero  albero di quel commit
 * @param {string} p.messaggio
 * @param {Array<{path: string, sha: string|null}>} p.voci
 * @returns {Promise<{commitSha: string, commitUrl: string}>}
 */
async function commitAtomico({ token, shaCommit, shaAlbero, messaggio, voci }) {
  const albero = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
    token,
    metodo: "POST",
    corpo: {
      base_tree: shaAlbero,
      tree: voci.map((voce) => ({
        path: voce.path,
        mode: MODO_FILE,
        type: "blob",
        sha: voce.sha,
      })),
    },
  });

  const commit = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
    token,
    metodo: "POST",
    corpo: { message: messaggio, tree: albero.sha, parents: [shaCommit] },
  });

  await api(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    token,
    metodo: "PATCH",
    corpo: { sha: commit.sha, force: false },
  });

  return {
    commitSha: commit.sha,
    commitUrl: `https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`,
  };
}

/**
 * Esegue l'operazione e, se fallisce per conflitto, ricarica lo stato e
 * riprova UNA SOLA VOLTA. Insistere oltre rischierebbe di calpestare il
 * lavoro di chi sta scrivendo nello stesso momento: meglio avvisare.
 */
async function conUnaRiprova(operazione) {
  try {
    return await operazione(1);
  } catch (errore) {
    if (!(errore instanceof ErroreGitHub) || errore.codice !== "conflitto") throw errore;

    try {
      return await operazione(2);
    } catch (secondo) {
      if (secondo instanceof ErroreGitHub && secondo.codice === "conflitto") {
        throw new ErroreGitHub(
          "Il catalogo è stato modificato proprio adesso. Aspetta qualche secondo " +
            "e premi di nuovo Pubblica: non hai perso nulla.",
          { codice: "conflitto", stato: secondo.stato }
        );
      }
      throw secondo;
    }
  }
}

/**
 * Pubblica in UN SOLO commit: immagine + products.json aggiornato.
 *
 * @param {object} params
 * @param {string} params.token
 * @param {object} params.product         voce conforme allo schema, senza `images`
 * @param {Blob}   params.imageBlob
 * @param {string} params.imageExtension
 * @param {(step: string) => void} [params.onProgress]
 * @returns {Promise<{commitSha: string, commitUrl: string, imagePath: string, product: object}>}
 */
export async function publishProduct({
  token,
  product,
  imageBlob,
  imageExtension,
  onProgress,
}) {
  const avanza = typeof onProgress === "function" ? onProgress : () => {};

  if (!token) {
    throw new ErroreGitHub("Manca il codice di accesso. Esci e rientra.", {
      codice: "credenziale",
    });
  }
  if (!product || !product.name) {
    throw new ErroreGitHub("Manca il nome del gioiello.", { codice: "dati" });
  }
  if (!imageBlob) {
    throw new ErroreGitHub("Manca la foto del gioiello.", { codice: "dati" });
  }

  avanza("Preparo la foto…");
  const immagineBase64 = await blobInBase64(imageBlob);

  // La foto si carica una volta sola: anche se il catalogo andasse in
  // conflitto, il blob resta valido e non va ricaricato sulla rete mobile.
  avanza("Carico la foto…");
  const shaImmagine = await creaBlob(token, immagineBase64);

  const imagePath = percorsoImmagine(product.name, imageExtension || "jpg");

  const esito = await conUnaRiprova(async (tentativo) => {
    avanza(tentativo === 1 ? "Aggiorno il catalogo…" : "Riprovo ad aggiornare il catalogo…");

    const { shaCommit, shaAlbero } = await leggiVertice(token);
    const { raw } = await leggiCatalogo(token, shaCommit);
    const prodotti = raw.products;

    const id =
      product.id && !prodotti.some((p) => p && p.id === product.id)
        ? product.id
        : generaId(product.name, prodotti);

    const voce = {
      id,
      name: product.name,
      category: product.category || "altro",
      price: Number.isFinite(product.price) ? product.price : null,
      description: product.description || "",
      materials: Array.isArray(product.materials) ? product.materials : [],
      images: [imagePath],
      available: product.available !== false,
      featured: Boolean(product.featured),
      tags: Array.isArray(product.tags) ? product.tags : [],
      createdAt: product.createdAt || new Date().toISOString(),
    };

    // I nuovi prodotti vanno in testa: lo dice il contratto, sezione 1.
    const catalogo = {
      schemaVersion: raw.schemaVersion || 1,
      updatedAt: new Date().toISOString(),
      products: [voce, ...prodotti],
    };

    const shaCatalogo = await creaBlob(
      token,
      testoInBase64(`${JSON.stringify(catalogo, null, 2)}\n`)
    );

    avanza("Pubblico…");
    const commit = await commitAtomico({
      token,
      shaCommit,
      shaAlbero,
      messaggio: `Aggiunge ${voce.name} al catalogo`,
      voci: [
        { path: imagePath, sha: shaImmagine },
        { path: PERCORSO_CATALOGO, sha: shaCatalogo },
      ],
    });

    return { ...commit, product: voce };
  });

  avanza("Fatto.");
  return {
    commitSha: esito.commitSha,
    commitUrl: esito.commitUrl,
    imagePath,
    product: esito.product,
  };
}

// =============================================================
//  4. Eliminazione
// =============================================================

/**
 * Toglie il prodotto dal catalogo e, nello stesso commit, cancella le sue
 * foto. Vengono cancellate solo quelle dentro images/products/ che nessun
 * altro prodotto sta usando, e mai il segnaposto condiviso con la vetrina.
 *
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.id
 * @param {(step: string) => void} [params.onProgress]
 * @returns {Promise<{commitSha: string}>}
 */
export async function deleteProduct({ token, id, onProgress }) {
  const avanza = typeof onProgress === "function" ? onProgress : () => {};

  if (!token) {
    throw new ErroreGitHub("Manca il codice di accesso. Esci e rientra.", {
      codice: "credenziale",
    });
  }
  if (!id) {
    throw new ErroreGitHub("Non so quale gioiello eliminare.", { codice: "dati" });
  }

  const esito = await conUnaRiprova(async (tentativo) => {
    avanza(tentativo === 1 ? "Aggiorno il catalogo…" : "Riprovo ad aggiornare il catalogo…");

    const { shaCommit, shaAlbero } = await leggiVertice(token);
    const { raw } = await leggiCatalogo(token, shaCommit);
    const prodotti = raw.products;

    const daEliminare = prodotti.find((p) => p && p.id === id);
    if (!daEliminare) {
      throw new ErroreGitHub(
        "Questo gioiello non è più nel catalogo: forse è già stato eliminato.",
        { codice: "non-trovato" }
      );
    }

    const rimasti = prodotti.filter((p) => p && p.id !== id);
    const ancoraInUso = new Set(
      rimasti.flatMap((p) => (Array.isArray(p.images) ? p.images : []))
    );

    const fotoDaCancellare = (
      Array.isArray(daEliminare.images) ? daEliminare.images : []
    ).filter(
      (percorso) =>
        typeof percorso === "string" &&
        percorso.startsWith(`${CARTELLA_IMMAGINI}/`) &&
        percorso !== SEGNAPOSTO &&
        !ancoraInUso.has(percorso)
    );

    const catalogo = {
      schemaVersion: raw.schemaVersion || 1,
      updatedAt: new Date().toISOString(),
      products: rimasti,
    };

    const shaCatalogo = await creaBlob(
      token,
      testoInBase64(`${JSON.stringify(catalogo, null, 2)}\n`)
    );

    avanza("Elimino…");
    return commitAtomico({
      token,
      shaCommit,
      shaAlbero,
      messaggio: `Rimuove ${daEliminare.name} dal catalogo`,
      voci: [
        { path: PERCORSO_CATALOGO, sha: shaCatalogo },
        // In un albero con base_tree, sha a null significa "cancella il file".
        ...fotoDaCancellare.map((percorso) => ({ path: percorso, sha: null })),
      ],
    });
  });

  avanza("Fatto.");
  return { commitSha: esito.commitSha };
}

// =============================================================
//  Indirizzi utili alla dashboard
// =============================================================

/** Indirizzo pubblico del sito, per il link "Vedi il gioiello". */
export function indirizzoSito() {
  return `https://${OWNER}.github.io/${REPO}/`;
}

/** Nome leggibile del repository, mostrato nelle istruzioni sul codice. */
export function nomeRepository() {
  return `${OWNER}/${REPO}`;
}
