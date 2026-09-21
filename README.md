# Vetrina Gioielli

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
