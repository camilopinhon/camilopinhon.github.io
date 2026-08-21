# Portfolio fotografico para GitHub Pages

Sitio estatico (sin hosting extra) para usar en `github.io`.

## Editar contenido rapido

Todo se edita en `portfolio-data.js`.

- `siteTitle`: nombre en el menu lateral.
- `instagramUrl`: enlace del boton INSTAGRAM.
- `contact`: datos de contacto.
- `projects`: lista de proyectos/secciones.

## Como anadir fotos (automatico)

1. Copiar tus fotos dentro de la carpeta del proyecto en `images/`:
   - `images/blackbird/`
   - `images/people-are-strange/`
   - `images/us-and-them/`
   - `images/like-a-rolling-stone/`
   - `images/space-oddity/`
   - `images/the-boxer/`
2. No hace falta editar `photos`: la web detecta automaticamente las imagenes de cada carpeta.
3. El orden es alfabetico natural por nombre de archivo (por ejemplo `1.jpg`, `2.jpg`, `10.jpg`).

Si usas un dominio personalizado o cualquier hosting que no sea `*.github.io`, indica tu repo en `portfolio-data.js` dentro de `github.repo` (por ejemplo `usuario/portfolio-website`). Asi la web pregunta directamente a la API de GitHub y puede listar los archivos aunque el servidor no muestre indices de carpetas.

> Nota: abrir `index.html` directamente (protocolo `file://`) impide que el navegador liste las carpetas de `images/`. Arranca un servidor local para previsualizar los cambios, por ejemplo:
>
> ```bash
> python3 -m http.server 4173
> ```
>
> Luego entra en `http://localhost:4173/` y la deteccion automatica funcionara con tus archivos locales.

La disposicion (`frame` y `grid`) se calcula automaticamente segun el formato de cada imagen:

- horizontales muy anchas: `full` y `wide`
- verticales: `center` y `narrow`
- proporciones intermedias: `center` o alternancia `left/center/right`

Opcionalmente, si quieres forzar una foto concreta, puedes seguir usando `photos` manual en `portfolio-data.js`.

## Publicar en GitHub Pages

1. Sube estos archivos a tu repo.
2. En GitHub: `Settings > Pages`.
3. Fuente: branch `main` (root).
4. Tu portfolio quedara publicado en tu `*.github.io`.

## Automatizar la compresion de imagenes

El hook `.githooks/pre-commit` comprime **solo las imagenes JPG nuevas** detectadas en el `git add` del commit (mismas que no existian en el repo), manteniendo el resto intactas. Activalo una vez:

```bash
git config core.hooksPath .githooks
```

Si en algun momento quieres volver a optimizar todas las imagenes, ejecuta manualmente:

```bash
scripts/compress-images.sh
```

Requisitos:

- macOS (usa `sips` para comprimir).
- Permisos de ejecucion (`chmod +x .githooks/pre-commit` ya esta aplicado en el repo, pero verifica tras clonar).

## Generar el sitio de produccion

El sitio usa `images/manifest.json` como fuente de imagenes en produccion. Despues de anadir o quitar fotos, regenera el manifiesto y crea `dist/`:

```bash
node scripts/build-image-manifest.mjs
node scripts/build-site.mjs
```

Publica el contenido de `dist/`. Incluye las variantes responsive y conserva la calidad visual, pero no copia los originales de alta resolucion innecesarios para el navegador.

Durante el desarrollo local, la web sigue detectando directamente las fotos nuevas de las carpetas `images/`.
