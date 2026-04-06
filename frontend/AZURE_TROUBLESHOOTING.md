# Azure SSO 400 Error Troubleshooting Guide

## Current Error
```
POST https://login.microsoftonline.com/cd775fb1-40c4-42dc-8ddf-2ca152bec472/oauth2/v2.0/token
Status: 400 Bad Request
```

## Common Causes & Solutions

### 1. **Platform Configuration Mismatch** (MOST LIKELY)
**Problem**: Your Azure App Registration is configured as "Web" instead of "Single-page application (SPA)"

**Solution**:
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Find your app: **Client ID: 2cc4db33-435b-45ee-a2d6-63e15a4d6f77**
4. Click on **Authentication** in the left menu
5. Check the **Platform configurations** section:
   - ✅ **CORRECT**: You should see "Single-page application" with `http://localhost:3000`
   - ❌ **WRONG**: If you see "Web" platform, this is your problem

**To Fix**:
- If "Web" platform exists: **DELETE IT**
- Click **Add a platform** → Select **Single-page application**
- Enter Redirect URI: `http://localhost:3000`
- Save changes

### 2. **Redirect URI Mismatch**
**Problem**: The redirect URI in your code doesn't exactly match Azure AD

**Current Config**: `http://localhost:3000`

**Check in Azure Portal**:
1. Go to your App Registration → **Authentication**
2. Under "Single-page application" section
3. Verify **EXACT** match: `http://localhost:3000`
   - ❌ `http://localhost:3000/` (trailing slash) = MISMATCH
   - ❌ `https://localhost:3000` (https) = MISMATCH
   - ✅ `http://localhost:3000` = CORRECT

### 3. **Client Secret in SPA** (Should NOT exist)
**Problem**: A client secret is configured, causing Azure to expect confidential client flow

**Solution**:
1. Go to your App Registration → **Certificates & secrets**
2. If you see any client secrets: **This is a problem for SPA**
3. SPAs should NOT use client secrets (they run in browsers)
4. If secrets exist, you can ignore them, but make sure your code doesn't try to use them

### 4. **Token Request Flow Issues**
**Problem**: MSAL is not properly handling the authorization code flow with PKCE

**Debugging Steps**:
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Try to sign in
4. Look for detailed error messages
5. Check **Network** tab → Filter by "token" → Look at the failed request
6. Click on the failed request → **Payload** tab to see what was sent

**Common Error Messages**:
- `AADB2C90088`: Application is not correctly configured = Wrong platform type
- `AADSTS50011`: Redirect URI mismatch
- `AADSTS700054`: response_type not supported = Wrong platform configuration

### 5. **Token Endpoint Configuration**
For SPA with MSAL, Azure should:
- Use Authorization Code Flow with PKCE
- NOT require client_secret
- Accept code_verifier

**If you see in Network tab**:
- `grant_type=authorization_code` ✅ Correct
- `client_secret=...` ❌ Wrong for SPA
- `code_verifier=...` ✅ Correct (PKCE)

## Step-by-Step Fix Guide

### Option A: Recreate as SPA (Recommended)
1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Find: **2cc4db33-435b-45ee-a2d6-63e15a4d6f77**
3. **Authentication** → Delete any "Web" platform configurations
4. **Add a platform** → **Single-page application**
5. Redirect URI: `http://localhost:3000`
6. Check **Access tokens** and **ID tokens** under Implicit grant
7. **Save**

### Option B: Verify Current Configuration
Run this checklist in Azure Portal:

- [ ] App Registration → **Authentication**
  - [ ] Platform = "Single-page application" (NOT "Web")
  - [ ] Redirect URI = `http://localhost:3000` (exact match)
  - [ ] Implicit grant: ID tokens ✅ checked
  
- [ ] App Registration → **API permissions**
  - [ ] `openid` - Delegated ✅
  - [ ] `profile` - Delegated ✅
  - [ ] `email` - Delegated ✅
  
- [ ] App Registration → **Token configuration**
  - [ ] Add roles claim to ID token
  - [ ] Add optional claims: email, preferred_username

## Testing After Fix

1. Clear browser cache and cookies
2. Close all browser tabs
3. Open browser DevTools (F12)
4. Navigate to `http://localhost:3000`
5. Click "Single Sign-On (Azure AD)"
6. Monitor Console for errors
7. Monitor Network tab for token request

## Still Not Working?

Check these additional items:

1. **Browser Cache**: Hard refresh (Ctrl+Shift+R)
2. **Session Storage**: Clear it manually
   ```javascript
   sessionStorage.clear();
   ```
3. **MSAL Cache**: Clear MSAL cache
   ```javascript
   // In browser console
   sessionStorage.clear();
   localStorage.clear();
   ```

## Environment Variable Setup

Create `.env` file in project root:
```env
REACT_APP_REDIRECT_URI=http://localhost:3000
REACT_APP_CLIENT_ID=2cc4db33-435b-45ee-a2d6-63e15a4d6f77
REACT_APP_TENANT_ID=cd775fb1-40c4-42dc-8ddf-2ca152bec472
```

For production:
```env
REACT_APP_REDIRECT_URI=https://your-production-domain.com
```

## Quick Test Script

Run this in browser console to check MSAL configuration:
```javascript
// Check current MSAL config
const config = window.sessionStorage;
console.log("MSAL Cache:", Object.keys(config).filter(k => k.includes('msal')));

// Check redirect URI
console.log("Current Origin:", window.location.origin);
console.log("Expected Redirect:", "http://localhost:3000");
console.log("Match:", window.location.origin === "http://localhost:3000");
```

## Contact Support

If still failing after all checks:
1. Copy error from Network tab → Payload
2. Copy error from Console
3. Share Azure App Registration settings (Authentication section screenshot)
