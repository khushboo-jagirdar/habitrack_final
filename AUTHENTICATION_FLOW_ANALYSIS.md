# HABITRACK Authentication Flow Analysis

## 1. LOGIN FLOW OVERVIEW

### Frontend Trigger (SignIn.jsx)
- **Location**: [UI/src/routes/signIn/SignIn.jsx](UI/src/routes/signIn/SignIn.jsx)
- **User Input**: Email and password via form with mode toggle (User/Admin)
- **Validation**: Basic check for non-empty fields
- **Action on Submit**:
  ```
  1. User clicks "Sign In" button
  2. handleSubmit() is triggered
  3. Mode determines which API call:
     - User mode: calls loginUser(formData)
     - Admin mode: calls adminLogin(formData)
  4. On success: login(result.user, result.token) called via AuthContext
  5. Redirect: User mode → "/" | Admin mode → "/admin/dashboard"
  6. Toast notification shown
  ```

---

## 2. API CALLS & DATA TRANSMISSION

### Location: [UI/src/lib/api.js](UI/src/lib/api.js)

#### User Login
```javascript
const res = await fetch(`${API_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),  // { email, password }
});
```
- **Endpoint**: `POST /api/auth/login`
- **Payload**: `{ email: string, password: string }`
- **Success Response**: `{ token: string, user: {...} }`
- **Error Handling**: Throws error with `result?.message || "Login failed"`

#### Admin Login
```javascript
const res = await fetch(`${API_URL}/auth/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),  // { email, password }
});
```
- **Endpoint**: `POST /api/auth/admin/login`
- **Payload**: `{ email: string, password: string }`
- **Success Response**: `{ token: string, user: {...} }`
- **Error Handling**: Throws error with `result?.message || "Admin login failed"`

#### Configuration
- **API_URL**: From `VITE_API_URL` env var or defaults to `/api`
- **Vite Proxy**: Configured in [vite.config.js](vite.config.js) to proxy `/api` to `http://localhost:5000`

---

## 3. AUTHENTICATION STATE MANAGEMENT

### Location: [UI/src/context/AuthContext.jsx](UI/src/context/AuthContext.jsx)

#### AuthContext Structure
```javascript
Context Provides:
  - user: Current authenticated user object (or null)
  - login(userData, token): Sets user & token in state + localStorage
  - logout(): Clears user & token from state + localStorage
  - updateUser(updatedData): Updates user in state + localStorage
```

#### Data Persistence
```javascript
localStorage.setItem("user", JSON.stringify(normalized));
localStorage.setItem("token", token);
```
- User data and JWT token stored in browser localStorage
- Survives page refresh
- **User Normalization**: Ensures `id` field exists (maps MongoDB `_id` → `id`)

#### Initial Load
- App checks localStorage on mount for existing user session
- If user exists, they remain logged in after page refresh

---

## 4. BACKEND AUTHENTICATION ROUTES

### Location: [backend/routes/auth.js](backend/routes/auth.js)

#### POST `/auth/login` (User Login)
```javascript
1. Receives { email, password }
2. Validates both fields exist (400 error if missing)
3. Queries MongoDB: User.findOne({ email: email.toLowerCase() })
   - If not found → 401: "Invalid credentials."
4. Compares password with bcrypt: bcrypt.compare(password, user.password)
   - If mismatch → 401: "Invalid credentials."
5. Generates JWT token:
   jwt.sign({ id: user._id, email, userType, isAdmin }, JWT_SECRET, { expiresIn: '1d' })
6. Returns:
   {
     token: "jwt_token_here",
     user: {
       id: user._id,
       fullName: user.fullName,
       email: user.email,
       userType: user.userType,
       avatar: user.avatar,
       aadhaarVerified: user.aadhaarVerified,
       isAdmin: user.isAdmin
     }
   }
```

#### POST `/auth/admin/login` (Admin Login)
```javascript
1. Receives { email, password }
2. Validates both fields exist (400 error if missing)
3. First checks environment-based admin credentials:
   if (email == ADMIN_EMAIL && password == ADMIN_PASSWORD) {
     → Returns admin token with id: 'admin'
   }
4. If no match, queries DB: User.findOne({ email: email.toLowerCase(), isAdmin: true })
   - If not found → 401: "Invalid admin credentials."
5. Compares password with bcrypt
   - If mismatch → 401: "Invalid admin credentials."
6. Generates JWT token:
   jwt.sign({ id: user._id, email, userType: 'admin', isAdmin: true }, JWT_SECRET, { expiresIn: '1d' })
7. Returns similar structure with isAdmin: true
```

#### Environment Variables Required
```
JWT_SECRET=<your-secret-key>
ADMIN_EMAIL=admin@habittrack.com  (default)
ADMIN_PASSWORD=Admin@1234        (default)
MONGODB_URI=<mongodb-connection-string>
```

---

## 5. USER MODEL & DATA SCHEMA

### Location: [backend/models/User.js](backend/models/User.js)

```javascript
{
  fullName: String (required),
  email: String (required, unique, lowercase),
  password: String (required, bcrypt hashed),
  userType: String ('buyer'|'owner'|'agent'|'admin', default: 'buyer'),
  isAdmin: Boolean (default: false),
  avatar: String (default: ''),
  savedProperties: Array,
  aadhaarNumber: String,
  aadhaarVerified: Boolean,
  aadhaarOtp: String,
  aadhaarOtpExpiry: Date,
  aadhaarRefId: String,
  timestamps: true (createdAt, updatedAt)
}
```

---

## 6. ERROR HANDLING & MESSAGES

### Frontend Error Handling (SignIn.jsx)
```javascript
try {
  const result = await (mode === "admin" ? adminLogin : loginUser)(formData);
  login(result.user, result.token);
  toast.success(...); // Success toast
  navigate(...);
} catch (err) {
  setError(err.message || "Sign in failed. Please check your credentials.");
  // Error displayed in UI
}
```

### Error Messages Source
| Scenario | Error Message | HTTP Status |
|----------|---------------|-------------|
| Empty email/password | "Email and password are required." | 400 |
| User not in DB | "Invalid credentials." | 401 |
| Wrong password | "Invalid credentials." | 401 |
| Admin user not found (admin login) | "Invalid admin credentials." | 401 |
| Wrong admin password | "Invalid admin credentials." | 401 |
| Server error | err.message \| "Login failed." | 500 |
| Invalid JSON response | "Invalid server response" | - |

### Error Message Flow
```
Backend raises error → api.js throws new Error(result?.message || fallback)
  → SignIn catches it → displays err.message in UI
```

---

## 7. SECURITY CONSIDERATIONS

### Current Implementation
✅ **Good**:
- Passwords are bcrypt hashed (10 salt rounds implied)
- JWT tokens with 1-day expiration
- HTTPS recommended (not enforced in code)
- Email stored as lowercase to prevent case-sensitive duplicates

⚠️ **Issues/Concerns**:
1. **No Token Verification on Protected Routes**: JWT is created but not verified on API calls
2. **Information Disclosure**: Different error messages for "user not found" vs "wrong password" (allows user enumeration)
3. **Admin Credentials in Environment**: Hardcoded env comparison (no DB check first for default admin)
4. **No Rate Limiting**: No protection against brute force attacks on login endpoint
5. **Token Not Sent to Backend**: Frontend stores token but doesn't send it with API requests
6. **LocalStorage Vulnerability**: Token stored in localStorage (vulnerable to XSS)
7. **No CSRF Protection**: No CSRF tokens on login form

### Missing Features
- ❌ Refresh token mechanism
- ❌ Password complexity validation
- ❌ Login attempt tracking
- ❌ Account lockout after failed attempts
- ❌ Email verification
- ❌ JWT middleware to protect routes
- ❌ Logout token blacklisting

---

## 8. COMPLETE LOGIN FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER LOGIN FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

1. FRONTEND (SignIn.jsx)
   ┌─────────────────────────────────────────┐
   │ User enters email + password            │
   │ Selects User or Admin mode              │
   │ Clicks "Sign In" button                 │
   └─────────────────┬───────────────────────┘
                     │
                     ▼
   ┌─────────────────────────────────────────┐
   │ handleSubmit() validates form           │
   │ Calls loginUser() or adminLogin()       │
   └─────────────────┬───────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼ (User Mode)            ▼ (Admin Mode)
   
2. API CALL (api.js)
   POST /api/auth/login        POST /api/auth/admin/login
   { email, password }         { email, password }
        │                              │
        └──────────────┬───────────────┘
                       │
                       ▼
3. PROXY (vite.config.js)
   Proxies to http://localhost:5000
                       │
                       ▼
4. BACKEND (backend/routes/auth.js)
   
   POST /auth/login
   ┌──────────────────────────────────────┐
   │ 1. Validate email & password         │
   │ 2. Query User from MongoDB           │
   │ 3. Verify password with bcrypt       │
   │ 4. Generate JWT token                │
   │ 5. Return { token, user }            │
   └──────────────────┬───────────────────┘
                      │
                      ▼
   POST /auth/admin/login
   ┌──────────────────────────────────────┐
   │ 1. Validate email & password         │
   │ 2. Check env-based admin creds first │
   │ 3. OR query isAdmin user from DB     │
   │ 4. Generate JWT token                │
   │ 5. Return { token, user }            │
   └──────────────────┬───────────────────┘
                      │
                      ▼
5. RESPONSE
   Parse JSON safely → check for errors
   ┌──────────────────────────────────────┐
   │ Success: { token, user }             │
   │ Error: { message: "..." }            │
   └──────────────────┬───────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ▼                            ▼
     SUCCESS                      ERROR
        │                            │
        ▼                            ▼
   6. AuthContext             Show error message
      login(user, token)       Don't navigate
      ├─ Set localStorage
      └─ Update state
        │
        ▼
      NAVIGATE
      - User mode → "/"
      - Admin mode → "/admin/dashboard"
        │
        ▼
      TOAST NOTIFICATION
      "Welcome back, {name}! 👋"
```

---

## 9. KEY FILES & LOCATIONS

| Component | File Path | Responsibility |
|-----------|-----------|-----------------|
| SignIn Form | `UI/src/routes/signIn/SignIn.jsx` | Login UI, form submission |
| API Wrapper | `UI/src/lib/api.js` | HTTP calls to backend |
| Auth State | `UI/src/context/AuthContext.jsx` | User state + localStorage management |
| Auth Routes | `backend/routes/auth.js` | Login/register endpoints |
| User Model | `backend/models/User.js` | MongoDB user schema |
| Vite Config | `UI/vite.config.js` | Dev server proxy to backend |
| Server Setup | `backend/index.js` | Express app + route registration |

---

## 10. TESTING THE LOGIN FLOW

### To test User Login:
```
1. Create a test account via /signup
   Email: test@example.com
   Password: Test123

2. Go to /signin (User mode)
3. Enter same credentials
4. Should redirect to "/" with success toast
5. Token + user stored in localStorage
```

### To test Admin Login:
```
1. Go to /signin (Admin mode)
2. Enter default credentials:
   Email: admin@habittrack.com
   Password: Admin@1234
   (or any user with isAdmin: true in DB)

3. Should redirect to "/admin/dashboard"
4. Token with id: 'admin' stored in localStorage
```

---

## 11. POTENTIAL PROBLEMS & FIXES

### Problem 1: "Login Failed" with No Details
**Issue**: Generic error message from backend
**Cause**: JSON parsing error or 500 server error
**Fix**: Check server logs and ensure MONGODB_URI is correct

### Problem 2: Admin Login Doesn't Work
**Issue**: Invalid admin credentials always
**Cause**: 
- ADMIN_EMAIL/ADMIN_PASSWORD env vars not set
- Database credentials incorrect
**Fix**: 
- Set env vars in `.env`
- OR create isAdmin user in DB first

### Problem 3: Token Not Persisting After Refresh
**Issue**: User logged out after page refresh
**Cause**: localStorage cleared or AuthContext not re-reading on mount
**Fix**: Check browser's localStorage manually, verify AuthContext initialization

### Problem 4: CORS Error
**Issue**: Login fails with CORS error
**Cause**: Vite proxy misconfigured or backend not running
**Fix**: 
- Ensure backend running on port 5000
- Check vite.config.js proxy settings

### Problem 5: Protected Routes Not Protected
**Issue**: Unauthenticated users can access private pages
**Cause**: No JWT verification middleware on backend
**Fix**: Need to implement `verifyToken` middleware on all protected routes

---

## 12. RECOMMENDATIONS

### High Priority (Security)
1. ✅ Implement JWT verification middleware for protected routes
2. ✅ Add rate limiting to login endpoint
3. ✅ Implement refresh token pattern
4. ✅ Move token to httpOnly cookie (XSS protection)

### Medium Priority (UX/Stability)
5. ✅ Add email verification for new accounts
6. ✅ Implement account lockout after failed attempts
7. ✅ Add password strength requirements
8. ✅ Logging and monitoring for failed logins

### Low Priority (Nice to Have)
9. ✅ Social login (Google, Facebook)
10. ✅ Two-factor authentication
11. ✅ Login history/device tracking

