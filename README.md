# Euroansa — Pratiche Mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → storage sul sito (cartelle stile Filippo) → pre-scoring → invio segreteria con **link ZIP** → dashboard CRM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail API (OAuth2 hub ufficio — lettura mail + invio)
- Vercel Blob (documenti privati + pacchetto download per segreteria)
- Deploy: Vercel Hobby + polling email via [cron-job.org](https://cron-job.org)

## Flusso documenti (Filippo)

Per ogni pratica sul sito si crea una cartella virtuale:

```
{Cliente}/
  {COGNOME} DOC/   ← CI, buste, CUD, …
  BANCA/
  IMMOBILE/
  EUROANSA/
  {Cliente}_relazione.pdf   ← obbligatoria prima dell'invio
```

Nomi file stile campione: `ALI_ci.pdf`, `ALI_bp 05.pdf`.

Alla segreteria arriva una mail Gmail **senza allegati pesanti**: solo un bottone **Scarica pacchetto ZIP** (link token sul sito). Niente WeTransfer / Drive.

## Multiuser

1. Un solo **ADMIN** = org Euroansa (collega Gmail ufficio in Impostazioni).
2. I **BROKER** gestiscono pratiche assegnate (checklist, relazione, invio).
3. ADMIN vede tutto e assegna i broker.

In Google Cloud Console registra il redirect:

`https://TUO-PROGETTO.vercel.app/api/google/callback`

## Produzione su Vercel

### 1. Neon
Crea un database su [console.neon.tech](https://console.neon.tech) e copia la connection string.

### 2. Vercel Blob
In Vercel → Storage → crea un **Blob Store** e copia `BLOB_READ_WRITE_TOKEN`.

### 3. Vercel env
Importa il repo e in **Settings → Environment Variables** (Production):

| Variabile | Dove prenderla |
|---|---|
| `DATABASE_URL` | Neon |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth |
| `GOOGLE_REDIRECT_URI` | `https://….vercel.app/api/google/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://….vercel.app` |
| `GMAIL_SUBJECT_TAG` | Tag oggetto mail clienti (default `[EUROANSA-MUTUO]`) |
| `CRON_SECRET` | Stringa random lunga |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

### 4. Setup DB
```bash
curl -X POST "https://TUO-PROGETTO.vercel.app/api/setup" -H "Authorization: Bearer TUO_CRON_SECRET"
```

Poi login → **Impostazioni → Collega Google** (solo Gmail; se avevi autorizzato Drive, ricollega per aggiornare gli scope).

### 5. Cron email (cron-job.org)
- **URL:** `https://TUO-PROGETTO.vercel.app/api/cron/check-emails`
- **Schedule:** ogni 5 minuti
- **GET** + header `Authorization: Bearer TUO_CRON_SECRET`

### Oggetto email clienti
**`[EUROANSA-MUTUO]`** nell'oggetto (o `GMAIL_SUBJECT_TAG`).

## Google OAuth scopes
- `gmail.modify` / `gmail.send`
- `userinfo.email`

(Drive non serve più: i file stanno su Vercel Blob.)
