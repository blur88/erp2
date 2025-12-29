# Implementation Plan: Basic Login System with User Settings

## Overview
Implement a basic username/password authentication system with JWT tokens and user profile management. This will restore authentication to the ERP2 system which previously had auth completely removed.

## User Requirements
- **Authentication Level**: Basic login only (username/password with JWT)
- **User Settings**: Yes - profile page for updating user information and password
- **Scope**: Minimal viable authentication without complex features (no password reset emails, no OAuth, no 2FA)

---

## Backend Implementation

### Phase 1: Install Dependencies
**Location**: `backend/`

Install required authentication packages:
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/bcrypt @types/passport-jwt
```

### Phase 2: Create Auth Module
**Location**: `backend/src/modules/auth/`

Create new auth module with following structure:
```
backend/src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   └── jwt.strategy.ts
├── guards/
│   └── jwt-auth.guard.ts
└── dto/
    ├── login.dto.ts
    └── auth-response.dto.ts
```

**Files to Create:**

1. **auth.module.ts**
   - Import JwtModule with configuration from environment
   - Import PassportModule with default strategy 'jwt'
   - Import UsersModule (to access UserService)
   - Provide: AuthService, JwtStrategy
   - Export: AuthService, JwtModule

2. **auth.controller.ts**
   - `POST /api/auth/login` - Login endpoint
     - Takes LoginDto (username, password)
     - Returns AuthResponseDto (user, accessToken)
     - Rate limit: 5 attempts per minute using @Throttle
     - Returns specific error messages:
       - "Account is locked. Please try again later."
       - "Invalid username or password. X attempts remaining."
   - `POST /api/auth/logout` - Logout endpoint (client-side token removal)
     - No server-side action needed (stateless JWT)
   - `GET /api/auth/profile` - Get current user profile
     - Protected with @UseGuards(JwtAuthGuard)
     - Returns current user from request.user
   - `POST /api/auth/unlock/:userId` - Admin unlock account
     - Protected with @UseGuards(JwtAuthGuard)
     - Only admins can unlock accounts (check user.role === 'ADMIN')
     - Resets failed attempts and clears lock

3. **auth.service.ts**
   - `validateUser(username: string, password: string)` - Validate credentials
     - Find user by username
     - Check if account is locked (lockedUntil > now)
     - If locked, throw UnauthorizedException
     - Compare password using bcrypt.compare()
     - If invalid password:
       - Increment failedLoginAttempts
       - If attempts >= 5, set lockedUntil to 30 minutes from now
       - Throw UnauthorizedException
     - If valid password:
       - Reset failedLoginAttempts to 0
       - Clear lockedUntil
       - Return user
   - `login(user: User)` - Generate JWT token
     - Create payload: { sub: user.id, username: user.username, role: user.role }
     - Sign JWT with jwtService.sign()
     - Update lastLoginAt and lastLoginIp in database
     - Return { user: UserResponseDto, accessToken: string }
   - `unlockAccount(userId: string)` - Admin function to unlock account
     - Reset failedLoginAttempts to 0
     - Clear lockedUntil

4. **jwt.strategy.ts**
   - Extend PassportStrategy(Strategy)
   - Validate JWT payload
   - Extract user from database by payload.sub (user ID)
   - Return user object (attached to request.user)

5. **jwt-auth.guard.ts**
   - Extend @nestjs/passport AuthGuard('jwt')
   - Provides @UseGuards(JwtAuthGuard) decorator for protected routes

6. **DTOs:**
   - **LoginDto**: username (string, required), password (string, required)
   - **AuthResponseDto**: user (UserResponseDto), accessToken (string)

### Phase 3: Update User Entity & Service
**Location**: `backend/src/modules/users/`

**Files to Modify:**

1. **user.entity.ts** (NO CHANGES NEEDED)
   - Password field already exists (varchar 255)
   - Just need to hash passwords going forward

2. **users.service.ts**
   - Add bcrypt hashing to `create()` method:
     ```typescript
     const hashedPassword = await bcrypt.hash(dto.password, 10);
     const user = this.userRepository.create({
       ...dto,
       password: hashedPassword
     });
     ```
   - Add `findByUsername(username: string)` method for auth
   - Add `updatePassword(userId: string, newPassword: string)` method
     - Hash new password with bcrypt
     - Update user.password field
   - Add `updateProfile(userId: string, dto: UpdateProfileDto)` method
     - Allow updating: firstName, lastName, email, phoneNumber
     - Validate email uniqueness

3. **users.controller.ts**
   - Protect sensitive endpoints with @UseGuards(JwtAuthGuard)
   - Update `GET /api/users/me` to use JWT user from request
   - Update `PATCH /api/users/me` to use JWT user ID
   - Add `PUT /api/users/me/password` endpoint for password changes
     - Takes { currentPassword, newPassword }
     - Validates current password before updating

4. **New DTOs:**
   - **UpdateProfileDto**: firstName?, lastName?, email?, phoneNumber?
   - **ChangePasswordDto**: currentPassword (string, required), newPassword (string, required, min 8 chars)

### Phase 4: Add JWT Configuration
**Location**: `backend/src/config/`

**Files to Create:**

1. **jwt.config.ts**
   - Export JWT configuration factory
   - Read from environment: JWT_SECRET, JWT_EXPIRATION (default: '24h')
   - Register with ConfigModule

2. **Update .env / docker-compose.yml**
   - Add JWT_SECRET environment variable (generate secure random string)
   - Add JWT_EXPIRATION=24h

### Phase 5: Update App Module
**Location**: `backend/src/app.module.ts`

- Import AuthModule
- Add to imports array (after UsersModule)

### Phase 6: Database Migration
**Location**: `backend/src/database/migrations/`

Create migration to reset all user passwords:
- Migration name: `ResetUserPasswordsToDefault`
- Set all users to default password: "Password123!"
- Hash with bcrypt (10 rounds)
- Reset failedLoginAttempts to 0
- Clear lockedUntil field
- Add note to each user: "Password reset - please change on first login"
- **Action Required**: Users must change password after first login

---

## Frontend Implementation

### Phase 1: Create Auth Redux Slice
**Location**: `frontend/src/store/slices/authSlice.ts`

**State Shape:**
```typescript
interface AuthState {
  user: UserResponseDto | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}
```

**Async Thunks:**
- `login(credentials: LoginDto)` - POST /api/auth/login
  - On success: store token in state (Redux Persist will save it)
  - Store user object
  - Set isAuthenticated: true
- `logout()` - Clear token and user from state
- `fetchCurrentUser()` - GET /api/auth/profile
  - Fetch user data with current token
  - Refresh user object in state

**Reducers:**
- Handle fulfilled/rejected cases for all thunks
- Clear error on new requests

### Phase 2: Create Auth API Service
**Location**: `frontend/src/services/authApi.ts`

**Methods:**
```typescript
export const authApi = {
  login: (credentials: LoginDto) => ApiService.post('/auth/login', credentials),
  logout: () => ApiService.post('/auth/logout'),
  getCurrentUser: () => ApiService.get('/auth/profile'),
}
```

### Phase 3: Update API Service Interceptor
**Location**: `frontend/src/services/api.ts`

**Modifications:**
- Add request interceptor to attach JWT token:
  ```typescript
  apiClient.interceptors.request.use(config => {
    const token = store.getState().auth.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })
  ```
- Add response interceptor for 401 errors:
  ```typescript
  apiClient.interceptors.response.use(
    response => response,
    error => {
      if (error.response?.status === 401) {
        store.dispatch(logout())
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
  )
  ```

### Phase 4: Create Login Page
**Location**: `frontend/src/pages/auth/LoginPage.tsx`

**Component Structure:**
- Full-screen centered login form (not in MainLayout)
- Material-UI Card with Paper elevation
- React Hook Form + Yup validation
- Fields: username (required), password (required, min 8 chars)
- Submit button with loading state
- Error message display using useNotification
- Redirect to /dashboard on successful login
- Company logo and title at top

**Validation Schema:**
```typescript
const schema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required').min(8)
})
```

**Actions:**
- On submit: dispatch login() thunk
- On success:
  - Navigate('/dashboard')
  - If user notes contains "Password reset", show notification to change password
- On error:
  - Show specific error message (account locked, invalid credentials, attempts remaining)
  - Display error notification

### Phase 5: Create User Settings Page
**Location**: `frontend/src/pages/settings/UserSettingsPage.tsx`

**Component Structure:**
- Two tabs: "Profile Information" and "Change Password"
- Profile tab:
  - Form fields: firstName, lastName, email, phoneNumber
  - Pre-filled with current user data
  - Submit updates to PATCH /api/users/me
- Change Password tab:
  - Form fields: currentPassword, newPassword, confirmNewPassword
  - Validation: passwords match, min 8 chars
  - Submit to PUT /api/users/me/password
- Use react-hook-form + yup
- Success/error notifications

**API Calls:**
```typescript
// Profile update
const updateProfile = async (data: UpdateProfileDto) => {
  await ApiService.patch('/users/me', data)
}

// Password change
const changePassword = async (data: ChangePasswordDto) => {
  await ApiService.put('/users/me/password', data)
}
```

### Phase 6: Create Protected Route Component
**Location**: `frontend/src/components/auth/ProtectedRoute.tsx`

**Component Logic:**
- Check if user is authenticated from Redux state
- If not authenticated:
  - Redirect to /login
  - Store intended destination in localStorage
- If authenticated:
  - Render children
- Show loading state while checking auth

**Usage:**
```typescript
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>
```

### Phase 7: Update App.tsx Routing
**Location**: `frontend/src/App.tsx`

**Changes:**
- Add public route: `/login` → LoginPage (not wrapped in MainLayout)
- Wrap all existing routes with ProtectedRoute component
- Add `/settings/profile` route → UserSettingsPage
- Default redirect: `/` → `/login` if not authenticated, else `/dashboard`

**Route Structure:**
```typescript
<Routes>
  {/* Public Routes */}
  <Route path="/login" element={<LoginPage />} />

  {/* Protected Routes */}
  <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/settings/profile" element={<UserSettingsPage />} />
    {/* ... all other routes ... */}
  </Route>

  <Route path="*" element={<Navigate to="/login" />} />
</Routes>
```

### Phase 8: Update Main Layout
**Location**: `frontend/src/components/layout/MainLayout.tsx`

**Changes:**
- Add user menu in AppBar:
  - Display current user name
  - Dropdown with options:
    - "Profile Settings" → navigate to /settings/profile
    - "Logout" → dispatch logout() and navigate to /login
- Use Avatar component for user icon
- Get user from Redux: `useAppSelector(state => state.auth.user)`

### Phase 9: Update Redux Store Configuration
**Location**: `frontend/src/store/index.ts`

**Changes:**
- Import authSlice reducer
- Add to rootReducer: `auth: authReducer`
- Add 'auth' to persistConfig whitelist (persist token across page refreshes)

**Persist Config:**
```typescript
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['theme', 'inventory', 'sales', 'purchasing', 'auth'], // Add auth
}
```

---

## Testing Strategy

### Backend Testing
1. **Auth Service Tests**:
   - Test password hashing during user creation
   - Test validateUser() with correct/incorrect passwords
   - Test JWT token generation

2. **Auth Controller Tests**:
   - Test login endpoint with valid/invalid credentials
   - Test protected endpoints require JWT
   - Test token expiration handling

3. **Manual API Testing**:
   - Use Postman/curl to test /api/auth/login
   - Verify JWT token in response
   - Test protected endpoints with Authorization header

### Frontend Testing
1. **Login Flow**:
   - Submit valid credentials → redirects to dashboard
   - Submit invalid credentials → shows error
   - Token persists after page refresh

2. **Protected Routes**:
   - Access dashboard without login → redirects to /login
   - Logout → redirects to /login
   - Token expired → redirects to /login

3. **User Settings**:
   - Update profile information → success notification
   - Change password with wrong current password → error
   - Change password with valid data → success

---

## Environment Variables

### Backend (.env)
```env
JWT_SECRET=<generate-random-64-char-string>
JWT_EXPIRATION=24h
```

### Frontend (.env)
No new variables needed - uses existing VITE_API_BASE_URL

---

## Critical Files to Modify/Create

### Backend (Create New)
- `backend/src/modules/auth/auth.module.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/strategies/jwt.strategy.ts`
- `backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `backend/src/modules/auth/dto/login.dto.ts`
- `backend/src/modules/auth/dto/auth-response.dto.ts`
- `backend/src/config/jwt.config.ts`
- `backend/src/database/migrations/[timestamp]-ResetUserPasswordsToDefault.ts`

### Backend (Modify Existing)
- `backend/src/modules/users/users.service.ts` - Add password hashing, findByUsername, updatePassword methods
- `backend/src/modules/users/users.controller.ts` - Add @UseGuards, password change endpoint
- `backend/src/modules/users/dto/update-user.dto.ts` - Add UpdateProfileDto, ChangePasswordDto
- `backend/src/app.module.ts` - Import AuthModule
- `backend/package.json` - Add dependencies

### Frontend (Create New)
- `frontend/src/pages/auth/LoginPage.tsx`
- `frontend/src/pages/settings/UserSettingsPage.tsx`
- `frontend/src/components/auth/ProtectedRoute.tsx`
- `frontend/src/store/slices/authSlice.ts`
- `frontend/src/services/authApi.ts`
- `frontend/src/types/auth.types.ts`

### Frontend (Modify Existing)
- `frontend/src/App.tsx` - Add login route, wrap routes with ProtectedRoute
- `frontend/src/services/api.ts` - Add auth interceptors
- `frontend/src/store/index.ts` - Add authSlice to store and persist config
- `frontend/src/components/layout/MainLayout.tsx` - Add user menu with logout
- `frontend/package.json` - No new dependencies needed

### Docker & Config
- `docker-compose.yml` - Add JWT_SECRET environment variable
- `.env.example` - Document JWT_SECRET and JWT_EXPIRATION

---

## Implementation Order

1. **Backend Auth Module** (core authentication)
2. **Backend User Service Updates** (password hashing, profile endpoints)
3. **Database Migration** (reset passwords to default)
4. **Frontend Auth Slice** (state management)
5. **Frontend Login Page** (user entry point)
6. **Frontend Protected Routes** (route guards)
7. **Frontend User Settings** (profile management)
8. **UI Integration** (layout updates, user menu)
9. **Testing** (manual testing of full flow)
10. **Documentation** (update CLAUDE.md with auth status)

---

## Security Considerations

### Implemented
- Password hashing with bcrypt (10 rounds)
- JWT with configurable expiration (24h default)
- HTTP-only token storage (localStorage on frontend)
- Rate limiting on login endpoint (5 attempts/minute)
- Password complexity validation (min 8 chars)
- **Account lockout**: 5 failed attempts → 30 minute lock
- Failed login attempt tracking with database persistence
- Admin unlock capability for locked accounts
- Informative error messages showing remaining attempts

### Not Implemented (Future Enhancements)
- Refresh tokens (JWT expiration requires re-login)
- Password reset via email
- Two-factor authentication
- Session management (JWT is stateless)
- CSRF protection (not needed for JWT)
- Password expiration/rotation policies
- Force password change on first login (UI notification only)

---

## Rollback Plan

If issues arise:
1. Comment out AuthModule import in app.module.ts
2. Remove @UseGuards decorators from controllers
3. System returns to public access mode
4. All code changes are isolated to auth module (minimal risk)

---

## Post-Implementation Updates

### CLAUDE.md Updates Required
- Remove "⚠️ CRITICAL: Authentication system completely removed"
- Update "Current System Status" to reflect JWT auth
- Add Auth Module to active modules list
- Update security status section
- Add authentication endpoints to API documentation
- Update development patterns with auth examples

### README.md Updates
- Add login instructions
- Document default credentials for all users: "Password123!"
- Note: All users must change password after first login
- Add JWT environment variables to setup guide

### Default Credentials After Migration
**All existing users will have password reset to**: `Password123!`

Users should:
1. Login with their existing username and default password
2. Navigate to Settings → Profile
3. Change password immediately in the "Change Password" tab

**Admin unlock capability**: Admins can unlock accounts from Users management page (future enhancement)

---

## Estimated Complexity
- **Backend**: Medium (new module, password hashing, JWT strategy)
- **Frontend**: Medium (new pages, Redux slice, route guards)
- **Total**: ~15-20 files to create/modify
- **Risk**: Low (isolated changes, easy rollback)
