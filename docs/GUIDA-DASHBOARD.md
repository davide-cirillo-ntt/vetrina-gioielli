# Guida alla dashboard

> **Nota.** Questo è un progetto dimostrativo, realizzato per sperimentare lo
> sviluppo assistito dall'intelligenza artificiale. Non esiste un negozio
> reale e i gioielli pubblicati non sono in vendita. La guida è scritta come
> se il negozio esistesse, perché anche questo fa parte della prova.

Questa è la guida per chi gestisce il negozio. Non serve saper programmare:
si scatta una foto, si controllano due righe di testo e si pubblica.

La dashboard si apre a questo indirizzo:

**https://davide-cirillo-ntt.github.io/vetrina-gioielli/admin/**

---

## 1. La prima volta: il codice di accesso

La dashboard scrive direttamente sul sito, quindi la prima volta chiede un
**codice di accesso**. Si crea una volta sola e resta salvato sul telefono.

1. Apri la dashboard. Nella schermata di accesso premi
   *«Come si crea il codice — un minuto»*: il collegamento ti porta già alla
   pagina giusta di GitHub.
2. Dai un nome qualsiasi al codice, per esempio *Dashboard gioielleria*.
3. Alla voce **Repository access** scegli **Only select repositories** e
   seleziona soltanto il repository del sito.
4. Alla voce **Permissions**, sotto *Repository permissions*, metti
   **Contents** su **Read and write**. Non serve nient'altro.
5. Premi **Generate token**, copia il codice e incollalo nella dashboard.

> **Il codice è come una password.** Non mandarlo a nessuno, per nessun
> motivo, e non usarlo su un telefono o un computer che non è tuo. Se pensi
> che qualcuno l'abbia visto, premi **Esci** nella dashboard e creane uno
> nuovo: quello vecchio si può cancellare da GitHub.

Se il codice è giusto, la dashboard ti saluta col tuo nome utente. Se ti dice
che *può solo leggere*, vuol dire che al passo 4 è rimasto su *Read-only*:
creane un altro mettendo **Read and write**.

---

## 2. Mettere la dashboard nella schermata Home

Così la apri con un tocco, come un'app, senza cercarla nel browser.

**iPhone (Safari)** — apri la dashboard, premi il tasto Condividi (il quadrato
con la freccia in su), scorri e scegli **Aggiungi alla schermata Home**.

**Android (Chrome)** — apri la dashboard, premi i tre puntini in alto a destra
e scegli **Installa app** oppure **Aggiungi a schermata Home**.

Comparirà un'icona con un anello dorato.

---

## 3. Aggiungere un gioiello

Sono quattro passaggi, e si fanno con una mano sola.

### 1 — La foto

Premi **Scatta la foto**: si apre la fotocamera. Oppure **Scegli dalla
galleria**, se la foto l'hai già fatta.

Qualche consiglio che fa la differenza più di qualsiasi programma:

- appoggia il gioiello su un fondo semplice e chiaro, senza fantasie;
- mettiti vicino a una finestra, di giorno, evitando il sole diretto;
- non usare il flash: sul metallo lascia una macchia bianca;
- inquadra il pezzo al centro, riempiendo bene lo schermo.

Appena scegli la foto, la dashboard la raddrizza, la ritaglia in quadrato, la
schiarisce e la alleggerisce. Ti mostra quanto peso ha risparmiato, e con
**Vedi com'era** puoi confrontarla con quella di partenza.

Se non ti piace il risultato, **Cambia foto** e rifai lo scatto.

### 2 — La descrizione

Se hai attivato la descrizione automatica (vedi il punto 5 qui sotto), la
dashboard guarda la foto e propone nome, descrizione, materiali e parole
chiave. Puoi anche scrivere due indizi prima, per esempio
*«argento con pietra di luna»*: la proposta viene più precisa.

Se non l'hai attivata, non è un problema: si scrive tutto a mano nel passo
successivo. La dashboard funziona lo stesso.

### 3 — Controlla e correggi

**Quello che leggi è solo una proposta.** Cambia pure ogni parola: il testo
che va sul sito è quello che decidi tu.

Qui aggiungi anche:

- **Prezzo** — se preferisci non mostrarlo, spunta *«scrivo su richiesta»*.
- **Disponibile** — se togli la spunta, in vetrina il pezzo risulta venduto.
- **In evidenza** — per i pezzi a cui tieni di più.

Il nome e la descrizione sono obbligatori: senza, la dashboard non ti lascia
pubblicare e ti dice quale campo manca.

### 4 — Pubblica

Premi **Pubblica il gioiello** e aspetta senza chiudere la pagina. Vedrai
scorrere i passaggi: *carico la foto*, *aggiorno il catalogo*, *pubblico*.

Alla fine compare la conferma. **Il sito ci mette circa un minuto ad
aggiornarsi**: se apri subito la vetrina e non lo vedi, aspetta un attimo e
ricarica la pagina. È normale.

---

## 4. Togliere un gioiello

Vai nella scheda **Catalogo**, trova il pezzo e premi il cestino accanto al
nome. La dashboard ti chiede conferma nominando il gioiello, così non si
sbaglia.

L'eliminazione **non si può annullare**: sparisce dal sito insieme alla sua
foto. Se un pezzo è solo venduto ma vuoi lasciarlo in mostra, non eliminarlo:
togli invece la spunta *Disponibile*.

---

## 5. La descrizione automatica (facoltativa)

Serve solo a proporre nome e descrizione guardando la foto. **Senza, la
dashboard funziona benissimo**: scrivi tu i testi.

Per attivarla serve una chiave di Google Gemini, che è **gratuita e non
richiede la carta di credito**:

1. Vai su <https://aistudio.google.com/apikey> ed entra col tuo account Google.
2. Premi **Create API key** e copia la chiave.
3. Nella dashboard apri **Impostazioni**, incolla la chiave e premi **Salva**.
   In alternativa, la trovi già proposta nel passo 2 mentre aggiungi un pezzo.

Anche questa chiave è come una password: vale lo stesso avvertimento del
codice di accesso.

C'è un limite giornaliero gratuito di descrizioni. Se lo superi, la dashboard
te lo dice e tu scrivi il testo a mano: non si blocca nulla.

---

## 6. Se qualcosa non va

| Cosa vedi | Cosa vuol dire |
|---|---|
| *«Il codice di accesso non è valido o è scaduto»* | Il codice è stato cancellato o è scaduto. Premi **Esci** e creane uno nuovo. |
| *«Il codice non ha il permesso di scrivere sul sito»* | Quando l'hai creato, *Contents* era su *Read-only*. Creane un altro con **Read and write**. |
| *«Non trovo l'archivio del sito»* | Il codice non è abilitato su questo repository. Ricrealo selezionando il repository giusto. |
| *«Sei senza connessione»* | Manca la rete. Quello che hai scritto resta lì: appena torna la linea, premi di nuovo **Pubblica**. |
| *«Il catalogo è stato modificato proprio adesso»* | Qualcun altro stava pubblicando nello stesso momento. Aspetta qualche secondo e premi di nuovo **Pubblica**. Non hai perso niente. |
| *«La chiave Gemini non è valida»* | La chiave della descrizione automatica è sbagliata. Controllala in **Impostazioni**, oppure scrivi il testo a mano. |
| *«Non sono riuscito a migliorare la foto»* | La foto verrà pubblicata così com'è. Va benissimo lo stesso. |

**Se chiudi la pagina per sbaglio** mentre stai scrivendo, non perdi il
lavoro: riaprendo la dashboard ritrovi quello che avevi scritto, foto
compresa.

**Se presti il telefono a qualcuno**, premi prima **Esci**: cancella sia il
codice di accesso sia la chiave della descrizione automatica.

---

## 7. Nota per chi mantiene il sito

Il nome che compare sotto l'icona nella schermata Home è scritto in
`admin/manifest.webmanifest`. Se cambi il nome del negozio in `config.js`,
conviene aggiornare anche quel file, perché il manifesto è statico e non può
leggere la configurazione.
