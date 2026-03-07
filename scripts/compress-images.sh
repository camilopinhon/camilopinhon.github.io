#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAX_DIMENSION="${MAX_DIMENSION:-1600}"
JPEG_QUALITY="${JPEG_QUALITY:-60}"

if ! command -v sips >/dev/null 2>&1; then
  echo "Error: el comando 'sips' no esta disponible en este sistema." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

files=()

if (( $# > 0 )); then
  files=("$@")
else
  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find images -type f \( -iname '*.jpg' -o -iname '*.jpeg' \) -print0)
fi

if (( ${#files[@]} == 0 )); then
  echo "No se encontraron JPGs en images/."
  exit 0
fi

total_before=0
total_after=0
processed=0
skipped=0

for file in "${files[@]}"; do
  [[ -z "$file" ]] && continue
  if [[ ! -f "$file" ]]; then
    echo "Aviso: '$file' no existe, se omite." >&2
    ((skipped++))
    continue
  fi

  lower_path="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"
  case "$lower_path" in
    *.jpg|*.jpeg) ;;
    *)
      ((skipped++))
      continue
      ;;
  esac

  rel_path="$file"
  if [[ "$file" == ./* ]]; then
    rel_path="${file#./}"
  elif [[ "$file" == "$ROOT_DIR/"* ]]; then
    rel_path="${file#$ROOT_DIR/}"
  fi

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
done

if (( processed == 0 )); then
  echo "No se procesaron JPGs."
  exit 0
fi

bytes_saved=$((total_before - total_after))

printf "Procesadas: %d imagenes (omitidas: %d)\n" "$processed" "$skipped"
printf "Tamano total antes: %.2f MB\n" "$(bc <<<"scale=2;$total_before/1048576")"
printf "Tamano total despues: %.2f MB\n" "$(bc <<<"scale=2;$total_after/1048576")"
printf "Espacio ahorrado: %.2f MB\n" "$(bc <<<"scale=2;$bytes_saved/1048576")"
