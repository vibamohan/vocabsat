#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.12 or newer is required."
  exit 1
fi

node_version="$(node --version)"
node_major="${node_version#v}"
node_major="${node_major%%.*}"
node_minor="${node_version#v*.}"
node_minor="${node_minor%%.*}"

if ((node_major < 22 || (node_major == 22 && node_minor < 12))); then
  echo "Node.js 22.12 or newer is required; found ${node_version}."
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo "Creating .env.local. Find these values in Supabase under Project Settings > API."
  read -r -p "Supabase project URL: " supabase_url
  read -r -p "Supabase publishable/anon key: " supabase_key

  if [[ -z "$supabase_url" || -z "$supabase_key" ]]; then
    echo "Both Supabase values are required."
    exit 1
  fi

  {
    printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$supabase_url"
    printf 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$supabase_key"
    printf 'NEXT_PUBLIC_DAILY_WORD_COUNT=6\n'
    printf 'NEXT_PUBLIC_STUDY_TIME_ZONE=America/Los_Angeles\n'
  } > .env.local
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

echo "Starting VocabSAT at http://localhost:3000"
npm run dev
