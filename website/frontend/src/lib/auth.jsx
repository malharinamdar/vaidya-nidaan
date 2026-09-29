import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!token) {
      setDoctor(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api("/api/doctors/profile")
      .then((d) => alive && setDoctor(d))
      .catch(() => alive && setDoctor(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const signIn = useCallback((newToken, profile) => {
    setToken(newToken);
    if (profile) setDoctor(profile);
    setTokenState(newToken);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setDoctor(null);
    setTokenState(null);
  }, []);

  const startDemo = useCallback(async () => {
    const res = await api("/api/doctors/demo", { method: "POST" });
    signIn(res.token, res.doctor);
    return res;
  }, [signIn]);

  const value = useMemo(
    () => ({ token, doctor, loading, signIn, signOut, startDemo, isDemo: !!doctor?.isDemo }),
    [token, doctor, loading, signIn, signOut, startDemo]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
