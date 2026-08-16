#!/usr/bin/env bash
# Shared psql wrapper. Sourced, never executed.
#
# Defines pg(), which forwards to the host psql when libpq is installed and
# otherwise to the client inside the Postgres container. Neither the security
# script nor the isolation proof may be skippable because a developer has no
# local libpq — both are correctness gates, not conveniences.

if command -v psql >/dev/null 2>&1; then
  pg() { psql "$@"; }
else
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-docker-postgres-1}"
  if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    echo "No psql on PATH and container '$POSTGRES_CONTAINER' not found." >&2
    echo "Install libpq (brew install libpq && brew link --force libpq)" >&2
    echo "or set POSTGRES_CONTAINER to the running Postgres container." >&2
    exit 2
  fi
  echo "psql not on PATH — running through container '$POSTGRES_CONTAINER'."
  pg() { docker exec -i "$POSTGRES_CONTAINER" psql "$@"; }
fi
