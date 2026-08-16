# Architecture Decision Records

Every decision that changes architecture, client isolation, security, authentication, billing, data ownership or product policy is recorded here before it is implemented. A decision that is not written down is not a decision — it is an accident waiting to be discovered by whoever maintains the code next.

## Format

Each ADR states: context, decision, alternatives considered (with the reason each was rejected), and consequences — including the negative ones. An ADR with no negative consequences has not been thought through.

## Status values

| Status | Meaning |
| --- | --- |
| Proposed | Written, awaiting approval. Not implemented. |
| Accepted | Approved. Implementation may proceed. |
| Superseded | Replaced by a later ADR, which is named in the header. |
| Deprecated | No longer applies; nothing replaces it. |

## Index

| ADR | Title | Status | Phase |
| --- | --- | --- | --- |
| [0001](ADR-0001-client-hostname-contract.md) | Client hostname contract and resolution | Accepted | 1 |
| [0002](ADR-0002-client-isolation.md) | Client isolation: Prisma extension plus PostgreSQL RLS | Accepted | 1 |
| [0003](ADR-0003-session-and-auth-boundary.md) | Session and authentication boundary | Accepted | 1 |

## Open decisions

Decisions not yet made are tracked in [`../phase-1/03-DECISIONS-REQUIRING-APPROVAL.md`](../phase-1/03-DECISIONS-REQUIRING-APPROVAL.md). Six of them block Phase 1 code generation. When one is approved, it either becomes an ADR here (if it is architectural) or is recorded in the sign-off table there (if it is a version or tooling choice).

## Relationship to the baseline

The project baseline is `ExcelEx-NodeJS-SaaS-Project-Foundation.md`. Its section 15 lists decisions that are final and should not be reopened without new material evidence. ADRs in this directory implement that baseline; they do not overrule it. Where this project needs to deviate from the baseline, the deviation is raised for approval first — see DEC-006 for the one structural deviation proposed in Phase 1.
