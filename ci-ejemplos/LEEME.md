# Ejemplos de CI con GitHub Actions

Material de la clase de CI/CD. El CI **real** del proyecto está en
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml); esta carpeta tiene los ejemplos para
llegar hasta él y para ir más allá.

> ⚠️ **Estos archivos no se ejecutan.** GitHub solo corre los workflows que están directamente en
> `.github/workflows/`. Por eso los ejemplos viven acá: si estuvieran allá, cada push dispararía
> todos a la vez. Es la misma regla de la clase: "la ruta no es negociable".

## ▶️ Cómo probar un ejemplo

1. Copialo a `.github/workflows/` (por ejemplo, como `ejemplo.yml`).
2. Hacé push o abrí un PR a `main`, según los `on:` del archivo.
3. Mirá la pestaña **Actions** del repo.
4. Cuando termines, borralo: si convive con `ci.yml`, vas a tener dos CI corriendo.

## 🪜 Progresivos: de `echo` al CI real

Cada paso agrega **una sola cosa** respecto al anterior. El encabezado de cada archivo dice cuál.

| Paso | Archivo | Qué agrega |
| ---- | ------- | ---------- |
| 1 | [`01-hola-mundo.yml`](progresivos/01-hola-mundo.yml) | Un workflow mínimo. El runner nace vacío |
| 2 | [`02-checkout.yml`](progresivos/02-checkout.yml) | `actions/checkout`: el código llega al runner (lo gitignoreado no) |
| 3 | [`03-node-pnpm.yml`](progresivos/03-node-pnpm.yml) | pnpm + Node + cache + `install --frozen-lockfile` |
| 4 | [`04-verificaciones.yml`](progresivos/04-verificaciones.yml) | `prisma:generate`, lint, formato, tests unitarios y build |
| 5 | [`05-pull-requests.yml`](progresivos/05-pull-requests.yml) | `pull_request`, `concurrency` y `timeout-minutes` |
| 6 | [`06-e2e-con-postgres.yml`](progresivos/06-e2e-con-postgres.yml) | `services:` con Postgres, migraciones y e2e (en un solo job) |
| 7 | [`07-jobs-con-needs.yml`](progresivos/07-jobs-con-needs.yml) | Dos jobs: `verificar` → `e2e` con `needs` |
| 8 | [`08-artifacts.yml`](progresivos/08-artifacts.yml) | Coverage con umbral y subido como artifact |
| ✅ | [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Paso 8 + `workflow_dispatch` + `permissions` mínimos |

## 🚀 Avanzados: para mostrar, no para usar

Ver [`avanzados/LEEME.md`](avanzados/LEEME.md). Son piezas que este proyecto no necesita todavía
(matrix, deploy con environments, imágenes Docker, workflows reusables, seguridad, releases),
cada una con el motivo por el que no se usa acá.

## 🧩 Lo que el CI necesita del proyecto

Estos detalles no son de GitHub Actions sino de **este** proyecto, y aparecen en todos los ejemplos
a partir del paso 4:

| Detalle | Por qué |
| ------- | ------- |
| `pnpm prisma:generate` después del install | El cliente de Prisma se genera en `src/generated`, que está en `.gitignore` |
| `pnpm lint` sin `--fix` (y `pnpm lint:fix` para vos) | En CI se verifica, no se arregla |
| `pnpm format:check` | Lo mismo con Prettier: `--check`, no `--write` |
| `"packageManager"` en `package.json` | `pnpm/action-setup` lee la versión de ahí: el CI usa la misma que vos |
| `cp .env.test.example .env.test` | `.env.test` no está en git; el `.example` sí, con valores de una base descartable |
| Postgres en el puerto **5434** con base `integrar_test` | Igual que `compose.test.yaml`, así `.env.test.example` sirve tal cual. `crear-app.ts` se niega a correr contra otra base |
| `pnpm test:e2e:ci` en vez de `pnpm test:e2e` | `test:e2e` dispara `pretest:e2e`, que levanta `compose.test.yaml` y chocaría con el Postgres de `services:` |
