// =============================================================
//  Vetrina pubblica — caricamento e presentazione del catalogo
//  Solo moduli ES nativi: nessun build step, nessuna libreria.
// =============================================================

import { CONFIG } from "../config.js";

const SORGENTE = "data/products.json";
const SEGNAPOSTO = "images/products/placeholder.svg";
const TUTTE = "__tutte__";

const stato = {
  prodotti: [],
  categoria: TUTTE,
  attivatore: null, // il gioiello da cui è stata aperta la scheda
};

const el = (id) => document.getElementById(id);

const dom = {
  nomeNegozio: el("nome-negozio"),
  tagline: el("tagline-negozio"),
  descrizione: el("descrizione-negozio"),
  filtri: el("filtri"),
  conteggio: el("conteggio"),
  griglia: el("griglia"),
  avviso: el("avviso"),
  avvisoTitolo: el("avviso-titolo"),
  avvisoTesto: el("avviso-testo"),
  avvisoRiprova: el("avviso-riprova"),
  contatti: el("contatti"),
  copyright: el("copyright"),
  scheda: el("scheda"),
  pannello: el("scheda-pannello"),
  chiudi: el("scheda-chiudi"),
  schedaImmagine: el("scheda-immagine"),
  schedaVenduto: el("scheda-venduto"),
  schedaCategoria: el("scheda-categoria"),
  schedaNome: el("scheda-nome"),
  schedaPrezzo: el("scheda-prezzo"),
  schedaDescrizione: el("scheda-descrizione"),
  schedaMateriali: el("scheda-materiali"),
  schedaMaterialiElenco: el("scheda-materiali-elenco"),
  whatsapp: el("scheda-whatsapp"),
  whatsappOff: el("scheda-whatsapp-off"),
  schedaNota: el("scheda-nota"),
};

// =============================================================
//  Prezzi
// =============================================================

// Se la valuta in config.js fosse scritta male, meglio un ripiego
// che una pagina bianca: il formattatore si crea una volta sola.
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
  const senzaPrezzo =
    CONFIG.showPrices === false ||
    prezzo === null ||
    prezzo === undefined ||
    prezzo === "" ||
    !Number.isFinite(numero);

  if (senzaPrezzo) return "Prezzo su richiesta";
  if (!formattatore) return `${numero} ${CONFIG.currencySymbol || ""}`.trim();
  return formattatore.format(numero);
}

// =============================================================
//  Utilità
// =============================================================

function etichettaCategoria(id) {
  const voce = (CONFIG.categories || []).find((c) => c.id === id);
  return voce ? voce.label : "";
}

function numeroWhatsapp() {
  return String(CONFIG.whatsapp || "").replace(/\D/g, "");
}

function collegamentoWhatsapp(prodotto) {
  const numero = numeroWhatsapp();
  if (!numero) return "";
  const messaggio = `Buongiorno ${CONFIG.shopName}, ho visto "${prodotto.name}" sul vostro sito e vorrei qualche informazione.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(messaggio)}`;
}

function primaImmagine(prodotto) {
  const immagini = Array.isArray(prodotto.images) ? prodotto.images : [];
  const trovata = immagini.find((p) => typeof p === "string" && p.trim() !== "");
  return trovata ? trovata.trim() : SEGNAPOSTO;
}

function testoAlternativo(prodotto) {
  const categoria = etichettaCategoria(prodotto.category);
  return categoria ? `${prodotto.name}, ${categoria.toLowerCase()}` : prodotto.name;
}

// Se un file immagine manca, si ripiega in silenzio sul segnaposto
// invece di lasciare un riquadro rotto nella griglia.
function ripiegoImmagine(img) {
  img.addEventListener(
    "error",
    () => {
      if (!img.getAttribute("src").endsWith(SEGNAPOSTO)) img.src = SEGNAPOSTO;
    },
    { once: true },
  );
}

function impostaMeta(selettore, valore) {
  const tag = document.head.querySelector(selettore);
  if (tag && valore) tag.setAttribute("content", valore);
}

// =============================================================
//  Identità del negozio e meta tag
// =============================================================

function applicaIdentita() {
  const titolo = CONFIG.tagline ? `${CONFIG.shopName} — ${CONFIG.tagline}` : CONFIG.shopName;

  document.title = titolo;
  dom.nomeNegozio.textContent = CONFIG.shopName;
  dom.tagline.textContent = CONFIG.tagline || "";
  dom.tagline.hidden = !CONFIG.tagline;
  dom.descrizione.textContent = CONFIG.description || "";
  dom.descrizione.hidden = !CONFIG.description;

  impostaMeta('meta[name="description"]', CONFIG.description);
  impostaMeta('meta[property="og:title"]', titolo);
  impostaMeta('meta[property="og:description"]', CONFIG.description);
  impostaMeta('meta[property="og:site_name"]', CONFIG.shopName);
  impostaMeta('meta[property="og:url"]', window.location.href);

  // Il colore della barra del browser resta agganciato al design system.
  const fondo = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
  impostaMeta('meta[name="theme-color"]', fondo);

  dom.copyright.textContent = `© ${new Date().getFullYear()} ${CONFIG.shopName}`;
}

function aggiornaImmagineSociale() {
  const primo = stato.prodotti[0];
  if (!primo) return;
  try {
    impostaMeta('meta[property="og:image"]', new URL(primaImmagine(primo), window.location.href).href);
  } catch {
    // percorso non valido: resta l'immagine statica dell'HTML
  }
}

// =============================================================
//  Piè di pagina
// =============================================================

function renderContatti() {
  const voci = [];
  const numero = numeroWhatsapp();

  if (numero) voci.push({ href: `https://wa.me/${numero}`, testo: "Scrivici su WhatsApp", esterno: true });
  if (CONFIG.email) voci.push({ href: `mailto:${CONFIG.email}`, testo: CONFIG.email });
  if (CONFIG.instagram) {
    const utente = String(CONFIG.instagram).trim().replace(/^@/, "");
    if (utente) voci.push({ href: `https://instagram.com/${utente}`, testo: `@${utente}`, esterno: true });
  }
  if (CONFIG.address) voci.push({ testo: CONFIG.address });

  const frammento = document.createDocumentFragment();
  for (const voce of voci) {
    const li = document.createElement("li");
    if (voce.href) {
      const a = document.createElement("a");
      a.href = voce.href;
      a.textContent = voce.testo;
      if (voce.esterno) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      li.append(a);
    } else {
      const span = document.createElement("span");
      span.textContent = voce.testo;
      li.append(span);
    }
    frammento.append(li);
  }

  dom.contatti.replaceChildren(frammento);
  dom.contatti.hidden = voci.length === 0;
}

// =============================================================
//  Stati della pagina
// =============================================================

function mostraScheletri(quantita = 6) {
  nascondiAvviso();
  dom.conteggio.textContent = "Caricamento del catalogo in corso";
  const frammento = document.createDocumentFragment();
  for (let i = 0; i < quantita; i += 1) {
    const li = document.createElement("li");
    li.className = "scheletro";
    li.setAttribute("aria-hidden", "true");
    for (const classe of ["scheletro__foto", "scheletro__riga", "scheletro__riga scheletro__riga--corta"]) {
      const span = document.createElement("span");
      span.className = classe;
      li.append(span);
    }
    frammento.append(li);
  }
  dom.griglia.replaceChildren(frammento);
}

function mostraAvviso(titolo, testo, conRiprova = false) {
  dom.griglia.replaceChildren();
  dom.conteggio.textContent = "";
  dom.avvisoTitolo.textContent = titolo;
  dom.avvisoTesto.textContent = testo;
  dom.avvisoRiprova.hidden = !conRiprova;
  dom.avviso.hidden = false;
}

function nascondiAvviso() {
  dom.avviso.hidden = true;
  dom.avvisoRiprova.hidden = true;
}

// =============================================================
//  Filtri
// =============================================================

function renderFiltri() {
  if (stato.prodotti.length === 0) {
    dom.filtri.replaceChildren();
    dom.filtri.hidden = true;
    return;
  }

  // Si tiene l'ordine di CONFIG.categories, non quello dei dati,
  // e si mostrano solo le categorie che hanno almeno un pezzo.
  const presenti = new Set(stato.prodotti.map((p) => p.category));
  const voci = [
    { id: TUTTE, label: "Tutti" },
    ...(CONFIG.categories || []).filter((c) => presenti.has(c.id)),
  ];

  const frammento = document.createDocumentFragment();
  for (const voce of voci) {
    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.className = "filtro";
    bottone.textContent = voce.label;
    bottone.dataset.categoria = voce.id;
    bottone.setAttribute("aria-pressed", String(stato.categoria === voce.id));
    frammento.append(bottone);
  }

  dom.filtri.replaceChildren(frammento);
  dom.filtri.hidden = false;
}

function aggiornaFiltriAttivi() {
  for (const bottone of dom.filtri.querySelectorAll(".filtro")) {
    bottone.setAttribute("aria-pressed", String(bottone.dataset.categoria === stato.categoria));
  }
}

// =============================================================
//  Griglia
// =============================================================

function prodottiVisibili() {
  if (stato.categoria === TUTTE) return stato.prodotti;
  return stato.prodotti.filter((p) => p.category === stato.categoria);
}

function creaGioiello(prodotto) {
  const venduto = prodotto.available === false;

  const li = document.createElement("li");

  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.className = venduto ? "gioiello gioiello--venduto" : "gioiello";
  bottone.dataset.id = prodotto.id;
  bottone.setAttribute("aria-haspopup", "dialog");

  const foto = document.createElement("span");
  foto.className = "gioiello__foto";

  const img = document.createElement("img");
  img.src = primaImmagine(prodotto);
  img.alt = testoAlternativo(prodotto);
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 800;
  img.height = 800;
  ripiegoImmagine(img);
  foto.append(img);

  if (venduto) {
    const etichetta = document.createElement("span");
    etichetta.className = "etichetta";
    etichetta.textContent = "Venduto";
    foto.append(etichetta);
  }

  const corpo = document.createElement("span");
  corpo.className = "gioiello__corpo";

  const nome = document.createElement("span");
  nome.className = "gioiello__nome";
  nome.textContent = prodotto.name;

  const prezzo = document.createElement("span");
  prezzo.className = "gioiello__prezzo";
  prezzo.textContent = venduto ? "Venduto" : formattaPrezzo(prodotto.price);

  corpo.append(nome, prezzo);
  bottone.append(foto, corpo);
  li.append(bottone);
  return li;
}

function renderGriglia() {
  if (stato.prodotti.length === 0) {
    mostraAvviso(
      "Il catalogo è in allestimento",
      "Stiamo preparando i prossimi pezzi. Torni a trovarci fra qualche giorno, oppure ci scriva: le raccontiamo volentieri cosa abbiamo in laboratorio.",
    );
    return;
  }

  const elenco = prodottiVisibili();

  if (elenco.length === 0) {
    mostraAvviso(
      "Nessun gioiello in questa categoria",
      "Per il momento non ci sono pezzi in questa sezione. Scelga «Tutti» per vedere l'intera collezione.",
    );
    return;
  }

  nascondiAvviso();

  const frammento = document.createDocumentFragment();
  for (const prodotto of elenco) frammento.append(creaGioiello(prodotto));
  dom.griglia.replaceChildren(frammento);

  const coda = stato.categoria === TUTTE ? "" : ` in ${etichettaCategoria(stato.categoria)}`;
  dom.conteggio.textContent = `${elenco.length} ${elenco.length === 1 ? "gioiello" : "gioielli"}${coda}`;
}

// =============================================================
//  Scheda del gioiello
// =============================================================

function apriScheda(id, attivatore) {
  const prodotto = stato.prodotti.find((p) => p.id === id);
  if (!prodotto) return;

  const venduto = prodotto.available === false;
  stato.attivatore = attivatore || null;

  dom.schedaImmagine.src = primaImmagine(prodotto);
  dom.schedaImmagine.alt = testoAlternativo(prodotto);
  ripiegoImmagine(dom.schedaImmagine);

  const categoria = etichettaCategoria(prodotto.category);
  dom.schedaCategoria.textContent = categoria;
  dom.schedaCategoria.hidden = categoria === "";

  dom.schedaNome.textContent = prodotto.name;
  dom.schedaPrezzo.textContent = formattaPrezzo(prodotto.price);

  const descrizione = typeof prodotto.description === "string" ? prodotto.description.trim() : "";
  dom.schedaDescrizione.textContent = descrizione;
  dom.schedaDescrizione.hidden = descrizione === "";

  const materiali = (Array.isArray(prodotto.materials) ? prodotto.materials : []).filter(
    (m) => typeof m === "string" && m.trim() !== "",
  );
  const elencoMateriali = document.createDocumentFragment();
  for (const materiale of materiali) {
    const li = document.createElement("li");
    li.textContent = materiale.trim();
    elencoMateriali.append(li);
  }
  dom.schedaMaterialiElenco.replaceChildren(elencoMateriali);
  dom.schedaMateriali.hidden = materiali.length === 0;

  dom.scheda.classList.toggle("scheda--venduto", venduto);
  dom.schedaVenduto.hidden = !venduto;

  const collegamento = collegamentoWhatsapp(prodotto);
  const haWhatsapp = collegamento !== "";
  if (haWhatsapp && !venduto) dom.whatsapp.href = collegamento;
  dom.whatsapp.hidden = !haWhatsapp || venduto;
  dom.whatsappOff.hidden = !haWhatsapp || !venduto;

  if (venduto) {
    dom.schedaNota.textContent =
      "Questo pezzo è stato venduto. Se le piace, possiamo realizzarne uno simile: ci scriva pure.";
    dom.schedaNota.hidden = false;
  } else if (!haWhatsapp && CONFIG.email) {
    dom.schedaNota.textContent = `Per informazioni scriva a ${CONFIG.email}.`;
    dom.schedaNota.hidden = false;
  } else {
    dom.schedaNota.textContent = "";
    dom.schedaNota.hidden = true;
  }

  dom.scheda.showModal();
  document.documentElement.classList.add("senza-scorrimento");
  dom.pannello.scrollTop = 0;
  dom.pannello.focus();
}

function chiudiScheda() {
  if (dom.scheda.open) dom.scheda.close();
}

// showModal() trattiene già il focus: questo ciclo è una rete di
// sicurezza per i browser che lo fanno in modo incompleto.
function trattieniFocus(evento) {
  if (evento.key !== "Tab") return;

  const focalizzabili = [
    ...dom.scheda.querySelectorAll("a[href]:not([hidden]), button:not([disabled]):not([hidden])"),
  ].filter((nodo) => nodo.offsetParent !== null);

  if (focalizzabili.length === 0) {
    evento.preventDefault();
    return;
  }

  const primo = focalizzabili[0];
  const ultimo = focalizzabili[focalizzabili.length - 1];
  const attivo = document.activeElement;

  if (evento.shiftKey && (attivo === primo || attivo === dom.pannello)) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && attivo === ultimo) {
    evento.preventDefault();
    primo.focus();
  }
}

// =============================================================
//  Caricamento dei dati
// =============================================================

function prodottoValido(voce) {
  return (
    voce !== null &&
    typeof voce === "object" &&
    typeof voce.id === "string" &&
    voce.id.trim() !== "" &&
    typeof voce.name === "string" &&
    voce.name.trim() !== ""
  );
}

async function caricaCatalogo() {
  mostraScheletri();

  try {
    const risposta = await fetch(SORGENTE, { cache: "no-cache" });
    if (!risposta.ok) throw new Error(`Risposta ${risposta.status} da ${SORGENTE}`);

    const dati = await risposta.json();
    const elenco = Array.isArray(dati && dati.products) ? dati.products : [];

    // Una riga malformata non deve far cadere l'intera pagina.
    stato.prodotti = elenco.filter(prodottoValido);

    const categorieNote = new Set((CONFIG.categories || []).map((c) => c.id));
    if (stato.categoria !== TUTTE && !categorieNote.has(stato.categoria)) {
      stato.categoria = TUTTE;
    }

    renderFiltri();
    renderGriglia();
    aggiornaImmagineSociale();
  } catch (errore) {
    // Il dettaglio tecnico resta in console, al cliente va un messaggio piano.
    console.warn("Catalogo non caricato:", errore);
    dom.filtri.replaceChildren();
    dom.filtri.hidden = true;
    mostraAvviso(
      "Non riusciamo a mostrare il catalogo",
      "Il collegamento non è andato a buon fine. Controlli la connessione e riprovi fra un momento.",
      true,
    );
  }
}

// =============================================================
//  Avvio
// =============================================================

function collegaEventi() {
  dom.filtri.addEventListener("click", (evento) => {
    const bottone = evento.target.closest(".filtro");
    if (!bottone) return;
    stato.categoria = bottone.dataset.categoria;
    aggiornaFiltriAttivi();
    renderGriglia();
  });

  dom.griglia.addEventListener("click", (evento) => {
    const gioiello = evento.target.closest(".gioiello");
    if (!gioiello) return;
    apriScheda(gioiello.dataset.id, gioiello);
  });

  dom.avvisoRiprova.addEventListener("click", caricaCatalogo);
  dom.chiudi.addEventListener("click", chiudiScheda);
  dom.scheda.addEventListener("keydown", trattieniFocus);

  // Clic sullo sfondo: si chiude solo se pressione e rilascio avvengono
  // entrambi fuori dal pannello, così trascinare una selezione di testo
  // fino oltre il bordo non chiude la scheda per sbaglio.
  let premutoFuori = false;
  dom.scheda.addEventListener("mousedown", (evento) => {
    premutoFuori = evento.target === dom.scheda;
  });
  dom.scheda.addEventListener("click", (evento) => {
    if (premutoFuori && evento.target === dom.scheda) chiudiScheda();
    premutoFuori = false;
  });

  dom.scheda.addEventListener("close", () => {
    document.documentElement.classList.remove("senza-scorrimento");
    if (stato.attivatore && document.contains(stato.attivatore)) stato.attivatore.focus();
    stato.attivatore = null;
  });
}

applicaIdentita();
renderContatti();
collegaEventi();
caricaCatalogo();
