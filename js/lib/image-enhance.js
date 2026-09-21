/**
 * =============================================================
 *  Miglioramento automatico delle foto di gioielli
 * =============================================================
 *
 * Firma e comportamento definiti in `docs/CONTRACTS.md`, sezione 2.
 * Nessuna dipendenza esterna, nessuna chiamata di rete: solo le API
 * native del browser (createImageBitmap, canvas, ImageData, toBlob).
 *
 * Ordine della catena di elaborazione:
 *   1. orientamento EXIF
 *   2. ritaglio quadrato centrato (opzionale)
 *   3. ridimensionamento a dimezzamenti successivi
 *   4. bilanciamento del bianco
 *   5. auto-livelli sui percentili, con spalla morbida sulle alte luci
 *   6. contrasto (curva a S dolce) e saturazione
 *   7. maschera di contrasto (unsharp mask) con soglia
 *   8. esportazione in WebP, con ripiego su JPEG
 *
 * Criterio di taratura: il risultato deve restare credibile. Una foto
 * già corretta deve uscire praticamente identica; per questo ogni
 * correzione è limitata da un tetto massimo e applicata a forza
 * parziale. Le costanti qui sotto sono il punto in cui intervenire
 * per rendere l'effetto più o meno marcato.
 */

// --- Parametri predefiniti (contratto) --------------------------
const DEFAULTS = {
  maxSize: 1600,
  quality: 0.85,
  square: true,
};

// --- Taratura ----------------------------------------------------
const TUNING = {
  // Bilanciamento del bianco
  wbSampleLow: 0.4, // percentile di luminanza minimo del campione
  wbSampleHigh: 0.92, // percentile massimo: esclude i riflessi speculari
  wbClipLevel: 250, // pixel con un canale oltre questo valore: scartati
  wbStrength: 0.9, // esponente: su una foto già neutra resta comunque ~1
  wbMinGain: 0.7,
  wbMaxGain: 1.5,

  // Auto-livelli
  levelsLowPercentile: 0.005, // 0,5 %
  levelsHighPercentile: 0.995, // 99,5 %
  levelsMaxStretch: 3.0, // tetto all'espansione dell'istogramma
  levelsMaxDarkening: 0.72, // la mediana non scende oltre il 28 %
  levelsStrength: 0.85, // miscelazione con l'originale
  levelsMinSpan: 8, // sotto questa ampiezza l'istogramma è degenere

  // Contrasto e saturazione
  contrastAmount: 0.16, // quota di curva a S miscelata
  saturationAmount: 1.1, // +10 % sui colori poco saturi

  // Maschera di contrasto
  sharpenAmount: 0.55,
  sharpenThreshold: 3, // su 255: sotto questa soglia è rumore
  sharpenReference: 1200, // px: raggio 1 a questa dimensione
  sharpenHeadroom: 0.7, // quota di spazio residuo utilizzabile dall'alone

  // Limiti di sicurezza
  maxPixels: 80e6,
  maxBytes: 80 * 1024 * 1024,
  exifScanBytes: 256 * 1024,
};

/**
 * JPEG 8×4 con EXIF `Orientation = 6` (rotazione di 90°), 700 byte.
 * Serve come sonda: se il browser lo decodifica 4×8 vuol dire che ha
 * applicato l'orientamento EXIF da solo. È l'unico modo affidabile per
 * saperlo — la stringa user-agent non dice nulla di utile e su Safari
 * il comportamento è cambiato più volte fra una versione e l'altra.
 */
const PROBE_ORIENT_6 =
  "/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/wAARCAAEAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEB" +
  "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0Kx" +
  "wRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJ" +
  "ipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QA" +
  "HwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMi" +
  "MoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3" +
  "eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP0" +
  "9fb3+Pn6/9sAQwAEBAQEBAQGBAQGCQYGBgkMCQkJCQwPDAwMDAwPEg8PDw8PDxISEhISEhISFRUVFRUVGRkZGRkcHBwc" +
  "HBwcHBwc/9sAQwEEBQUHBwcMBwcMHRQQFB0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0d" +
  "HR0dHR0d/90ABAAB/9oADAMBAAIRAxEAPwDxHW/+WP8AwL+lYNb2t/8ALH/gX9Kwa/a+CP8AkR4f/t7/ANLkerxh/wAj" +
  "iv8A9u/+kxP/2Q==";

// =============================================================
//  Rilevamento delle capacità del browser
// =============================================================

/** @type {Promise<Capabilities>|null} */
let capabilitiesPromise = null;

/** Copia sincrona, disponibile dopo la prima risoluzione. */
let caps = {
  offscreen: false,
  webp: false,
  decode: "image", // "bitmap-from-image" | "bitmap" | "image"
  autoOrients: false,
};

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function supportsOffscreen() {
  // Safari ha aggiunto OffscreenCanvas solo nella 16.4 e in alcune versioni
  // il costruttore esiste ma il contesto 2d no: va verificato davvero.
  try {
    if (typeof OffscreenCanvas !== "function") return false;
    const probe = new OffscreenCanvas(2, 2);
    const ctx = probe.getContext("2d");
    if (!ctx) return false;
    ctx.fillRect(0, 0, 1, 1);
    return typeof probe.convertToBlob === "function";
  } catch {
    return false;
  }
}

async function supportsWebp(useOffscreen) {
  // Verifica reale: si codifica una tela 2×2 e si guarda che tipo esce.
  // Un browser che non sa fare WebP restituisce comunque un PNG.
  try {
    if (useOffscreen) {
      const probe = new OffscreenCanvas(2, 2);
      probe.getContext("2d").fillRect(0, 0, 2, 2);
      const blob = await probe.convertToBlob({ type: "image/webp", quality: 0.8 });
      return blob.type === "image/webp";
    }
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    probe.width = 2;
    probe.height = 2;
    probe.getContext("2d").fillRect(0, 0, 2, 2);
    return probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function decodeWithImageElement(blob) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Impossibile decodificare l'immagine in questo contesto."));
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decodifica fallita"));
    };
    img.src = url;
  });
}

async function probeDecodePath(blob) {
  // Si prova la catena nello stesso ordine usato per le foto vere, così la
  // sonda misura esattamente il percorso che verrà poi impiegato.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const rotated = bitmap.width === 4 && bitmap.height === 8;
      bitmap.close?.();
      if (rotated) return { decode: "bitmap-from-image", autoOrients: true };
    } catch {
      /* opzione non riconosciuta: si passa oltre */
    }
    try {
      const bitmap = await createImageBitmap(blob);
      const rotated = bitmap.width === 4 && bitmap.height === 8;
      bitmap.close?.();
      return { decode: "bitmap", autoOrients: rotated };
    } catch {
      /* createImageBitmap inutilizzabile: si ripiega su <img> */
    }
  }
  try {
    const img = await decodeWithImageElement(blob);
    return { decode: "image", autoOrients: img.naturalWidth === 4 };
  } catch {
    return { decode: "image", autoOrients: false };
  }
}

/**
 * @typedef {object} Capabilities
 * @property {boolean} offscreen
 * @property {boolean} webp
 * @property {string}  decode
 * @property {boolean} autoOrients  il browser raddrizza già da solo
 */

/** @returns {Promise<Capabilities>} */
function detectCapabilities() {
  if (capabilitiesPromise) return capabilitiesPromise;
  capabilitiesPromise = (async () => {
    const offscreen = supportsOffscreen();
    const [webp, path] = await Promise.all([
      supportsWebp(offscreen),
      probeDecodePath(base64ToBlob(PROBE_ORIENT_6, "image/jpeg")),
    ]);
    caps = { offscreen, webp, decode: path.decode, autoOrients: path.autoOrients };
    return caps;
  })();
  return capabilitiesPromise;
}

// =============================================================
//  Orientamento EXIF
// =============================================================
//
// Scelta implementativa: si preferisce sempre
// createImageBitmap(file, { imageOrientation: 'from-image' }) quando la
// sonda conferma che funziona, perché il raddrizzamento lo fa il
// decodificatore nativo, senza un passaggio extra su tela e senza
// occupare memoria per un'immagine intera a piena risoluzione.
// Quando non è disponibile si legge il tag Orientation direttamente dai
// marker del JPEG e si applica la matrice corrispondente: la rotazione
// viene però fusa nella prima riduzione di scala (vedi buildGeometry),
// così non si crea mai una tela a piena risoluzione — cosa che su iOS
// supererebbe il limite di area delle tele per le foto più grandi.
// Se invece il browser raddrizza già da solo (autOrients) il tag va
// ignorato, altrimenti si ruoterebbe due volte.

/**
 * Legge il tag EXIF `Orientation` (0x0112) da un JPEG.
 * @param {Blob} blob
 * @returns {Promise<number>} 1..8, oppure 1 se assente o illeggibile
 */
async function readExifOrientation(blob) {
  let view;
  try {
    const head = blob.slice(0, Math.min(blob.size, TUNING.exifScanBytes));
    view = new DataView(await head.arrayBuffer());
  } catch {
    return 1;
  }
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1; // non è JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1; // riallineamento su byte di riempimento
      continue;
    }
    const marker = view.getUint8(offset + 1);
    // Marker senza payload
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Inizio dei dati compressi o fine immagine: l'EXIF non c'è
    if (marker === 0xda || marker === 0xd9) return 1;

    const size = view.getUint16(offset + 2);
    if (size < 2) return 1;

    if (marker === 0xe1 && offset + 10 <= view.byteLength) {
      const isExif =
        view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000;
      if (isExif) return parseTiffOrientation(view, offset + 10, size - 8);
    }
    offset += 2 + size;
  }
  return 1;
}

function parseTiffOrientation(view, start, length) {
  const end = Math.min(view.byteLength, start + Math.max(length, 0));
  if (start + 8 > end) return 1;

  const byteOrder = view.getUint16(start);
  let little;
  if (byteOrder === 0x4949) little = true;
  else if (byteOrder === 0x4d4d) little = false;
  else return 1;

  if (view.getUint16(start + 2, little) !== 0x002a) return 1;

  const ifdStart = start + view.getUint32(start + 4, little);
  if (ifdStart + 2 > end) return 1;

  const entries = view.getUint16(ifdStart, little);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint16(entry + 2, little) !== 3) continue; // tipo SHORT
    const value = view.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/**
 * Matrice 2×3 che porta le coordinate del sorgente in quelle
 * dell'immagine raddrizzata, di dimensioni (ow, oh).
 */
function orientationMatrix(orientation, ow, oh) {
  switch (orientation) {
    case 2: return [-1, 0, 0, 1, ow, 0]; // specchiata in orizzontale
    case 3: return [-1, 0, 0, -1, ow, oh]; // 180°
    case 4: return [1, 0, 0, -1, 0, oh]; // specchiata in verticale
    case 5: return [0, 1, 1, 0, 0, 0]; // trasposta
    case 6: return [0, 1, -1, 0, ow, 0]; // 90° in senso orario
    case 7: return [0, -1, -1, 0, ow, oh]; // trasversa
    case 8: return [0, -1, 1, 0, 0, oh]; // 90° in senso antiorario
    default: return [1, 0, 0, 1, 0, 0];
  }
}

const swapsAxes = (orientation) => orientation >= 5 && orientation <= 8;

// =============================================================
//  Tele e decodifica
// =============================================================

function createCanvas(width, height) {
  if (caps.offscreen) return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") {
    throw new Error("Impossibile elaborare l'immagine: manca il supporto alle tele.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * `willReadFrequently` va chiesto soltanto per l'ultima tela, quella da
 * cui si legge l'ImageData: sulle tele intermedie farebbe cadere
 * l'accelerazione hardware del ridimensionamento.
 */
function context2d(canvas, readFrequently = false) {
  const ctx = canvas.getContext("2d", { willReadFrequently: readFrequently, alpha: false });
  if (!ctx) throw new Error("Impossibile elaborare l'immagine: manca il supporto alle tele.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Decodifica il file con il percorso migliore disponibile. */
async function decodeImage(file) {
  if (caps.decode === "bitmap-from-image") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* si riprova senza opzioni */
    }
  }
  if (caps.decode !== "image" && typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* si ripiega su <img> */
    }
  }
  return decodeWithImageElement(file);
}

const sourceWidth = (img) => img.width || img.naturalWidth || 0;
const sourceHeight = (img) => img.height || img.naturalHeight || 0;

// =============================================================
//  Geometria: raddrizzamento, ritaglio, riduzione di scala
// =============================================================

/**
 * Calcola il rettangolo di ritaglio (nello spazio già raddrizzato) e la
 * dimensione finale. Non si ingrandisce mai: una foto piccola resta tale.
 */
function planGeometry(orientedW, orientedH, { square, maxSize }) {
  let cropW = orientedW;
  let cropH = orientedH;
  if (square) {
    const side = Math.min(orientedW, orientedH);
    cropW = side;
    cropH = side;
  }
  const cropX = Math.round((orientedW - cropW) / 2);
  const cropY = Math.round((orientedH - cropH) / 2);

  const scale = Math.min(1, maxSize / Math.max(cropW, cropH));
  const targetW = Math.max(1, Math.round(cropW * scale));
  const targetH = Math.max(1, Math.round(cropH * scale));

  return { cropX, cropY, cropW, cropH, targetW, targetH };
}

/**
 * Riduce a dimezzamenti successivi fino alla dimensione richiesta.
 * Un unico drawImage con un rapporto molto grande produce aliasing;
 * dimezzare più volte costa poco e resta nettamente più nitido.
 *
 * Il primo passaggio disegna direttamente dalla sorgente decodificata e
 * incorpora rotazione EXIF, ritaglio e prima riduzione in una sola
 * operazione: nessuna tela a piena risoluzione viene mai allocata.
 */
function renderGeometry(source, orientation, plan) {
  const { cropX, cropY, cropW, cropH, targetW, targetH } = plan;

  // Il primo passaggio non scende mai sotto la metà, né sotto l'obiettivo.
  let stepW = Math.max(targetW, Math.ceil(cropW / 2));
  let stepH = Math.max(targetH, Math.ceil(cropH / 2));

  let canvas = createCanvas(stepW, stepH);
  const ctx = context2d(canvas, stepW === targetW && stepH === targetH);

  // Con alpha:false la tela parte nera: un PNG con trasparenza finirebbe
  // su fondo nero. Per un catalogo il bianco è più sensato.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, stepW, stepH);

  const orientedW = swapsAxes(orientation) ? sourceHeight(source) : sourceWidth(source);
  const orientedH = swapsAxes(orientation) ? sourceWidth(source) : sourceHeight(source);
  const matrix = orientationMatrix(orientation, orientedW, orientedH);

  const sx = stepW / cropW;
  const sy = stepH / cropH;
  // composizione: scala ∘ traslazione del ritaglio ∘ rotazione EXIF
  ctx.setTransform(sx, 0, 0, sy, -cropX * sx, -cropY * sy);
  ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  while (stepW > targetW || stepH > targetH) {
    const nextW = Math.max(targetW, Math.round(stepW / 2));
    const nextH = Math.max(targetH, Math.round(stepH / 2));
    const next = createCanvas(nextW, nextH);
    const nextCtx = context2d(next, nextW === targetW && nextH === targetH);
    nextCtx.drawImage(canvas, 0, 0, stepW, stepH, 0, 0, nextW, nextH);
    canvas = next;
    stepW = nextW;
    stepH = nextH;
  }
  return canvas;
}

// =============================================================
//  Statistiche e tabelle di conversione
// =============================================================

/** Passo di campionamento: le statistiche non richiedono tutti i pixel. */
function samplingStep(pixelCount) {
  return Math.max(1, Math.round(Math.sqrt(pixelCount / 250000)));
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function percentileFromHistogram(histogram, total, fraction) {
  const goal = total * fraction;
  let running = 0;
  for (let v = 0; v < 256; v += 1) {
    running += histogram[v];
    if (running >= goal) return v;
  }
  return 255;
}

/**
 * Bilanciamento del bianco: gray-world calcolato su una fascia di
 * luminanza intermedio-alta. Si evitano le ombre (rumorose e dominate
 * dal colore ambientale) e soprattutto i riflessi speculari, che con un
 * banale max-RGB farebbero impazzire la correzione: su un gioiello il
 * pixel più chiaro è quasi sempre un riflesso bruciato, non un bianco.
 *
 * Perché l'oro non diventa grigio: la statistica si calcola su tutta la
 * scena, e in una foto di catalogo il gioiello occupa una minoranza dei
 * pixel mentre il fondo e il piano d'appoggio sono quasi sempre neutri.
 * A questo si aggiungono un esponente minore di 1, che schiaccia le
 * correzioni grandi lasciando intatte quelle piccole, e due limiti
 * assoluti sui guadagni. Su una foto già neutra i guadagni escono a
 * ridosso di 1 qualunque sia l'esponente: la correzione si fa sentire
 * solo quando c'è davvero una dominante.
 */
function computeWhiteBalance(data, step) {
  const lumaHistogram = new Uint32Array(256);
  const width4 = 4;
  let counted = 0;

  for (let i = 0; i < data.length; i += width4 * step) {
    lumaHistogram[luminance(data[i], data[i + 1], data[i + 2]) | 0] += 1;
    counted += 1;
  }
  if (counted === 0) return null;

  const low = percentileFromHistogram(lumaHistogram, counted, TUNING.wbSampleLow);
  const high = percentileFromHistogram(lumaHistogram, counted, TUNING.wbSampleHigh);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += width4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= TUNING.wbClipLevel || g >= TUNING.wbClipLevel || b >= TUNING.wbClipLevel) continue;
    const y = luminance(r, g, b);
    if (y < low || y > high) continue;
    sumR += r;
    sumG += g;
    sumB += b;
    samples += 1;
  }
  if (samples < 32) return null;

  const meanR = sumR / samples;
  const meanG = sumG / samples;
  const meanB = sumB / samples;
  if (meanR < 4 || meanG < 4 || meanB < 4) return null; // immagine troppo scura

  const grey = (meanR + meanG + meanB) / 3;
  const partial = (mean) =>
    Math.min(
      TUNING.wbMaxGain,
      Math.max(TUNING.wbMinGain, Math.pow(grey / mean, TUNING.wbStrength)),
    );

  let gainR = partial(meanR);
  let gainG = partial(meanG);
  let gainB = partial(meanB);

  // Normalizzazione sulla luminanza: la correzione sposta i colori,
  // non l'esposizione complessiva.
  const before = luminance(meanR, meanG, meanB);
  const after = luminance(gainR * meanR, gainG * meanG, gainB * meanB);
  if (before > 0 && after > 0) {
    const ratio = after / before;
    gainR /= ratio;
    gainG /= ratio;
    gainB /= ratio;
  }
  return { gainR, gainG, gainB, meanR, meanG, meanB };
}

/**
 * Auto-livelli sui percentili (0,5 % e 99,5 %): un solo pixel bruciato o
 * un pixel nero isolato non deve decidere l'intera curva, come invece
 * accade usando minimo e massimo assoluti.
 *
 * La mappatura è ancorata alla MEDIANA, non al punto di nero. Ancorarla
 * al nero, con la pendenza limitata da un tetto, produce un risultato
 * assurdo sulle foto molto buie: sottraendo per intero un punto di nero
 * alto senza poter applicare l'espansione corrispondente, l'immagine
 * esce più scura di prima. Ancorando la mediana al punto in cui la
 * finiranno gli auto-livelli "pieni" si separano le due cose: la
 * luminosità viene comunque corretta, mentre il tetto limita soltanto
 * quanto si allarga il contrasto.
 *
 * Alle due estremità la curva non taglia di netto: sopra un ginocchio e
 * sotto una punta, entrambi calcolati perché la pendenza resti continua,
 * si passa a una parabola che arriva dolcemente a 1 e a 0. Sui riflessi
 * del metallo resta così una gradazione invece di una macchia bianca
 * piatta. Se la foto è già a pieno campo, ginocchio e punta finiscono
 * fuori dall'intervallo utile e la mappatura resta lineare: nessun danno.
 *
 * La stessa curva si applica ai tre canali, così le tinte non si
 * spostano: il bilanciamento del bianco è già stato fatto prima.
 */
function computeLevels(data, step, wbLut) {
  const histogram = new Uint32Array(256);
  let counted = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = wbLut ? wbLut.r[data[i]] : data[i];
    const g = wbLut ? wbLut.g[data[i + 1]] : data[i + 1];
    const b = wbLut ? wbLut.b[data[i + 2]] : data[i + 2];
    histogram[luminance(r, g, b) | 0] += 1;
    counted += 1;
  }
  if (counted === 0) return null;

  const low = percentileFromHistogram(histogram, counted, TUNING.levelsLowPercentile);
  const high = percentileFromHistogram(histogram, counted, TUNING.levelsHighPercentile);
  const mid = percentileFromHistogram(histogram, counted, 0.5);
  if (high - low < TUNING.levelsMinSpan) return null; // istogramma degenere

  const fullScale = 255 / (high - low);
  const scale = Math.min(fullScale, TUNING.levelsMaxStretch);
  // Dove gli auto-livelli pieni collocherebbero la mediana.
  const ideale = Math.min(255, Math.max(0, (mid - low) * fullScale));
  // Allargare l'istogramma non deve però trasformarsi in una grossa
  // correzione di esposizione verso il basso: un'area chiara estesa (un
  // riflesso ampio, un fondo illuminato) alza il punto di bianco e
  // trascinerebbe giù tutto il resto dell'immagine. Schiarire resta
  // libero — è il caso delle foto scure, e il tetto è già dato dal fatto
  // che la mediana non può superare il punto di bianco.
  const pivot = Math.max(ideale, mid * TUNING.levelsMaxDarkening);

  const at = (v) => ((v - mid) * scale + pivot) / 255;
  const top = at(255);
  const bottom = at(0);
  // I due raccordi sono scelti in modo che la pendenza resti continua.
  const knee = top > 1 ? Math.min(0.999, Math.max(0.6, 2 - top)) : 1;
  const toe = bottom < 0 ? Math.max(0.001, Math.min(0.4, -bottom)) : 0;

  return { low, high, mid, scale, pivot, top, bottom, knee, toe };
}

function applyLevels(value, levels) {
  const t = ((value - levels.mid) * levels.scale + levels.pivot) / 255;
  if (t >= levels.knee && levels.top > levels.knee) {
    const over = Math.min(1, (t - levels.knee) / (levels.top - levels.knee));
    return levels.knee + (1 - levels.knee) * over * (2 - over);
  }
  if (t <= levels.toe && levels.bottom < levels.toe) {
    const under = Math.min(1, (levels.toe - t) / (levels.toe - levels.bottom));
    return levels.toe - levels.toe * under * (2 - under);
  }
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Curva a S dolce: smoothstep miscelata con l'identità. */
function applyContrast(t, amount) {
  const s = t * t * (3 - 2 * t);
  return t + (s - t) * amount;
}

/**
 * Bilanciamento del bianco, auto-livelli e contrasto sono tutte funzioni
 * scalari applicate canale per canale: si possono comporre in tre sole
 * tabelle da 256 voci e risolversi con una lettura invece che con tre
 * passaggi sui pixel. Su un telefono la differenza si sente.
 */
function buildCombinedLut(wbLut, levels, contrastAmount) {
  const lut = {
    r: new Uint8ClampedArray(256),
    g: new Uint8ClampedArray(256),
    b: new Uint8ClampedArray(256),
  };
  const channels = ["r", "g", "b"];
  for (let c = 0; c < 3; c += 1) {
    const key = channels[c];
    for (let v = 0; v < 256; v += 1) {
      let value = wbLut ? wbLut[key][v] : v;
      if (levels) {
        const mapped = applyLevels(value, levels) * 255;
        value = value + (mapped - value) * TUNING.levelsStrength;
      }
      if (contrastAmount > 0) {
        value = applyContrast(Math.min(1, Math.max(0, value / 255)), contrastAmount) * 255;
      }
      lut[key][v] = clamp255(value);
    }
  }
  return lut;
}

function buildWhiteBalanceLut(balance) {
  const lut = {
    r: new Uint8ClampedArray(256),
    g: new Uint8ClampedArray(256),
    b: new Uint8ClampedArray(256),
  };
  for (let v = 0; v < 256; v += 1) {
    lut.r[v] = clamp255(v * balance.gainR);
    lut.g[v] = clamp255(v * balance.gainG);
    lut.b[v] = clamp255(v * balance.gainB);
  }
  return lut;
}

/**
 * Unico passaggio sui pixel: tabelle composte + saturazione.
 * La saturazione cresce meno dove il colore è già vivo, così un oro
 * saturo non scivola verso l'arancione.
 */
function applyToneAndSaturation(data, lut, saturation) {
  const boostBase = saturation - 1;
  for (let i = 0; i < data.length; i += 4) {
    let r = lut.r[data[i]];
    let g = lut.g[data[i + 1]];
    let b = lut.b[data[i + 2]];

    if (boostBase !== 0) {
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      if (max > 0) {
        const current = (max - min) / max;
        const boost = 1 + boostBase * (1 - current * current);
        const y = luminance(r, g, b);
        r = y + (r - y) * boost;
        g = y + (g - y) * boost;
        b = y + (b - y) * boost;
      }
    }
    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

// =============================================================
//  Maschera di contrasto
// =============================================================

/**
 * Sfocatura a box separabile. Tre passaggi approssimano bene una
 * gaussiana e costano O(n) indipendentemente dal raggio: una
 * convoluzione vera sarebbe inutilmente lenta su un telefono.
 */
function boxBlurPass(src, dst, width, height, radius, horizontal) {
  const span = radius * 2 + 1;
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const stride = horizontal ? 1 : width;

  for (let o = 0; o < outer; o += 1) {
    const base = horizontal ? o * width : o;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const idx = k < 0 ? 0 : k >= inner ? inner - 1 : k;
      sum += src[base + idx * stride];
    }
    for (let i = 0; i < inner; i += 1) {
      dst[base + i * stride] = sum / span;
      const leaving = i - radius;
      const entering = i + radius + 1;
      const leavingIdx = leaving < 0 ? 0 : leaving >= inner ? inner - 1 : leaving;
      const enteringIdx = entering < 0 ? 0 : entering >= inner ? inner - 1 : entering;
      sum += src[base + enteringIdx * stride] - src[base + leavingIdx * stride];
    }
  }
}

/**
 * Maschera di contrasto sulla sola luminanza: agire sui tre canali
 * separatamente produrrebbe frange colorate sui bordi lucidi del
 * metallo. La soglia lascia intatte le zone piatte, dove l'unica cosa
 * da amplificare sarebbe il rumore del sensore del telefono.
 */
function applyUnsharpMask(data, width, height, amount, threshold) {
  const count = width * height;
  if (count < 16) return;

  const radius = Math.max(1, Math.round(Math.max(width, height) / TUNING.sharpenReference));
  const luma = new Float32Array(count);
  const tmp = new Float32Array(count);
  const blurred = new Float32Array(count);

  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    luma[p] = luminance(data[i], data[i + 1], data[i + 2]);
  }

  // Ogni passaggio legge interamente la sorgente prima di riscriverla:
  // dal secondo in poi sorgente e destinazione possono coincidere.
  let source = luma;
  for (let pass = 0; pass < 3; pass += 1) {
    boxBlurPass(source, tmp, width, height, radius, true);
    boxBlurPass(tmp, blurred, width, height, radius, false);
    source = blurred;
  }

  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    const delta = luma[p] - blurred[p];
    const magnitude = delta < 0 ? -delta : delta;
    if (magnitude <= threshold) continue;
    // soglia morbida: nessun gradino visibile al superamento
    const soft = delta > 0 ? delta - threshold : delta + threshold;
    let add = soft * amount;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // L'alone non deve mai arrivare a toccare il bianco o il nero puro:
    // è esattamente così che i bordi lucidi di un gioiello si trasformano
    // in macchie piatte. Si concede solo una parte dello spazio residuo.
    if (add > 0) {
      const spazio = 255 - (r > g ? (r > b ? r : b) : g > b ? g : b);
      const tetto = spazio * TUNING.sharpenHeadroom;
      if (add > tetto) add = tetto;
    } else {
      const spazio = r < g ? (r < b ? r : b) : g < b ? g : b;
      const fondo = -spazio * TUNING.sharpenHeadroom;
      if (add < fondo) add = fondo;
    }

    data[i] = clamp255(r + add);
    data[i + 1] = clamp255(g + add);
    data[i + 2] = clamp255(b + add);
  }
}

// =============================================================
//  Esportazione
// =============================================================

function canvasToBlob(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Impossibile salvare l'immagine elaborata."));
      },
      mimeType,
      quality,
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossibile leggere l'immagine elaborata."));
    reader.readAsDataURL(blob);
  });
}

async function exportCanvas(canvas, quality) {
  if (caps.webp) {
    try {
      const blob = await canvasToBlob(canvas, "image/webp", quality);
      // Doppia verifica: alcuni browser accettano il tipo e restituiscono PNG.
      if (blob && blob.type === "image/webp") {
        return { blob, mimeType: "image/webp", extension: "webp" };
      }
    } catch {
      /* codifica WebP non riuscita: si ripiega su JPEG */
    }
  }
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new Error("Impossibile salvare l'immagine elaborata.");
  return { blob, mimeType: "image/jpeg", extension: "jpg" };
}

// =============================================================
//  Funzione principale
// =============================================================

const now = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

function validateInput(file) {
  if (!file || typeof Blob === "undefined" || !(file instanceof Blob)) {
    throw new Error("Nessuna immagine da elaborare.");
  }
  if (file.size === 0) {
    throw new Error("Il file selezionato è vuoto.");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Il file selezionato non è un'immagine.");
  }
  if (file.size > TUNING.maxBytes) {
    const mb = Math.round(TUNING.maxBytes / (1024 * 1024));
    throw new Error(
      "L'immagine è troppo grande: supera " + mb + " MB. Riprova con una foto più leggera.",
    );
  }
}

function resolveOptions(options) {
  const opts = options || {};
  const maxSize = Number(opts.maxSize);
  const quality = Number(opts.quality);
  return {
    maxSize: Number.isFinite(maxSize) && maxSize > 0 ? Math.round(maxSize) : DEFAULTS.maxSize,
    quality: Number.isFinite(quality) && quality > 0 && quality <= 1 ? quality : DEFAULTS.quality,
    square: opts.square === undefined ? DEFAULTS.square : Boolean(opts.square),
    steps: {
      orientation: opts.steps?.orientation !== false,
      crop: opts.steps?.crop !== false,
      whiteBalance: opts.steps?.whiteBalance !== false,
      levels: opts.steps?.levels !== false,
      contrast: opts.steps?.contrast !== false,
      saturation: opts.steps?.saturation !== false,
      sharpen: opts.steps?.sharpen !== false,
    },
    onStage: typeof opts.onStage === "function" ? opts.onStage : null,
  };
}

/**
 * Migliora una foto scattata con il telefono.
 *
 * @param {File|Blob} file                     foto originale
 * @param {object}   [options]
 * @param {number}   [options.maxSize=1600]    lato massimo in px
 * @param {number}   [options.quality=0.85]    qualità di compressione
 * @param {boolean}  [options.square=true]     ritaglio quadrato centrato
 * @param {object}   [options.steps]           (estensione) interruttori per
 *   disattivare i singoli passaggi: orientation, crop, whiteBalance, levels,
 *   contrast, saturation, sharpen. Servono al banco di prova in dev/test-lab.html.
 * @param {(stage: string, canvas: any) => void} [options.onStage]
 *   (estensione) richiamata dopo "geometria" e dopo "finale", per confrontare
 *   prima e dopo senza decodificare il file due volte.
 * @returns {Promise<EnhancedImage>}
 */
export async function enhanceImage(file, options) {
  const started = now();
  validateInput(file);
  const opts = resolveOptions(options);
  await detectCapabilities();

  // 1. Orientamento EXIF -----------------------------------------
  let orientation = 1;
  if (opts.steps.orientation && !caps.autoOrients) {
    orientation = await readExifOrientation(file);
  }

  // Decodifica ----------------------------------------------------
  let source;
  try {
    source = await decodeImage(file);
  } catch {
    throw new Error(
      "Non è stato possibile leggere l'immagine: il file potrebbe essere danneggiato " +
        "o in un formato non supportato dal browser.",
    );
  }

  const srcW = sourceWidth(source);
  const srcH = sourceHeight(source);
  if (!srcW || !srcH) {
    source.close?.();
    throw new Error("Immagine non valida: il file sembra danneggiato.");
  }
  if (srcW * srcH > TUNING.maxPixels) {
    source.close?.();
    const mp = Math.round(TUNING.maxPixels / 1e6);
    throw new Error(
      "L'immagine è troppo grande: supera " + mp + " megapixel. Riduci la risoluzione e riprova.",
    );
  }

  // 2-3. Ritaglio e ridimensionamento ------------------------------
  const orientedW = swapsAxes(orientation) ? srcH : srcW;
  const orientedH = swapsAxes(orientation) ? srcW : srcH;
  const plan = planGeometry(orientedW, orientedH, {
    square: opts.square && opts.steps.crop,
    maxSize: opts.maxSize,
  });

  let canvas;
  try {
    canvas = renderGeometry(source, orientation, plan);
  } finally {
    source.close?.();
  }
  const width = canvas.width;
  const height = canvas.height;
  if (opts.onStage) opts.onStage("geometria", canvas);

  const ctx = context2d(canvas, true);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    throw new Error("Non è stato possibile elaborare i pixel dell'immagine.");
  }
  const data = imageData.data;
  const step = samplingStep(width * height);

  // 4. Bilanciamento del bianco -----------------------------------
  const balance = opts.steps.whiteBalance ? computeWhiteBalance(data, step) : null;
  const wbLut = balance ? buildWhiteBalanceLut(balance) : null;

  // 5. Auto-livelli sui percentili --------------------------------
  const levels = opts.steps.levels ? computeLevels(data, step, wbLut) : null;

  // 6. Contrasto e saturazione ------------------------------------
  const contrastAmount = opts.steps.contrast ? TUNING.contrastAmount : 0;
  const saturation = opts.steps.saturation ? TUNING.saturationAmount : 1;
  if (wbLut || levels || contrastAmount > 0 || saturation !== 1) {
    applyToneAndSaturation(data, buildCombinedLut(wbLut, levels, contrastAmount), saturation);
  }

  // 7. Maschera di contrasto --------------------------------------
  if (opts.steps.sharpen) {
    applyUnsharpMask(data, width, height, TUNING.sharpenAmount, TUNING.sharpenThreshold);
  }

  ctx.putImageData(imageData, 0, 0);
  if (opts.onStage) opts.onStage("finale", canvas);

  // 8. Esportazione ------------------------------------------------
  const exported = await exportCanvas(canvas, opts.quality);
  const dataUrl = await blobToDataUrl(exported.blob);

  return {
    blob: exported.blob,
    dataUrl,
    mimeType: exported.mimeType,
    extension: exported.extension,
    width,
    height,
    originalBytes: file.size,
    bytes: exported.blob.size,
    // Extra rispetto al contratto: diagnostica per il banco di prova.
    // I consumatori possono ignorarlo senza conseguenze.
    report: {
      elapsedMs: Math.round(now() - started),
      orientation,
      decodePath: caps.decode,
      autoOrients: caps.autoOrients,
      offscreen: caps.offscreen,
      sourceWidth: srcW,
      sourceHeight: srcH,
      cropWidth: plan.cropW,
      cropHeight: plan.cropH,
      whiteBalance: balance
        ? {
            gainR: Number(balance.gainR.toFixed(4)),
            gainG: Number(balance.gainG.toFixed(4)),
            gainB: Number(balance.gainB.toFixed(4)),
          }
        : null,
      levels: levels
        ? {
            low: levels.low,
            high: levels.high,
            mid: levels.mid,
            scale: Number(levels.scale.toFixed(4)),
            knee: Number(levels.knee.toFixed(4)),
            toe: Number(levels.toe.toFixed(4)),
          }
        : null,
    },
  };
}

export default { enhanceImage };
