# Producción del fork — OVHcloud VPS

Mac (desarrollo) → GitHub Actions (`fork-images.yml`) → GHCR (`ghcr.io/eduardocerino/chatbotx-*:sha-<commit>`) → VPS (`/opt/chatbotx`, Docker Compose).

El VPS **nunca compila**: solo descarga imágenes. Todo lo de esta carpeta está versionado sin secretos; los secretos viven solo en `/opt/chatbotx/.env` (chmod 600) en el VPS.

## Servicios

| Servicio | Imagen | Expuesto | Notas |
|---|---|---|---|
| caddy | `caddy:2-alpine` | 80, 443 | HTTPS automático (Let's Encrypt) |
| builder | fork `chatbotx-builder` | vía Caddy | Next.js, API, webhooks, OAuth |
| worker | fork `chatbotx-worker` | no | `worker standalone` (colas + schedule + secuencias en un proceso) |
| realtime | fork `chatbotx-realtime` | vía Caddy `/ws/*` | WebSocket |
| javascript-executor | fork `chatbotx-javascript-executor` | no | Red `internal: true`, `read_only`, `cap_drop: ALL`, igual que upstream |
| postgres | `timescale/timescaledb-ha:pg18-all` | no | TimescaleDB + pgvector (requeridos por el esquema) |
| redis | `redis:8-alpine` | no | contraseña, AOF, `noeviction` (BullMQ) |
| filesystem | `rustfs/rustfs` | vía Caddy | S3 compatible, igual que upstream |

MCP server: la imagen se construye, pero no se arranca (RAM). Para activarlo, añade el servicio y descomenta `/mcp*` en el `Caddyfile`.

## Rutas públicas (un solo dominio + uno para S3)

| URL | Destino |
|---|---|
| `https://chatbot.peachperfect.com.mx/*` | builder (dashboard, `/api/*`, `/rpc/*`, `/integrations/<canal>/webhook`, callbacks OAuth `/api/auth/callback/*`) |
| `https://chatbot.peachperfect.com.mx/ws/*` | realtime (`wss://…/ws/rt/...`) |
| `https://chatbot.peachperfect.com.mx/storage/*` y `/assets/*` | bucket, solo prefijo `public/` es anónimo |
| `https://s3.chatbot.peachperfect.com.mx` | API S3 para subidas/descargas firmadas (`S3_ENDPOINT`) |

### DNS a crear (en el panel de tu dominio)

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `chatbot` | `149.56.210.42` | 300 |
| A | `s3.chatbot` | `149.56.210.42` | 300 |

(Si tu proveedor usa nombres completos: `chatbot.peachperfect.com.mx` y `s3.chatbot.peachperfect.com.mx`.) Sin AAAA salvo que configures IPv6 en el VPS.

Mientras no exista el DNS (Caddy aún no puede emitir el certificado), verifica en privado por SSH:
`bash scripts/dc.sh ps` y `bash scripts/dc.sh exec builder node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"`.
Las subidas de archivos fallarán hasta que exista `s3.chatbot…` con certificado.

## Primera instalación

1. **SSH** (desde la Mac): `ssh-copy-id -i ~/.ssh/ovh_chatbotx.pub ubuntu@149.56.210.42`
2. **Sincronizar archivos**: `bash deploy/production/scripts/sync-to-vps.sh` (antes: `sudo install -d -o ubuntu /opt/chatbotx` en el VPS)
3. **Bootstrap** (en el VPS): `sudo bash /opt/chatbotx/scripts/bootstrap-vps.sh` — Docker, swap 4 GB, UFW (22/80/443), fail2ban, SSH solo con clave, actualizaciones automáticas.
4. **Secretos**: `cd /opt/chatbotx && ACME_EMAIL=… PLATFORM_ADMIN_EMAIL=… SMTP_SERVER=… SMTP_FROM=… bash scripts/generate-env.sh`
5. **GHCR**: si los paquetes son privados, guarda un PAT clásico con solo `read:packages` en `/opt/chatbotx/state/ghcr-token` (chmod 600). `deploy.sh` hace `docker login` con él.
6. **Imágenes**: GitHub → Actions → *Fork - Build images and deploy* → Run workflow (`deploy: false`). Anota el SHA.
7. **Desplegar**: `bash scripts/deploy.sh sha-<sha completo>`
8. Regístrate en `https://chatbot.peachperfect.com.mx` con el email de `PLATFORM_ADMIN_EMAIL` (requiere SMTP para verificar el correo). Después, si no quieres registros públicos: `AUTH_DISABLE_SIGNUP=true` en `.env` y `bash scripts/dc.sh up -d builder`.

El seed de upstream **no se ejecuta**: crea `demo@example.com` con una contraseña pública.

## Desplegar una versión nueva

1. En la Mac: commit + push a tu fork.
2. Actions → *Fork - Build images and deploy* → elige rama/SHA. `run_checks` ejecuta `ci.yml` (lint, tipos, tests) antes de construir.
3. Opción A (manual): en el VPS `bash scripts/deploy.sh sha-<sha>`.
   Opción B (desde Actions): `deploy: true`. Se detiene en el entorno `production` hasta que lo apruebes.

`deploy.sh` hace: pull → arranca infra → **backup** (`backups/db-*.dump`, se conservan 7) → lista migraciones pendientes → **se detiene si hay `DROP`/`TRUNCATE`/`DELETE`/cambios de tipo** (re-ejecuta con `ALLOW_DESTRUCTIVE=1` tras revisarlas) → migra → actualiza contenedores → espera healthchecks → si fallan, vuelve las imágenes al tag anterior.

**Rollback**: `bash scripts/deploy.sh rollback` cambia solo las imágenes. Las migraciones no se revierten; si una migración rompió datos, restaura un backup:
`docker compose exec -T postgres pg_restore -U chatbotx -d chatbotx --clean --if-exists < backups/db-<fecha>.dump` (detén builder y worker antes).

Cambios en `docker-compose.yml`/`Caddyfile`: edítalos en el repo y ejecuta `sync-to-vps.sh`, luego `bash scripts/dc.sh up -d`.

### Configurar el despliegue desde Actions (opcional)

1. Settings → Environments → `production` → Required reviewers: tú. Deployment branches: solo `main`.
2. Clave dedicada: `ssh-keygen -t ed25519 -f gh_deploy -N ""`. En el VPS añade a `~ubuntu/.ssh/authorized_keys`:
   `command="/opt/chatbotx/scripts/ci-deploy-gate.sh",restrict ssh-ed25519 AAAA… github-deploy`
   Esa clave solo puede ejecutar `deploy sha-<40 hex>`.
3. Secrets del entorno: `DEPLOY_SSH_KEY` (clave privada), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan 149.56.210.42`). Variables: `DEPLOY_HOST=149.56.210.42`, `DEPLOY_USER=ubuntu`.
4. Desactiva en Actions los workflows de upstream que no aplican al fork (`Build and Push Docker Images`, `Publish CLI to npm`, `Publish chatbotx-mcp`) con *Disable workflow*, sin borrar los archivos (evita conflictos al sincronizar upstream).

## Backups

Diario (cron del usuario `ubuntu`, `crontab -e`):
`15 4 * * * cd /opt/chatbotx && bash scripts/backup.sh daily >> backups/cron.log 2>&1`
Copia `backups/` fuera del VPS periódicamente (los backups en el mismo disco no protegen contra la pérdida del VPS). Los archivos del bucket viven en el volumen `chatbotx_filesystem-data`.

## Sincronizar con upstream

```bash
git fetch upstream
git switch main && git merge upstream/main   # resuelve conflictos, sobre todo en tus puntos de enganche
pnpm install && pnpm lint && pnpm check-types
git push origin main
```
Revisa `packages/database/drizzle/` en el diff: son las migraciones que se aplicarán en el siguiente despliegue.

## Módulos personalizados — estrategia de mínima fricción con upstream

Regla: **código nuevo en archivos nuevos**; los archivos de upstream solo reciben líneas de registro (una importación + una entrada). Así un merge de upstream choca, como mucho, en esas líneas.

| Capa | Dónde va tu módulo (`<x>` = nombre con prefijo, p. ej. `pp-loyalty`) | Punto de enganche en el núcleo |
|---|---|---|
| Feature UI + acciones | `apps/builder/src/features/<x>/` (`actions/`, `api/`, `queries/`, `schema/`, `components/`) | — |
| Página | `apps/builder/src/app/space/[workspaceId]/(has-folder)/<x>/page.tsx` | — |
| Navegación | — | 1 entrada en `apps/builder/src/components/app-sidebar.tsx` |
| Textos | claves nuevas en `apps/builder/messages/*.json` bajo un prefijo propio | — (obligatorio `useTranslations()`) |
| API pública (requerida, invariante 23) | `features/<x>/api/public.ts` con `workspaceTokenAuthAPIForScope("<scope>")` | 1 línea en `apps/builder/src/routers/public.ts` |
| Lógica de negocio | `packages/business/src/<x>/` (service) | export en el `package.json` del paquete |
| Acceso a datos | `packages/database/src/repositories/<x>.ts` | — |
| Tablas | `packages/database/src/schema/<x>.ts` + `relations/<x>.ts` | import **y** spread en `relations/index.ts`; `make:migration` |
| Purga de workspace | FK con `workspaceId` + índice | estrategia en el test de cobertura de purga (skill `workspace-purge`) |
| Jobs | handler en `apps/worker/src/<x>/` | cola/tipo en `packages/worker-config` |
| Integración externa | `integrations/<x>/` (paquete propio) | registro según skill `integration-channel` |
| Permisos | reutiliza los permisos de miembro existentes cuando puedas; uno nuevo toca el esquema de permisos del miembro | — |

Prefija tablas, colas, rutas y claves i18n (`pp_…`) para no chocar con funciones futuras de upstream. Antes de cada módulo, lee la skill correspondiente en `.agents/skills/` (ver tabla en `CLAUDE.md`). Las tablas nuevas implican migraciones: el `deploy.sh` las aplicará con backup previo.
