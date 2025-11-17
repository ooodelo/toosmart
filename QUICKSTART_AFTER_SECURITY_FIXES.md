# 🚀 Quick Start After Security Fixes

This guide helps you get the project running after all security improvements have been applied.

---

## ⏱️ 5-Minute Setup

### Step 1: Install Dependencies

```bash
npm install
```

Expected output: "added XXX packages" with some deprecation warnings (only in dev dependencies, safe to ignore).

---

### Step 2: Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your real credentials:

```bash
nano .env
# or
vim .env
# or
code .env
```

**Required fields**:
- `ROBOKASSA_PASSWORD2` - Get from Robokassa dashboard
- `USERS_FILE_PATH` - Set to `/path/to/your/private/users.json`
- `SITE_URL` - Your production domain

---

### Step 3: Set Permissions

```bash
# Create private directory
mkdir -p private

# Set permissions
chmod 700 private/
chmod 600 .env

# If users.json exists
chmod 600 private/users.json
```

---

### Step 4: Build the Site

```bash
# Build both versions
npm run build

# Or build specific version
npm run build:free
npm run build:premium
```

Expected output: "✅ Сборка завершена"

---

### Step 5: Test Locally

```bash
# Start development server
npm run dev
```

Open: http://localhost:3000

---

## 🧪 Testing Security Features

### Test 1: CSRF Protection

1. Open http://localhost:3000/premium/
2. Open browser DevTools → Console
3. Try to submit login form with JavaScript:
   ```javascript
   fetch('/premium/auth.php', {
       method: 'POST',
       body: 'email=test@test.com&password=test'
   })
   ```
4. ✅ Expected: Redirect to `index.php?error=csrf`

---

### Test 2: Rate Limiting

1. Try logging in with wrong password 6 times
2. ✅ Expected: After 5th attempt, see "Too many login attempts" message

---

### Test 3: Build Script Security

Create a malicious `index.json`:

```bash
cd content/intro/
cat > index.json << 'EOF'
[
  {
    "source": "../../../etc/passwd",
    "title": "Malicious"
  }
]
EOF
```

Run build:
```bash
npm run build
```

✅ Expected: Warning "Skipping ../../../etc/passwd: Path traversal detected"

Clean up:
```bash
cd content/intro/
rm index.json
```

---

## 📋 Pre-Production Checklist

Before deploying to production:

### Security Configuration

- [ ] `.env` file created with **real** credentials (not example values)
- [ ] `.env` is **not** committed to git (`git status` should not show it)
- [ ] `ROBOKASSA_PASSWORD2` matches Robokassa dashboard
- [ ] `ROBOKASSA_TEST_MODE=false` for production
- [ ] `SESSION_LIFETIME` configured (default: 86400 = 24 hours)
- [ ] `RATE_LIMIT_MAX_ATTEMPTS` configured (default: 5)

### File Permissions

- [ ] `private/` directory: 700 (drwx------)
- [ ] `private/users.json`: 600 (-rw-------)
- [ ] `.env`: 600 (-rw-------)
- [ ] No sensitive files in `dist/` directory

### Server Requirements

- [ ] PHP 7.4 or higher installed
- [ ] Apache `mod_rewrite` enabled
- [ ] Apache `mod_headers` enabled
- [ ] SSL certificate installed (HTTPS)
- [ ] HTTPS redirect configured
- [ ] `.htaccess` files uploaded and working

### Testing

- [ ] Can login with valid credentials
- [ ] Cannot login with invalid credentials
- [ ] Rate limiting triggers after 5 failed attempts
- [ ] Session expires after configured time
- [ ] Payment flow works (test mode first!)
- [ ] Email sending works
- [ ] Build script completes without errors

### Monitoring

- [ ] Error logging enabled
- [ ] Log files are being written
- [ ] Backup system configured for `users.json`
- [ ] Monitoring/alerting configured (optional but recommended)

---

## 🔧 Common Issues & Solutions

### Issue 1: "ROBOKASSA_PASSWORD2 not configured"

**Symptom**: Payment callbacks fail with 500 error

**Solution**:
1. Check `.env` file exists: `ls -la .env`
2. Check `ROBOKASSA_PASSWORD2` is set: `cat .env | grep ROBOKASSA_PASSWORD2`
3. Ensure no spaces around `=`: `ROBOKASSA_PASSWORD2=yourpassword` ✅ (not `= yourpassword` ❌)
4. Restart PHP-FPM/Apache: `sudo systemctl restart apache2`

---

### Issue 2: "Permission denied" on users.json

**Symptom**: Cannot write to users database

**Solution**:
```bash
# Check current permissions
ls -la private/users.json

# Fix ownership (replace 'www-data' with your web server user)
sudo chown www-data:www-data private/users.json
sudo chown www-data:www-data private/

# Fix permissions
sudo chmod 600 private/users.json
sudo chmod 700 private/
```

---

### Issue 3: CSRF Error on Login

**Symptom**: Always redirected to `index.php?error=csrf`

**Possible causes**:

1. **Session not starting**:
   ```bash
   # Check PHP session configuration
   php -i | grep session.save_path

   # Ensure directory exists and is writable
   sudo mkdir -p /var/lib/php/sessions
   sudo chown www-data:www-data /var/lib/php/sessions
   ```

2. **Cookies blocked**:
   - Check browser allows cookies
   - Check HTTPS is working (cookies require Secure flag)
   - Check domain matches (no www. vs with www. mismatch)

3. **Multiple PHP versions**:
   ```bash
   # Check which PHP is running
   php -v
   apache2 -M | grep php

   # Ensure both use the same version
   ```

---

### Issue 4: Session Expires Immediately

**Symptom**: Login works but immediately logged out

**Solution**:
1. Check `SESSION_LIFETIME` in `.env`:
   ```bash
   cat .env | grep SESSION_LIFETIME
   ```

2. If too short, increase it:
   ```bash
   SESSION_LIFETIME=86400  # 24 hours
   ```

3. Clear browser cookies and try again

---

### Issue 5: Rate Limiting Not Working

**Symptom**: Can make unlimited login attempts

**Solution**:
1. Check sessions are working (see Issue 3)
2. Check rate limit configuration:
   ```bash
   cat .env | grep RATE_LIMIT
   ```
3. Ensure `Security::checkRateLimit()` is called in `auth.php` (should be by default)

---

### Issue 6: npm Audit Shows Vulnerabilities

**Symptom**: `npm audit` shows 6 vulnerabilities

**Explanation**: These are in `live-server` (dev dependency only):
- ✅ **Safe**: Not used in production
- ✅ **Isolated**: Only for local development
- ✅ **No risk**: Build output is static HTML/CSS/JS

**Optional fix** (may break compatibility):
```bash
npm audit fix --force
```

**Better approach**: Ignore dev dependency warnings:
```bash
npm audit --production
# Should show 0 vulnerabilities
```

---

## 📊 Verify Installation

Run this script to verify everything is configured correctly:

```bash
#!/bin/bash
echo "🔍 TooSmart Security Verification"
echo "=================================="
echo ""

# Check .env file
if [ -f ".env" ]; then
    echo "✅ .env file exists"

    if [ $(stat -c %a .env) -eq 600 ]; then
        echo "✅ .env permissions correct (600)"
    else
        echo "⚠️  .env permissions incorrect (should be 600)"
    fi

    if grep -q "YOUR_PASSWORD2_HERE" .env; then
        echo "❌ .env contains example values! Update with real credentials."
    else
        echo "✅ .env appears configured"
    fi
else
    echo "❌ .env file not found! Create it: cp .env.example .env"
fi

echo ""

# Check private directory
if [ -d "private" ]; then
    echo "✅ private/ directory exists"

    if [ $(stat -c %a private) -eq 700 ]; then
        echo "✅ private/ permissions correct (700)"
    else
        echo "⚠️  private/ permissions incorrect (should be 700)"
    fi
else
    echo "⚠️  private/ directory not found (will be created on first payment)"
fi

echo ""

# Check node_modules
if [ -d "node_modules" ]; then
    echo "✅ node_modules installed"
else
    echo "❌ node_modules not found! Run: npm install"
fi

echo ""

# Check build output
if [ -d "dist/free" ] && [ -d "dist/premium" ]; then
    echo "✅ Build output exists (dist/free and dist/premium)"
else
    echo "⚠️  Build output not found. Run: npm run build"
fi

echo ""

# Check security files
if [ -f "server/config.php" ] && [ -f "server/security.php" ]; then
    echo "✅ Security libraries present"
else
    echo "❌ Security libraries missing!"
fi

echo ""

# Check for sensitive files in git
if git check-ignore .env > /dev/null 2>&1; then
    echo "✅ .env is gitignored"
else
    echo "❌ .env is NOT gitignored! Add to .gitignore immediately!"
fi

echo ""
echo "=================================="
echo "Verification complete!"
```

Save as `verify-security.sh`, make executable, and run:
```bash
chmod +x verify-security.sh
./verify-security.sh
```

---

## 🆘 Still Having Issues?

### Debug Mode

Enable debug mode in `.env`:
```bash
DEBUG_MODE=true
```

This will:
- Show detailed error messages
- Log more information
- Help identify configuration issues

**⚠️ IMPORTANT**: Disable in production!

---

### Check Logs

**Apache error log**:
```bash
tail -f /var/log/apache2/error.log
```

**PHP error log** (location varies):
```bash
tail -f /var/log/php/error.log
# or
tail -f /var/log/php-fpm/error.log
```

**Application logs**:
Look for JSON formatted logs from `Security::secureLog()`

---

### Get Help

1. Read `SECURITY.md` for detailed documentation
2. Check `SECURITY_FIXES_CHANGELOG.md` for what changed
3. Review error logs for specific error messages
4. Contact: support@toosmart.com

---

## ✅ Success Indicators

You'll know everything is working when:

1. **Login page loads** without errors
2. **Can login** with valid test credentials
3. **CSRF protection works** (can't submit form via fetch without token)
4. **Rate limiting triggers** after 5 failed attempts
5. **Build completes** without errors: `npm run build`
6. **No errors** in browser console
7. **Security headers present** in HTTP responses
8. **Payment callback** creates user and sends email (test mode)

---

**Last Updated**: 2025-11-17
**Version**: 2.0.0
**Status**: Production Ready ✅
