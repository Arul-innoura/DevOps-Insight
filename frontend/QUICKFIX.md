# Quick Fix for Azure SSO 400 Error

## THE PROBLEM
Your Azure App Registration is likely configured as **"Web"** instead of **"Single-page application (SPA)"**. This causes the 400 error because SPAs use different OAuth flows than Web apps.

## THE FIX (5 minutes)

### Step 1: Go to Azure Portal
1. Open [Azure Portal](https://portal.azure.com)
2. Navigate to: **Azure Active Directory** → **App registrations**
3. Find your app with Client ID: `2cc4db33-435b-45ee-a2d6-63e15a4d6f77`

### Step 2: Check Platform Type
1. Click **Authentication** in the left sidebar
2. Look at **Platform configurations** section
3. **If you see "Web"** → This is your problem!

### Step 3: Fix the Platform
**Option A - If "Web" platform exists:**
1. Click the trash icon to **delete the "Web" platform**
2. Click **Add a platform**
3. Choose **Single-page application**
4. Enter Redirect URI: `http://localhost:3000`
5. Make sure these are checked:
   - ✅ Access tokens (used for implicit flows)
   - ✅ ID tokens (used for implicit and hybrid flows)
6. Click **Configure**
7. Click **Save** at the top

**Option B - If no platform exists:**
1. Click **Add a platform**
2. Choose **Single-page application**
3. Enter Redirect URI: `http://localhost:3000`
4. Click **Configure**
5. Click **Save** at the top

### Step 4: Verify Redirect URI
Make sure the redirect URI is **EXACTLY**: `http://localhost:3000`
- ❌ NOT: `http://localhost:3000/` (no trailing slash!)
- ❌ NOT: `https://localhost:3000` (http not https!)
- ✅ YES: `http://localhost:3000`

### Step 5: Add App Roles (if not done)
1. Go to **App roles** in left sidebar
2. Click **Create app role**
3. Add these three roles:

**Role 1: Admin**
- Display name: `Admin`
- Allowed member types: `Users/Groups`
- Value: `Admin`
- Description: `Administrator access`
- Enable this app role: ✅ Checked

**Role 2: DevOps Team**
- Display name: `DevOps Team`
- Allowed member types: `Users/Groups`
- Value: `DevOps Team`
- Description: `DevOps team access`
- Enable this app role: ✅ Checked

**Role 3: User**
- Display name: `User`
- Allowed member types: `Users/Groups`
- Value: `User`
- Description: `Standard user access`
- Enable this app role: ✅ Checked

4. Click **Apply** for each role

### Step 6: Assign Users to Roles
1. Go back to **Azure Active Directory**
2. Click **Enterprise applications** (not App registrations)
3. Find your app by the same name
4. Click **Users and groups**
5. Click **Add user/group**
6. Select a user
7. Select a role (Admin, DevOps Team, or User)
8. Click **Assign**
9. Repeat for all users

### Step 7: Test the App
1. Close all browser tabs
2. Clear browser cache: Ctrl+Shift+Delete → Clear browsing data
3. Open new tab: `http://localhost:3000`
4. Open DevTools: Press F12
5. Go to Console tab
6. Click "Single Sign-On (Azure AD)" button
7. Watch for detailed error logs in console

## Still Getting 400 Error?

### Check Browser Console
Look for these error codes in console:
- `AADB2C90088` = Wrong platform configuration (use SPA not Web)
- `AADSTS50011` = Redirect URI mismatch
- `AADSTS700054` = response_type not supported

### Check Network Tab
1. Open DevTools → Network tab
2. Filter: "token"
3. Click the failed POST request
4. Go to **Payload** tab
5. Look for:
   - ✅ `grant_type=authorization_code` (correct)
   - ✅ `code_verifier=...` (PKCE - correct)
   - ❌ `client_secret=...` (WRONG for SPA!)

### Quick Reset
If nothing works, clear everything:
```javascript
// Run in browser console:
sessionStorage.clear();
localStorage.clear();
location.reload();
```

## Environment Variables (Optional)

Create `.env` in project root:
```
REACT_APP_REDIRECT_URI=http://localhost:3000
```

This makes redirect URI configurable for different environments.

## Need More Help?

See full guide: `AZURE_TROUBLESHOOTING.md`

---

**Bottom Line**: The 400 error almost always means your app is registered as "Web" instead of "Single-page application" in Azure AD. Fix that first!
