# План приватности и шифрования (старт)

## Цели
- Конфиденциальность личных сообщений и чувствительных данных пользователей.
- Предсказуемая, проверяемая криптография (без «самописных» протоколов).
- Баланс: скорость, многодевайсность и модерация.

## Основное решение (оптимально для нашего продукта)
1. **По умолчанию — «облачные чаты» с серверным шифрованием (envelope encryption)**  
   Быстро, поддерживает несколько устройств и бэкапы, при утечке БД нет plaintext.
2. **Опционально — «секретные чаты» с E2E (как в Telegram: отдельный режим)**  
   Только 1:1, полный E2E, без хранения ключей на сервере.

Мы **не** берем MTProto. Для E2E оптимально использовать **Signal Protocol**
(X3DH + Double Ratchet) — де‑факто стандарт и лучше всего аудирован.

## Этапы

### Этап 0 — база приватности (сейчас)
- Инвентаризация данных (PII/не‑PII).
- Redaction в логах, строгий доступ к админке.
- Документ угроз и политики доступа.

### Этап 1 — серверное шифрование сообщений (MVP)
- Envelope encryption:  
  - master key в KMS (prod) / локальный ключ (dev).
  - на каждое сообщение — свой DEK (AES‑256‑GCM), DEK хранится только в зашифрованном виде.
- В БД хранить ciphertext + iv + tag + keyId + wrapped‑DEK.
- Сервер расшифровывает только для участников.
- Минусы: сервер по‑прежнему видит сообщения в рантайме.

### Этап 2 — E2E «секретные чаты» (1:1)
**Протокол:** Signal (X3DH + Double Ratchet).  
**Сторона сервера** хранит только зашифрованные сообщения и ключевые пакеты.

## Модель угроз (кратко)
- Утечка БД: в облачных чатах данные зашифрованы (MVP), в секретных — E2E.
- Компрометация сервера в рантайме: защищает только E2E.
- Потеря устройства: восстановление только для облачных чатов.

## Ключи и хранение (план)

### Облачные чаты (этап 1)
- **KEK** (key‑encryption key) в KMS.
- **DEK** (data‑encryption key) на сообщение (AES‑256‑GCM).
- В БД: `ciphertext`, `iv`, `tag`, `keyId`.

### Секретные чаты (этап 2)
На клиентах:
- **Identity Key** (долгоживущий).
- **Signed PreKey** (ротация раз в N дней).
- **One‑time PreKeys** (пакет на сервере).

На сервере:
- Публичные ключи и pre‑keys.
- **Нет** приватных ключей.

## Минимальные сущности БД (E2E)
- `UserDevice` (id, userId, label, createdAt, lastSeenAt)
- `UserIdentityKey` (deviceId, publicKey, createdAt)
- `UserSignedPreKey` (deviceId, keyId, publicKey, signature, createdAt, expiresAt)
- `UserOneTimePreKey` (deviceId, keyId, publicKey, consumedAt)

## Структура хранения DM (MVP)
- `Message.contentCiphertext` — ciphertext
- `Message.contentIv` / `Message.contentTag` — параметры AES‑GCM
- `Message.contentKeyId` — id KEK
- `Message.contentDekWrapped` / `Message.contentDekIv` / `Message.contentDekTag` — зашифрованный DEK
- `Conversation.encryptionMode` — `CLOUD` | `E2E`
- `Message.expiresAt` — TTL для self‑destruct (используется в E2E)

## API (E2E, готово)
- `GET /api/e2e/devices` — список устройств и identity keys
- `POST /api/e2e/devices` — регистрация устройства + identity key
- `POST /api/e2e/prekeys` — загрузка signed prekey + one‑time prekeys
- `GET /api/e2e/bundle?userId=...&deviceId=...` — выдача key bundle (+ trust status)
- `POST /api/dm/[id]/send` — принимает только ciphertext в режиме E2E (опц. `ttlSeconds`)
- `GET /api/e2e/safety?deviceId=...&peerDeviceId=...` — safety number
- `GET/POST /api/e2e/trust` — проверка и подтверждение trust

## Ограничение запросов
- Все E2E endpoints защищены rate‑limit.

## Сигналы безопасности
- Security‑уведомление создаётся при регистрации нового устройства.

## UX (как у Telegram)
- Переключатель **«Секретный чат»** (1:1).
- Явный бейдж «E2E».
- Предупреждение: нет поиска/бэкапа в секретном режиме.

## Ограничения
- Метаданные (кто/когда/кому) сервер всё равно видит.
- Модерация E2E невозможна без client‑side «report with decrypt».
- Для группового чата нужен MLS или серверное шифрование.

## Следующие шаги в этом репозитории (предлагаю начать с этого)
1. Согласовать этап 1 vs этап 2 как первый инкремент.
2. Добавить env‑переменные: `KMS_PROVIDER`, `KMS_KEY_ID`, `ENCRYPTION_MASTER_KEY` (base64/hex, 32 bytes).
3. Таблицы ключей и режим E2E добавлены (можно включать для отдельных диалогов).

## Секретные чаты (E2E, Telegram‑style)
Подробный план: `docs/secret-chats-plan.md`.

## Переменные окружения (MVP)
- `ENCRYPTION_MASTER_KEYS` — keyring `keyId:base64,keyId:hex` (ротация).
- `ENCRYPTION_ACTIVE_KEY_ID` — активный ключ для новых сообщений.
- `ENCRYPTION_MASTER_KEY` — 32 bytes (base64/hex), если не используется keyring.
- `ENCRYPTION_MASTER_KEY_ID` — id ключа для `ENCRYPTION_MASTER_KEY` (дефолт `v1`).
- `DM_CACHE_PLAINTEXT` — `true/false` (по умолчанию `false`), отключает хранение plaintext в кэше.

## Кэш и E2E
- Для `E2E` диалогов plaintext не кэшируется (кэш только для `CLOUD`).

## Backfill (если есть старые plaintext‑сообщения)
Скрипт: `scripts/encrypt-dm-messages.mjs`  
Запускать после установки `ENCRYPTION_MASTER_KEY`.

## Ротация ключей (оптимально)
1. Добавить новый ключ в `ENCRYPTION_MASTER_KEYS`.
2. Установить `ENCRYPTION_ACTIVE_KEY_ID` на новый ключ.
3. Запустить backfill для пере‑шифровки старых сообщений (по желанию).
