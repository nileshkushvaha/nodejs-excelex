# CI

One workflow, run on every push and pull request.

The order is deliberate: the cheap checks fail fast, and the isolation proof —
the assertion that no client can reach another client's rows — runs last
against a real Postgres with the same four runtime roles production uses.

`Create runtime roles` exists because the proof is only meaningful when it runs
as the constrained roles. Running it as a superuser would pass while proving
nothing: `FORCE ROW LEVEL SECURITY` does not constrain superusers, which is
recorded in ADR-0002 as a documented residual risk.
