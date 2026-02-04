# План "Секретные чаты" (Telegram‑style, E2E)

## Почему так
Цель — приватные 1:1 диалоги с максимальной безопасностью, но без потери скорости и UX.
Телеграмм‑подход = **секретные чаты отдельно от облачных**. Это оптимально:
- E2E включается **точечно** (только тем, кому нужно).
- Нет риска замедлить/сломать обычные чаты.
- Бэкапы и мульти‑девайс остаются в облачных чатах.

## Криптография (оптимально)
**Не MTProto.** Используем **Signal Protocol (X3DH + Double Ratchet)** — лучшая практика.
- **Forward secrecy** и **post‑compromise security**.
- Хорошие библиотеки (libsignal).

## Ограничения (как в Telegram)
- **Только 1:1**.
- **Нет облачной синхронизации** (секретный чат живёт на устройстве).
- **Нет серверного поиска/модерации**.
- Метаданные (кто/кому/когда) сервер всё равно видит.

## UX/продукт
- В профиле/диалоге кнопка: **“Начать секретный чат”**.
- Явный бейдж **E2E**.
- Экран объяснения: “нет бэкапа/поиска, только это устройство”.
- Опция таймера самоуничтожения (client‑side + delete на сервере по TTL).
- “Проверка ключей” (safety number / QR).
- Уведомления о смене ключей.
  - Реализация: Security‑уведомление при регистрации нового устройства.

## Архитектура данных (минимум)
Добавляем таблицы ключей (публичные данные):
- `UserDevice` (id, userId, deviceLabel, createdAt, lastSeenAt)
- `UserIdentityKey` (deviceId, publicKey, createdAt)
- `UserSignedPreKey` (deviceId, keyId, publicKey, signature, createdAt, expiresAt)
- `UserOneTimePreKey` (deviceId, keyId, publicKey, consumedAt)

Для сообщений:
- `Conversation.encryptionMode` = `CLOUD` | `E2E`
- `Message.contentCiphertext` хранит **e2e payload** (base64)
- `Message.contentKeyId` **не используется** для E2E (server не расшифровывает)
- Доп. поле по необходимости: `Message.e2eHeader` (если отделяем header от body)

## API (план)
- `GET /api/e2e/devices` — список устройств и identity keys
- `POST /api/e2e/devices` — регистрация устройства + identity key
- `POST /api/e2e/prekeys` — загрузка signed prekey + one‑time prekeys
- `GET /api/e2e/bundle?userId=...&deviceId=...` — key bundle (+ trust status)
- `GET /api/e2e/safety?deviceId=...&peerDeviceId=...` — safety number
- `GET/POST /api/e2e/trust` — trust status/confirm
- `POST /api/dm/start` — поддержка `mode: "secret"`
- `POST /api/dm/[id]/send` — в режиме E2E принимает ciphertext без расшифровки

## Клиент (web/iOS)
**Web**:
- Библиотека libsignal (JS/TS).
- Локальное безопасное хранение ключей (IndexedDB + WebCrypto).
**iOS**:
- libsignal‑client (Swift/Obj‑C).
- Secure Enclave / Keychain.

## Шаги внедрения (пошагово)
1. **Схема БД + API ключей** (без включения E2E).
2. **Клиентская генерация ключей** + публикация bundle.
3. **Создание секретного чата** (Conversation.encryptionMode=E2E).
4. **Отправка/приём E2E** (server хранит только ciphertext).
5. **Safety Number + предупреждения**.
6. **Self‑destruct timer**.

## Текущий статус в репозитории
- Добавлены таблицы ключей и API:
  - `GET /api/e2e/devices`
  - `POST /api/e2e/devices`
  - `POST /api/e2e/prekeys`
  - `GET /api/e2e/bundle`
- Добавлен флаг `Conversation.encryptionMode` и отправка ciphertext для E2E.
- Добавлена поддержка TTL (`Message.expiresAt`) для self‑destruct.
  - API: `POST /api/dm/[id]/send` принимает `e2e.ttlSeconds`.
- Добавлен trust‑store и safety number endpoint.

## Риски и контроль
- Потеря устройства = потеря секретных чатов.
- Восстановление только через новое рукопожатие.
- Юридическая/модераторская зона — E2E непрозрачно.
 - Все ключевые E2E endpoints защищены rate‑limit.
