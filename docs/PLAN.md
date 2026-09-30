# FPL Captain Analytics — план переделки CLI → веб-приложение

## Контекст

Сейчас проект — CLI на Node.js/TypeScript (`update-league`, настраивается через
`league_id` и `my_id`), который считает суммарные очки капитанства участников
мини-лиги Fantasy Premier League через неофициальный FPL API.

Цель — full-stack веб-приложение с аналитикой капитанских выборов, пригодное
для портфолио: чистая архитектура, тесты, CI, живое демо. Существующую логику
подсчёта **не переписываем**, а выносим в общий пакет, которым пользуются и
веб, и CLI.

## Архитектура

Монорепозиторий: pnpm workspaces + Turborepo.

```
fpl-captain/
├── apps/
│   ├── web/          Next.js (App Router) — UI + API routes + cron endpoint
│   └── cli/          тонкая обёртка над packages/core (бывший update-league)
├── packages/
│   ├── fpl-client/   типизированный клиент FPL API, Zod-схемы ответов
│   ├── core/         чистые функции подсчёта (без I/O)
│   └── db/           Drizzle-схема, миграции, репозитории
├── docker-compose.yml  локальный Postgres
└── docs/PLAN.md
```

Принципы:
- `core` не делает сетевых запросов и не знает про БД — только чистые функции.
- Весь доступ к FPL API — на сервере (у FPL API нет CORS). Браузер ходит только
  в наш API / RSC.
- Данные завершённых туров берём из БД, а не из FPL API.

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 15, React Server Components, Tailwind CSS, shadcn/ui |
| Графики | Recharts |
| Клиентские данные | TanStack Query (только где нужна интерактивность) |
| Валидация | Zod |
| БД | PostgreSQL (локально Docker, прод — Neon) + Drizzle ORM |
| Фоновые задачи | Vercel Cron → защищённый API route синхронизации |
| Тесты | Vitest, MSW (моки FPL API на фикстурах), Playwright |
| Качество | ESLint, Prettier, TypeScript strict |
| CI/CD | GitHub Actions (lint, typecheck, test, build), деплой на Vercel |
| Мониторинг | Sentry |

## FPL API (используемые эндпоинты)

База: `https://fantasy.premierleague.com/api`

- `/bootstrap-static/` — игроки, команды, туры (`finished`, `data_checked`)
- `/leagues-classic/{league_id}/standings/` — участники лиги (пагинация)
- `/entry/{entry_id}/event/{gw}/picks/` — состав, капитан, вице, `multiplier`, `active_chip`
- `/event/{gw}/live/` — очки игроков за тур

Правила подсчёта:
- Очки капитана = очки игрока за тур × `multiplier` из picks (2, или 3 при Triple Captain).
- Если капитан не сыграл, `multiplier` переходит к вице-капитану — берём игрока
  с `multiplier > 1` из ответа picks, а не поле `is_captain`.
- Двойной тур: очки за тур в live уже суммарные.
- Тур считается финальным, только когда `finished && data_checked`.

## Модель данных

- `leagues` — id, name, last_synced_at
- `managers` — entry_id, player_name, team_name
- `league_members` — league_id, entry_id
- `gameweeks` — id, finished, data_checked, deadline
- `players` — id, web_name, team_id, position
- `captain_picks` — entry_id, gw, captain_player_id, vice_player_id,
  effective_captain_id, multiplier, base_points, captain_points, active_chip,
  best_possible_points (лучший игрок стартового состава × multiplier)
  PK: (entry_id, gw)

## Функциональность UI

1. **Главная** — ввод ID лиги, переход на `/league/[id]`.
2. **Рейтинг лиги** — сумма очков капитанства, место, изменение за последний тур.
3. **Тепловая карта** менеджер × тур: очки капитана, цвет по результату,
   тултип с именем капитана и чипом.
4. **График накопительных очков** по турам, с переключением менеджеров.
5. **«Упущенные очки»** — разница между лучшим возможным капитаном из стартового
   состава и фактическим выбором; рейтинг «самых неудачных» решений.
6. **Трекер Triple Captain** — кто и когда использовал, по половинам сезона.
7. **Страница менеджера** `/league/[id]/manager/[entryId]` — история капитанов,
   самые частые выборы.

Общее: тёмная тема, адаптив (мобильные в приоритете), skeleton-загрузка,
пустые и ошибочные состояния, мета-теги для шаринга ссылки на лигу.

## Синхронизация

- Cron раз в час вызывает `POST /api/sync` (защищён секретом `CRON_SECRET`).
- Проверяет `bootstrap-static`; для туров с `finished && data_checked`, которых
  ещё нет в БД, подтягивает picks всех участников отслеживаемых лиг и live-очки.
- Запросы к FPL API — с ограничением параллельности (например, 5 одновременно),
  повторными попытками с экспоненциальной задержкой и таймаутом.
- Первый запрос новой лиги запускает полную синхронизацию её истории.
- Идущий тур можно показывать «вживую» с пометкой «предварительно» (без записи в БД).

## Фазы

Работать строго по одной фазе. В конце каждой фазы: всё собирается, тесты
зелёные, коммит.

### Фаза 1 — монорепо и ядро
- Настроить pnpm workspaces + Turborepo, общий tsconfig, ESLint, Prettier.
- Вынести логику из CLI в `packages/core` и `packages/fpl-client`.
- Zod-схемы для всех используемых ответов FPL API.
- Фикстуры реальных ответов API в `packages/fpl-client/fixtures`.
- Vitest-тесты `core`: обычный тур, Triple Captain, замена капитана на вице,
  двойной тур, пропущенный тур.
- `apps/cli` работает как раньше, но через новые пакеты.
- **Готово, когда:** `pnpm test` и `pnpm typecheck` проходят, CLI выдаёт те же
  результаты, что и до рефакторинга.

### Фаза 2 — БД и синхронизация
- `docker-compose.yml` с Postgres, `packages/db` на Drizzle, миграции.
- Сервис синхронизации (используется и CLI, и API route).
- Команда CLI `sync --league <id>` для ручного запуска.
- Тесты синхронизации с MSW.
- **Готово, когда:** после `sync` в БД лежат все завершённые туры лиги,
  повторный запуск идемпотентен.

### Фаза 3 — веб: рейтинг лиги
- `apps/web` на Next.js, Tailwind, shadcn/ui, тёмная тема.
- Главная и `/league/[id]` с рейтингом.
- `POST /api/sync` + конфиг Vercel Cron.
- Деплой на Vercel + Neon, переменные окружения.
- **Готово, когда:** есть публичная ссылка, на которой открывается рейтинг
  реальной лиги.

### Фаза 4 — аналитика
- Тепловая карта, график накопительных очков, «упущенные очки», трекер
  Triple Captain, страница менеджера.
- **Готово, когда:** все экраны работают на мобильном и десктопе.

### Фаза 5 — качество и оформление
- Playwright e2e для основных сценариев (на моках FPL API).
- GitHub Actions: lint, typecheck, unit, e2e, build.
- Sentry.
- README: скриншоты, ссылка на демо, схема архитектуры, как запустить локально.
- **Готово, когда:** CI зелёный, README готов для показа работодателю.

## Вне скоупа (пока)

Авторизация, избранные лиги, уведомления, поддержка H2H-лиг.
