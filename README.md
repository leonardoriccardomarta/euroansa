# Euroansa — Pratiche Mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → Google Drive ordinato → pre-scoring → invio segreteria → dashboard CRM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail + Drive API (OAuth2)
- Deploy: Vercel (cron ogni 5 minuti)

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
| `CRON_SECRET` | Stringa random lunga (la inventi tu) |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

3. Deploy.

### 3. Inizializza DB (una sola volta)
Dopo il deploy, chiama (sostituisci URL e secret):

```bash
curl -X POST "https://TUO-PROGETTO.vercel.app/api/setup" ^
  -H "Authorization: Bearer TUO_CRON_SECRET"
```

Crea tabelle, utente admin e settings. Poi login su `/login`.

### 4. Cron
In Vercel → Project → Cron Jobs: `/api/cron/check-emails` ogni 5 minuti (già in `vercel.json`).

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
2. Il cron elabora con Gemini, carica su Drive, aggiorna checklist e pre-scoring.
3. Se checklist completa e auto-invio ON → email alla segreteria.
4. In dashboard: sollecito cliente, invio forzato, stati banca.
