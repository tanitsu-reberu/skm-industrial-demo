# PLAN - SKM PostgreSQL migration

> Orchestrator-maintained. Last updated: 2026-07-16

## Goal

Перенести production-схему и данные сайта SKM с SQLite/Turso на PostgreSQL 18 в российском дата-центре Timeweb, подключить production-приложение к PostgreSQL и подтвердить работу авторизации, заявок, заказов, платежей и админ-панели.

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Existing Next.js App Router | UI и маршруты сохраняются без лишнего переписывания |
| Backend | Existing server actions/API with PostgreSQL adapter | Минимальный объём изменений и сохранение текущего контракта |
| DB | Timeweb Managed PostgreSQL 18, database `skm`, app user `skm_ap` | Российский дата-центр, SSL, бэкапы и отдельный пользователь без superuser |
| Design | Existing dark SKM UI | Миграция не меняет внешний вид |

## Phases

- [x] **Phase 0** - Plan approved
- [x] **Phase 1** - Schema and source-data audit
- [x] **Phase 2** - PostgreSQL schema and data migration
- [x] **Phase 3** - Application adapter and production environment
- [x] **Phase 4** - Integration and QA (read-only production smoke checks completed)

## Risks (accepted / mitigated)

| Risk | Mitigation | Status |
|------|------------|--------|
| SQLite/Turso и PostgreSQL различаются по синтаксису и типам | Миграция через явное описание схемы и транзакции | Mitigated |
| Незавершённые пользовательские изменения в рабочем дереве | Не откатывать dirty worktree, менять только согласованные файлы | Mitigated |
| Потеря production-данных при переключении | Источник сохранён в Turso, количества строк сопоставлены после миграции | Mitigated |
| Секреты могут попасть в логи | Не печатать `.env.local` и значения переменных | Mitigated |
| Временная недоступность при релизе | Сборка завершена до переключения, public endpoints отвечают штатно | Mitigated |
| Пользователь `skm_app` может быть нужен старому деплою | Не удалять до подтверждения всех подключений | Mitigated |

## Agent task log

| Date | Agent | Task | Status |
|------|-------|------|--------|
| 2026-07-16 | Explorer 1 - PostgreSQL architect | Сравнить SQLite/Turso и PostgreSQL схему | Completed |
| 2026-07-16 | Explorer 2 - Migration engineer | Определить источник данных и план переноса | Completed |
| 2026-07-16 | Explorer 3 - Timeweb DevOps | Проверить production env и безопасную установку `POSTGRES_URL` | Completed |
| 2026-07-16 | Explorer 4 - QA/security | Подготовить smoke-тесты после переключения | Completed |
| 2026-07-16 | Backend worker A | Добавить `pg`, миграционный и smoke-скрипты | Completed |
| 2026-07-16 | Backend worker B | Переключить `lib/db.ts` на PostgreSQL | Completed manually after worker timeout |
| 2026-07-16 | Orchestrator | Run migration, build, deploy, and production smoke checks | Completed |

## Open questions

- Запись-счётчик и production smoke checks подтверждены; state-changing QA намеренно не выполнялся.
- Production приложение перезапустилось после публикации `main` и добавления переменной.
- Решить судьбу `skm_app` после отдельной проверки всех подключений.

## Out of scope (for now)

- Удаление пользователя `skm_app` без отдельной проверки и подтверждения.
- Изменение дизайна и бизнес-логики сайта, не связанное с миграцией.
- Перенос домена, DNS или SSL-настроек.
