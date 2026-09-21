# RESUME: REDITUS SIGN — deterministic restart doc
Written at manual handoff. **Do not trust file state; re-verify each probe below in the
fresh session before adding new code.** This environment corrupts large/long writes;
keep parts small and gate every append with `node --check`.

## 1. Re-verify the engine first (one command)
Run from repo root. All these previously imported clean at runtime; if ANY throws,
the src/ tree is suspect and must be re-checked per-file before continuing.
  node --check src/services/requests.js
  node --input-type=module -e "await import('./src/db.js');await import('./src/services/requests.js');await import('./src/services/cert.js');await import('./src/services/pdf.js');await import('./src/storage/index.js');console.log('ENGINE_OK')"

## 2. Known-good surfaces (probe these, don't trust memory)
config.js  : export const config  (dataDir, port, host, appUrl, adminUser/Pass,
            drive{cid,secret,redirectUri,rootFolderId,offline}, storage kind, limits)
crypto.js  : randomToken, randomId(prefix), sha256(data)->hex, hashString(str,secret),
            secureCompare, nowIso, randomUrlToken(bytes)
db.js      : export sql = {run,one,all,tx?}; initDb(); export function audit({...});
            export function listAuditEvents({limit,offset,docId,...}); setting(key[,val]);
            closeDb().  Tables: documents, requests, signers, fields, templates,
            audit_events, settings, app_sessions.
storage/   : index.js exports getStorage(), currentStorageKind(); local.js=LocalStorage;
            drive.js=GoogleDriveStorage + helpers (getAuthUrl+PKCE, handleCallback,
            drive.file scope, auto folder tree); cats.js=CATS/catFolder/splitRef.
services/  : pdf.js(stampSignedPdf? use stampSignedPdf export; getPageSizes),
            cert.js(buildCertificate), requests.js(createRequest/signRequest),
            signing.js, https.js stub exists.
crypto/sha256Hex: NOT exported by crypto.js — requests.js used sha256Hex alias; add
            `export const sha256Hex = sha256;` if missing (was added in later pass; re-check).

## 3. Rebuild order for missing HTTP layer (fresh, verified, small parts)
  src/http/app.tsrm → 1) src/middleware.js (re-check) 2) src/http/auth.js 3) src/http/app.js
  (express + cookie session cookie reditus_sid on app_sessions + multer 25MB + rate limit
   + drive OAuth callback + static web/. + error handler) 4) src/server.js
5) web/ React+Vite UI  6) test: two-signers-concurrent over HTTP  7) final §14 report.

## 4. Guardrails learned (keep them)
- Never paste a file >~35 lines in one shorthand heredoc. Use `cat > part` per chunk,
  `node --check part` after each, then `cat part* > file` and `node --check file`.
- Verify WITH node --check AFTER EVERY single write; this caught all session corruption.
- Do not reuse /tmp/opencode/*.part* files — several were assembly-mangled; the big clean
  files (drive.js, pdf.js) were rebuilt via fresh small heredocs, not by re-catting old parts.
## End
