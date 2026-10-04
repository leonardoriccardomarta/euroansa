# Prontopratica — Gestione pratiche mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → storage Cloudflare R2 → pre-scoring → invio segreteria con **link ZIP** → dashboard CRM.

Nome UI configurabile con `NEXT_PUBLIC_APP_NAME` (default **Prontopratica**).

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail API (OAuth2 hub ufficio — lettura mail + invio)
- Cloudflare R2 (documenti privati, free tier ~10 GB)
- Deploy: Vercel Hobby + polling email via [cron-job.org](https://cron-job.org)

## Flusso documenti (Filippo)

Per ogni pratica sul sito si crea una cartella virtuale:

```
{Cliente}/
  {COGNOME} DOC/   ← CI, buste, CUD, …
  BANCA/
  IMMOBILE/
  UFFICIO/
  {Cliente}_relazione.pdf   ← obbligatoria prima dell'invio
```

Nomi file stile campione: `ALI_ci.pdf`, `ALI_bp 05.pdf`.

Upload documenti: **diretto browser → R2** (presigned), poi analisi Gemini sul server.

Alla segreteria arriva una mail Gmail **senza allegati pesanti**: solo link **Scarica pacchetto ZIP** (validità 7 giorni).

### CORS R2 (obbligatorio per upload diretto)
Bucket Settings → CORS Policy, esempio:

```json
[
  {
    "AllowedOrigins": ["https://TUO-PROGETTO.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Multiuser

1. Un solo **ADMIN** (collega Gmail ufficio in Impostazioni).
2. I **BROKER** gestiscono pratiche assegnate (checklist, relazione, invio).
3. ADMIN vede tutto e assegna i broker.
4. Mail automatiche al broker: pratica assegnata; fallimento invio segreteria.

In Google Cloud Console registra il redirect:

`https://TUO-PROGETTO.vercel.app/api/google/callback`

## Produzione su Vercel

### 1. Neon
Crea un database su [console.neon.tech](https://console.neon.tech) e copia la connection string.

### 2. Cloudflare R2
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → crea un bucket (es. `euroansa`).
2. **Manage R2 API Tokens** → Create API token (Object Read & Write sul bucket).
3. Copia Account ID, Access Key ID, Secret Access Key.

Free tier tipico: **10 GB** storage + operazioni incluse; egress gratis. Non serve Vercel Pro solo per i file.

### 3. Vercel env
Importa il repo e in **Settings → Environment Variables** (Production):

| Variabile | Dove prenderla |
|---|---|
| `DATABASE_URL` | Neon |
| `R2_ACCOUNT_ID` | Cloudflare → R2 overview |
| `R2_ACCESS_KEY_ID` | Token R2 |
| `R2_SECRET_ACCESS_KEY` | Token R2 |
| `R2_BUCKET_NAME` | Nome bucket (es. `euroansa`) |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth |
| `GOOGLE_REDIRECT_URI` | `https://….vercel.app/api/google/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://….vercel.app` |
| `GMAIL_SUBJECT_TAG` | Tag oggetto mail clienti (default `[EUROANSA-MUTUO]`) |
| `NEXT_PUBLIC_APP_NAME` | Nome UI (default `Prontopratica`) |
| `CRON_SECRET` | Stringa random lunga |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

Rimuovi `BLOB_READ_WRITE_TOKEN` se era ancora in env (non serve più).

### 4. Setup DB
```bash
curl -X POST "https://TUO-PROGETTO.vercel.app/api/setup" -H "Authorization: Bearer TUO_CRON_SECRET"
```

(Al primo accesso dashboard lo schema si aggiorna anche da solo.)

Poi login → **Impostazioni → Collega Google** (solo Gmail).

### 5. Cron email (cron-job.org)
- **URL:** `https://TUO-PROGETTO.vercel.app/api/cron/check-emails`
- **Schedule:** ogni 5 minuti
- **GET** + header `Authorization: Bearer TUO_CRON_SECRET`

### Oggetto email clienti
**`[PRATICA-MUTUO]`** nell'oggetto (o il valore di `GMAIL_SUBJECT_TAG`).

## Google OAuth scopes
- `gmail.modify` / `gmail.send`
- `userinfo.email`

(Drive non serve: i file stanno su Cloudflare R2.)
