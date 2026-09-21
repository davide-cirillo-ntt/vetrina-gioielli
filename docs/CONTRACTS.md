# Contratti tecnici — NON modificare senza avvisare gli altri worktree

Questo file è la fonte di verità condivisa fra i lavori paralleli.
Chi implementa un modulo **deve** rispettare esattamente queste firme.
Chi consuma un modulo **può** assumere che esistano.

---

## 1. Schema dati — `data/products.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "ISO-8601",       // aggiornato a ogni scrittura
  "products": [
    {
      "id": "slug-univoco-0001",  // kebab-case, generato da nome + contatore
      "name": "Anello Aurora",
      "category": "anelli",       // uno degli id in CONFIG.categories
      "price": 189,               // numero, nella valuta di CONFIG. null = su richiesta
      "description": "…",         // testo libero, 2-4 frasi
      "materials": ["Argento 925"],
      "images": ["images/products/xxx.webp"], // percorsi relativi alla root del repo
      "available": true,
      "featured": false,
      "tags": ["minimal"],
      "createdAt": "ISO-8601"
    }
  ]
}
```

Regole:
- I prodotti si leggono con `fetch('data/products.json')`; **mai** hardcodare prodotti nel markup.
- `id` è immutabile. I nuovi prodotti si aggiungono **in testa** all'array.
- Un prodotto ha sempre almeno una voce in `images`.

---

## 2. `js/lib/image-enhance.js`

Migliora una foto scattata dal telefono, interamente nel browser (Canvas API).
Nessuna dipendenza esterna, nessuna chiamata di rete.

```js
/**
 * @param {File|Blob} file           foto originale
 * @param {object}   [options]
 * @param {number}   [options.maxSize=1600]  lato massimo in px
 * @param {number}   [options.quality=0.85]  qualità di compressione
 * @param {boolean}  [options.square=true]   ritaglio quadrato centrato
 * @returns {Promise<EnhancedImage>}
 */
export async function enhanceImage(file, options) {}

/**
 * @typedef {object} EnhancedImage
 * @property {Blob}   blob      immagine finale (image/webp, fallback image/jpeg)
 * @property {string} dataUrl   data URL della stessa immagine
 * @property {string} mimeType
 * @property {string} extension "webp" | "jpg"
 * @property {number} width
 * @property {number} height
 * @property {number} originalBytes
 * @property {number} bytes
 */
```

Deve applicare, in quest'ordine: correzione orientamento EXIF → ritaglio → ridimensionamento
→ bilanciamento del bianco → auto-livelli (con clipping dei percentili, non min/max puri)
→ leggero aumento di contrasto e saturazione → maschera di contrasto (unsharp mask).
Il risultato deve restare **naturale**: è un gioiello, non un filtro social.

---

## 3. `js/lib/ai-describe.js`

Genera nome e descrizione a partire dalla foto.

```js
/**
 * @param {object} params
 * @param {string} params.imageDataUrl  data URL dell'immagine (già migliorata)
 * @param {object} [params.hints]       indizi facoltativi dati dall'utente
 * @param {string} [params.hints.category]
 * @param {string} [params.hints.materials]
 * @param {number} [params.hints.price]
 * @param {string} [params.hints.notes]
 * @param {string} params.token         credenziale per il servizio di inferenza
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<Suggestion>}
 */
export async function generateDescription(params) {}

/**
 * @typedef {object} Suggestion
 * @property {string}   name
 * @property {string}   description   italiano, 2-4 frasi, tono sobrio
 * @property {string[]} materials
 * @property {string[]} tags
 * @property {string}   [category]
 */
```

Vincoli: output **sempre in italiano**, niente superlativi da pubblicità
("stupendo", "imperdibile"), niente prezzi inventati, niente affermazioni non
verificabili sulla pietra o sulla caratura se non fornite negli `hints`.
In caso di errore lanciare un `Error` con messaggio leggibile in italiano.

---

## 4. `js/lib/github-store.js`

Scrive su GitHub dal browser.

```js
/** @returns {Promise<{login: string, canWrite: boolean}>} */
export async function verifyToken(token) {}

/** @returns {Promise<{products: object[], sha: string, raw: object}>} */
export async function loadProducts(token) {}

/**
 * Pubblica in UN SOLO commit: immagine + products.json aggiornato.
 * @param {object} params
 * @param {string} params.token
 * @param {object} params.product     voce conforme allo schema (senza `images`)
 * @param {Blob}   params.imageBlob
 * @param {string} params.imageExtension
 * @param {(step: string) => void} [params.onProgress]
 * @returns {Promise<{commitSha: string, commitUrl: string, imagePath: string}>}
 */
export async function publishProduct(params) {}

/** @returns {Promise<{commitSha: string}>} */
export async function deleteProduct({ token, id }) {}
```

Usa la Git Data API (blob → tree → commit → update ref) per avere **un commit
atomico**. Niente librerie esterne, solo `fetch`.

---

## 5. Proprietà dei file (per evitare conflitti)

| Ambito | File di competenza |
|---|---|
| Vetrina pubblica | `index.html`, `css/site.css`, `js/catalog.js` |
| Dashboard | `admin/index.html`, `css/admin.css`, `js/admin.js`, `js/lib/github-store.js` |
| Foto e AI | `js/lib/image-enhance.js`, `js/lib/ai-describe.js`, `dev/test-lab.html` |
| Condivisi (solo lettura) | `config.js`, `data/products.json`, `docs/CONTRACTS.md` |
