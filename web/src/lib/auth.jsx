import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokens } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokens.get()) return setLoading(false);
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await api.login({ username, password });
    tokens.set(d.accessToken, d.refreshToken);
    setUser(d.user);
    return d.user;
  }, []);

  const register = useCallback(async (payload) => {
    const d = await api.register(payload);
    tokens.set(d.accessToken, d.refreshToken);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const d = await api.me();
    setUser(d.user);
    return d.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
