# Быстрый старт: сборка и деплой

## Требования
- Node.js 12+ (см. `package.json`), npm.
- Для предпросмотра — `live-server` (устанавливается через devDependencies).
- Для premium-платежей на хостинге нужен PHP 7.4+ и SQLite, доступ к Robokassa.

## Установка и сборка
```bash
npm install               # установка зависимостей
npm run build             # полная сборка free + premium + recommendations
npm run build:free        # только бесплатная версия
npm run build:premium     # только закрытая версия
npm run build:recommendations # только статьи-рекомендации
npm run clean             # очистить dist/
```
- При сборке конфиг читается из `config/site.json`; при отсутствии используется `DEFAULT_SITE_CONFIG` из `scripts/lib/build.js`.
- Шаблоны берутся из `src/template.html` и `src/template-paywall.html`; ресурсы копируются из `src/assets` и `src/premium/assets` (если есть).

## Предпросмотр
```bash
npm run preview:free      # live-server dist/ на 3003 (free)
npm run preview:premium   # live-server dist/ на 3004 (premium)
```

## Деплой
1. Выполнить `npm run build`.
2. Залить каталоги:
   - `dist/free/` — в корень публичного сайта.
   - `dist/premium/` — в `/premium/` на сервере вместе с файлами PHP (`server/*`).
   - `dist/shared/` и `dist/assets/` — в общедоступный каталог, чтобы free и premium ссылались на общие JSON/стили.
3. Настроить переменные Robokassa в `config/site.json` и на сервере (логин, пароли, боевой/тестовый режим).
4. Убедиться, что PHP может писать в SQLite-базу и сессии; включить HTTPS для страниц оплаты/логина.

---

## Полный список NPM-команд

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск dev-сервера Vite для разработки |
| `npm run build` | Полная сборка: Vite + генерация HTML + открытие превью |
| `npm run build:assets` | Сборка только статических ресурсов (CSS/JS) через Vite |
| `npm run build:free` | Сборка только бесплатных статей |
| `npm run build:premium` | Сборка только премиум статей |
| `npm run build:recommendations` | Сборка только рекомендаций |
| `npm run build:all` | Сборка всех типов контента |
| `npm run preview` | Превью через встроенный сервер Vite |
| `npm run preview:dist` | Превью собранного сайта на порту 3003 |
| `npm run dev:lan` | Dev-сервер с доступом по локальной сети |
| `npm run admin` | Запуск админ-панели (порт 3001) |
| `npm run clean` | Очистка папки dist |
| `npm run lint:links` | Проверка ссылок в проекте |
| `npm run lint:links:fix` | Автоисправление ссылок |

---

## Админ-панель (`npm run admin`)

Запускается на `http://localhost:3001`

### Возможности

| Функция | Описание |
|---------|----------|
| Управление ценами | Редактирование текущей/старой цены, валюты |
| Настройка футера | Название компании, ИНН, год |
| Запуск сборки | Выбор целевой сборки (free/premium/recommendations/all) |
| Просмотр разделов | Список всех md-файлов курса и рекомендаций |
| Редактирование модального окна оплаты | Изменение HTML payment-modal |
| Настройка Robokassa | Параметры платёжной системы |

### API endpoints

- `GET/POST /api/config` — конфигурация сайта
- `POST /api/build` — запуск сборки
- `GET /api/sections` — список разделов контента
- `GET/POST /api/payment-modal` — модальное окно оплаты

---

## Структура контента

```
content/
├── course/              # Основной курс (10 разделов)
│   ├── 01_раздел_1_основы_основ.md
│   ├── 02_раздел_2_инструменты.md
│   ├── ...
│   └── 10_раздел_10_специальные_задачи.md
│
├── recommendations/     # Бесплатные рекомендательные статьи
│   ├── eco-cleaning.md
│   └── ...
│
├── intro/               # Вводные материалы
├── appendix/            # Приложения
├── legal/               # Юридические документы
└── images/              # Изображения для контента
```

---

## Конфигурация (`config/site.json`)

| Секция | Описание |
|--------|----------|
| `pricing` | Цены: `currentAmount`, `originalAmount`, `currency` |
| `ctaTexts` | Тексты кнопок призыва к действию |
| `footer` | Данные компании: название, ИНН, год |
| `robokassa` | Настройки платёжной системы |
| `features` | Флаги функций (`cookiesBannerEnabled`) |
| `build` | Параметры сборки (`wordsPerMinute` для расчёта времени чтения) |
