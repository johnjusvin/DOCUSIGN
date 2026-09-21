---
name: execute-docusign
description: >-
  Builds the complete REDITUS Sign e-signature application. Use ONLY when the
  user says "execute-docusign" or asks to execute/build REDITUS Sign. When
  triggered, follow every instruction in this skill end to end and actually
  implement the full application (not just a plan). Do not use for unrelated
  projects or other tasks.
---

# execute-docusign

When the user invokes **execute-docusign**, you take over the REDITUS Sign
project and build the complete application. You ACTUALLY IMPLEMENT the
software. You do not merely produce a plan.

You behave as the `reditus-sign` agent (see `.opencode/agents/reditus-sign.md`):
a senior full-stack engineer who inspects before modifying, tests their work,
fixes their own errors, and never leaves fake buttons or placeholder
functionality in core features.

## 1. Project identity

- **Project name:** REDITUS SIGN
- **Tagline:** THE RETURN OF WHAT'S POSSIBLE
- **Type:** lightweight, self-hosted electronic-signature platform inspired
  by the core workflow of DocuSign/OpenSign.
- **Deployment target:** runs locally, on a normal Ubuntu/Linux PC, at
  `http://localhost:<port>`.

## 2. Mandatory workflow (do this first — do NOT start editing files)

1. Inspect the repository: what files exist, what frameworks/libraries are
   present, whether it is empty or has scaffolding.
2. Inspect package configuration (e.g. `package.json`, lockfiles, build tool).
3. Inspect the OpenCode configuration and any existing agents or skills.
4. Determine the framework and existing reusable components.
5. Produce a concise implementation plan covering architecture, data model,
   storage, API, frontend, signing flow, and testing strategy.
6. Present the plan briefly, then proceed to implement systematically
   WITHOUT waiting for further approval (unless a destructive action
   requires it).
7. Implement: build, test, run lint, run type checking, fix errors.
8. Start the application, exercise the real UI, test the signing workflow,
   test Google Drive integration, test two simultaneous signing sessions.
9. Fix every discovered problem.
10. Deliver a final implementation report (see §14).

## 3. Architecture constraints (initial version)

- Run entirely **locally**. Target `http://localhost:<port>`.
- **Google Drive is the ONLY external storage layer** (documents).
- **Metadata store:** the lightest appropriate local mechanism. Use SQLite
  (electron-style, no server) or a local JSON/file-based store. Do NOT start
  a database server. Only use SQLite or similar if structured persistent
  metadata is actually needed.
- **Do NOT** introduce PostgreSQL, Kubernetes, Redis, cloud hosting, or
  microservices at this stage.
- Keep the storage layer modular: the document store (Google Drive) and the
  metadata store must be behind clean interfaces so PostgreSQL, Redis,
  Kubernetes, or another storage provider can be swapped in later.
- The application must support **multiple concurrent users**: several people
  creating/viewing documents while signers sign at the same time. Do not
  design a single-user desktop application.

### Recommended baseline stack (adapt to what actually exists in the repo)

If the repository is empty or has no framework, a strong lightweight choice
is:

- **Backend:** Node.js + Express (or Fastify), or a single Next.js app.
- **Frontend:** React (SPA or server-rendered) with a clean SaaS-style UI,
  served by the same local app.
- **PDF rendering/inspection:** pdf.js (pdfjs-dist) for displaying the PDF
  and building the field-placement UI.
- **PDF stamping:** a mature library to render flattened fields/signatures
  into a completed PDF (e.g. pdf-lib, or an equivalent that reliably embeds
  text, images/signatures, checkboxes, and radios into the final document).
- **PDF parsing for geometry/coordinates:** pdf-lib or pdf.js provides page
  dimensions; store field coordinates in a page-sized percentage or point
  system that survives page-render scaling.
- **Metadata:** `better-sqlite3` (or similar local SQLite driver) for the
  document/signer/audit/template metadata.
- **Google Drive:** official `googleapis` (Drive v3) SDK; OAuth 2.0
  (installed-app)

or OAuth-based service credentials as required by your actual Google setup.

Adapt the stack to whatever framework the repository already has; do not
introduce a heavy framework just for its own sake.

## 4. Data model

Model these entities in the local metadata store:

- **Document** — id, name, status, archive flag, upload metadata, Google
  Drive file references (original, signed, certificate), SHA-256 hash,
  created/updated timestamps, created-by.
- **SigningRequest** (envelope) — id, document id, status, created/sent/
  completed/expired timestamps, message, email subject/body, signing-order
  mode (sequential | parallel), signers[], link token, expires-at.
- **Signer** — id, request id, name, email, order, status
  (pending/started/signed/declined), secure signing token
  (unguessable, high-entropy), viewed-at, signed-at, session references.
- **Field** — id, request id / template id, page number, x, y, width, height,
  type (signature | initials | name | email | date | text | checkbox | radio |
  choice), signer id, required flag, options (for choice fields), saved value.
- **AuditEvent** — id, event type, timestamp, signer/user ref, IP address,
  user agent, document id, signer id, event metadata (JSON).
- **Template** — id, name (e.g. NDA, Service Agreement, Software Agreement,
  Project Agreement, Internship Agreement), description, source PDF Drive
  reference, configured fields, signer roles, document metadata.

**Document statuses:** Draft, Sent, Viewed, In Progress, Completed, Declined,
Expired, Cancelled.

## 5. Functional requirements — documents

Support:

- Upload PDF
- View PDF (in the UI)
- Create a signing request
- Rename document
- Delete document (ask for confirmation before destructive delete / Drive
  deletion)
- Archive document
- Track status
- Download original document
- Download completed signed document
- Search documents
- Filter documents (by status, date, name)

## 6. Signers and signing order

- Each signing request supports one or many signers.
- Each signer has: name, email, signing order, status, signing token,
  timestamps (created, sent, viewed, started, signed, declined).
- Support **sequential signing**: Signer 1 → Signer 2 → Signer 3 (signer N
  may only sign after N-1 completed).
- Support **parallel signing**: all signers can sign independently in any
  order.
- The signing-order mode is chosen per request when it is created.

## 7. PDF field builder

Create a visual, drag-and-drop PDF field-placement interface.

Field types to support initially:

- Signature
- Initials
- Name
- Email
- Date
- Text
- Checkbox
- Radio/choice (where practical)

The document creator must be able to:

- place fields on the correct page
- move fields
- resize fields
- delete fields
- assign fields to a specific signer
- mark fields as required
- save the field layout

Every field must retain: page number, X coordinate, Y coordinate, width,
height, type, signer assignment, required state. Coordinates must map
correctly between the on-screen rendered PDF and the actual PDF coordinate
space so placed signatures land on the correct spot of the real document.

## 8. Signature methods

Support all three:

1. **Draw** signature (canvas)
2. **Type** signature (font-based)
3. **Upload** signature image

The signing experience must be simple and professional.

## 9. Signing experience

The signer receives a dedicated signing page and must be able to:

1. Open the signing link
2. View the document
3. Verify identity where implemented
4. Navigate to required fields
5. Enter information
6. Create/select a signature
7. Place the signature
8. Review the document
9. Agree to electronic signing (consent checkbox)
10. Submit the signature

After successful signing, show a clear completion message.

## 10. Signing links

- Every signing request has a secure, unguessable signing URL:
  `/sign/<secure-token>`.
- Tokens MUST have sufficient entropy (at least 32 random bytes /
  crypto-random). Never use sequential database IDs as signing tokens.
- The signing page is public-only via the token; signers must not need an
  account. The dashboard side remains protected by normal app authorization
  where applicable.

## 11. Audit trail

Record events such as:

- Document created
- Document uploaded
- Signing request created
- Signing request sent
- Document opened
- Signer started signing
- Field completed
- Signature created
- Signature applied
- Document signed
- Signer declined
- Signing request expired
- Signing completed
- Final document generated

Record where appropriate: timestamp, signer/user, IP address, user agent,
document ID, signer ID, event metadata. Audit events must not be casually
editable through the normal UI (append-only from the application layer; add a
guard against ordinary update/delete routes).

## 12. Completion certificate and package

When all required signers finish, generate a **completion certificate**
containing:

- document name
- document ID
- signer list
- signer emails
- signing timestamps
- completion timestamp
- audit events
- document hash

The completed package conceptually contains:

- Original document
- Completed signed document
- Audit information
- Completion certificate

### Document integrity

- Generate SHA-256 hashes for documents where appropriate and record them.
- Never silently overwrite a completed signed document.
- Maintain clear separation between: Original / Signed / Certificate.

## 13. Templates

Support reusable templates, e.g.:

- NDA
- Service Agreement
- Software Agreement
- Project Agreement
- Internship Agreement

A template retains: the source PDF, configured fields, signer roles, document
metadata. Creating a new signing request from a template automatically loads
the field configuration (fields assigned to the template's roles/signers).

## 14. REDITUS dashboard

Create a clean REDITUS dashboard with these sections:

- Dashboard
- Documents
- Send for Signature
- Templates
- Pending
- Completed
- Declined
- Expired
- Audit Trail
- Settings

The Dashboard should show useful status information (counts by status, recent
activity, pending signers).

## 15. Google Drive storage

This is the ONLY external storage requirement.

- Use the Google Drive API with a secure OAuth-based integration. Determine
  the exact authentication method during implementation based on the user's
  setup. Do NOT make Drive files publicly accessible just to make the app
  easier.
- The provided Drive folder is configurable via environment variables /
  configuration. Do NOT hard-code the folder ID into source code.
- Keep all Google credentials/secrets outside source code (environment
  variables or an untracked local config file; add creds to `.gitignore`).
- Organize documents logically in folders, for example:

```
REDITUS SIGN/
├── Originals/
├── Signed/
├── Templates/
├── Certificates/
└── Attachments/
```

Create the folder tree automatically at first run (or first OAuth auth)
inside the configured root folder.

## 16. UI/UX

- The interface should look like a real professional SaaS product.
- Brand: REDITUS. Clean, modern, own design.
- Do NOT copy DocuSign's branding, logo, proprietary UI, or copyrighted
  visual assets. DocuSign/OpenSign are functional references only.
- The external signer page must be extremely simple and clean.

## 17. Security controls

Implement all of the following:

- secure signing tokens (high-entropy, random)
- authorization on every API route
- input validation on every request body/query/param
- file type validation (PDF and allowed images only)
- file size limits for uploads/signatures
- safe file handling (sanitized names, no path traversal, no direct serving
  of arbitrary files)
- XSS protection (escape/React default escaping, no dangerouslySetInnerHTML
  on user content)
- CSRF protection where applicable
- secure cookies/sessions (HttpOnly, SameSite, Secure where localhost HTTPS
  permits)
- rate limiting for sensitive endpoints (signing submission, auth)
- no secrets in Git
- no public database
- secure Google credentials
- access checks on every document operation (never trust IDs or tokens
  supplied by the client without verifying ownership/authorization where the
  route requires it)

## 18. Engineering behavior while building

1. Do NOT immediately start randomly editing files.
2. First: inspect repo → package config → OpenCode config → existing agents →
   existing skills → determine framework → determine reusable components.
3. Produce a concise implementation plan.
4. Implement systematically:
   - scaffold project
   - metadata/database layer
   - Google Drive storage layer
   - document/API layer (upload, request, signer, template, audit routes)
   - signing-token + signing page flow
   - PDF field builder UI
   - signing UI (draw/type/upload signature)
   - completed PDF generation (flattened stamping)
   - completion certificate generation
   - audit trail wiring
   - dashboard UI (all sections)
   - templates
   - document status tracking
   - security controls
   - tests, lint, typecheck — then fix errors
5. Start the application and verify for real:
   - dashboard works
   - PDF upload works
   - signing request creation works
   - multiple signers configured
   - fields placed in the builder
   - signing link opens
   - signer signs
   - multiple signers sign
   - sequential signing works
   - parallel signing works
   - completed PDF is generated
   - audit trail is generated
   - completion certificate is generated
   - documents stored in the configured Google Drive folder
   - templates work
   - multiple browser/simultaneous sessions work (test two signing sessions
     at once)
   - app restarts without losing required state
6. Fix every discovered problem. Do not claim a feature works unless it has
   actually been tested.

## 19. Definition of done

`execute-docusign` is successful ONLY when:

1. Application runs locally.
2. REDITUS dashboard works.
3. PDF can be uploaded.
4. Signing request can be created.
5. Multiple signers can be configured.
6. Fields can be placed.
7. Signing link works.
8. Signer can sign.
9. Multiple signers can sign.
10. Sequential signing works.
11. Parallel signing works.
12. Completed PDF is generated.
13. Audit trail is generated.
14. Completion certificate is generated.
15. Documents are stored in the configured Google Drive folder.
16. Templates work.
17. Multiple browser sessions work simultaneously.
18. No core feature is a fake/mock implementation.
19. Application can restart without losing required state.
20. Documentation exists for running and configuring the application.

## 20. Destructive operations

For anything destructive — deleting documents, resetting the database,
deleting Google Drive files, replacing existing data — ask for explicit
confirmation before proceeding. Never destroy user data without approval.

## 21. Final implementation report

When done, deliver a report that includes:

- What was built (summary of the architecture and each major component)
- Where the metadata and document storage live
- Installation instructions
- Development command (`npm run dev` or equivalent)
- Production/local run command
- Environment configuration (which env vars, and a `.env.example`)
- Google Drive setup instructions (OAuth, folder configuration)
- Test instructions (unit/integration/UI, and how to run two simultaneous
  signing sessions)
- Anything that remains unimplemented, plus how it can be added later
  (PostgreSQL, Kubernetes, Redis, cloud hosting, etc.)