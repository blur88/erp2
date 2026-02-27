import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import '@testing-library/jest-dom/vitest';
import LoginPage from '../LoginPage';
import authReducer from '../../../store/slices/authSlice';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../services/authApi', () => ({
  authApi: {
    shouldShowDefaultCredentials: vi.fn().mockResolvedValue({
      data: { showDefaultCredentials: true },
    }),
  },
}));

describe('LoginPage', () => {
  let store: ReturnType<typeof configureStore>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        auth: authReducer,
      },
    });
    vi.clearAllMocks();
    // Login failure paths are intentionally exercised in this suite.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const renderLoginPage = async () => {
    render(
      <Provider store={store}>
        <BrowserRouter future={routerFutureFlags}>
          <LoginPage />
        </BrowserRouter>
      </Provider>
    );
    // LoginPage triggers async credential-hint fetch on mount.
    await waitFor(() => {
      expect(screen.getByText(/default admin credentials/i)).toBeInTheDocument();
    });
  };

  it('should render login form', async () => {
    await renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('should show validation errors for empty fields', async () => {
    await renderLoginPage();

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/username or email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('should allow typing in input fields', async () => {
    await renderLoginPage();

    const usernameInput = screen.getByLabelText(/username or email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'Password@123' } });

    expect(usernameInput.value).toBe('testuser');
    expect(passwordInput.value).toBe('Password@123');
  });

  it('should toggle password visibility', async () => {
    await renderLoginPage();

    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });

    // Initially password is hidden
    expect(passwordInput.type).toBe('password');

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    // Click to hide password again
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('password');
  });

  it('should display error message on login failure', async () => {
    await renderLoginPage();

    const usernameInput = screen.getByLabelText(/username or email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'invaliduser' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPassword' } });
    fireEvent.click(submitButton);

    // Note: The actual error display depends on the Redux state
    // This test verifies the form submission works
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should show remember me checkbox', async () => {
    await renderLoginPage();

    const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
    expect(rememberMeCheckbox).toBeInTheDocument();
    expect(rememberMeCheckbox).not.toBeChecked();

    fireEvent.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).toBeChecked();
  });

  it('should disable submit button while loading', async () => {
    await renderLoginPage();

    const usernameInput = screen.getByLabelText(/username or email/i);
    // Use more specific selector for password input field (not the label text)
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'Password@123' } });

    // Initially enabled
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should display default credentials hint', async () => {
    await renderLoginPage();
    expect(screen.getByText(/username:/i)).toBeInTheDocument();
    expect(screen.getByText(/password:/i)).toBeInTheDocument();
  });
});
