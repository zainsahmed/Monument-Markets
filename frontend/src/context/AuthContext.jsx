import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('mm_token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('mm_token');
    setToken(null);
    setUser(null);
  }, []);

  // Validate token on mount and when token changes
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await api.getMe(token);
        setUser(userData);
      } catch {
        // Token invalid or expired
        logout();
      } finally {
        setLoading(false);
      }
    }

    validateToken();
  }, [token, logout]);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('mm_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const signup = useCallback(async (email, password) => {
    const data = await api.signup(email, password);
    localStorage.setItem('mm_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
