#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAX_DIMENSION="${MAX_DIMENSION:-3000}"
JPEG_QUALITY="${JPEG_QUALITY:-80}"

if ! command -v sips >/dev/null 2>&1; then
  echo "Error: el comando 'sips' no esta disponible en este sistema." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

total_before=0
total_after=0
processed=0
skipped=0

while IFS= read -r -d '' file; do
  rel_path="${file#./}"
  ((processed++))

  size_before=$(stat -f%z "$file")
  total_before=$((total_before + size_before))

  tmp_file="$(mktemp "$TMP_DIR/IMG-XXXXXX.jpg")"
  if sips --resampleHeightWidthMax "$MAX_DIMENSION" \
    -s formatOptions "$JPEG_QUALITY" \
    "$file" --out "$tmp_file" >/dev/null; then
    size_after=$(stat -f%z "$tmp_file")

    if (( size_after < size_before )); then
      mv "$tmp_file" "$file"
      total_after=$((total_after + size_after))
    else
      rm "$tmp_file"
      total_after=$((total_after + size_before))
      ((skipped++))
      continue
    fi
  else
    echo "No se pudo procesar $rel_path" >&2
    rm -f "$tmp_file"
    total_after=$((total_after + size_before))
    ((skipped++))
  fi
done < <(find images -type f \( -iname '*.jpg' -o -iname '*.jpeg' \) -print0)

if (( processed == 0 )); then
  echo "No se encontraron JPGs en images/."
  exit 0
fi

bytes_saved=$((total_before - total_after))

printf "Procesadas: %d imagenes (omitidas: %d)\n" "$processed" "$skipped"
printf "Tamano total antes: %.2f MB\n" "$(bc <<<"scale=2;$total_before/1048576")"
printf "Tamano total despues: %.2f MB\n" "$(bc <<<"scale=2;$total_after/1048576")"
printf "Espacio ahorrado: %.2f MB\n" "$(bc <<<"scale=2;$bytes_saved/1048576")"
