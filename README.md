# TooSmart — Платформа для онлайн-курсов

Статический генератор сайта курса с freemium-моделью доступа.

## Архитектура

Проект реализует архитектуру согласно [ARCHITECTURE_v1.1](docs/ARCHITECTURE_v1.1.md):

- **Free-версия** (`dist/free`) — открытая часть с логическим введением и preview разделов
- **Premium-версия** (`dist/premium`) — полный курс с навигацией и приложениями
- **Shared** (`dist/shared`) — общие ресурсы (legal документы, JSON рекомендаций)

## Структура контента

```
content/
  intro/
    00_intro.md              # Вводная страница (полностью открыта)
  course/
    01_*.md, 02_*.md, ...    # Основные разделы курса
  appendix/
    A_*.md, B_*.md, ...      # Приложения (только premium)
  recommendations/
    *.md                     # SEO-статьи с front matter
  legal/
    offer.md, privacy.md, ... # Юридические документы
```

### Правила именования

- **Intro**: `00_intro.md` (order=0)
- **Course**: `NN_название.md` где NN — порядковый номер (01, 02, 03...)
- **Appendix**: `A_название.md`, `B_название.md` (буквенные префиксы)
- **Recommendations**: любое имя, slug берется из front matter

## Команды сборки

```bash
# Установка зависимостей
npm install

# Полная сборка (free + premium + recommendations)
npm run build

# Сборка только free-версии
npm run build:free

# Сборка только premium-версии
npm run build:premium

# Предпросмотр
npm run preview:free    # http://localhost:3001
npm run preview:premium # http://localhost:3002

# Очистка dist/
npm run clean
```

## Конфигурация

Все настройки проекта хранятся в `config/site.json`:

```json
{
  "domain": "https://toosmart.ru",
  "pricing": {
    "originalAmount": 10000,
    "currentAmount": 3400,
    "currency": "RUB"
  },
  "ctaTexts": {
    "enterFull": "Войти в полную версию",
    "next": "Далее",
    "goToCourse": "Перейти к курсу"
  },
  "footer": {
    "companyName": "ООО \"Название компании\"",
    "inn": "0000000000",
    "year": 2024
  },
  "legal": {
    "offer": "offer.md",
    "privacy": "privacy.md",
    "cookies": "cookies.md"
  },
  "robokassa": {
    "merchantLogin": "",
    "password1": "",
    "password2": "",
    "isTest": true
  },
  "build": {
    "wordsPerMinute": 180
  }
}
```

## Логическое введение

Билд автоматически извлекает логическое введение из каждого раздела курса по алгоритму:

- **Ветка A**: После H1 идут параграфы → берем до 3-х параграфов
- **Ветка B**: После H1 идет HR, затем H2 → анализируем H2 на слово "введение"
- **Ветка C**: После H1 сразу идет H2 → анализируем H2 на слово "введение"

Введение показывается в free-версии полностью, остаток — blur-тизер (1-2 параграфа).

## Меню курса

Меню формируется автоматически:

- **Free**: intro → course (БЕЗ recommendations и legal)
- **Premium**: intro → course → appendix

Recommendations и legal доступны ТОЛЬКО по прямым URL и через карусель.

## Front Matter для рекомендаций

```markdown
---
title: "Экологичные средства для уборки"
teaser: "Краткое описание для карточки"
image: "/images/reco/eco.png"
order: 10
slug: "eco-cleaning"
---

# Контент статьи
```

## Навигация Premium

Цепочка навигации в premium следует порядку:

```
intro → course[1..N] → appendix[1..M]
```

Каждая страница имеет ссылки "Назад" и "Далее" по этой цепочке.

## Развертывание

1. **Сборка проекта:**
   ```bash
   npm run build
   ```

2. **Копирование на сервер:**
   ```bash
   # Free-версия в корень сайта
   rsync -avz dist/free/ user@server:/var/www/html/

   # Premium-версия в /premium/
   rsync -avz dist/premium/ user@server:/var/www/html/premium/

   # Shared ресурсы
   rsync -avz dist/shared/ user@server:/var/www/html/shared/
   ```

3. **Настройка PHP:**
   - Скопировать `dist/premium/*.php` на сервер
   - Настроить параметры Robokassa в `config/site.json`
   - Создать базу SQLite для пользователей

## SEO

- Free-страницы: `index, follow` (введение + preview)
- Premium-страницы: `noindex, nofollow` + закрыты .htaccess
- Blur-тизер обернут в `data-nosnippet` и `<!--noindex-->`
- Генерируются robots.txt и sitemap.xml

## Документация

- [ARCHITECTURE_v1.1](docs/ARCHITECTURE_v1.1.md) — целевая архитектура
- [TZ_razrabotchika_v1.1](docs/TZ_razrabotchika_v1.1.md) — техническое задание
- [BUILD_REFACTOR_GUIDE_v1.1](docs/BUILD_REFACTOR_GUIDE_v1.1.md) — гайд по рефакторингу

## Технологии

- **Сборка**: Node.js + marked + DOMPurify
- **Фронтенд**: Vanilla JS + CSS
- **Бэкенд**: PHP 7.4+ + SQLite
- **Платежи**: Robokassa (Script-pay)

## Лицензия

MIT
