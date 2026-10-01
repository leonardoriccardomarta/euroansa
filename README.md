# Euroansa — Pratiche Mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → Google Drive ordinato → pre-scoring → invio segreteria → dashboard CRM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail + Drive API (OAuth2 **per utente**)
- Deploy: Vercel Hobby + polling email via [cron-job.org](https://cron-job.org) (gratis)

## Multiuser (Filippo admin + broker)

1. Crea utenti in **Utenti** (Filippo = ADMIN, socio = BROKER).
2. Ogni persona entra in **Impostazioni → Collega Google** e autorizza **la propria** Gmail + Drive.
3. Il cron legge **tutte** le caselle collegate:
   - mail su casella Filippo → pratica di Filippo → Drive di Filippo
   - mail su casella socio → pratica del socio → Drive del socio
4. ADMIN vede tutte le pratiche; BROKER solo le proprie.

In Google Cloud Console registra il redirect:

`https://TUO-PROGETTO.vercel.app/api/google/callback`

(e metti la stessa URL in `GOOGLE_REDIRECT_URI` + `NEXT_PUBLIC_APP_URL` su Vercel).

## Produzione su Vercel

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
| `GOOGLE_REDIRECT_URI` | `https://….vercel.app/api/google/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://….vercel.app` |
| `GMAIL_SUBJECT_TAG` | Tag oggetto mail clienti (default `[EUROANSA-MUTUO]`) |
| `CRON_SECRET` | Stringa random lunga |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

`GOOGLE_REFRESH_TOKEN` globale non serve più (resta solo fallback legacy). Ogni utente collega Google dalla dashboard.

3. Deploy.

### 3. Inizializza DB (una sola volta / dopo update schema)
```bash
curl -X POST "https://TUO-PROGETTO.vercel.app/api/setup" -H "Authorization: Bearer TUO_CRON_SECRET"
```

Poi login su `/login` → **Impostazioni → Collega Google**.

### 4. Polling email ogni 5 minuti — cron-job.org

1. [cron-job.org](https://cron-job.org)
2. Job:
   - **URL:** `https://TUO-PROGETTO.vercel.app/api/cron/check-emails`
   - **Schedule:** ogni 5 minuti
   - **GET** + header `Authorization: Bearer TUO_CRON_SECRET`

### Oggetto email clienti

**`[EUROANSA-MUTUO]`** nell'oggetto (o il valore di `GMAIL_SUBJECT_TAG`).

I clienti devono scrivere **alla Gmail del broker** di riferimento.

## Google OAuth scopes

- `gmail.modify` / `gmail.send`
- `drive.file`
- `userinfo.email`
