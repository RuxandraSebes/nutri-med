import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  authApi,
  clearAuthToken,
  getAuthToken,
  patientApi,
  setAuthToken,
} from "../api/baseFetch.js";

const AuthContext = createContext(null);

const STORAGE_KEY = "nutrimed_token";
const USER_KEY = "nutrimed_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t) setAuthToken(t);
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await authApi.login({ email, password });
    setAuthToken(token);
    localStorage.setItem(STORAGE_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    if (u.role === "patient") {
      try {
        await patientApi.bootstrap();
      } catch {}
    }
    return u;
  }, []);

  const register = useCallback(async ({ email, password, role }) => {
    const { token, user: u } = await authApi.register({
      email,
      password,
      role,
    });
    setAuthToken(token);
    localStorage.setItem(STORAGE_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    if (u.role === "patient") {
      await patientApi.bootstrap();
    }
    return u;
  }, []);

  const refreshUser = useCallback(async () => {
    const t = getAuthToken();
    if (!t) return null;
    const u = await authApi.me();
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, ready, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
