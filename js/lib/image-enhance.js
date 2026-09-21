/**
 * SEGNAPOSTO — sostituito dal lavoro sulla pipeline foto.
 * Vedi docs/CONTRACTS.md sezione 2 per la firma definitiva.
 * Per ora restituisce l'immagine originale senza modifiche, così le altre
 * parti del sito possono importare il modulo e funzionare.
 */
export async function enhanceImage(file, options = {}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Impossibile leggere il file."));
    reader.readAsDataURL(file);
  });

  return {
    blob: file,
    dataUrl,
    mimeType: file.type || "image/jpeg",
    extension: (file.type || "").includes("png") ? "png" : "jpg",
    width: 0,
    height: 0,
    originalBytes: file.size,
    bytes: file.size,
  };
}
