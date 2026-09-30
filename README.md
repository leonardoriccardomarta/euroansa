# Euroansa — Pratiche Mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → Google Drive ordinato → pre-scoring → invio segreteria → dashboard CRM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail + Drive API (OAuth2)
- Deploy: Vercel Hobby + polling email via [cron-job.org](https://cron-job.org) (gratis)

## Produzione su Vercel (senza locale)

### 1. Neon
Crea un database su [console.neon.tech](https://console.neon.tech) e copia la connection string.

### 2. Vercel
1. Importa il repo [leonardoriccardomarta/euroansa](https://github.com/leonardoriccardomarta/euroansa).
2. In **Settings → Environment Variables** (Production) metti:

| Variabile | Dove prenderla |
|---|---|
| `DATABASE_URL` | Neon |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth |
| `GOOGLE_REFRESH_TOKEN` | OAuth offline (Gmail+Drive) |
| `CRON_SECRET` | Stringa random lunga |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

3. Deploy (Hobby ok: il cron Vercel interno è 1×/giorno; il polling frequente è esterno).

### 3. Inizializza DB (una sola volta)
Dopo il deploy:

```bash
curl -X POST "https://TUO-PROGETTO.vercel.app/api/setup" -H "Authorization: Bearer TUO_CRON_SECRET"
```

Poi login su `/login` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### 4. Polling email ogni 5 minuti — cron-job.org (gratis)

Hobby Vercel non permette cron più frequenti di 1×/giorno. Per controllare le mail spesso:

1. Registrati su [cron-job.org](https://cron-job.org)
2. Crea un job:
   - **URL:** `https://TUO-PROGETTO.vercel.app/api/cron/check-emails`
   - **Schedule:** ogni 5 minuti
   - **Request method:** `GET`
   - **Header:** `Authorization` = `Bearer TUO_CRON_SECRET`
3. Salva e fai un **Test run**

Se con tanti documenti il job va in timeout (~30s su cron-job.org), si abbassa il carico per chiamata (meno email/allegati per run).

Backup: su Vercel resta anche un cron giornaliero alle 06:00 UTC (`0 6 * * *`).

## Google OAuth (Gmail + Drive)

1. Google Cloud Console → OAuth Client (Web).
2. Abilita Gmail API e Google Drive API.
3. Refresh token offline con scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/drive.file`

## Config documenti (da raffinare con Filippo)

`src/lib/config/documents.ts` — checklist, nomi file, cartella Drive.

## Flusso

1. Il cliente invia email con allegati (soggetto con `mutuo` / `documenti` / `[MUTUO]`).
2. cron-job.org chiama l’API → Gemini → Drive → checklist → pre-scoring.
3. Se checklist completa e auto-invio ON → email alla segreteria.
4. In dashboard: sollecito cliente, invio forzato, stati banca.
