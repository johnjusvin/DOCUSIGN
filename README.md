# REDITUS SIGN — THE RETURN OF WHAT'S POSSIBLE

Lightweight, self-hosted electronic-signature platform (DocuSign-style core workflow).
Runs locally at `http://localhost:4000`. Google Drive is the only external storage layer.

## Stack

- **Backend:** Node.js + Express (`src/server.js`), SQLite metadata (`node:sqlite`, file at `data/reditus-local/reditus.db`)
- **Frontend:** React + Vite + pdf.js (`web/`, built to `web/dist/`, served by Express)
- **PDF:** `pdf-lib` (parse geometry, stamp flattened signatures), `pdfjs-dist` (in-browser rendering)
- **Storage:** `googleapis` Drive v3 with local-disk fallback — both behind one interface (`src/storage/`)

## Quick start

```bash
cp .env.example .env        # then edit ADMIN_PASSWORD at minimum
npm install
npm run build               # build the React frontend into web/dist
npm start                   # → http://localhost:4000
```

Development (backend auto-reload + frontend HMR):

```bash
npm run dev                 # node --watch src/server.js (port 4000)
# in another terminal, for frontend iteration:
npx vite --config vite.config.js
```

Login with `ADMIN_USER` / `ADMIN_PASSWORD` from `.env` (defaults: `admin` / empty — set a password).

## Environment (.env)

| Var | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `4000` / `127.0.0.1` | listen address |
| `REDITUS_APP_URL` | `http://localhost:PORT` | base URL baked into signer links |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / (empty) | dashboard login |
| `REDITUS_DATA_DIR` | `./data` | SQLite DB + local file store live here |
| `STORAGE` | auto | `drive` \| `local`; defaults to Drive when authorized, else local |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | — | Drive OAuth (redirect must be `<app>/api/storage/drive/oauth/callback`) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | — | optional existing Drive folder; else `REDITUS SIGN/` is created |
| `SIGNING_LINK_EXPIRY_HOURS` | `0` (never) | default lifetime for new signing links |
| `MAX_UPLOAD_BYTES` | 30 MB | PDF upload cap |
| `MAX_SIGIMAGE_BYTES` | 5 MB | signature-image cap |

## Google Drive setup

1. Google Cloud Console → Credentials → **OAuth 2.0 Client ID (Web application)**.
2. Add authorized redirect URI: `http://localhost:4000/api/storage/drive/oauth/callback`
   (use your `REDITUS_APP_URL` host/port if different).
3. Put the client ID/secret/redirect into `.env`, restart the app.
4. Open **Settings → Storage → Connect with Google**, approve the consent screen.
5. The folder tree (`Originals/ Signed/ Certificates/ Templates/`) is created automatically.
6. Uploads/signed PDFs/certificates then live in Drive; refs (`o/<id>`, `s/<id>` …) stay in SQLite.

## Signing flow

1. **Send for Signature** wizard: upload/select PDF → place fields on the real rendered pages →
   add signers (sequential or parallel) → review → send. Signer links are shown once.
2. Signer opens `/sign/<token>` (no account needed), fills fields, creates a signature
   (draw / type / upload), consents, submits.
3. Each submission stamps a new signed PDF. When the **last** signer finishes, a
   **completion certificate** (signers, timestamps, audit trail, SHA-256 hashes) is generated.
4. Downloads live on the document: original, signed PDF, certificate.

## Tests

```bash
npm test        # 14 offline unit tests (crypto, storage refs, PDF helpers)
npm run test:e2e  # 37-check live flow — requires the server running:
                   # upload → sequential order enforced → sign → complete →
                   # certificate → parallel reverse order → decline → delete rules
```

Two simultaneous signing sessions were verified concurrently (both `200 OK`, exactly one
certificate generated, request ends `Completed`).

## Project layout

```
src/server.js          entry point            src/sessions.js     session store (DB-backed)
src/http/app.js        routes + middleware    src/middleware.js   session/auth/rate-limit
src/routes/            auth, docs, requests, sign (public), storage, settings, audit, templates
src/services/          requests (envelopes), pdf (stamping), cert, signing
src/storage/           index (selector), drive (OAuth + CRUD), local, cats (ref grammar)
web/src/               React app: Dashboard, Documents, Send, Templates, Settings,
                       SigningPage, PDFFieldBuilder, PdfCanvas (pdf.js), SignaturePad
test/unit.test.mjs     offline tests          test/e2e.mjs        live end-to-end test
```

## Security notes

HttpOnly `SameSite=strict` session cookies, timing-safe credential compare, per-signer
high-entropy URL tokens (40 random bytes), auth enforced on all dashboard routes,
rate-limited public signing endpoints, PDF magic-byte + size validation, sanitized
filenames, no path traversal in storage refs, append-only audit trail, secrets only in `.env`.

## Still open / future work

- Email delivery of signer links (currently shown in the dashboard after sending)
- Webhook/callback integrations, PostgreSQL/Redis swap-in (storage + metadata layers are interfaced for this)
- Template field-layout reuse when creating a request from a template
