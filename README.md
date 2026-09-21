# Vetrina Gioielli — progetto dimostrativo

> ### ⚠️ Questo è un esperimento, non un negozio reale
>
> Questo repository nasce come **prova pratica di sviluppo assistito
> dall'intelligenza artificiale**: serve a capire fin dove arriva un agente AI
> nel costruire un progetto completo, dall'idea alla pubblicazione.
>
> La "gioielleria" è solo un pretesto realistico per avere un banco di prova
> credibile. **Non esiste alcun negozio**, i gioielli e i prezzi che vedi non
> sono in vendita, e i contatti sono segnaposto.
>
> Il codice è pubblico perché GitHub Pages, sul piano gratuito, pubblica i siti
> solo da repository pubblici.

Sito vetrina statico ospitato su **GitHub Pages**, con una dashboard mobile per
caricare i prodotti direttamente dal telefono.

## Com'è fatto

| Parte | Dove | A cosa serve |
|---|---|---|
| Vetrina | `index.html` | Il sito pubblico, il catalogo dei gioielli |
| Dashboard | `admin/` | Aggiungere un articolo dal telefono: foto, prezzo, descrizione |
| Dati | `data/products.json` | L'elenco dei prodotti |
| Foto | `images/products/` | Le immagini, già ottimizzate |
| Impostazioni | `config.js` | Nome del negozio, WhatsApp, categorie |

Niente server, niente database, nessun costo: il sito è fatto di file, e i file
stanno su GitHub.

## Cosa è stato sperimentato

Il progetto è stato costruito da più agenti AI che hanno lavorato in parallelo
su parti separate, coordinati da contratti scritti prima del codice
(`docs/CONTRACTS.md`). Gli aspetti interessanti dell'esperimento:

- **Miglioramento automatico delle foto** interamente nel browser, senza
  librerie: orientamento EXIF, bilanciamento del bianco, auto-livelli e
  maschera di contrasto scritti a mano (`js/lib/image-enhance.js`).
- **Descrizione del prodotto generata dalla fotografia**, chiamando un modello
  multimodale direttamente dal browser (`js/lib/ai-describe.js`).
- **Scrittura sul repository dal browser** con un commit atomico via Git Data
  API, per non lasciare mai il catalogo a metà (`js/lib/github-store.js`).

## Come si aggiunge un gioiello

1. Apri la dashboard dal telefono.
2. Scatta o scegli la foto: viene raddrizzata, ritagliata e migliorata in automatico.
3. L'assistente propone nome e descrizione; tu correggi quello che non ti convince.
4. Premi *Pubblica*. Dopo circa un minuto il gioiello è online.

## Prima configurazione

Apri `config.js` e compila nome del negozio, numero WhatsApp e contatti.

## Sviluppo in locale

Il sito usa i moduli ES, quindi va servito via HTTP (aprire il file con doppio
clic non basta):

```bash
python3 -m http.server 8000
```

Poi vai su <http://localhost:8000>.
