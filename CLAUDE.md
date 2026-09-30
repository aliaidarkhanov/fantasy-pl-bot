# FPL Captain Analytics

Full-stack приложение для аналитики очков капитанства в мини-лигах FPL.
Полный план и архитектура — в `docs/PLAN.md`. Прочитай его перед началом работы.

## Правила работы

- Работаем по одной фазе из `docs/PLAN.md` за раз. Не забегай вперёд.
- Перед крупными изменениями сначала предложи план и дождись подтверждения.
- Перед добавлением новой зависимости объясни, зачем она нужна.
- `packages/core` — только чистые функции, без сети и БД.
- К FPL API обращаемся только с сервера; ответы валидируем через Zod.
- Каждая новая логика подсчёта покрывается тестами Vitest.
- Секреты только в `.env` (он в `.gitignore`), в `.env.example` — пустые ключи.
- В конце шага запускай `pnpm typecheck` и `pnpm test` и сообщай результат.

## Команды

Node 22 (`.nvmrc`), pnpm через corepack (`corepack enable`).

- `pnpm install` — установить зависимости
- `pnpm typecheck` — tsc во всех пакетах (через Turborepo)
- `pnpm test` — Vitest во всех пакетах (через Turborepo)
- `pnpm lint` — ESLint (typed) по всему репо
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm cli update-league [--force]` / `pnpm cli show` — CLI (tsx, без сборки)

`pnpm show` не работает — это встроенная команда pnpm (`pnpm view`), поэтому
CLI запускается через `pnpm cli <команда>`.
