
# ТЗ_разработчика_v1.1

## 1. Цель

Реализовать и доработать проект сайта курса по клинингу в полном соответствии с ARCHITECTURE_v1.1:

- многостраничная структура (`/course/<slug>/`, `/premium/...`, `/recommendations/...`);
- корректный paywall (логическое введение + blur‑тизер);
- меню курса и время чтения;
- рекомендации и legal‑страницы;
- конфиг `site.json` + (опционально) GUI для настроек;
- базовая интеграция Robokassa (без сложной логики чеков).

Результат: рабочие сборки `dist/free` и `dist/premium` + PHP‑слой для авторизации/Robokassa, задокументированные в README.

---

## 2. Входные данные

- Существующий код билд‑скрипта (`scripts/`).
- Существующие шаблоны (`src/`).
- Структура Markdown‑файлов в `content/` (intro, 10 разделов курса, приложения, рекомендации, legal).
- Документ ARCHITECTURE_v1.1.

---

## 3. Задачи по сборке (Node.js)

### 3.1. Структура `content/` и URL

1. Привести билд к использованию только следующей структуры:

   ```text
   content/
     intro/00_intro.md
     course/NN_*.md
     appendix/A_*.md, B_*.md
     recommendations/*.md
     legal/*.md
   ```

2. Удалить старые сущности (`articles/`, ручной список веток/якорей).

3. Реализовать генерацию:

   - free:
     - `/` → `dist/free/index.html`;
     - `/course/<slug>/` → `dist/free/course/<slug>.html`;
     - `/recommendations/<slug>/` → `dist/free/recommendations/<slug>.html`;
     - `/legal/<slug>/` → `dist/free/legal/<slug>.html` (по необходимости).
   - premium:
     - `/premium/course/<slug>/` → `dist/premium/course/<slug>.html`;
     - `/premium/appendix/<slug>/` → `dist/premium/appendix/<slug>.html`.

4. Slug’и формировать по имени файла (без префикса и расширения), с учётом `frontMatter.slug` у рекомендаций.

### 3.2. Алгоритм логического введения

Реализовать функцию `extractLogicalIntro(markdown)` по алгоритму из ARCHITECTURE_v1.1:

- оперировать блоками `H1`, `H2`, `hr (---)`, `p`;
- ветки A/B/C (после `H1` → `p` / `hr`+`H2` / `H2`);
- возвращать `{ introMd, restMd }`.

Использовать эту функцию для всех файлов `course/NN_*.md` при сборке free и для вычисления времени чтения (на основе полного текста).

### 3.3. Free‑страницы разделов курса

Для каждого курса:

1. Преобразовать `introMd` в `introHtml`.
2. Преобразовать `restMd` в `restHtml`.
3. Выделить из `restHtml` 1–2 первых параграфа `<p>` для blur‑тизера.
4. Сформировать `/course/<slug>/`:

   - H1;
   - время чтения (см. п. 3.5);
   - `introHtml`;
   - блок `premium-teaser`:

     - `div.premium-teaser__blurred` с `data-nosnippet` и обёрткой `<!--noindex--> ... <!--/noindex-->`;
     - `div.premium-teaser__overlay` с текстом «осталось ~N минут» и CTA‑кнопкой.

5. Остальной `restHtml` в free‑страницу не включать.

### 3.4. Premium‑страницы курса и приложений

- Для каждого `course/NN_*.md` и `appendix/*.md`:

  - отрендерить полный markdown → `fullHtml`;
  - сформировать `/premium/course/<slug>/` или `/premium/appendix/<slug>/`:

    - H1;
    - время чтения;
    - `fullHtml`;
    - кнопки «Назад/Далее» (передаём URL из навигационной структуры, см. 3.5).

### 3.5. Меню курса и навигация

1. На этапе сборки построить массив `MenuItem`:

   ```ts
   type MenuItem = {
     type: "intro" | "course" | "appendix";
     label: string;
     urlFree: string;
     urlPremium: string;
     readingTime: number;
     order: number;
   };
   ```

2. Порядок:

   - intro;
   - все `course/NN_*` по `NN`;
   - все `appendix/*` по A/B/C… (для premium).

3. Время чтения:

   - посчитать количество слов по markdown;
   - взять `wordsPerMinute` из `config/site.json`;
   - `readingTime = ceil(words / wordsPerMinute)`.

4. На основе массива `MenuItem` вычислить `prevUrlPremium` и `nextUrlPremium` для кнопок `Назад/Далее` на premium‑страницах.

5. Меню передавать в шаблоны:

   - free‑шаблон → использовать `urlFree`;
   - premium‑шаблон → `urlPremium`.

### 3.6. Рекомендации

1. Для `content/recommendations/*.md`:

   - прочитать front matter (`title`, `teaser`, `image`, `order`, `slug?`);
   - сгенерировать `/recommendations/<slug>/`;
   - собрать JSON `dist/shared/recommendations.json`:

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

2. В free‑шаблонах блок «Рекомендуем» должен строиться по этому JSON (без хардкода карточек).

### 3.7. Legal

1. Для каждого `content/legal/*.md`:

   - сгенерировать страницу `/legal/<slug>/` (опционально);
   - сгенерировать HTML‑фрагмент для модалки в `dist/shared/legal/<slug>.html`.

2. Билд должен встраивать в шаблон ссылки или data‑атрибуты, по которым фронтенд подгружает эти фрагменты.

---

## 4. Конфиг и команды сборки

### 4.1. `config/site.json`

Реализовать чтение `config/site.json` со структурой:

- `domain`;
- `pricing` (original/current/currency);
- `ctaTexts` (enterFull / next / goToCourse);
- `footer` (companyName / inn / year);
- `legal` (имена файлов для offer/privacy/…);
- `robokassa` (merchantLogin/password1/password2/isTest/invoicePrefix/successUrl/failUrl/resultUrl);
- `build.wordsPerMinute`.

Никакие цены, тексты кнопок и реквизиты не должны быть жёстко зашиты в шаблонах/скриптах.

### 4.2. Команды сборки

В `scripts/build.js` реализовать:

- `buildAll()` → собирает free + premium + recommendations;
- `buildFree()` → только `dist/free`;
- `buildPremium()` → только `dist/premium`;
- `buildRecommendations()` → только рекомендации и JSON.

CLI:

- без аргументов → `buildAll`;
- `--target=free` → `buildFree`;
- `--target=premium` → `buildPremium`;
- `--target=recommendations` → `buildRecommendations`.

---

## 5. Правки HTML‑шаблонов (src/)

### 5.1. Меню

1. Удалить текущие жёстко прописанные пункты меню с `href="#..."`.
2. Заменить на цикл по `menuItems`:

   - текст → `item.label`;
   - ссылка → `item.urlFree` или `item.urlPremium`;
   - время чтения → `item.readingTime`.

### 5.2. Paywall‑блок и CTA‑виджет

Реализовать единый компонент виджета (проценты+кнопка), работающий на базе:

- `pageType` ∈ {`intro`, `courseFree`, `coursePremium`, `recommendation`};
- `userState` ∈ {`guest`, `paid`};
- `nextUrlPremium`, `entryUrlPremium`.

Использовать только три текста кнопок:

1. `Войти в полную версию`;
2. `Далее`;
3. `Перейти к курсу`.

Логика:

- `userState=guest` и `pageType` = `intro`/`courseFree`/`recommendation`:
  - текст: `Войти в полную версию`;
  - переход на единую страницу логина/оплаты.
- `userState=paid` и `pageType=coursePremium`, есть `nextUrlPremium`:
  - текст: `Далее`;
  - переход на `nextUrlPremium`.
- `userState=paid` и `pageType` = `intro`/`recommendation`, либо `coursePremium` без следующего раздела:
  - текст: `Перейти к курсу`;
  - переход на `entryUrlPremium` (точка входа в курс).

В free‑разделах CTA‑кнопка располагается в `premium-teaser__overlay` под blur‑тизером.

### 5.3. Футер и legal‑модалки

1. Футер:

   - использовать данные `footer` из `site.json`;
   - ссылки/кнопки «Оферта», «Политика…», «Реквизиты», «Cookies», «Контакты»;
   - каждая ссылка содержит `data-legal="<key>"`.

2. Модалка:

   - один шаблон модального окна с контейнером для контента;
   - JS по клику на `data-legal` подгружает `dist/shared/legal/<key>.html` и вставляет внутрь.

---

## 6. Robokassa и авторизация (PHP, high‑level)

### 6.1. Конфиг Robokassa

PHP‑код должен читать настройки из `site.json` (или отдельного PHP‑конфига, генерируемого на основе `site.json`):

- `merchantLogin`;
- `password1`, `password2`;
- `isTest`;
- `invoicePrefix`;
- `successUrl`, `failUrl`, `resultUrl`.

Никаких секретов в Git не хранить в виде захардкоженных строк.

### 6.2. Поток оплаты

Реализовать базовый сценарий:

1. На странице логина/оплаты:

   - формируется заказ (InvId) в SQLite;
   - считается подпись `SignatureValue` по актуальной формуле Robokassa;
   - генерируется форма/ссылка на Robokassa с параметрами.

2. На `resultUrl`:

   - скрипт принимает параметры от Robokassa;
   - проверяет подпись (Password2);
   - при успехе помечает заказ как `paid` и открывает пользователю доступ к premium.

3. На `successUrl` / `failUrl`:

   - выводит сообщение пользователю;
   - не меняет критически важные данные (их меняет только `resultUrl`).

Детальная PHP‑реализация может быть упрощённой, но должна быть согласована с действующей инструкцией Robokassa.

---

## 7. SEO‑слой

1. В сборке free:

   - генерировать `robots.txt` и `sitemap.xml` по правилам ARCHITECTURE_v1.1;
   - выставлять нужные мета‑теги (`title`, `description`) и Open Graph.

2. В premium:

   - добавлять `X-Robots-Tag: noindex, nofollow` для всех HTML.

---

## 8. Критерии готовности

Задача считается выполненной, если:

1. Сборка `dist/free` и `dist/premium` успешна на текущем наборе `content/*`.
2. Каждому разделу курса соответствует пара `/course/<slug>/` и `/premium/course/<slug>/`.
3. В free‑разделах:

   - корректно выделено логическое введение (2–3 абзаца);
   - blur‑тизер показывает следующий 1–2 абзаца;
   - остальной текст не присутствует в HTML.

4. Меню строится из `intro + course (+ appendix в premium)` без захардкоженного списка.
5. Рекомендации:

   - имеют отдельные страницы;
   - карусель читает данные из JSON, а не из статического HTML.

6. Футер получает реквизиты и ссылки из конфига/Markdown.
7. CTA‑виджет в шаблонах реализован в виде одного компонента с тремя текстами и поведением по таблице.
8. Конфиг `site.json` является единственным источником цен, текстов кнопок, футера и параметров Robokassa.
9. README описывает:

   - как настроить `site.json`;
   - как запустить сборку free/premium/recommendations;
   - как развернуть PHP‑часть на хостинге.
