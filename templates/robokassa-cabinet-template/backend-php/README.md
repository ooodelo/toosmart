# Backend (PHP/MySQL) - v1.6.1

Endpoints:
- POST /api/order/create
- POST /api/auth/magic-consume
- POST /api/auth/set-password
- POST /api/auth/login
- POST /robokassa/result
- GET /health
- GET /admin/setup?token=...
- GET /admin/orders?token=...
- GET /config.js.php

Setup:
1) copy storage/settings.json.example -> storage/settings.json
2) fill settings
3) open /health once to create tables
