# Архитектура и стек Yessenov Community

## 1) Кратко о проекте
Yessenov Community — студенческая социальная сеть: лента постов, ответы, сообщества, подписки, личные сообщения, уведомления, модерация и админ‑панель.

## 2) Технологический стек (full‑stack)

### Frontend
- Next.js 16.1.3 (App Router)
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4 + PostCSS
- next/font (Manrope)

### Backend
- Next.js Route Handlers (`src/app/api/*`)
- Auth.js / NextAuth v5.0.0‑beta.30
- Prisma 6.19.2
- Zod 4.3.5 (валидация запросов)

### База данных
- PostgreSQL через Prisma (`DATABASE_URL`)
- Миграции Prisma (`prisma/migrations`)
  - Внутренняя очередь задач хранится в таблице `Job`

### Инфраструктура и tooling
- Vercel (скрипт `scripts/vercel-build.mjs` с `prisma migrate deploy` + `next build`)
- ESLint 9
- Vitest 2.1.9
- Redis (внутренний/self‑hosted через `REDIS_URL`)
- Внутренняя очередь задач (DB‑backed) через `JOB_QUEUE_PROVIDER=postgres`
- Event bus через очередь (`EVENT_BUS_PROVIDER=queue`) для async событий
- Realtime (SSE + Redis pub/sub) через `REALTIME_PROVIDER=redis`

## 3) Архитектурная схема

```
[ Browser ]
    |
    |  (Server Components / Client Components)
    v
[ Next.js App Router ]
    |
    |  Route Handlers: /api/*  (Node.js runtime)
    v
[ Service Layer (src/services) ]
    |
    v
[ Repositories (src/repositories) ]
    |
    v
[ Infrastructure (src/infrastructure) ]
    |  - cache, jobs, events, search, realtime (adapters)
    v
[ Prisma Client ]
    |
    v
[ PostgreSQL ]
```

Ключевая идея: Route Handlers тонкие и делегируют бизнес‑логику в `src/services`. Доступ к данным изолирован в `src/repositories`, а инфраструктура (кэш, очереди, события) — в `src/infrastructure`. Общие вспомогательные вещи остаются в `src/lib`.

## 4) Структура репозитория

```
/ARCHITECTURE.md
/README.md
/next.config.ts
/prisma
  /schema.prisma
  /migrations
  /seed.mjs
/scripts
  /vercel-build.mjs
/src
  /app            # маршруты (App Router) + API routes
  /components     # UI компоненты
  /domain         # контракты домена (events/jobs/cache/search/realtime)
  /infrastructure # контейнер + адаптеры (in-memory/legacy)
  /repositories   # доступ к данным (Prisma)
  /services       # бизнес‑логика (use cases)
  /lib            # общие серверные утилиты
  /types          # типы (расширения NextAuth)
/tests            # Vitest
```

## 5) Основные домены и маршруты

### 5.1. Публичные страницы (UI)
- `/` — лента
- `/welcome` — стартовая
- `/auth/*` — вход/регистрация через Google
- `/invite`, `/onboarding` — инвайты и онбординг
- `/p/[id]` — пост и ветка ответов
- `/u/[username]` — профиль пользователя
- `/communities`, `/c/[slug]` — сообщества
- `/messages` — личные сообщения
- `/notifications` — уведомления
- `/admin/*` — админ‑панель

### 5.2. API (Route Handlers)
Группы и назначение:

- **Auth**: `/api/auth/[...nextauth]`, `/api/auth/onboarding`
- **Feed/Posts**: `/api/feed`, `/api/community-feed`, `/api/posts`, `/api/posts/[id]`, `/api/posts/reply`, `/api/posts/repost`, `/api/posts/[id]/replies`
- **Likes/Follow**: `/api/likes/toggle`, `/api/follow/toggle`
- **Users**: `/api/users/[username]`, `/api/users/[username]/posts`, `/api/users/[username]/followers`, `/api/users/[username]/following`, `/api/users/[username]/replies`
- **Communities**: `/api/communities`
- **Notifications**: `/api/notifications`, `/api/notifications/unread-count`, `/api/notifications/mark-read`, `/api/notifications/mark-all-read`
- **Realtime**: `/api/realtime/stream` (SSE)
  - каналы: `user:<id>`, `moderation:system` (только MOD/ADMIN)
- **Search**: `/api/search/users`
- **DM**: `/api/dm/inbox`, `/api/dm/start`, `/api/dm/[id]`, `/api/dm/[id]/send`, `/api/dm/[id]/read`
- **E2E (keys)**: `GET/POST /api/e2e/devices`, `/api/e2e/prekeys`, `/api/e2e/bundle`, `/api/e2e/safety`, `/api/e2e/trust`
- **Reports/Appeals**: `/api/admin/reports`, `/api/admin/appeals`
- **Feedback**: `/api/feedback`
- **Admin**: `/api/admin/*` (модерация, аудит, метрики, экспорт, очереди)
- **Dev**: `/api/dev/*` (health/runtime/auth/debug)

> Многие API routes помечены `export const runtime = "nodejs"`, что важно для NextAuth + Prisma.

## 6) Данные и модели (Prisma)
Ключевые сущности:

- **User**: профиль, роли, бан/шадоубан, онбординг
- **Post**: посты и ответы (ответы хранятся как `Post` с `replyToId`)
- **Community** и **CommunityMember** (роли MEMBER/MOD/OWNER)
- **Like**, **Follow**
- **Notification** (типы: REPLY, LIKE, FOLLOW, MENTION)
- **Conversation**, **ConversationParticipant**, **Message** (личные сообщения)
- **Report**, **Appeal** (модерация)
- **AuditLog**, **ModerationAction**, **Feedback**

Индексы и уникальные ограничения заданы в `prisma/schema.prisma` для ленты, лайков, подписок и модерации.
Также есть SQL‑миграции с частичными индексами под фиды/профили (для ускорения `replyToId IS NULL` / `deletedAt IS NULL` запросов).

## 7) Аутентификация и сессии
- Auth.js / NextAuth (Google OAuth)
- Сессии хранятся в базе (strategy: `database`)
- `src/auth.ts` — конфиг провайдера, коллбек session
- `src/lib/auth.ts` — вспомогательные функции (requireUser, requireRole, invite checks)
- `src/types/next-auth.d.ts` — расширение типов session/user

## 8) Безопасность и модерация
- **Rate limiting**: `src/lib/rate-limit.ts` (Redis при наличии `REDIS_URL`, иначе in‑memory)
- **Anti‑abuse**: `src/lib/abuse-rules.ts`, `src/lib/abuse-tracker.ts`
- **Auto‑abuse scan**: `abuse.scan.post` job (content heuristics, пишет `ModerationAction`)
- **Bans/Shadow bans** и роль‑бэйзд доступ (`Role`: USER/MOD/ADMIN)
- **Audit log**: `src/lib/audit-log.ts` + `AuditLog` модель
- **Очереди**: `Job` + `JobLog` модели (retry/backoff, lock TTL)

## 9) Уведомления
- `src/lib/notifications.ts` — создание уведомлений, дедупликация LIKE/FOLLOW, @mention
- Уведомления хранятся в `Notification` и доступны через `/api/notifications*`
- @mention и авто‑модерация обрабатываются через event bus (async)

## 10) Observability и диагностика
- `src/lib/api-metrics.ts` — метрики запросов (duration, status, dbQueryCount)
- `GET /api/dev/health` — проверка подключения Prisma/DB (только не‑prod)
- `GET /api/dev/runtime` — runtime/host/env
- `src/lib/error-log.ts` — лог ошибок в БД с авто‑очисткой по retention

## 11) Конфигурация окружения
Базовые переменные:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
AUTH_TRUST_HOST=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Дополнительно (по README):

```
INVITE_ONLY=true
INVITE_CODES=alpha1,alpha2,alpha3
```

Дополнительно (инфраструктура):

```
REDIS_URL=redis://user:pass@host:6379/0
JOB_QUEUE_PROVIDER=postgres
EVENT_BUS_PROVIDER=queue
REALTIME_PROVIDER=redis
```

## 12) Тесты
- Vitest: `npm run test`

## 13) Потоки (high‑level)

### Создание поста
1) Клиент отправляет POST `/api/posts`
2) Валидация Zod → проверка rate‑limit → auth
3) Prisma сохраняет `Post`
4) Создаются уведомления (mentions/replies)

## 14) Приватность и шифрование
См. документ `docs/privacy.md` — выбран подход:
- «облачные чаты» с серверным envelope‑шифрованием (быстро, многодевайсно)
- опциональные «секретные чаты» с E2E (Signal Protocol)
Дополнительно: план E2E «секретных чатов» — `docs/secret-chats-plan.md`.

### Уведомления
- при лайке/подписке/ответе создаются `Notification`
- есть дедупликация для лайков и подписок

### Модерация
- репорты создаются в `/api/admin/reports`
- админ/модератор управляет через `/api/admin/*`
- аудит пишется в `AuditLog`

## 14) Что можно улучшить (технический долг)
- Вынести rate‑limit/abuse store в Redis или другой shared‑store
- Добавить системные интеграционные тесты для ключевых API‑потоков
- Вынести API метрики в реальную observability‑систему (OpenTelemetry/Datadog)

---

Если нужно, могу дополнить документ диаграммами (C4 или Mermaid) и описать конкретный модуль/фичу более глубоко.
