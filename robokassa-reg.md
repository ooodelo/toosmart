# Краткий гайд по настройке Robokassa после активации магазина

Я прошёл по всем настройкам в ЛК Robokassa. Вот что нужно сделать:

## 1. ДАННЫЕ ИЗ ЛК ROBOKASSA (уже настроено)

## Основные параметры:

- **Идентификатор магазина (MerchantLogin)**: `toosmart`
- **Алгоритм расчёта хеша**: `MD5`

## Боевые пароли (для production):

- **Пароль #1**: `IW28UB5YCX9ZZjTNeWEq`
- **Пароль #2**: `RvESxE1Gnd8oh62TG2yG`

## Тестовые пароли (для istest: true):

- **Алгоритм**: `MD5`
- **Тестовый Пароль #1**: `flXqbcCV47812lh9XALa`
- **Тестовый Пароль #2**: `otW6HzMh32rCO4c5GVTA`

## URL-адреса (уже настроены в ЛК):

- **Result URL**: `https://toosmart.ru/premium/robokassa/result.php` (метод: POST)
- **Success URL**: `https://toosmart.ru/premium/success.php` (метод: GET)
- **Fail URL**: `https://toosmart.ru/premium/fail.php` (метод: GET)

------

## 2. ЧТО ВКЛЮЧИТЬ В КОД САЙТА

## Обновите `premium/storage/settings.json`:

```
json
{
  "db": {
    "dsn": "mysql:host=localhost;dbname=toosmart;charset=utf8mb4",
    "user": "toosmart_user",
    "pass": "ВАШ_ПАРОЛЬ_БД"
  },
  "robokassa": {
    "merchantLogin": "toosmart",
    "pass1": "IW28UB5YCX9ZZjTNeWEq",
    "pass2": "RvESxE1Gnd8oh62TG2yG",
    "istest": true,
    "signatureAlg": "md5",
    "successUrl": "https://toosmart.ru/premium/success.php",
    "failUrl": "https://toosmart.ru/premium/fail.php",
    "defaultSno": "usn_income",
    "defaultTax": "none",
    "productCode": "premiumcourse"
  },
  "security": {
    "sessionName": "toosmart_premium",
    "adminToken": "СГЕНЕРИРУЙТЕ_32_СИМВОЛА"
  },
  "emails": {
    "from": "noreply@toosmart.ru",
    "transport": "phpmail"
  },
  "site": {
    "baseUrl": "https://toosmart.ru"
  }
}
```

**Важно**:

- Для тестирования оставьте `"istest": true`
- Для боевого режима измените на `"istest": false`

------

## 3. ТЕСТИРОВАНИЕ

## Для тестовых платежей используйте:

- **Тестовая карта**: 5555 5555 5555 5599
- **Срок**: любая будущая дата (например, 12/25)
- **CVV**: любой (например, 123)

## Проверьте:

1. Создание заказа через ваш сайт (сумма 990₽)
2. Переход на форму оплаты Robokassa
3. Успешная оплата тестовой картой
4. Получение уведомления на Result URL
5. Отправка Magic Link на email пользователя

------

## 4. ФИНАЛЬНАЯ ДОНАСТРОЙКА В ЛК ROBOKASSA

⚠️ **ВАЖНО**: Вам нужно **подтвердить изменения по email**!

На ваш email `sofia.konstantinova.01@mail.ru` отправлен код подтверждения. Введите его в поле "Код подтверждения" и нажмите "Сохранить". Код действителен 20 минут.[partner.robokassa](https://partner.robokassa.ru/Shops/Edit/9821fc57-e6a0-481b-a9f8-9eb7c2d2695e?sType=Shop_Settings)

------

## 5. ПЕРЕХОД В PRODUCTION

Когда всё протестировано:

1. **В ЛК Robokassa**:

   - Перейдите в раздел "Операции" → включите боевой режим (если требуется)

2. **В коде (`settings.json`)**:

   ```
   json
   "istest": false
   ```

3. **Проверьте**:

   - Пароли для production (pass1, pass2) корректны
   - URL-адреса доступны через HTTPS
   - Права на файлы: `chmod 600 storage/settings.json`

------

## 6. SECURITY CHECKLIST

✅ Result URL защищён (принимает только POST)
 ✅ Проверка подписи Robokassa в `result.php`
 ✅ settings.json имеет права 600
 ✅ Email-уведомления настроены
 ✅ Magic links с expiration 24 часа

Всё готово для интеграции! Осталось только подтвердить настройки через email-код.

1. https://partner.robokassa.ru/Shops/Edit/9821fc57-e6a0-481b-a9f8-9eb7c2d2695e?sType=Shop_Settings