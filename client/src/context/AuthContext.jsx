import { createContext, useContext, useState, useEffect } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.get("/auth/me");
      const nextUser = res.data?.user || null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { user: u } = res.data;
    const freshUser = (await refreshUser()) || u;
    setUser(freshUser);
    return freshUser;
  };

  const logout = () => {
    setUser(null);
    api.post("/auth/logout").catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
};
