#!/bin/bash
# check-env.sh
# Checks required environment variables for applying Squad Auth ZITADEL seeds.

if [ -z "$ZITADEL_ISSUER" ] || [ -z "$ZITADEL_BASE_URL" ] || [ -z "$ZITADEL_ORG_ID" ]; then
  echo "Error: Missing required ZITADEL environment variables."
  echo "Ensure ZITADEL_ISSUER, ZITADEL_BASE_URL, and ZITADEL_ORG_ID are set."
  exit 1
fi

if [ -z "$ZITADEL_SERVICE_ACCOUNT_KEY_FILE" ] && [ -z "$ZITADEL_PAT" ]; then
  echo "Error: Missing authentication credentials."
  echo "Provide either ZITADEL_SERVICE_ACCOUNT_KEY_FILE or ZITADEL_PAT."
  exit 1
fi

if [ -z "$SQUAD_AUTH_ENV" ]; then
  echo "Error: SQUAD_AUTH_ENV is not set (e.g., local, dev, staging, prod)."
  exit 1
fi

if [ "$SQUAD_AUTH_ENV" == "prod" ]; then
  if [ "$ALLOW_PROD_ZITADEL_SEED" != "true" ]; then
    echo "Error: Refusing to run in 'prod' environment without explicit confirmation."
    echo "Set ALLOW_PROD_ZITADEL_SEED=true to proceed."
    exit 1
  fi
fi

echo "Environment checks passed for $SQUAD_AUTH_ENV."
exit 0
