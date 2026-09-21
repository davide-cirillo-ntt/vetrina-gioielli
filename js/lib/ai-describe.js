/**
 * Genera nome e descrizione di un gioiello a partire dalla sua foto,
 * chiamando l'API di Google Gemini direttamente dal browser.
 *
 * Firma definita in docs/CONTRACTS.md sezione 3.
 *
 * Nota per chi legge: Gemini è stato scelto perché è l'unico servizio
 * verificato che restituisce le intestazioni CORS anche sulla risposta
 * vera, non solo sul preflight. OpenAI supera il preflight ma poi il
 * browser blocca la lettura della risposta.
 */

import { CONFIG } from "../../config.js";

const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Provati in ordine: i nomi dei modelli cambiano nel tempo e quelli vecchi
 * vengono spenti, quindi se il primo non esiste più si passa al successivo
 * invece di lasciare l'utente con un errore incomprensibile.
 */
const MODELLI = ["gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

/** Il modello che ha funzionato, per non ripetere i tentativi a ogni foto. */
let modelloFunzionante = null;

const SCHEMA_RISPOSTA = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    materials: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    category: { type: "string" },
  },
  required: ["name", "description", "materials", "tags"],
};

function categorieAmmesse() {
  const categorie = Array.isArray(CONFIG?.categories) ? CONFIG.categories : [];
  return categorie.map((c) => c.id).filter(Boolean);
}

function componiIstruzioni(hints = {}) {
  const categorie = categorieAmmesse();

  const righe = [
    "Sei l'assistente di una piccola gioielleria italiana.",
    "Guarda la fotografia e compila la scheda del gioiello in ITALIANO.",
    "",
    "Tono: sobrio e concreto, come la scheda di una bottega artigiana.",
    "Descrizione di 2-4 frasi: che cos'è, la forma, la lavorazione, come si porta.",
    "",
    "Regole da rispettare sempre:",
    "- Niente superlativi pubblicitari: mai 'stupendo', 'imperdibile', 'unico nel suo genere'.",
    "- Non inventare prezzi e non citare cifre.",
    "- Non affermare caratura, purezza, autenticità o valore delle pietre se non ti vengono indicati qui sotto: descrivi solo ciò che si vede.",
    "- Se un dettaglio non è visibile nella foto, non inventarlo.",
    "- Il nome deve essere breve, 2-3 parole, adatto a un catalogo.",
    "- In 'materials' elenca solo materiali che ti sono stati indicati o chiaramente riconoscibili.",
    "- In 'tags' metti 2-4 parole chiave semplici e minuscole.",
  ];

  if (categorie.length) {
    righe.push(
      `- In 'category' scegli esattamente uno fra questi valori: ${categorie.join(", ")}.`
    );
  }

  const indizi = [];
  if (hints.category) indizi.push(`Categoria indicata dal negoziante: ${hints.category}.`);
  if (hints.materials) indizi.push(`Materiali indicati dal negoziante: ${hints.materials}.`);
  if (hints.notes) indizi.push(`Note del negoziante: ${hints.notes}.`);
  // Il prezzo non viene mai passato al modello: non deve influenzare il testo.

  if (indizi.length) {
    righe.push("", "Informazioni fornite dal negoziante, da considerare attendibili:", ...indizi);
  }

  return righe.join("\n");
}

function leggiDataUrl(imageDataUrl) {
  const corrispondenza = /^data:([^;,]+);base64,(.+)$/s.exec(imageDataUrl || "");
  if (!corrispondenza) {
    throw new Error("La foto non è leggibile. Prova a caricarla di nuovo.");
  }
  return { mimeType: corrispondenza[1], base64: corrispondenza[2] };
}

function messaggioPerStato(stato, dettaglio) {
  if (stato === 400 && /api key/i.test(dettaglio)) {
    return "La chiave Gemini non è valida. Controllala nelle impostazioni.";
  }
  if (stato === 400) {
    return "Il servizio non ha accettato la richiesta. Prova con un'altra foto.";
  }
  if (stato === 401 || stato === 403) {
    return "La chiave Gemini non è valida o non è abilitata. Controllala nelle impostazioni.";
  }
  if (stato === 429) {
    return "Hai raggiunto il limite giornaliero di descrizioni automatiche. Riprova più tardi o scrivi la descrizione a mano.";
  }
  if (stato >= 500) {
    return "Il servizio non è raggiungibile in questo momento. Riprova fra qualche minuto.";
  }
  return "Non è stato possibile generare la descrizione. Puoi scriverla a mano.";
}

function testoDaRisposta(dati) {
  const parti = dati?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parti)) return "";
  return parti
    .map((p) => p?.text)
    .filter(Boolean)
    .join("");
}

function ripulisciTesto(valore) {
  return typeof valore === "string" ? valore.trim() : "";
}

function ripulisciElenco(valore, massimo) {
  if (!Array.isArray(valore)) return [];
  const visti = new Set();
  const risultato = [];
  for (const voce of valore) {
    const pulita = ripulisciTesto(voce);
    const chiave = pulita.toLowerCase();
    if (!pulita || visti.has(chiave)) continue;
    visti.add(chiave);
    risultato.push(pulita);
    if (risultato.length >= massimo) break;
  }
  return risultato;
}

function normalizzaProposta(grezza, hints) {
  const ammesse = categorieAmmesse();
  const categoriaProposta = ripulisciTesto(grezza?.category).toLowerCase();
  const categoria = ammesse.includes(categoriaProposta) ? categoriaProposta : hints?.category;

  return {
    name: ripulisciTesto(grezza?.name),
    description: ripulisciTesto(grezza?.description),
    materials: ripulisciElenco(grezza?.materials, 6),
    tags: ripulisciElenco(grezza?.tags, 4).map((t) => t.toLowerCase()),
    ...(categoria ? { category: categoria } : {}),
  };
}

async function chiamaModello({ modello, corpo, token, signal }) {
  let risposta;
  try {
    risposta = await fetch(`${ENDPOINT_BASE}/${modello}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": token },
      body: JSON.stringify(corpo),
      signal,
    });
  } catch (errore) {
    if (errore?.name === "AbortError") throw errore;
    throw new Error(
      "Impossibile contattare il servizio. Controlla la connessione e riprova."
    );
  }

  if (!risposta.ok) {
    const dettaglio = await risposta.text().catch(() => "");
    const errore = new Error(messaggioPerStato(risposta.status, dettaglio));
    errore.stato = risposta.status;
    // Serve a distinguere "questo modello non esiste più" da un errore vero.
    errore.modelloAssente =
      risposta.status === 404 || /not found|is not supported/i.test(dettaglio);
    throw errore;
  }

  return risposta.json();
}

/**
 * @param {object} params
 * @param {string} params.imageDataUrl
 * @param {object} [params.hints]
 * @param {string} params.token
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{name: string, description: string, materials: string[], tags: string[], category?: string}>}
 */
export async function generateDescription({ imageDataUrl, hints = {}, token, signal } = {}) {
  if (!token) {
    throw new Error(
      "Manca la chiave per la descrizione automatica. Aggiungila nelle impostazioni oppure scrivi la descrizione a mano."
    );
  }

  const { mimeType, base64 } = leggiDataUrl(imageDataUrl);

  const corpo = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: componiIstruzioni(hints) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_RISPOSTA,
    },
  };

  const daProvare = modelloFunzionante
    ? [modelloFunzionante, ...MODELLI.filter((m) => m !== modelloFunzionante)]
    : MODELLI;

  let ultimoErrore;
  for (const modello of daProvare) {
    try {
      const dati = await chiamaModello({ modello, corpo, token, signal });
      const testo = testoDaRisposta(dati);
      if (!testo) {
        throw new Error("Il servizio non ha restituito una descrizione. Riprova.");
      }

      let grezza;
      try {
        grezza = JSON.parse(testo);
      } catch {
        throw new Error("La risposta del servizio non è leggibile. Riprova.");
      }

      const proposta = normalizzaProposta(grezza, hints);
      if (!proposta.name && !proposta.description) {
        throw new Error("Il servizio non ha restituito una descrizione. Riprova.");
      }

      modelloFunzionante = modello;
      return proposta;
    } catch (errore) {
      if (errore?.name === "AbortError") throw errore;
      ultimoErrore = errore;
      if (!errore?.modelloAssente) throw errore;
    }
  }

  throw ultimoErrore ?? new Error("Non è stato possibile generare la descrizione.");
}

export default generateDescription;
