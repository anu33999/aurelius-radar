#!/bin/zsh
# Saves the Gmail app password to .env.local on this Mac only (never uploaded or committed).
cd "$(dirname "$0")/.." || exit 1
read -s "P?Paste the 16-letter Gmail app password, then press Enter: "
echo
P="${P// /}"
if [[ ${#P} -ne 16 ]]; then
  echo "That was ${#P} characters, not 16. Nothing saved. Run this again and paste the code."
  exit 1
fi
grep -v '^GMAIL_APP_PASSWORD=' .env.local > .env.local.tmp 2>/dev/null; mv .env.local.tmp .env.local
echo "GMAIL_APP_PASSWORD=\"$P\"" >> .env.local
echo "Saved. You can close this tab."
