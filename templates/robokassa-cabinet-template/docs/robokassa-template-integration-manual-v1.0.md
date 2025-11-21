# Robokassa + Cabinet Template · Мануал внедрения в рабочий проект (Vite сайт + PHP backend) - v1.0

Документ описывает практический порядок подключения Robokassa к вашему рабочему Vite‑проекту, используя данный шаблон кабинета на PHP/MySQL.  
Цель: поток оплаты → фискальный чек 54‑ФЗ → автоматическая выдача доступа → вход в кабинет по magic‑link.

---

## 0. Как устроен шаблон

Backend (PHP/MySQL) — отдельный мини‑сервис: хранит секреты Robokassa, создаёт InvId и Receipt, считает подписи, принимает ResultURL, выдаёт доступ, шлёт письма и отдаёт API.

Frontend (Vite/React) — демо‑кабинет и пример buy‑формы. В ваш рабочий сайт переносится только buy‑логика.

---

## 1. Подготовка Robokassa в личном кабинете

1. Создайте магазин, получите MerchantLogin, Pass1, Pass2.
2. В “Технических настройках” выберите алгоритм подписи MD5 или SHA256 и включите фискализацию (если нужна).
3. Пропишите URL‑ы:
   - ResultURL — серверный обработчик результата
   - SuccessURL — страница “спасибо”
   - FailURL — страница отказа
4. Для ResultURL используйте POST.
5. Если сервер фильтрует входящие запросы — добавьте IP Robokassa в allowlist.

---

## 2. Настройка backend‑сервиса

1. Разверните папку `backend-php/` на сервере так, чтобы публичная директория была `backend-php/public/`.
2. Скопируйте `storage/settings.json.example` → `storage/settings.json` и заполните:
   - db.* — доступ к MySQL
   - robokassa.* — MerchantLogin, Pass1/Pass2, is_test, signature_alg, product_code
   - security.admin_token — для /admin/*
   - emails.* — транспорт писем
3. (Опционально) заполняйте настройки через `/admin/setup?token=ВАШ_ТОКЕН`.
4. Скопируйте `storage/products.json.example` → `storage/products.json` и задайте товар для чека.
5. Откройте `/health` один раз — таблицы создадутся автоматически.

---

## 3. Подключение формы покупки на фронте (Vite)

Поток:

1. Пользователь вводит email.
2. Фронт вызывает:
   `POST /api/order/create` → `{email, amount}`
3. Backend возвращает endpoint Robokassa и набор параметров (MerchantLogin, OutSum, InvId, Receipt, Shp_email, SignatureValue).
4. Фронт делает редирект на Robokassa через HTML‑форму POST (`endpoint` + скрытые поля).

Email передавайте как `Email` — тогда Robokassa покажет его заполненным. Shp_* параметры должны быть включены в подпись.

---

## 4. URL‑ы Robokassa и их смысл

**ResultURL** (`/robokassa/result`) — единственный источник истины оплаты.  
Обработчик:
- проверяет подпись (OutSum:InvId:Pass2:Shp_*),
- создаёт/находит пользователя,
- помечает заказ paid,
- выдаёт доступ,
- шлёт magic‑link,
- отвечает `OK<InvId>`.

**SuccessURL** — только UX (“спасибо”). На нём нельзя выдавать доступ.

**FailURL** — UX отказа/повтора оплаты.

---

## 5. Поток доступа

1. Оплата.
2. ResultURL подтверждает и шлёт magic‑link.
3. Клиент открывает `/magic?token=...`.
4. Фронт вызывает `/api/auth/magic-consume` → устанавливается сессия.
5. Клиент задаёт пароль через `/api/auth/set-password` (опционально).

---

## 6. Тестовый режим

1. В ЛК включите тест.
2. В settings.json поставьте is_test=true и тестовые Pass1/Pass2.
3. Платёж уйдёт с IsTest=1, ResultURL вызовется так же.

---

## 7. Чек‑лист

- Robokassa: URL‑ы заданы, signature_alg совпадает, фискализация включена при необходимости.
- Backend: settings заполнен, /health без ошибок, products.json корректен, письма отправляются.
- Frontend: createOrder → POST‑редирект на Robokassa, SuccessURL не выдаёт доступ.

---

Готово: это рабочий минимальный поток Robokassa + 54‑ФЗ + выдача доступа + кабинет без ручной поддержки.


## Примечание v1.6
Цена берётся только сервером из products.json. Переданный с фронта amount игнорируется/проверяется на совпадение.
