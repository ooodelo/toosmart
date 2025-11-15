# 🏗️ АРХИТЕКТУРА ПРОЕКТА - TOOSMART

**Дата создания:** 2025-11-15
**Версия:** 1.0
**Статус:** Утверждено к реализации

---

## 📋 ОГЛАВЛЕНИЕ

1. [Общая концепция](#общая-концепция)
2. [Структура проекта](#структура-проекта)
3. [Free vs Premium версии](#free-vs-premium-версии)
4. [Процесс сборки](#процесс-сборки)
5. [PHP авторизация](#php-авторизация)
6. [Robokassa интеграция](#robokassa-интеграция)
7. [Защита от поисковиков](#защита-от-поисковиков)
8. [Деплой на хостинг](#деплой-на-хостинг)
9. [Workflow разработки](#workflow-разработки)
10. [FAQ и решение проблем](#faq-и-решение-проблем)

---

## 🎯 ОБЩАЯ КОНЦЕПЦИЯ

### Описание продукта

**TooSmart** - образовательная платформа с курсом "Clean - Теория правильной уборки".

### Бизнес-модель: Freemium

- **Free версия:** Вступительные абзацы каждого раздела + полные статьи из "Рекомендации"
- **Premium версия:** Полные разделы курса с навигацией и прогрессом

### Монетизация

- Единоразовая оплата через **Robokassa** (990₽)
- После оплаты → email с паролем → доступ к premium.toosmart.com

### Технический стек

```
Frontend:  HTML5, CSS3, Vanilla JavaScript
Backend:   PHP (только для авторизации)
Build:     Node.js + marked.js + DOMPurify
Hosting:   Простой хостинг с PHP + .htaccess
Payment:   Robokassa
```

### Ключевые особенности

✅ **Статичная генерация** - весь контент собирается локально
✅ **Простой деплой** - FTP/SFTP загрузка готовых файлов
✅ **Минимальный бэкенд** - только PHP сессии для premium
✅ **SEO для free версии** - статьи "Рекомендации" индексируются Google
✅ **Надежная защита premium** - .htaccess + PHP session + noindex

---

## 📁 СТРУКТУРА ПРОЕКТА

### Локальная структура (разработка)

```
toosmart/                              ← Корень проекта
│
├── package.json                       ← NPM конфигурация
├── package-lock.json
├── .gitignore
├── README.md
│
├── src/                               ← ШАБЛОНЫ (UI/UX макет)
│   ├── template.html                 ← Основной шаблон страницы
│   ├── script.js                     ← Логика UI (меню, свайпы, карусель)
│   ├── styles.css                    ← Все стили
│   ├── mode-utils.js                 ← Детекция режима (mobile/tablet/desktop)
│   └── assets/                       ← Ресурсы макета
│       ├── PointingToClean.png       ← Логотип "рука"
│       └── CleanLogo.svg             ← SVG логотип
│
├── content/                           ← КОНТЕНТ
│   ├── course/                       ← Разделы курса
│   │   ├── 01-intro.md              ← Введение в химию уборки
│   │   ├── 02-kitchen.md            ← Химия кухонной уборки
│   │   ├── 03-bathroom.md           ← Ванная комната
│   │   ├── 04-textiles.md           ← Стирка и текстиль
│   │   ├── 05-floors.md             ← Уход за полами
│   │   └── ...                       ← остальные разделы
│   │
│   ├── articles/                     ← Статьи "Рекомендации" (ВСЕГДА FREE)
│   │   ├── eco-myths.md             ← "Переплата за эко-средства"
│   │   ├── dangerous-mix.md         ← "Опасные комбинации"
│   │   ├── soda-vinegar.md          ← "Сода + уксус не работает"
│   │   └── ph-neutral-myth.md       ← "pH-нейтрально — маркетинг"
│   │
│   ├── config.json                   ← Конфигурация курса и статей
│   └── images/                       ← Картинки для контента
│       ├── intro-diagram.png
│       ├── kitchen-grease.jpg
│       └── ...
│
├── scripts/                           ← ИНСТРУМЕНТЫ СБОРКИ
│   └── build.js                      ← Генерация free/ и premium/
│
├── server/                            ← PHP СКРИПТЫ (для хостинга)
│   ├── index.php                     ← Форма входа в premium
│   ├── auth.php                      ← Проверка email + password
│   ├── logout.php                    ← Выход из сессии
│   ├── check-auth.php                ← Middleware для защиты .html
│   ├── robokassa-callback.php        ← Обработка успешной оплаты
│   ├── .htaccess                     ← Защита premium папки
│   └── users.json.example            ← Пример базы пользователей
│
├── docs/                              ← ДОКУМЕНТАЦИЯ
│   ├── ARCHITECTURE.md               ← Этот документ
│   ├── UI_UX_SPECIFICATION.md        ← UI/UX спецификация
│   ├── IMPLEMENTATION_PLAN.md        ← План разработки
│   ├── CHANGES_CHECKLIST.md          ← История изменений
│   └── TEMPLATES_STRUCTURE.md        ← (устарел, можно удалить)
│
├── logs/                              ← История аудита
│
└── dist/                              ← РЕЗУЛЬТАТ СБОРКИ (в .gitignore)
    │
    ├── free/                         ← 🌍 БЕСПЛАТНАЯ ВЕРСИЯ
    │   ├── index.html               ← Раздел "Введение" (вступление)
    │   ├── kitchen.html             ← Раздел "Кухня" (вступление)
    │   ├── bathroom.html            ← Раздел "Ванная" (вступление)
    │   ├── ...                       ← остальные разделы
    │   ├── script.js                ← Копия из src/
    │   ├── styles.css               ← Копия из src/
    │   ├── mode-utils.js            ← Копия из src/
    │   ├── assets/                  ← Копия из src/assets/
    │   │   ├── PointingToClean.png
    │   │   └── CleanLogo.svg
    │   ├── images/                  ← Копия из content/images/
    │   └── articles/                ← 📰 СТАТЬИ (ВСЕГДА ОТКРЫТЫ)
    │       ├── eco-myths.html       ← Полная статья
    │       ├── dangerous-mix.html   ← Полная статья
    │       ├── soda-vinegar.html    ← Полная статья
    │       └── ph-neutral-myth.html ← Полная статья
    │
    └── premium/                      ← 🔒 ПЛАТНАЯ ВЕРСИЯ
        ├── .htaccess                ← Защита от прямого доступа
        ├── index.php                ← Форма входа (email + password)
        ├── auth.php                 ← Проверка учетных данных
        ├── check-auth.php           ← Middleware защиты
        ├── logout.php               ← Выход из аккаунта
        ├── home.html                ← Главная после входа (редирект)
        ├── kitchen.html             ← Раздел "Кухня" (ПОЛНЫЙ)
        ├── bathroom.html            ← Раздел "Ванная" (ПОЛНЫЙ)
        ├── ...                       ← остальные разделы (ПОЛНЫЕ)
        ├── script.js                ← Копия из src/
        ├── styles.css               ← Копия из src/
        ├── mode-utils.js            ← Копия из src/
        ├── assets/                  ← Копия из src/assets/
        └── images/                  ← Копия из content/images/
```

### Структура на хостинге (production)

```
toosmart.com/                          ← Корень домена
│
├── free/                             ← Загружаешь dist/free/*
│   ├── index.html
│   ├── kitchen.html
│   ├── ...
│   ├── articles/
│   └── assets/
│
├── premium/                          ← Загружаешь dist/premium/*
│   ├── .htaccess
│   ├── index.php
│   ├── auth.php
│   ├── ...
│   └── assets/
│
└── private/                          ← ВНЕ public_html!
    └── users.json                   ← База пользователей
```

### .gitignore

```
node_modules/
dist/
.DS_Store
*.log
```

**Важно:** `dist/` НЕ коммитится в git, собирается локально перед деплоем.

---

## 🆓 FREE VS PREMIUM ВЕРСИИ

### Различия в контенте

| Элемент | Free версия | Premium версия |
|---------|-------------|----------------|
| **Разделы курса** | Только вступительные абзацы | Полные разделы |
| **Статьи "Рекомендации"** | ✅ Полностью доступны | ✅ Полностью доступны (те же файлы) |
| **Навигация (меню)** | ✅ Структура курса видна | ✅ Структура курса видна |
| **Flyout меню** | ✅ Подразделы H2 видны | ✅ Подразделы H2 видны |
| **Dots-rail** | ✅ Навигация по подразделам | ✅ Навигация по подразделам |
| **Кнопка внизу раздела** | 🔒 "Получить полную версию" | ➡️ "Далее" (к следующему разделу) |
| **Кнопка в статьях** | "Перейти к полному курсу" | "Перейти к полному курсу" |

### Визуальные различия

#### Free версия - Раздел курса:

```html
<!-- dist/free/kitchen.html -->

<section id="grease-removal" class="text-section">
    <h2>Удаление жира: почему обычная вода не помогает</h2>

    <!-- ВСТУПИТЕЛЬНЫЙ АБЗАЦ -->
    <p>Жир — один из самых стойких загрязнений на кухне.
       Он оседает на плите, вытяжке, стенах...</p>

    <!-- БЛЮР ЭФФЕКТ + ОВЕРЛЕЙ -->
    <div class="premium-teaser">
        <div class="blurred-content">
            <p>Для эффективного удаления жира нужны...</p>
            <p>Затем происходит процесс эмульгирования...</p>
        </div>
        <div class="unlock-overlay">
            <button class="btn-unlock" onclick="openPaymentModal()">
                🔒 Получить полную версию
            </button>
        </div>
    </div>
</section>

<!-- МОДАЛЬНОЕ ОКНО ОПЛАТЫ -->
<div class="modal" id="payment-modal" hidden>
    <h2>Получите полный доступ к курсу</h2>
    <ul>
        <li>✅ 10 полных разделов курса</li>
        <li>✅ Практические рецепты и таблицы</li>
        <li>✅ Пожизненный доступ</li>
    </ul>
    <p class="price"><strong>990 ₽</strong></p>
    <form action="https://auth.robokassa.ru/Merchant/Index.aspx">
        <input type="email" name="Shp_email" required>
        <button type="submit">Оплатить 990 ₽</button>
    </form>
</div>
```

#### Premium версия - Раздел курса:

```html
<!-- dist/premium/kitchen.html -->

<?php
session_start();
if (!isset($_SESSION['premium_user'])) {
    header('Location: index.php');
    exit;
}
?>

<section id="grease-removal" class="text-section">
    <h2>Удаление жира: почему обычная вода не помогает</h2>

    <!-- ПОЛНЫЙ КОНТЕНТ БЕЗ ОГРАНИЧЕНИЙ -->
    <p>Жир — один из самых стойких загрязнений на кухне...</p>
    <p>Всё дело в молекулярной структуре жиров...</p>
    <p>Для эффективного удаления жира нужны...</p>
    <!-- ... весь контент до конца ... -->
</section>

<!-- КНОПКА ДАЛЕЕ -->
<button class="btn-next" data-next-page="bathroom.html">
    Далее →
</button>
```

#### Free версия - Статья "Рекомендации":

```html
<!-- dist/free/articles/eco-myths.html -->

<article class="text-box">
    <h1>Переплата за «эко»-средства</h1>

    <!-- ПОЛНАЯ СТАТЬЯ (без ограничений) -->
    <p>Разбираем состав экологичных средств...</p>
    <!-- ... весь контент ... -->

    <!-- КНОПКА ПЕРЕХОДА К КУРСУ -->
    <a href="/free/index.html" class="btn-course">
        Перейти к полному курсу →
    </a>
</article>
```

### SEO стратегия

**Индексируются Google:**
- ✅ `/free/articles/` - статьи "Рекомендации"
- ✅ Могут приносить органический трафик

**НЕ индексируются:**
- ❌ `/free/*.html` - разделы курса (можно добавить meta noindex)
- ❌ `/premium/*` - вся папка закрыта через robots.txt + noindex

---

## ⚙️ ПРОЦЕСС СБОРКИ

### content/config.json

```json
{
  "course": {
    "title": "Clean - Теория правильной уборки",
    "sections": [
      {
        "id": "intro",
        "title": "Введение в химию уборки",
        "markdown": "01-intro.md",
        "next": "kitchen"
      },
      {
        "id": "kitchen",
        "title": "Химия кухонной уборки",
        "markdown": "02-kitchen.md",
        "next": "bathroom"
      },
      {
        "id": "bathroom",
        "title": "Ванная комната",
        "markdown": "03-bathroom.md",
        "next": "textiles"
      }
    ]
  },
  "articles": {
    "title": "Рекомендуем",
    "list": [
      {
        "id": "eco-myths",
        "title": "Переплата за «эко»-средства",
        "markdown": "eco-myths.md"
      },
      {
        "id": "dangerous-mix",
        "title": "Опасные комбинации бытовой химии",
        "markdown": "dangerous-mix.md"
      }
    ]
  }
}
```

### scripts/build.js - Алгоритм работы

```javascript
// Псевдокод

async function buildAll() {
  console.log('🚀 Начинаем сборку...');

  await buildFreeVersion();
  await buildPremiumVersion();

  console.log('✅ Сборка завершена!');
}

async function buildFreeVersion() {
  const output = './dist/free';

  // 1. Очистить dist/free/
  cleanDir(output);

  // 2. Копировать ресурсы из src/
  copy('src/script.js', output + '/script.js');
  copy('src/styles.css', output + '/styles.css');
  copy('src/mode-utils.js', output + '/mode-utils.js');
  copyDir('src/assets', output + '/assets');
  copyDir('content/images', output + '/images');

  // 3. Генерировать разделы курса (ВСТУПЛЕНИЯ)
  for (const section of config.course.sections) {
    const mdContent = readFile(`content/course/${section.markdown}`);
    const firstParagraph = extractFirstParagraph(mdContent); // только вступление
    const fullContent = markdownToHTML(mdContent); // полный для блюра

    const html = generatePage({
      template: 'src/template.html',
      content: firstParagraph,
      blurredContent: fullContent, // под блюром
      sections: extractH2Headers(mdContent), // для flyout меню
      footer: {
        type: 'paywall',
        button: {
          text: '🔒 Получить полную версию',
          action: 'openPaymentModal()'
        }
      },
      modal: generatePaymentModal() // модалка оплаты
    });

    writeFile(`${output}/${section.id}.html`, html);
  }

  // 4. Генерировать статьи "Рекомендации" (ПОЛНЫЕ)
  for (const article of config.articles.list) {
    const mdContent = readFile(`content/articles/${article.markdown}`);
    const fullContent = markdownToHTML(mdContent);

    const html = generatePage({
      template: 'src/template.html',
      content: fullContent,
      footer: {
        type: 'link',
        button: {
          text: 'Перейти к полному курсу →',
          href: '/free/index.html'
        }
      }
    });

    writeFile(`${output}/articles/${article.id}.html`, html);
  }

  console.log('✅ Free версия собрана');
}

async function buildPremiumVersion() {
  const output = './dist/premium';

  // 1. Очистить dist/premium/
  cleanDir(output);

  // 2. Копировать ресурсы
  copy('src/script.js', output + '/script.js');
  copy('src/styles.css', output + '/styles.css');
  copy('src/mode-utils.js', output + '/mode-utils.js');
  copyDir('src/assets', output + '/assets');
  copyDir('content/images', output + '/images');

  // 3. Копировать PHP скрипты
  copy('server/index.php', output + '/index.php');
  copy('server/auth.php', output + '/auth.php');
  copy('server/check-auth.php', output + '/check-auth.php');
  copy('server/logout.php', output + '/logout.php');
  copy('server/.htaccess', output + '/.htaccess');

  // 4. Генерировать разделы курса (ПОЛНЫЕ)
  for (const section of config.course.sections) {
    const mdContent = readFile(`content/course/${section.markdown}`);
    const fullContent = markdownToHTML(mdContent);

    const html = generatePage({
      template: 'src/template.html',
      content: fullContent,
      sections: extractH2Headers(mdContent),
      footer: {
        type: 'navigation',
        button: {
          text: 'Далее →',
          href: `${section.next}.html`
        }
      }
    });

    // Обернуть в PHP проверку сессии
    const protectedHTML = wrapWithPHPAuth(html);

    writeFile(`${output}/${section.id}.html`, protectedHTML);
  }

  console.log('✅ Premium версия собрана');
}

function extractFirstParagraph(markdown) {
  // Взять всё до первого заголовка H2 или H3
  const match = markdown.match(/^([\s\S]*?)(?=\n##\s|\n###\s|$)/);
  return match ? match[1].trim() : markdown;
}

function extractH2Headers(markdown) {
  const regex = /^##\s+(.+)$/gm;
  const headers = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    headers.push({
      id: slugify(match[1]),
      title: match[1]
    });
  }

  return headers;
}

function wrapWithPHPAuth(html) {
  return `<?php
session_start();
if (!isset($_SESSION['premium_user'])) {
    header('Location: index.php');
    exit;
}
?>
${html}`;
}
```

### Команды NPM

```json
{
  "scripts": {
    "dev": "live-server src --port=3000",
    "build": "node scripts/build.js",
    "build:free": "node scripts/build.js --target=free",
    "build:premium": "node scripts/build.js --target=premium",
    "preview:free": "live-server dist/free --port=3001",
    "preview:premium": "live-server dist/premium --port=3002",
    "clean": "rm -rf dist/*"
  }
}
```

---

## 🔐 PHP АВТОРИЗАЦИЯ

### Архитектура безопасности

```
Пользователь → index.php → auth.php → check-auth.php → content.html
                ↓              ↓            ↓
              Форма ввода   Проверка    Middleware
              email+pass    в users.json  сессии
```

### server/.htaccess

```apache
# ========================================
# ЗАЩИТА ПРЕМИУМ ВЕРСИИ
# ========================================

# Запретить индексацию поисковиками
Header set X-Robots-Tag "noindex, nofollow, noarchive"
Header set X-Frame-Options "SAMEORIGIN"

# Включить PHP
<FilesMatch "\.php$">
    SetHandler application/x-httpd-php
</FilesMatch>

# Все запросы к .html файлам проксировать через check-auth.php
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.+)\.html$ check-auth.php?page=$1 [L,QSA]

# Защитить прямой доступ к статическим файлам
<FilesMatch "\.(html|js|css)$">
    Order Deny,Allow
    Deny from all
</FilesMatch>

# Разрешить только PHP и изображения
<FilesMatch "\.(php|png|jpg|jpeg|svg|gif|webp)$">
    Allow from all
</FilesMatch>
```

### server/index.php (форма входа)

```php
<?php
session_start();

// Если уже авторизован → редирект
if (isset($_SESSION['premium_user'])) {
    header('Location: home.html');
    exit;
}

$error = $_GET['error'] ?? '';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Вход в закрытую версию курса</title>
    <link rel="stylesheet" href="../free/styles.css">
    <style>
        .auth-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #e8f4f8;
        }
        .auth-container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .auth-form input {
            width: 100%;
            padding: 12px;
            margin-bottom: 16px;
            border: 1px solid #d0d0d0;
            border-radius: 8px;
        }
        .auth-form button {
            width: 100%;
            padding: 14px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
        }
        .error { color: #d32f2f; margin-top: 12px; }
        .help-text { color: #666; font-size: 14px; margin-top: 20px; }
    </style>
</head>
<body class="auth-page">
    <div class="auth-container">
        <h1>Вход в закрытую версию</h1>
        <p>Введите данные, которые были отправлены на ваш email после оплаты</p>

        <form action="auth.php" method="POST" class="auth-form">
            <input type="email" name="email" placeholder="Ваш email" required autofocus>
            <input type="password" name="password" placeholder="Пароль из письма" required>
            <button type="submit">Войти в курс</button>
        </form>

        <?php if ($error === '1'): ?>
            <p class="error">❌ Неверный email или пароль</p>
        <?php endif; ?>

        <p class="help-text">
            Не получили доступ? <a href="mailto:support@toosmart.com">Напишите нам</a>
        </p>
    </div>
</body>
</html>
```

### server/auth.php (проверка учетных данных)

```php
<?php
session_start();

$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

// Путь к базе пользователей (ВНЕ public_html!)
$users_file = __DIR__ . '/../../private/users.json';

if (!file_exists($users_file)) {
    error_log('Users file not found: ' . $users_file);
    header('Location: index.php?error=1');
    exit;
}

$users = json_decode(file_get_contents($users_file), true);

if (!$users || !is_array($users)) {
    error_log('Invalid users.json format');
    header('Location: index.php?error=1');
    exit;
}

// Поиск пользователя
foreach ($users as $user) {
    if ($user['email'] === $email && password_verify($password, $user['password_hash'])) {
        // Успешная авторизация
        $_SESSION['premium_user'] = $email;
        $_SESSION['login_time'] = time();

        // Редирект на главную
        header('Location: home.html');
        exit;
    }
}

// Неверные данные
header('Location: index.php?error=1');
exit;
?>
```

### server/check-auth.php (middleware)

```php
<?php
session_start();

// Проверка авторизации
if (!isset($_SESSION['premium_user'])) {
    header('Location: index.php');
    exit;
}

// Получить запрошенную страницу
$page = $_GET['page'] ?? 'home';

// Валидация имени файла (защита от path traversal)
if (preg_match('/[^a-z0-9_-]/i', $page)) {
    header('HTTP/1.0 400 Bad Request');
    exit('Invalid page name');
}

// Путь к файлу
$file = __DIR__ . "/{$page}.html";

// Проверка существования
if (!file_exists($file)) {
    header('HTTP/1.0 404 Not Found');
    exit('404 - Страница не найдена');
}

// Отдать содержимое
header('Content-Type: text/html; charset=UTF-8');
readfile($file);
?>
```

### server/logout.php

```php
<?php
session_start();
session_destroy();
header('Location: index.php');
exit;
?>
```

### База пользователей (private/users.json)

```json
[
  {
    "email": "user@example.com",
    "password_hash": "$2y$10$abcdefghijklmnopqrstuvwxyz1234567890",
    "created_at": "2025-11-15 12:30:45",
    "invoice_id": "12345"
  },
  {
    "email": "another@example.com",
    "password_hash": "$2y$10$zyxwvutsrqponmlkjihgfedcba0987654321",
    "created_at": "2025-11-16 08:15:22",
    "invoice_id": "12346"
  }
]
```

**ВАЖНО:** Файл `users.json` должен находиться ВНЕ public_html (например в `/home/user/private/users.json`)

---

## 💳 ROBOKASSA ИНТЕГРАЦИЯ

### Процесс оплаты

```
1. Пользователь на free/kitchen.html
2. Нажимает "🔒 Получить полную версию"
3. Открывается модальное окно
4. Вводит email → отправка формы на Robokassa
5. Оплата 990₽
6. Robokassa → robokassa-callback.php (Result URL)
7. Скрипт генерирует пароль, добавляет в users.json, отправляет email
8. Robokassa → success.php (Success URL)
9. Пользователь видит "Спасибо! Проверьте email"
10. Открывает письмо → переходит на premium/
11. Вводит email + пароль → доступ к курсу
```

### Модальное окно в free версии

```html
<!-- В каждом dist/free/*.html -->

<div class="modal" id="payment-modal" hidden>
    <div class="modal-overlay" onclick="closePaymentModal()"></div>
    <div class="modal-content">
        <button class="modal-close" onclick="closePaymentModal()">×</button>

        <h2>Получите полный доступ к курсу</h2>

        <ul class="benefits">
            <li>✅ 10 полных разделов с подробными объяснениями</li>
            <li>✅ Практические рецепты и таблицы совместимости</li>
            <li>✅ Пожизненный доступ к материалам</li>
            <li>✅ Обновления курса бесплатно</li>
        </ul>

        <p class="price">
            <span class="price-old">1990 ₽</span>
            <span class="price-current">990 ₽</span>
        </p>

        <form id="payment-form" action="https://auth.robokassa.ru/Merchant/Index.aspx" method="GET">
            <!-- Email пользователя -->
            <input type="email"
                   name="Shp_email"
                   placeholder="Ваш email"
                   required
                   pattern="[^@]+@[^@]+\.[a-zA-Z]{2,}">

            <!-- Параметры Robokassa -->
            <input type="hidden" name="MerchantLogin" value="ВАШ_ЛОГИН">
            <input type="hidden" name="OutSum" value="990">
            <input type="hidden" name="InvId" value="0">
            <input type="hidden" name="Description" value="Доступ к курсу Clean">
            <input type="hidden" name="SignatureValue" value="ПОДПИСЬ">
            <input type="hidden" name="Culture" value="ru">
            <input type="hidden" name="Encoding" value="utf-8">

            <button type="submit" class="btn-pay">
                Оплатить 990 ₽
            </button>
        </form>

        <p class="security-note">
            🔒 Безопасная оплата через Robokassa
        </p>
    </div>
</div>

<script>
function openPaymentModal() {
    document.getElementById('payment-modal').removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
    document.getElementById('payment-modal').setAttribute('hidden', '');
    document.body.style.overflow = '';
}
</script>
```

### server/robokassa-callback.php (Result URL)

```php
<?php
/**
 * Robokassa Result URL - обработка успешной оплаты
 * URL: https://toosmart.com/premium/robokassa-callback.php
 */

// Параметры от Robokassa
$out_sum = $_POST['OutSum'] ?? '';
$inv_id = $_POST['InvId'] ?? '';
$shp_email = $_POST['Shp_email'] ?? '';
$signature = $_POST['SignatureValue'] ?? '';

// Конфигурация
$merchant_password2 = 'ВАШ_PASSWORD2'; // из настроек Robokassa (Result URL password)

// 1. ПРОВЕРКА ПОДПИСИ (КРИТИЧЕСКИ ВАЖНО!)
$expected_signature = strtoupper(md5("$out_sum:$inv_id:$merchant_password2:Shp_email=$shp_email"));

if (strtoupper($signature) !== $expected_signature) {
    error_log("Robokassa: Invalid signature. Expected: $expected_signature, Got: $signature");
    die('Bad signature');
}

// 2. ГЕНЕРАЦИЯ ПАРОЛЯ
$password = generateRandomPassword(8); // например: A7k3Xm9P
$password_hash = password_hash($password, PASSWORD_DEFAULT);

// 3. ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В БАЗУ
$users_file = __DIR__ . '/../../private/users.json';
$users = file_exists($users_file) ? json_decode(file_get_contents($users_file), true) : [];

// Проверить, нет ли уже такого email
$user_exists = false;
foreach ($users as $user) {
    if ($user['email'] === $shp_email) {
        $user_exists = true;
        error_log("Robokassa: User already exists: $shp_email");
        break;
    }
}

if (!$user_exists) {
    $users[] = [
        'email' => $shp_email,
        'password_hash' => $password_hash,
        'created_at' => date('Y-m-d H:i:s'),
        'invoice_id' => $inv_id,
        'amount' => $out_sum
    ];

    file_put_contents($users_file, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// 4. ОТПРАВКА EMAIL С ПАРОЛЕМ
$to = $shp_email;
$subject = 'Ваш доступ к курсу Clean - Теория правильной уборки';
$message = "
Здравствуйте!

Спасибо за покупку курса «Clean - Теория правильной уборки».

Ваши данные для входа в закрытую версию:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: $shp_email
Пароль: $password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ссылка для входа: https://toosmart.com/premium/

Сохраните это письмо - пароль больше нигде не отображается.

С уважением,
Команда TooSmart
";

$headers = "From: noreply@toosmart.com\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

mail($to, $subject, $message, $headers);

// 5. ОТВЕТ ROBOKASSA (ОБЯЗАТЕЛЬНО!)
echo "OK$inv_id";

// Логирование
error_log("Robokassa: Payment successful. Email: $shp_email, InvId: $inv_id, Password: $password");

function generateRandomPassword($length = 8) {
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $password = '';
    for ($i = 0; $i < $length; $i++) {
        $password .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $password;
}
?>
```

### server/success.php (Success URL)

```php
<?php
/**
 * Robokassa Success URL - страница после успешной оплаты
 * URL: https://toosmart.com/premium/success.php
 */

$email = $_GET['Shp_email'] ?? '';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата прошла успешно</title>
    <link rel="stylesheet" href="../free/styles.css">
    <style>
        .success-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #e8f4f8;
        }
        .success-container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            max-width: 500px;
            text-align: center;
        }
        .checkmark {
            font-size: 64px;
            color: #4caf50;
        }
    </style>
</head>
<body class="success-page">
    <div class="success-container">
        <div class="checkmark">✓</div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за покупку курса «Clean».</p>
        <p><strong>Проверьте вашу почту:</strong><br><?= htmlspecialchars($email) ?></p>
        <p>Мы отправили вам письмо с данными для входа в закрытую версию курса.</p>
        <hr>
        <p><a href="index.php" class="btn-primary">Войти в закрытую версию</a></p>
    </div>
</body>
</html>
```

### Настройки Robokassa

В личном кабинете Robokassa укажите:

```
Result URL:   https://toosmart.com/premium/robokassa-callback.php
Success URL:  https://toosmart.com/premium/success.php
Fail URL:     https://toosmart.com/free/index.html
Method:       POST
```

---

## 🛡️ ЗАЩИТА ОТ ПОИСКОВИКОВ

### robots.txt (в корне домена)

```
User-agent: *
Disallow: /premium/
Allow: /free/articles/

Sitemap: https://toosmart.com/sitemap.xml
```

### Meta tags в premium версии

```html
<!-- В каждом dist/premium/*.html -->
<meta name="robots" content="noindex, nofollow, noarchive">
```

### Meta tags в free версии (разделы курса)

```html
<!-- В dist/free/*.html (кроме articles/) -->
<meta name="robots" content="noindex, nofollow">
```

### Meta tags в статьях "Рекомендации"

```html
<!-- В dist/free/articles/*.html -->
<meta name="robots" content="index, follow">
<meta name="description" content="Описание статьи для поисковиков">
<meta property="og:title" content="Название статьи">
<meta property="og:description" content="Описание">
```

### Дополнительная защита в .htaccess

```apache
# Блокировать известных скраперов
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} (HTTrack|wget|curl) [NC]
RewriteRule .* - [F,L]
```

---

## 🚀 ДЕПЛОЙ НА ХОСТИНГ

### Требования к хостингу

✅ PHP 7.4+
✅ Поддержка .htaccess (Apache/LiteSpeed)
✅ Доступ к папке выше public_html (для users.json)
✅ Возможность отправки email через mail()
✅ SSL сертификат (Let's Encrypt)

**Подходящие хостинги:**
- Beget
- Timeweb
- Reg.ru
- Hostland

### Структура на сервере

```
/home/username/                  ← Домашняя папка
│
├── private/                     ← ВНЕ веб-доступа
│   └── users.json              ← База пользователей
│
└── public_html/                 ← Корень сайта
    ├── .htaccess               ← Редиректы
    ├── robots.txt
    ├── sitemap.xml
    │
    ├── free/                   ← Загрузить dist/free/*
    │   ├── index.html
    │   ├── kitchen.html
    │   ├── articles/
    │   └── assets/
    │
    └── premium/                ← Загрузить dist/premium/*
        ├── .htaccess
        ├── index.php
        ├── auth.php
        └── ...
```

### Пошаговая инструкция деплоя

#### 1. Локальная сборка

```bash
# Убедись что всё обновлено
git pull

# Собери обе версии
npm run build

# Проверь результат
npm run preview:free
npm run preview:premium
```

#### 2. Создание users.json на сервере

Через SSH или файловый менеджер хостинга:

```bash
# Создать папку private (если нет)
mkdir -p /home/username/private

# Создать пустой users.json
echo '[]' > /home/username/private/users.json

# Установить права
chmod 644 /home/username/private/users.json
```

#### 3. Загрузка через FTP (FileZilla)

```
Подключение:
Host:     ftp.toosmart.com
Username: ваш_логин
Password: ваш_пароль
Port:     21

Загрузить:
- dist/free/*       → /public_html/free/
- dist/premium/*    → /public_html/premium/
```

#### 4. Загрузка через SSH/rsync (быстрее)

```bash
# Одной командой
rsync -avz --delete \
  dist/free/ \
  user@toosmart.com:/home/username/public_html/free/

rsync -avz --delete \
  dist/premium/ \
  user@toosmart.com:/home/username/public_html/premium/
```

#### 5. Проверка прав доступа

```bash
# Через SSH
ssh user@toosmart.com

# Проверить права
ls -la public_html/premium/

# Если нужно, исправить
chmod 644 public_html/premium/*.php
chmod 644 public_html/premium/.htaccess
```

#### 6. Настройка Robokassa

В личном кабинете Robokassa:

1. Result URL: `https://toosmart.com/premium/robokassa-callback.php`
2. Success URL: `https://toosmart.com/premium/success.php`
3. Fail URL: `https://toosmart.com/free/index.html`
4. Скопировать Password#1 и Password#2
5. Вставить Password#2 в `robokassa-callback.php` и пересобрать

#### 7. Тестирование

```
1. Открыть https://toosmart.com/free/
2. Проверить навигацию между разделами
3. Нажать "Получить полную версию" → модалка работает
4. Открыть https://toosmart.com/premium/ → форма входа
5. Попробовать войти с несуществующим email → ошибка
6. Сделать тестовую оплату → проверить email
7. Войти с полученным паролем → доступ к курсу
```

#### 8. Мониторинг логов

```bash
# Логи PHP ошибок
tail -f /home/username/logs/error.log

# Логи Robokassa (если настроен error_log)
tail -f /home/username/logs/robokassa.log
```

### robots.txt в корне

```
User-agent: *
Disallow: /premium/
Allow: /free/articles/

Sitemap: https://toosmart.com/sitemap.xml
```

### Корневой .htaccess (редирект на free)

```apache
# Редирект с корня на free версию
RewriteEngine On
RewriteCond %{REQUEST_URI} ^/$
RewriteRule ^$ /free/ [R=301,L]
```

---

## 💼 WORKFLOW РАЗРАБОТКИ

### Типичный сценарий работы

#### Сценарий 1: Добавление нового раздела курса

```bash
# 1. Написать контент
vim content/course/06-eco-cleaning.md

# 2. Обновить config.json
vim content/config.json
# Добавить:
# {
#   "id": "eco-cleaning",
#   "title": "Экологичные альтернативы",
#   "markdown": "06-eco-cleaning.md",
#   "next": "safety-storage"
# }

# 3. Добавить картинки (если есть)
cp ~/images/eco-vinegar.jpg content/images/

# 4. Собрать проект
npm run build

# 5. Проверить результат
npm run preview:free
npm run preview:premium

# 6. Задеплоить
rsync -avz dist/free/ user@toosmart.com:/public_html/free/
rsync -avz dist/premium/ user@toosmart.com:/public_html/premium/
```

#### Сценарий 2: Изменение дизайна (CSS/JS)

```bash
# 1. Редактировать шаблон
vim src/styles.css

# 2. Тестировать в live-режиме
npm run dev
# Открыть http://localhost:3000

# 3. Когда готово - собрать
npm run build

# 4. Задеплоить
rsync -avz dist/free/ user@toosmart.com:/public_html/free/
rsync -avz dist/premium/ user@toosmart.com:/public_html/premium/
```

#### Сценарий 3: Добавление новой статьи "Рекомендации"

```bash
# 1. Написать статью
vim content/articles/new-article.md

# 2. Обновить config.json
vim content/config.json
# В секции "articles.list" добавить:
# {
#   "id": "new-article",
#   "title": "Название статьи",
#   "markdown": "new-article.md"
# }

# 3. Собрать
npm run build

# 4. Деплой
rsync -avz dist/free/articles/ user@toosmart.com:/public_html/free/articles/
```

#### Сценарий 4: Обновление цены

```bash
# 1. Изменить в src/template.html
# Найти: <input type="hidden" name="OutSum" value="990">
# Заменить: <input type="hidden" name="OutSum" value="1290">

# 2. Пересобрать
npm run build

# 3. Обновить Robokassa настройки (если нужно)

# 4. Деплой
rsync -avz dist/free/ user@toosmart.com:/public_html/free/
```

### Git workflow

```bash
# Создать ветку для новой фичи
git checkout -b feature/new-section

# Работа...
git add content/course/07-new.md
git commit -m "Add new section: Advanced techniques"

# Пуш
git push origin feature/new-section

# После ревью - merge
git checkout main
git merge feature/new-section
git push origin main

# Деплой
npm run build
# ... загрузка на хостинг
```

---

## ❓ FAQ И РЕШЕНИЕ ПРОБЛЕМ

### Q: Как добавить нового пользователя вручную?

```bash
# 1. Сгенерировать хеш пароля
php -r "echo password_hash('mypassword123', PASSWORD_DEFAULT);"
# Выведет: $2y$10$abcdef...

# 2. Добавить в users.json
{
  "email": "newuser@example.com",
  "password_hash": "$2y$10$abcdef...",
  "created_at": "2025-11-15 12:00:00",
  "invoice_id": "manual",
  "amount": "0"
}
```

### Q: Robokassa не отправляет запрос на callback

**Решение:**
1. Проверить, что Result URL правильный в настройках Robokassa
2. Проверить логи: `tail -f ~/logs/error.log`
3. Проверить подпись: убедись что Password#2 совпадает
4. Тестировать через Robokassa Test режим

### Q: Пользователь не может войти в premium

**Чеклист:**
1. Проверить `users.json` - есть ли email?
2. Проверить password_hash - правильный ли формат?
3. Проверить права файла: `chmod 644 users.json`
4. Проверить путь в auth.php: `__DIR__ . '/../../private/users.json'`
5. Логи PHP: `tail -f error.log`

### Q: CSS/JS не обновляется после деплоя

**Решение:**
```bash
# Очистить кеш браузера ИЛИ добавить версию в URL
<link rel="stylesheet" href="styles.css?v=2">
<script src="script.js?v=2"></script>

# Автоматизация в build.js:
const version = Date.now();
html.replace('styles.css', `styles.css?v=${version}`);
```

### Q: Как сбросить все и начать заново?

```bash
# Локально
rm -rf dist/
npm run clean
npm run build

# На сервере
ssh user@toosmart.com
rm -rf public_html/free/*
rm -rf public_html/premium/*
echo '[]' > /home/username/private/users.json

# Заново загрузить
rsync -avz dist/free/ user@server:/public_html/free/
rsync -avz dist/premium/ user@server:/public_html/premium/
```

### Q: Email с паролем не приходит

**Проверка:**
```bash
# 1. Тест отправки email на хостинге
php -r "mail('your@email.com', 'Test', 'Test message');"

# 2. Проверить логи Robokassa
tail -f robokassa.log

# 3. Проверить спам-папку

# 4. Настроить SMTP (если mail() не работает)
# Использовать PHPMailer вместо mail()
```

### Q: Поисковики индексируют premium контент

**Решение:**
```bash
# 1. Проверить robots.txt
curl https://toosmart.com/robots.txt

# 2. Проверить meta tags
curl https://toosmart.com/premium/kitchen.html | grep robots

# 3. Запросить удаление из индекса Google
# Google Search Console → Удаление → Временно удалить URL

# 4. Проверить .htaccess
Header set X-Robots-Tag "noindex, nofollow"
```

### Q: Как изменить срок сессии?

```php
// В начале auth.php
session_start();
// Установить срок жизни сессии (30 дней)
ini_set('session.gc_maxlifetime', 2592000);
session_set_cookie_params(2592000);
```

---

## 📊 МЕТРИКИ И АНАЛИТИКА

### Рекомендуемые инструменты

**Yandex.Metrika:**
```html
<!-- В src/template.html -->
<!-- Яндекс.Метрика -->
<script type="text/javascript">
   (function(m,e,t,r,i,k,a){...})
   (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

   ym(XXXXXXXX, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true
   });
</script>
```

**События для отслеживания:**

```javascript
// Открытие модального окна оплаты
ym(XXXXXXXX, 'reachGoal', 'payment_modal_open');

// Клик "Оплатить"
ym(XXXXXXXX, 'reachGoal', 'payment_click');

// Успешная оплата
ym(XXXXXXXX, 'reachGoal', 'payment_success');

// Вход в premium
ym(XXXXXXXX, 'reachGoal', 'premium_login');
```

---

## 🎯 ИТОГИ

### Что получилось

✅ Двухуровневая архитектура (free + premium)
✅ Статичная генерация из markdown
✅ Простой деплой (FTP/rsync)
✅ Надежная защита premium контента
✅ Интеграция с Robokassa
✅ SEO для бесплатных статей
✅ Минимальные требования к хостингу

### Сильные стороны решения

- **Простота:** Не нужен Node.js на сервере, только PHP
- **Скорость:** Статичные файлы отдаются мгновенно
- **Безопасность:** PHP сессии + .htaccess + хеширование паролей
- **Масштабируемость:** Легко добавлять новые разделы
- **SEO:** Статьи "Рекомендации" приносят трафик
- **Дешевизна:** Работает на любом простом хостинге

### Следующие шаги

1. ✅ Реализовать структуру папок
2. ✅ Переработать build.js
3. ✅ Создать PHP скрипты авторизации
4. ⏳ Написать контент для всех разделов
5. ⏳ Настроить Robokassa тестовый режим
6. ⏳ Задеплоить на хостинг
7. ⏳ Провести тестирование оплаты
8. ⏳ Запустить рекламу

---

**Конец документа ARCHITECTURE.md v1.0**
