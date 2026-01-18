# JWT Security Recommendations

## Current Status

**Environment**: Development
**JWT_SECRET Location**: docker-compose.yml (hardcoded)
**Security Level**: ⚠️ **Development Only**

---

## Is Current Setup OK?

### ✅ For Development/Testing: **YES**
- Strong 128-character secret
- Cryptographically secure random generation
- Proper expiry configuration
- Works perfectly for local development

### 🔴 For Production: **NO - Must Fix**
- Secret exposed in version control
- No secret rotation capability
- Same secret across all environments
- Security risk if repository is compromised

---

## Immediate Action Required for Production

### Priority 1: Move Secret Out of docker-compose.yml

**Option A: Use .env File (Easiest)**

1. **Update docker-compose.yml:**
```yaml
backend:
  env_file:
    - ./backend/.env
  environment:
    # Remove JWT_SECRET line
    # Keep only:
    - JWT_ACCESS_TOKEN_EXPIRY=15m
    - JWT_REFRESH_TOKEN_EXPIRY=7d
    # ... other vars
```

2. **Create backend/.env:**
```env
# Copy from docker-compose.yml, then remove from there
JWT_SECRET=b9adcae340bc05b8b527f61067aaad6122cae3639e33e2ec39da3b68ae9d5ff64a080d73f62e384a8f40c49005d7bdf5647d36f019bc625d151f334ca680a4cf
```

3. **Ensure .env is gitignored:**
```bash
# Add to .gitignore if not already there
echo "backend/.env" >> .gitignore
```

4. **Create .env.example for documentation:**
```bash
# backend/.env.example
JWT_SECRET=generate-your-own-secret-here
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

**Option B: Use Docker Secrets (Production-Grade)**

1. **Create secrets directory:**
```bash
mkdir -p secrets
echo "your-production-secret" > secrets/jwt_secret.txt
chmod 600 secrets/jwt_secret.txt
echo "secrets/" >> .gitignore
```

2. **Update docker-compose.yml:**
```yaml
services:
  backend:
    secrets:
      - jwt_secret
    environment:
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - JWT_ACCESS_TOKEN_EXPIRY=15m
      - JWT_REFRESH_TOKEN_EXPIRY=7d

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

3. **Update backend code to read from file:**
```typescript
// backend/src/config/jwt.config.ts
const jwtSecretFile = process.env.JWT_SECRET_FILE;
const jwtSecret = jwtSecretFile
  ? fs.readFileSync(jwtSecretFile, 'utf8').trim()
  : process.env.JWT_SECRET;
```

---

**Option C: Environment Variables (CI/CD)**

1. **Update docker-compose.yml:**
```yaml
backend:
  environment:
    - JWT_SECRET=${JWT_SECRET}  # From host environment
    - JWT_ACCESS_TOKEN_EXPIRY=15m
    - JWT_REFRESH_TOKEN_EXPIRY=7d
```

2. **Set in deployment environment:**
```bash
# In CI/CD or production server
export JWT_SECRET="production-secret-here"
docker compose up -d
```

---

## Security Best Practices

### 1. Secret Management ✅

- [ ] **Remove JWT_SECRET from docker-compose.yml**
- [ ] **Store in .env file (gitignored)**
- [ ] **Use different secrets for each environment**
  - Development: Current secret is fine
  - Staging: Generate new secret
  - Production: Generate new secret
- [ ] **Document secret generation in .env.example**

### 2. Secret Rotation Strategy 🔄

**When to rotate:**
- On suspected compromise
- Quarterly (every 3 months) as best practice
- After team member departures
- Before production launch

**How to rotate safely:**
```bash
# 1. Generate new secret
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 2. Update .env file
echo "JWT_SECRET=$NEW_SECRET" > backend/.env

# 3. Restart backend
docker compose restart backend

# Note: All existing tokens will be invalidated
# Users will need to login again
```

### 3. Environment Separation 🔐

| Environment | Secret Source | Rotation |
|-------------|---------------|----------|
| Development | .env file | Rarely (only if compromised) |
| Staging | .env file or secrets manager | Monthly |
| Production | Secrets manager (AWS/Azure/GCP) | Quarterly |

### 4. Additional JWT Security 🛡️

**Already Implemented:**
- ✅ Short-lived access tokens (15 min)
- ✅ Refresh token rotation
- ✅ Token stored as SHA-256 hash
- ✅ Daily token cleanup

**Consider Adding:**
- [ ] JWT algorithm verification (prevent "none" algorithm attack)
- [ ] Token revocation list (for emergency token invalidation)
- [ ] Device fingerprinting (detect token theft)
- [ ] Anomaly detection (unusual login patterns)

---

## Current Risk Assessment

### Development Environment (Current)
**Risk Level**: 🟢 **LOW**
- Local network only
- Not exposed to internet
- Team-controlled repository

### If Deployed to Production (Without Changes)
**Risk Level**: 🔴 **HIGH**
- JWT secret in git history
- All tokens can be forged if repo is compromised
- No ability to rotate secret easily

---

## Deployment Checklist

Before deploying to production:

### Critical (Must Do) 🔴
- [ ] Move JWT_SECRET out of docker-compose.yml
- [ ] Store JWT_SECRET in environment-specific .env files
- [ ] Add .env files to .gitignore
- [ ] Generate unique JWT_SECRET for production
- [ ] Change default admin password (Admin@123!)
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules

### Important (Should Do) 🟡
- [ ] Set up secrets management (AWS Secrets Manager, Azure Key Vault, etc.)
- [ ] Implement secret rotation schedule
- [ ] Configure rate limiting (already done for auth endpoints)
- [ ] Set up monitoring/alerting for failed login attempts
- [ ] Enable audit logging (already implemented)

### Recommended (Nice to Have) 🟢
- [ ] Implement 2FA/MFA
- [ ] Add JWT refresh token family tracking
- [ ] Set up anomaly detection
- [ ] Configure IP whitelisting for admin users
- [ ] Implement session management dashboard

---

## Quick Fix for Development

If you want to keep current setup for development but prepare for production:

1. **Keep docker-compose.yml as is** for local development
2. **Create docker-compose.prod.yml:**
```yaml
services:
  backend:
    environment:
      - JWT_SECRET=${JWT_SECRET}  # From environment
      - NODE_ENV=production
```

3. **Deploy with:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Generate New Production Secret

When ready for production:

```bash
# Generate strong secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 64

# Or using /dev/urandom
head -c 64 /dev/urandom | base64
```

**Copy output and store in:**
- Production secrets manager (AWS/Azure/GCP)
- Or encrypted .env file (gitignored)
- Never commit to git!

---

## Summary

### For Your Current Development Setup:
✅ **It's OK to use** - The secret is strong and works perfectly for local development.

### Before Production Deployment:
🔴 **Must change** - Move JWT_SECRET to .env file or secrets manager, generate new production secret.

### Recommended Next Step:
1. Keep current setup for development (works fine)
2. Add to your deployment checklist: "Move JWT_SECRET to environment variables"
3. When deploying to production, use Option A (.env file) or Option B (Docker secrets)

---

## Questions?

**Q: Can I keep the current secret for development?**
A: Yes! It's perfectly fine for local development.

**Q: When should I change it?**
A: Before deploying to any environment accessible outside your local network (staging, production).

**Q: Will changing the secret break anything?**
A: All existing JWT tokens will become invalid. Users will need to login again.

**Q: How often should I rotate the production secret?**
A: Every 3-6 months, or immediately if compromised.

**Q: What if I accidentally commit the secret to git?**
A: Generate a new secret immediately, update your deployment, and consider the old secret compromised. Rewrite git history if needed (careful!).
