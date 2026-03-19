import { create } from 'zustand';

interface Employee {
  id: string;
  name: string;
  role: string;
  orgId: string;
}

interface AuthStore {
  employee: Employee | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (employee: Employee, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  employee: null,
  accessToken: null,
  isAuthenticated: false,

  login: (employee, accessToken) =>
    set({ employee, accessToken, isAuthenticated: true }),

  logout: () =>
    set({ employee: null, accessToken: null, isAuthenticated: false }),
}));
