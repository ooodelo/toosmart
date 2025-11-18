
# BUILD_REFACTOR_GUIDE_v1.1

## 1. Цель

Этот документ — чек‑лист для приведения текущего билд‑скрипта и шаблонов к ARCHITECTURE_v1.1 и ТЗ_v1.1.

Задачи:

- перейти от «одной страницы с якорями» к многостраничной структуре;
- реализовать алгоритм логического введения;
- разделить free/premium‑сборку и рекомендации;
- завести единый конфиг `site.json` и подготовить GUI.

---

## 2. Что изменить в сборке

### 2.1. Структура контента и URL

1. Удалить логику, завязанную на:

   - `articles/`;
   - `DEFAULT_BRANCHES`;
   - якоря вида `href="#intro"`, `href="#ph-basics"`.

2. Использовать только структуру:

   ```text
   content/
     intro/00_intro.md
     course/NN_*.md
     appendix/A_*.md, B_*.md
     recommendations/*.md
     legal/*.md
   ```

3. Реализовать генерацию страниц:

   - free:
     - `/` → `dist/free/index.html`;
     - `/course/<slug>/` → `dist/free/course/<slug>.html`;
     - `/recommendations/<slug>/` → `dist/free/recommendations/<slug>.html`;
     - `/legal/<slug>/` → `dist/free/legal/<slug>.html` (при необходимости).
   - premium:
     - `/premium/course/<slug>/` → `dist/premium/course/<slug>.html`;
     - `/premium/appendix/<slug>/` → `dist/premium/appendix/<slug>.html`.

### 2.2. Алгоритм логического введения

1. Реализовать в отдельном модуле `extractLogicalIntro(markdown)`:

   - парсинг в блоки `H1`, `H2`, `hr`, `p`;
   - ветви A/B/C (после H1 → `p` / `hr`+`H2` / `H2`);
   - возврат `{ introMd, restMd }`.

2. Использовать его при сборке free‑разделов и для расчёта времени чтения (на основе полного markdown).

### 2.3. Free‑версии разделов курса

1. Для каждого курса:

   - `introMd → introHtml`;
   - `restMd → restHtml`.

2. Из `restHtml` взять 1–2 первых `<p>` для blur‑тизера (остаток отбросить).

3. Собрать `/course/<slug>/`:

   - H1;
   - время чтения;
   - `introHtml`;
   - блок `premium-teaser`:

     - в `premium-teaser__blurred` — тизер в обёртке `<!--noindex-->` и с `data-nosnippet`;
     - в `premium-teaser__overlay` — текст «осталось ~N минут» + CTA‑кнопка.

4. Полный текст раздела в free‑HTML **не должен присутствовать**.

### 2.4. Premium‑страницы

1. Для каждого `course/NN_*.md` и `appendix/*.md`:

   - отрендерить полный markdown → `fullHtml`;
   - сформировать `/premium/course/<slug>/` или `/premium/appendix/<slug>/`:

     - H1;
     - время чтения;
     - `fullHtml`;
     - data-атрибуты для Progress Widget (`data-page-type`, `data-button-text`, `data-next-page`).

> **Примечание:** Кнопка «Назад» удалена из интерфейса. Навигация однонаправленная — только вперед через Progress Widget. Возврат возможен через боковое меню или браузерную кнопку «Назад».

### 2.5. Меню и навигация

1. В билде собрать массив `MenuItem` (тип/название/URL free+premium/время/порядок).

2. На основе `MenuItem`:

   - сформировать JSON/объект меню и передавать его в шаблоны;
   - вычислить `nextUrlPremium` для навигации в premium (передается через `data-next-page`).

3. В шаблонах заменить статические списки на циклы по `menuItems`.

4. Для каждой страницы передавать:
   - `data-page-type` — тип страницы для определения поведения Progress Widget;
   - `data-button-text` — текст кнопки CTA;
   - `data-next-page` — URL следующей страницы.

### 2.6. Рекомендации

1. Удалить устаревшую папку `articles` и связанную с ней логику.

2. Реализовать:

   - генерацию страниц `/recommendations/<slug>/` с `data-page-type="recommendation"`;
   - сборку `dist/shared/recommendations.json` из front matter;
   - **динамическую загрузку** карусели рекомендаций из JSON.

3. Динамическая карусель:

   - HTML-шаблон содержит только пустой контейнер `.stack-carousel`;
   - JavaScript при загрузке:
     1. запрашивает `/shared/recommendations.json`;
     2. создает слайды по 2 карточки;
     3. генерирует точки индикатора;
     4. подключает автопрокрутку и свайпы.
   - При ошибке загрузки — fallback на статичный контент.

### 2.7. Legal

1. Сгенерировать страницы `/legal/<slug>/` (если нужны прямые URL).

2. Из `content/legal/*.md` собрать фрагменты в `dist/shared/legal/<key>.html` для модалок.

---

## 3. Конфиг и GUI

### 3.1. Ввести `config/site.json`

Структура (минимум):

- `domain`;
- `pricing`: `originalAmount`, `currentAmount`, `currency`;
- `ctaTexts`: `enterFull`, `next`, `goToCourse`, `openCourse`;
- `footer`: `companyName`, `inn`, `year`;
- `legal`: имена md‑файлов;
- `robokassa`: `merchantLogin`, `password1`, `password2`, `isTest`, `invoicePrefix`, `successUrl`, `failUrl`, `resultUrl`;
- `build.wordsPerMinute`.

Тексты CTA используются так:
- `enterFull` — «Войти в полную версию» (free-версия, открывает модалку оплаты);
- `next` — «Далее» (premium-версия, переход на следующую страницу);
- `goToCourse` — «Перейти к курсу» (возврат из appendix);
- `openCourse` — «Открыть курс» (рекомендации, переход на intro или сохраненную позицию).

Билд‑скрипт должен:

- использовать `pricing` для цены и вывода в шаблон;
- использовать `ctaTexts` для текстов CTA;
- использовать `footer` и `legal` для футера и модалок;
- пробрасывать `robokassa` в PHP‑конфиг.

### 3.2. GUI (минимальные требования)

GUI (локальный инструмент):

- читает `site.json`;
- даёт формы для редактирования:

  - цен;
  - текстов CTA;
  - футера;
  - маппинга legal;
  - параметров Robokassa.

- по кнопкам вызывает:

  - `node scripts/build.js --target=free`;
  - `node scripts/build.js --target=premium`;
  - `node scripts/build.js --target=recommendations`.

Отдельные действия в GUI для free/premium/recommendations обязательны: сборка не должна запускаться одной общей кнопкой. Для каждой команды желательно выводить статус/логи, чтобы можно было проверить корректность изменения контента перед загрузкой на хостинг.

---

## 4. Команды сборки

Реализовать в `scripts/build.js`:

- `buildAll()` → free + premium + recommendations;
- `buildFree()` → `dist/free`;
- `buildPremium()` → `dist/premium`;
- `buildRecommendations()` → рекомендации + JSON для карусели.

CLI:

- без аргументов → `buildAll`;
- `--target=free` → `buildFree`;
- `--target=premium` → `buildPremium`;
- `--target=recommendations` → `buildRecommendations`.

---

## 5. Правки шаблонов (кратко)

1. Меню:

   - убрать жёстко прошитые `href="#..."`;
   - использовать `menuItems` из билда.

2. Progress Widget (CTA‑виджет):

   - один компонент (проценты + кнопка);
   - определяет поведение на основе `data-page-type`:
     - `free`, `intro-free` → открывает модалку оплаты;
     - `premium`, `intro-premium` → переход на `data-next-page`;
     - `recommendation` → умная навигация с проверкой localStorage;
   - использовать 4 текста из `site.json.ctaTexts`:
     - «Войти в полную версию»;
     - «Далее»;
     - «Перейти к курсу»;
     - «Открыть курс».

3. Paywall‑блок в free:

   - выводить `introHtml` + blur‑тизер;
   - CTA‑кнопка внутри overlay.

4. Футер:

   - строить строку из `site.json.footer`;
   - кнопки legal с `data-legal="<key>"`.

5. Legal‑модалки:

   - один шаблон;
   - JS подгружает HTML‑фрагменты из `dist/shared/legal/*.html`.

---

## 6. Итог

После выполнения шагов из этого гида:

- билд‑скрипт и шаблоны переходят на многостраничную архитектуру;
- логическое введение и paywall реализованы по единым правилам;
- меню, рекомендации и legal формируются на основе `content/*` и `site.json`;
- цены, тексты кнопок и Robokassa‑настройки управляются через конфиг (и при желании через GUI).
