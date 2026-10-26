#!/bin/sh
# Arranca Comanda en Mac o Linux:  ./iniciar.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  No se encontró Node.js en este computador."
  echo "  Descarga la versión LTS en https://nodejs.org, instálala y vuelve a intentar."
  echo ""
  exit 1
fi
exec node scripts/iniciar.mjs "$@"
