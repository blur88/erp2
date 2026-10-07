import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  login,
  sessionEstablished,
  tokensUpdated,
  sessionEnded,
  storageUnavailable,
  clearError,
  selectCurrentUser,
  selectIsAuthenticated,
  selectAccessToken,
  selectStorageUnavailable,
} from '../authSlice';
import { authApi } from '../../../services/authApi';

const signIn = vi.fn();
const passwordChanged = vi.fn();

vi.mock('@/session', () => ({
  sessionRuntime: {
    signIn: (...args: any[]) => signIn(...args),
    passwordChanged: (...args: any[]) => passwordChanged(...args),
  },
}));

vi.mock('../../../services/authApi', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    changePassword: vi.fn(),
  },
}));

type TestRootState = {
  auth: ReturnType<typeof authReducer>;
};

const activeSession = {
  sessionId: 'sess-1',
  generation: 3,
  accessToken: 'access-token',
  accessTokenExpiresAt: 0,
  refreshToken: 'refresh-token',
  user: {
    id: '123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'manager' as const,
    status: 'active' as const,
    isActive: true,
    failedLoginAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  rememberMe: false,
};

describe('authSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        auth: authReducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().auth;

      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.sessionId).toBeNull();
      expect(state.generation).toBe(0);
      expect(state.storageUnavailable).toBe(false);
    });
  });

  describe('mirror reducers', () => {
    it('sessionEstablished sets the session and marks authenticated', () => {
      store.dispatch(sessionEstablished(activeSession));
      const state = store.getState().auth;
      expect(state.user).toEqual(activeSession.user);
      expect(state.accessToken).toBe('access-token');
      expect(state.refreshToken).toBe('refresh-token');
      expect(state.isAuthenticated).toBe(true);
      expect(state.sessionId).toBe('sess-1');
      expect(state.generation).toBe(3);
    });

    it('tokensUpdated replaces only the tokens and their generation', () => {
      store.dispatch(sessionEstablished(activeSession));
      store.dispatch(
        tokensUpdated({ generation: 4, accessToken: 'new-access', accessTokenExpiresAt: 1, refreshToken: 'new-refresh' })
      );
      const state = store.getState().auth;
      expect(state.accessToken).toBe('new-access');
      expect(state.refreshToken).toBe('new-refresh');
      expect(state.generation).toBe(4);
      expect(state.user).toEqual(activeSession.user);
    });

    it('sessionEnded clears the session', () => {
      store.dispatch(sessionEstablished(activeSession));
      store.dispatch(sessionEnded());
      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.sessionId).toBeNull();
    });

    it('storageUnavailable marks the fail-closed state', () => {
      store.dispatch(storageUnavailable());
      const state = store.getState().auth;
      expect(state.storageUnavailable).toBe(true);
      expect(state.isAuthenticated).toBe(false);
    });

    it('clearError clears the error', () => {
      store.dispatch({ type: 'auth/login/rejected', payload: 'boom' });
      expect(store.getState().auth.error).toBe('boom');
      store.dispatch(clearError());
      expect(store.getState().auth.error).toBeNull();
    });
  });

  describe('login async thunk', () => {
    it('calls the runtime and leaves the session to the mirror events', async () => {
      signIn.mockResolvedValue({ requiresPasswordChange: false });

      await store.dispatch(
        login({ usernameOrEmail: 'testuser', password: 'Password@123', rememberMe: false })
      );

      expect(signIn).toHaveBeenCalledWith({
        usernameOrEmail: 'testuser',
        password: 'Password@123',
        rememberMe: false,
      });
      const state = store.getState().auth;
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    // What axios throws for an error response: its own `message` is the generic
    // status sentence, and the server's message is in the response body.
    const httpError = (status: number, data: unknown) =>
      Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status, data },
      });

    const rejectedMessage = async (error: unknown) => {
      signIn.mockRejectedValue(error);
      await store.dispatch(
        login({ usernameOrEmail: 'testuser', password: 'WrongPassword', rememberMe: false })
      );
      const state = store.getState().auth;
      expect(state.loading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      return state.error;
    };

    it('rejects with the server message for a wrong password', async () => {
      expect(await rejectedMessage(httpError(401, { message: 'Invalid credentials', statusCode: 401 }))).toBe(
        'Invalid credentials'
      );
    });

    it('rejects with the server message for a locked account', async () => {
      expect(
        await rejectedMessage(
          httpError(401, { message: 'Account is locked. Try again in 15 minutes.', statusCode: 401 })
        )
      ).toBe('Account is locked. Try again in 15 minutes.');
    });

    it('rejects with the server message for a 426 CLIENT_RELOAD_REQUIRED', async () => {
      expect(
        await rejectedMessage(
          httpError(426, { message: 'This page is out of date. Reload to continue.', code: 'CLIENT_RELOAD_REQUIRED' })
        )
      ).toBe('This page is out of date. Reload to continue.');
    });

    it('joins a list of validation messages from the server', async () => {
      expect(
        await rejectedMessage(httpError(400, { message: ['password should not be empty', 'username is too long'] }))
      ).toBe('password should not be empty, username is too long');
    });

    it('rejects with Login failed for a network error with no response', async () => {
      expect(await rejectedMessage(Object.assign(new Error('Network Error'), { isAxiosError: true }))).toBe(
        'Login failed'
      );
    });

    it('rejects with Login failed when the response carries no message', async () => {
      expect(await rejectedMessage(httpError(502, '<html>Bad Gateway</html>'))).toBe('Login failed');
    });

    it('names storage when the session record cannot be opened or written', async () => {
      const { StorageUnavailableError, StorageTimeoutError } = await import('@/session/types');
      expect(await rejectedMessage(new StorageUnavailableError('session storage unavailable'))).toBe(
        'Session storage is unavailable in this browser. Allow site data for this address, then reload.'
      );
      expect(await rejectedMessage(new StorageTimeoutError('transaction timed out'))).toBe(
        'Session storage did not respond in time. Try again.'
      );
    });

    it('maps a session-changed-elsewhere error to the user-facing message', async () => {
      const { SessionChangedElsewhereError } = await import('@/session/runtime');
      signIn.mockRejectedValue(new SessionChangedElsewhereError('changed'));

      await store.dispatch(
        login({ usernameOrEmail: 'testuser', password: 'Password@123', rememberMe: false })
      );

      expect(store.getState().auth.error).toBe('The session changed in another tab. Sign in again.');
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      store.dispatch(sessionEstablished(activeSession));
    });

    it('should select current user', () => {
      expect(selectCurrentUser(store.getState())?.username).toBe('testuser');
    });

    it('should select authentication status', () => {
      expect(selectIsAuthenticated(store.getState())).toBe(true);
    });

    it('should select access token', () => {
      expect(selectAccessToken(store.getState())).toBe('access-token');
    });

    it('should select storage unavailable', () => {
      expect(selectStorageUnavailable(store.getState())).toBe(false);
      store.dispatch(storageUnavailable());
      expect(selectStorageUnavailable(store.getState())).toBe(true);
    });
  });

  it('changePassword calls the runtime passwordChanged on success', async () => {
    (authApi.changePassword as any).mockResolvedValue({ data: {} });
    passwordChanged.mockResolvedValue(undefined);
    const { changePassword } = await import('../authSlice');
    await store.dispatch(
      changePassword({ currentPassword: 'a', newPassword: 'b', newPasswordConfirmation: 'b' } as any)
    );
    expect(passwordChanged).toHaveBeenCalled();
  });
});
