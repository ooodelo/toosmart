# Исправление ошибки Robokassa "Error code: 29 - No payment methods available"

## Проблема
При попытке оплаты через Robokassa возникает ошибка:
```
Error code: 29
No payment methods available
```

## Причины ошибки

### 1. Не настроены способы оплаты в ЛК Robokassa (НАИБОЛЕЕ ВЕРОЯТНО)

Это самая частая причина данной ошибки в тестовом режиме.

**Решение:**
1. Войдите в личный кабинет Robokassa: https://auth.robokassa.ru/
2. Перейдите в раздел **"Магазины"**
3. Выберите свой магазин **"toosmart"**
4. Перейдите в **"Технические настройки"**
5. Убедитесь, что включены способы оплаты:
   - ✅ Банковские карты (Visa, Mastercard, Мир)
   - ✅ СБП (Система быстрых платежей)
   - ✅ Другие методы оплаты по необходимости
6. Сохраните изменения

### 2. Магазин не активирован или не прошел модерацию

**Решение:**
1. Проверьте статус магазина в личном кабинете
2. Убедитесь, что магазин прошел модерацию
3. Для тестового режима это обычно не требуется, но проверьте

### 3. Неправильные параметры тестового режима

**Решение:**
1. В личном кабинете Robokassa перейдите в **"Технические настройки"**
2. Найдите раздел **"Параметры проведения тестовых платежей"**
3. Скопируйте **тестовые пароли** (Test Password #1 и Test Password #2)
4. Обновите их в файле `/home/user/toosmart/server/storage/settings.json`:
   ```json
   "robokassa": {
     "test_password1": "ВАШИ_ТЕСТОВЫЕ_ПАРОЛИ_ЗДЕСЬ",
     "test_password2": "ВАШИ_ТЕСТОВЫЕ_ПАРОЛИ_ЗДЕСЬ",
     "is_test": true
   }
   ```

### 4. Неверная валюта или отсутствие параметра OutSumCurrency

**ИСПРАВЛЕНО** в коммите: добавлен параметр `OutSumCurrency: 'RUB'`

## Что было исправлено в коде

### Изменения в `/server/api/order/create.php`

Добавлен явный параметр валюты:
```php
$params = [
  'MerchantLogin' => $cfg['robokassa']['merchant_login'],
  'OutSum' => $outSum,
  'OutSumCurrency' => 'RUB',  // ← ДОБАВЛЕНО
  'InvId' => $invId,
  // ... остальные параметры
];
```

## Пошаговая инструкция для проверки

### Шаг 1: Проверьте настройки в ЛК Robokassa

1. Войдите: https://auth.robokassa.ru/
2. Магазины → toosmart → Технические настройки
3. Проверьте:
   - ✅ Включен тестовый режим (если тестируете)
   - ✅ Настроены способы оплаты
   - ✅ Указаны тестовые пароли

### Шаг 2: Проверьте URL-адреса

Убедитесь, что URL-адреса совпадают:

**В ЛК Robokassa:**
- Result URL: `https://toosmart.ru/premium/robokassa-callback.php`
- Success URL: `https://toosmart.ru/premium/success.php`
- Fail URL: `https://toosmart.ru/premium/fail.php`

**В `/server/storage/settings.json`:**
```json
"robokassa": {
  "success_url": "https://toosmart.ru/premium/success.php",
  "fail_url": "https://toosmart.ru/premium/fail.php"
}
```

### Шаг 3: Проверьте тестовые пароли

**ВАЖНО:** В тестовом режиме используйте **тестовые пароли**, а не боевые!

1. В ЛК Robokassa найдите раздел **"Параметры проведения тестовых платежей"**
2. Скопируйте тестовые пароли
3. Обновите в `settings.json`:
   ```json
   "robokassa": {
     "test_password1": "n67AucI3p5bpUGJOxN3v",
     "test_password2": "Hzu2rdP8C2nn7kBfcPV1",
     "is_test": true
   }
   ```

### Шаг 4: Тестирование

1. Откройте сайт: https://toosmart.ru
2. Нажмите на кнопку оплаты
3. Введите email
4. Нажмите "Оплатить"
5. Должен произойти редирект на страницу Robokassa
6. Если снова видите ошибку 29, проверьте пункты 1-3

## Дополнительные проверки

### Проверка формата суммы

Убедитесь, что сумма корректно форматируется (с точкой, не запятой):
```php
// Правильно: 990.00
// Неправильно: 990,00
```

Это уже реализовано в функции `rk_format_outsum()` в файле `server/src/robokassa/helpers.php:2-5`

### Проверка чека (Receipt)

Чек должен:
- Содержать корректный формат JSON
- Сумма всех позиций должна совпадать с OutSum
- Все обязательные поля заполнены

Это уже реализовано в файле `server/api/order/create.php:62-76`

## Контакты поддержки

Если проблема не решается:

1. **Поддержка Robokassa:**
   - Email: support@robokassa.ru
   - Телефон: 8 (800) 500-44-55
   - Онлайн-чат в личном кабинете

2. **Полезные ссылки:**
   - Документация: https://docs.robokassa.ru/
   - Типичные ошибки: https://robokassa.com/content/tipichnye-oshibki.html
   - Тестовый режим: https://robo-kassir.ru/testovyj-rezhim-sandbox/

## Источники

- [Robokassa Sandbox: тестирование и чек‑лист релиза](https://robo-kassir.ru/testovyj-rezhim-sandbox/)
- [Типичные ошибки и их расшифровка](https://robokassa.com/content/tipichnye-oshibki.html)
- [Документация Robokassa](https://docs.robokassa.ru/)
- [Интерфейс оплаты](https://docs.robokassa.ru/payment/)
- [Фискализация](https://docs.robokassa.ru/fiscalization/)

---

**Дата создания:** 2025-12-15
**Версия:** 1.0
