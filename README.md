# Euroansa — Pratiche Mutuo

Web app full-stack per mediatori creditizi: email clienti → OCR/AI → Google Drive ordinato → pre-scoring → invio segreteria → dashboard CRM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Google Gemini Flash (OCR / structured JSON)
- Gmail + Drive API (OAuth2)
- Deploy: Vercel (cron ogni 5 minuti)

## Setup locale

1. Copia `.env.example` in `.env.local` e compila le variabili.
2. Crea un progetto Neon e incolla `DATABASE_URL`.
3. Applica lo schema:

```bash
npm install
npm run db:push
npm run db:seed
```

4. Avvia:

```bash
npm run dev
```

Login con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Google OAuth (Gmail + Drive)

1. Google Cloud Console → crea OAuth Client (Web).
2. Abilita Gmail API e Google Drive API.
3. Genera un refresh token offline con scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/drive.file`
4. Inserisci `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

## Gemini

Chiave da [Google AI Studio](https://aistudio.google.com/) → `GEMINI_API_KEY`.

## Deploy su Vercel (produzione)

1. Vai su [vercel.com/new](https://vercel.com/new) e importa `leonardoriccardomarta/euroansa`.
2. Framework: Next.js (rilevato in automatico).
3. In **Environment Variables** (Production) aggiungi tutte le chiavi di `.env.example`:
   - `DATABASE_URL` (Neon)
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
   - `CRON_SECRET` (stringa lunga random)
   - `AUTH_SECRET` (stringa lunga random, min 32 caratteri)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `SECRETARY_EMAIL_DEFAULT`
4. Deploy.
5. Dopo il primo deploy, dallo stesso ambiente (o in locale con `DATABASE_URL` di prod):

```bash
npm run db:push
npm run db:seed
```

6. Verifica il cron: in Vercel → Project → Settings → Cron Jobs deve risultare `/api/cron/check-emails` ogni 5 minuti.
7. Login su `https://<tuo-progetto>.vercel.app/login` con le credenziali admin.

> Nota: i Cron Jobs di Vercel richiedono piano Hobby+ (disponibili anche sul free con limiti). L’header `Authorization: Bearer CRON_SECRET` è inviato automaticamente da Vercel ai cron.

## Config documenti (da raffinare con Filippo)

Checklist, prefissi file e template cartella Drive sono in:

`src/lib/config/documents.ts`

In v1 la cartella Drive è flat (una cartella per pratica, senza sottocartelle).

## Flusso

1. Il cliente invia email con allegati (soggetto con `mutuo` / `documenti` / `[MUTUO]`).
2. Il cron elabora gli allegati con Gemini, carica su Drive, aggiorna checklist e pre-scoring.
3. Se la checklist è completa e `auto_send` è ON → email alla segreteria.
4. In dashboard puoi sollecitare il cliente, forzare l’invio e aggiornare gli stati banca.
