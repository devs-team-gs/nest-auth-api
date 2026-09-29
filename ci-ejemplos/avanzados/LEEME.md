# Workflows avanzados (solo para mostrar)

Estos ejemplos van **más allá de la clase** de CI/CD con GitHub Actions. Están escritos para este
proyecto (pnpm, Prisma, Postgres de test en el puerto 5434), pero **ninguno se usa**: cada uno
resuelve un problema que este proyecto todavía no tiene.

> ⚠️ No están en `.github/workflows/`, así que GitHub no los ejecuta. Para probar uno, copialo ahí
> (y leé su encabezado: algunos necesitan mover otros archivos o configurar algo en GitHub).

| Archivo | Qué enseña | Por qué este proyecto no lo usa |
| ------- | ---------- | ------------------------------- |
| `matrix-node.yml` | `strategy.matrix` con Node 22/24 × Ubuntu/Windows, `fail-fast: false`, un check por combinación | Es una API: corre en **una** versión de Node y un SO. La matrix es para librerías y CLIs |
| `nightly-y-manual.yml` | `schedule` (cron en UTC) + `workflow_dispatch` con inputs; la trampa de `inputs` vacío en el cron | Sin usuarios ni dependencias que se actualicen solas, un problema aparece en el próximo PR |
| `reusable-setup.yml` + `usar-reusable.yml` | Reusable workflow (`workflow_call`): un job entero que se llama como una función, con `inputs` | Hay un solo workflow: la indirección no ahorra nada. Paga con muchos repos iguales |
| `composite-action/action.yml` + `usar-composite.yml` | Composite action local: agrupar steps repetidos en un `uses: ./.github/actions/setup` | El setup se repite solo en dos jobs; explícito se entiende mejor |
| `docker-build-push.yml` | Buildx + metadata + push a ghcr.io con `GITHUB_TOKEN`, cache `type=gha`, sin push en PRs | No hay Dockerfile |
| `cd-environments.yml` | Pipeline de Continuous Delivery: environments, aprobación manual, outputs entre jobs, la misma imagen de staging a prod, concurrency que nunca corta un deploy | No hay infraestructura donde desplegar (los deploys del ejemplo son simulados) |
| `seguridad.yml` | dependency-review, `pnpm audit` informativo, CodeQL, `permissions: {}` y pinning por SHA | Repo de clase sin usuarios reales; en repos privados requiere GitHub Advanced Security |
| `release-por-tag.yml` | `on: push: tags`, verificar antes de publicar, artifacts entre jobs, `gh release create --generate-notes` | Una API se despliega, no se distribuye como zip |

## Reusable workflow vs composite action

| | Reusable workflow | Composite action |
| --- | --- | --- |
| Agrupa | Jobs enteros (con su propio runner) | Steps (dentro del job que la usa) |
| Dónde vive | `.github/workflows/` (obligatorio) | Cualquier carpeta con un `action.yml`, típicamente `.github/actions/<nombre>/` |
| Se usa en | Un **job**: `uses: ./.github/workflows/x.yml` | Un **step**: `uses: ./.github/actions/x` |
| Necesita checkout antes | No | **Sí** (si es local) |

## Versiones de las actions

Verificadas el 2026-09-29 contra la API de GitHub (último release de cada repo):

| Action | Versión |
| ------ | ------- |
| `actions/checkout` | `v7` |
| `pnpm/action-setup` | `v6` |
| `actions/setup-node` | `v7` |
| `actions/upload-artifact` | `v7` |
| `actions/download-artifact` | `v8` |
| `docker/setup-buildx-action` | `v4` |
| `docker/login-action` | `v4` |
| `docker/metadata-action` | `v6` |
| `docker/build-push-action` | `v7` |
| `actions/dependency-review-action` | `v5` |
| `github/codeql-action` | `v4` |
