import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, clearToken, getToken, storeToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" until the stored token has been checked, so guards do not
  // bounce a signed-in user back to the login page on refresh.
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getToken()) {
        setStatus("ready");
        return;
      }
      try {
        const data = await authApi.me();
        if (active) {
          setUser(data.user);
        }
      } catch {
        clearToken();
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      clearToken();
      setUser(null);
    }
    window.addEventListener("smartpark:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("smartpark:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    storeToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload);
    storeToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, clear the local session.
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}
