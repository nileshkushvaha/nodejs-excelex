# ExcelEx Platform — Documentation

## Start here

| Document | Purpose |
| --- | --- |
| [`ExcelEx-NodeJS-SaaS-Project-Foundation.md`](ExcelEx-NodeJS-SaaS-Project-Foundation.md) | The approved project baseline. Source of truth for scope, stack and delivery phases. Uses the word *tenant*; see the glossary. |
| [`GLOSSARY.md`](GLOSSARY.md) | **Binding naming rules.** *Client* is the courier company and the isolation boundary; *customer* is the business that ships with a client. Read before naming anything. |
| [`phase-1/PROGRESS.md`](phase-1/PROGRESS.md) | Live implementation state: milestones completed, verification results, accepted residual risk, deferred work. |
| [`phase-1/00-IMPLEMENTATION-PLAN.md`](phase-1/00-IMPLEMENTATION-PLAN.md) | The Phase 1 engineering and SaaS foundation plan, with the eleven acceptance criteria that gate Phase 2. |
| [`phase-1/03-DECISIONS-REQUIRING-APPROVAL.md`](phase-1/03-DECISIONS-REQUIRING-APPROVAL.md) | **Read before approving anything.** Six decisions block code generation; three more gate specific steps. |
| [`phase-1/01-VERSION-MATRIX.md`](phase-1/01-VERSION-MATRIX.md) | Exact dependency lines, the procedure that resolves them to committed versions, and the compatibility risks to prove during scaffolding. |
| [`phase-1/02-SETUP-GUIDE.md`](phase-1/02-SETUP-GUIDE.md) | Reproducible local setup: prerequisites, infrastructure, roles, environment, scaffold order, verification. |
| [`adr/`](adr/README.md) | Architecture decision records. |
| [`runbooks/`](runbooks/README.md) | Operational procedures: reading an error reference, logging and error codes; more added as modules land. |

## Reading order for a first review

1. `GLOSSARY.md` — two pages, and it prevents the one naming mistake that leaks data.
2. The baseline, if you have not read it recently.
3. `phase-1/03-DECISIONS-REQUIRING-APPROVAL.md` — this is where your input is actually needed.
4. `phase-1/00-IMPLEMENTATION-PLAN.md` §11 (acceptance criteria) and §12 (sequenced delivery) — what "done" means and in what order it arrives.
5. The ADRs, if you want the reasoning behind client isolation, hostnames and sessions.
6. `phase-1/01-VERSION-MATRIX.md` and `phase-1/02-SETUP-GUIDE.md` when work begins.

## Status

Phase 1 is in progress. `phase-1/PROGRESS.md` is the live record; `00-IMPLEMENTATION-PLAN.md` §16 records the independent audit that produced revision 2 of these documents and what changed as a result.

The database foundation — schema, roles, grants and row-level security — is implemented and its cross-client isolation proof passes. Application code has not started.
