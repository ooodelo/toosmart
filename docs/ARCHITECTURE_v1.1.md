
# ARCHITECTURE_v1.1

## 1. Назначение

Этот документ описывает целевую архитектуру сайта курса по клинингу:

- как организованы файлы и типы контента;
- как устроена многостраничная структура (free/premium);
- как генерируются превью разделов, меню и рекомендации;
- как работают paywall, SEO и оплата через Robokassa.

ARCHITECTURE_v1.1 — актуальная «истина»; все старые описания считаются устаревшими, если им противоречат.

---

## 2. Общий обзор системы

### 2.1. Цель

Сайт:

- продаёт доступ к платной версии курса;
- даёт бесплатную вводную часть и превью платных разделов;
- привлекает трафик через SEO-статьи-рекомендации.

Модель: **freemium**.

### 2.2. Стек

- Контент: Markdown (`content/`).
- Сборка: Node.js-скрипты → статический HTML/CSS/JS в `dist/free` и `dist/premium`.
- Сервер: обычный PHP-хостинг с:
  - PHP 7.4+;
  - SQLite;
  - `.htaccess` (mod_rewrite).
- Платежи: Robokassa (Script-pay), единоразовый доступ к курсу.

---

## 3. Типы контента и структура `content/`

### 3.1. Типы контента

Все материалы лежат в `content/` и делятся на 5 типов:

1. `intro/` — вводная часть курса (полностью открыта в free и premium).
2. `course/` — основные платные разделы.
3. `appendix/` — приложения (только в premium, в конце курса).
4. `recommendations/` — SEO-статьи-рекомендации (полностью открыты).
5. `legal/` — юридические тексты (оферта, политика, cookies, реквизиты, контакты).

### 3.2. Структура каталога

```text
content/
  intro/
    00_intro.md
  course/
    01_*.md
    02_*.md
    ...
  appendix/
    A_*.md
    B_*.md
  recommendations/
    *.md
  legal/
    offer.md
    privacy.md
    cookies.md
    contacts.md
    requisites.md
```

- `NN_*.md` — номер раздела курса (порядок в меню).
- `A_/B_/…` — порядок приложений (A, B, C…).
- Имя файла без префикса — базовый slug.

### 3.3. Front matter для рекомендаций

Файлы `content/recommendations/*.md` используют YAML‑front matter:

```yaml
---
title: "Заголовок карточки и статьи"
teaser: "Краткое описание для карточки (1–2 строки)."
image: "/images/reco/filename.png"
order: 10
slug: "eco-cleaning" # опционально
---
```

- `title` и `teaser` — обязательны.
- `image`, `order`, `slug` — опциональны, с дефолтами.

`teaser` используется только в карточках/JSON, в теле статьи повторяться не обязан.

---

## 4. Публичные URL и соответствие файлов

### 4.1. Free-версия

- Главная (intro):

  - URL: `/`
  - Файл: `dist/free/index.html`

- Раздел курса (preview):

  - URL: `/course/<slug>/`
  - Файл: `dist/free/course/<slug>.html`

- Рекомендация:

  - URL: `/recommendations/<slug>/`
  - Файл: `dist/free/recommendations/<slug>.html`

- Legal (по необходимости):

  - URL: `/legal/<slug>/`
  - Файл: `dist/free/legal/<slug>.html`

### 4.2. Premium-версия

- Раздел курса:

  - URL: `/premium/course/<slug>/`
  - Файл: `dist/premium/course/<slug>.html`

- Приложение:

  - URL: `/premium/appendix/<slug>/`
  - Файл: `dist/premium/appendix/<slug>.html`

### 4.3. Правила формирования slug

- Для `course/NN_name.md` → slug = `name`.
- Для `appendix/A_name.md` → slug = `name`.
- Для `recommendations/file.md` → slug:
  - `frontMatter.slug`, если есть;
  - иначе имя файла без расширения.

---

## 5. Логическое введение и paywall

### 5.1. Модель блоков Markdown

Для выделения введения билдер оперирует блоками:

- `H1` — заголовок раздела (единственный).
- `H2` — подзаголовки второго уровня.
- `hr` — горизонтальный разделитель (`---`).
- `p` — параграф (одна или несколько непустых строк между пустыми).
- `blank` — пустая строка.

### 5.2. Алгоритм логического введения

Функция `extractLogicalIntro(markdown) → { introMd, restMd }`:

1. Найти первый `H1` и игнорировать всё до него.
2. Найти первый значимый блок после `H1` (пропустить `blank`).

#### Ветка A — после H1 сразу `p`

- Собрать подряд идущие параграфы `p` до первого `H2` или `hr`.
- Это логическое введение.
- Ограничить максимум 3 параграфами (лишнее уходит в `restMd`).

#### Ветка B — после H1 `hr`, затем `H2`

- Пропустить `hr` и `blank`.
- Взять первый `H2`.
- Собрать под ним параграфы до следующего `H2` или `hr`.
- Если в тексте `H2` есть «Введение» (без учёта регистра) — использовать все эти параграфы, но не более 3.
- Если «Введение» нет — взять первые 3 параграфа под этим `H2`.

#### Ветка C — после H1 сразу `H2`

- Действовать так же, как в ветке B, но без шага с `hr`.

Оставшаяся часть текста (все параграфы и блоки после выбранного введения) попадает в `restMd`.

Этот алгоритм соответствует всем текущим файлам курса и даёт смысловое введение длиной 2–3 абзаца.

### 5.3. Генерация free-версии разделов курса

Для каждого `content/course/NN_*.md`:

1. Определить slug, title (H1), `introMd`, `restMd`.
2. Отрендерить `introMd` → `introHtml`.
3. Отрендерить `restMd` → `restHtml`.
4. Выделить из `restHtml` первые 1–2 абзаца (`<p>`) как blur‑тизер, при этом ограничение по высоте реализуется через CSS (`max-height` ~ 300 px).
5. Сформировать страницу `/course/<slug>/`:

   - H1 раздела;
   - время чтения (на основе полного текста, см. раздел 6);
   - блок введения с `introHtml`;
   - блок paywall:

     ```html
     <section class="premium-teaser" data-nosnippet>
       <div class="premium-teaser__blurred">
         <!--noindex-->
         <!-- сюда вставляется blur‑тизер: 1–2 абзаца из restHtml -->
         <!--/noindex-->
       </div>
       <div class="premium-teaser__overlay">
         <!-- текст о оставшемся времени + кнопка CTA -->
       </div>
     </section>
     ```

6. Остальную часть `restHtml` в free‑версии **не рендерить**.

### 5.4. Генерация premium-версии разделов

Для каждого `course/NN_*.md`:

- отрендерить весь markdown (H1 + всё содержимое) → `fullHtml`;
- сформировать `/premium/course/<slug>/`:

  - H1;
  - время чтения;
  - `fullHtml`;
  - кнопки навигации «Назад/Далее» в рамках курса.

Никаких blur‑обёрток и noindex для основного текста в premium не используется.

### 5.5. intro и appendix

- `intro/00_intro.md`:

  - free и premium: рендерится полностью;
  - используется как `/` и первый пункт меню.

- `appendix/*`:

  - рендерится только в `dist/premium/appendix/*.html`;
  - логика такая же, как у разделов курса (полный текст, навигация, время чтения).

---

## 6. Меню и время чтения

### 6.1. Меню курса

Меню строится на этапе сборки и передаётся в шаблоны.

Структура элемента:

```ts
type MenuItem = {
  type: "intro" | "course" | "appendix";
  label: string;
  urlFree: string;     // "/" или "/course/<slug>/"
  urlPremium: string;  // "/premium/..."
  readingTime: number; // минуты
  order: number;
};
```

Порядок:

1. intro (один элемент из `00_intro.md`);
2. все `course/NN_*` по возрастанию `NN`;
3. все `appendix/*` по алфавиту префиксов (A, B, C…) — отображаются только в premium.

В free‑шаблонах использовать `urlFree`, в premium — `urlPremium`.

### 6.2. Цепочка «Назад/Далее»

На основе массива `MenuItem` формируется линейный список:

`intro → course[1..N] → appendix[1..M]`.

Для каждого элемента вычисляются:

- `prevUrlPremium` — URL предыдущего пункта;
- `nextUrlPremium` — URL следующего пункта.

Эти ссылки передаются в шаблон premium‑страниц для кнопок «Назад»/«Далее».

### 6.3. Расчёт времени чтения

Для каждого файла `intro`, каждого `course` и `appendix`:

1. Подсчитать `wordCount` по markdown (без front matter).
2. Взять `wordsPerMinute` из конфига (по умолчанию 200).
3. `readingTime = ceil(wordCount / wordsPerMinute)`.

Время чтения:

- показывается рядом с пунктами меню;
- отображается на странице раздела;
- используется в тексте paywall‑виджета (например, «Осталось ещё ~N минут»).

---

## 7. Рекомендации и карусель

### 7.1. Генерация страниц рекомендаций

Для каждого файла `content/recommendations/*.md`:

1. Прочитать front matter, вычислить slug.
2. Отрендерить полный markdown → HTML-страница `/recommendations/<slug>/`.
3. Добавить блок «Про курс» со ссылками на главную и подходящий раздел.

### 7.2. Карусель

Билдер формирует JSON (или JS‑модуль), например `dist/shared/recommendations.json`:

```json
[
  {
    "slug": "eco-cleaning",
    "url": "/recommendations/eco-cleaning/",
    "title": "…",
    "teaser": "…",
    "image": "/images/reco/eco.png",
    "order": 10
  }
]
```

Фронтенд‑шаблон карусели использует этот список для вывода карточек.

Рекомендации **никогда не входят в меню курса**, только в карусель и по прямым URL.

---

## 8. Legal и футер

### 8.1. Legal-страницы

Файлы в `content/legal`:

- конвертируются в страницы `/legal/<slug>/` (free);
- дополнительно из них генерируются HTML‑фрагменты для модалок футера (в `dist/shared/legal/*.html`).

### 8.2. Футер

Футер берёт данные из конфига (см. раздел 9) и строит строку вида:

`© <year> <companyName> · ИНН <inn> · Оферта · Политика конфиденциальности · Реквизиты · Cookies · Контакты`

Ссылки/кнопки открывают соответствующие модальные окна, наполняемые содержимым из `dist/shared/legal/*.html`.

---

## 9. Конфиг сайта и GUI

### 9.1. Конфиг `config/site.json`

Единый источник настроек (цены, тексты, футер, Robokassa и т.д.). Минимальная структура:

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
    "companyName": "ИП Иванов И.И.",
    "inn": "1234567890",
    "year": 2025
  },
  "legal": {
    "offer": "offer.md",
    "privacy": "privacy.md",
    "cookies": "cookies.md",
    "contacts": "contacts.md",
    "requisites": "requisites.md"
  },
  "robokassa": {
    "merchantLogin": "",
    "password1": "",
    "password2": "",
    "isTest": true,
    "invoicePrefix": "TS-COURSE-",
    "successUrl": "/premium/payment-success.php",
    "failUrl": "/premium/payment-fail.php",
    "resultUrl": "/premium/robokassa-result.php"
  },
  "build": {
    "wordsPerMinute": 200
  }
}
```

Билдер читает `site.json` и:

- подставляет цену и валюту;
- подставляет тексты CTA-кнопок;
- подставляет данные футера;
- генерирует конфиг для PHP-скриптов Robokassa.

### 9.2. GUI

GUI — лёгкая утилита (web/desktop), которая:

- читает и редактирует `site.json` через формы:
  - цена, старая цена;
  - тексты CTA;
  - данные футера;
  - маппинг legal-файлов;
  - параметры Robokassa;
- по кнопкам запускает команды сборки через Node:
  - `build:free` (`dist/free`);
  - `build:premium` (`dist/premium`);
  - `build:reco` (рекомендации и JSON).

Бизнес-логики в GUI нет — только редактирование конфига + запуск сборки.

---

## 10. Robokassa и доступ к premium

### 10.1. Архитектурная модель

- База пользователей и платежей: SQLite в `server/private/db.sqlite`.
- Robokassa используется по схеме Script-pay:
  - сайт формирует ссылку/форму оплаты с подписью;
  - Robokassa вызывает `ResultURL` (server callback) → сайт подтверждает платёж и открывает доступ;
  - пользователь видит `SuccessURL`/`FailURL` для UX.

### 10.2. Конфиг Robokassa

Параметры Robokassa в `site.json`:

- `merchantLogin`;
- `password1`, `password2`;
- `isTest`;
- `invoicePrefix`;
- `successUrl`, `failUrl`, `resultUrl`.

PHP-слой читает этот конфиг и:

- формирует подписи `SignatureValue` для формы оплаты;
- проверяет подписи в `ResultURL` и подтверждает платёж.

### 10.3. Поведение CTA «Войти в полную версию»

Одна точка входа (например, `/login-or-buy/`):

- free‑страницы (guest) → кнопка `Войти в полную версию` ведёт сюда;
- на этой странице:
  - если пользователь уже авторизован и оплата есть → редирект в premium;
  - если нет → форма авторизации + кнопка/форма Robokassa.

---

## 11. SEO: robots, sitemap, meta

### 11.1. Индексация

- Intro `/` — `index, follow`.
- Free‑разделы `/course/<slug>/` — `index, follow`. Индексируется введение и интерфейс, платный текст не рендерится.
- Рекомендации `/recommendations/<slug>/` — `index, follow`.
- Premium‑страницы `/premium/...` — `noindex, nofollow` + закрыты `.htaccess`.

Blur‑тизер обёрнут в `data-nosnippet` и `<!--noindex-->`.

### 11.2. robots.txt и sitemap

- `robots.txt`:
  - Allow: `/`, `/course/`, `/recommendations/`, `/legal/`;
  - Disallow: `/premium/`, `/server/`, `/dist/premium/`, `/scripts/`.
- `sitemap.xml`:
  - содержит: `/`, все `/course/<slug>/`, все `/recommendations/<slug>/`, при необходимости `/legal/*`.

### 11.3. Meta и Schema.org

- `<title>` и `<meta name="description">` формируются на базе:
  - `H1` и введения (первые 150–160 символов).
- Open Graph: `og:title`, `og:description`, `og:image`, `og:type`, `og:url`.
- Schema.org:
  - главная: `Course`;
  - рекомендации: `Article` + `isAccessibleForFree: true`;
  - платные разделы (premium): `Article`/`WebPageElement` + `isAccessibleForFree: false`.

---

ARCHITECTURE_v1.1 фиксирует поведение генерации контента, paywall, меню, SEO и интеграции Robokassa. Все реализационные ТЗ и скрипты должны ему соответствовать.
