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
Bucket Settings → CORS Policy. Su R2 il wildcard `*` negli header **spesso non funziona**:
metti `Content-Type` esplicito e l’origine **senza** slash finale.

```json
[
  {
    "AllowedOrigins": [
      "https://www.prontopratica.app",
      "https://prontopratica.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag", "Content-Type"],
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

`https://www.prontopratica.app/api/google/callback`

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
| `GOOGLE_REDIRECT_URI` | `https://www.prontopratica.app/api/google/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://www.prontopratica.app` |
| `GMAIL_SUBJECT_TAG` | Tag oggetto mail clienti (obbligatorio, solo da env) |
| `NEXT_PUBLIC_APP_NAME` | Nome UI (default `Prontopratica`) |
| `CRON_SECRET` | Stringa random lunga |
| `AUTH_SECRET` | Stringa random ≥32 caratteri |
| `ADMIN_EMAIL` | Email login admin |
| `ADMIN_PASSWORD` | Password login admin |
| `SECRETARY_EMAIL_DEFAULT` | Email segreteria iniziale |

Rimuovi `BLOB_READ_WRITE_TOKEN` se era ancora in env (non serve più).

### 4. Setup DB
```bash
curl -X POST "https://www.prontopratica.app/api/setup" -H "Authorization: Bearer TUO_CRON_SECRET"
```

(Al primo accesso dashboard lo schema si aggiorna anche da solo.)

Poi login → **Impostazioni → Collega Google** (solo Gmail).

### 5. Cron email (cron-job.org)
Con il dominio custom aggiorna (o crea) il job: il vecchio `*.vercel.app` non basta più.

- **URL:** `https://www.prontopratica.app/api/cron/check-emails`
- **Schedule:** ogni **1 minuto**
- **Timeout cron-job.org:** 30s va bene: l’API risponde subito `200` e il lavoro continua in background su Vercel (fino a 60s)
- **GET** + header `Authorization: Bearer` + valore di `CRON_SECRET` su Vercel
- Flusso: coda OCR → intake mail→R2 → altri OCR; al minuto dopo smaltisce il resto
- Dopo il cambio dominio: **Save** + **Run now** → deve dare **200**

### Oggetto email clienti
il valore di **`GMAIL_SUBJECT_TAG`** nell'oggetto.

## Google OAuth scopes
- `gmail.modify` / `gmail.send`
- `userinfo.email`
- `drive.readonly` (allegati grandi inviati come link Drive nella mail)

I file delle pratiche restano su Cloudflare R2; Drive serve solo a scaricare i link dalle email.
