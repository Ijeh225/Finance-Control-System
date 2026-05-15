import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type UserContextType = {
  userId: string;
  setUserId: (id: string) => void;
  isMD: boolean;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [userId, setUserId] = useState<string>('all');

  useEffect(() => {
    if (user) {
      // MD defaults to 'all' (sees everything); assistants default to their own ID
      setUserId(user.role === 'md' ? 'all' : user.id);
    } else {
      setUserId('all');
    }
  }, [user]);

  const isMD = user?.role === 'md';

  return (
    <UserContext.Provider value={{ userId, setUserId, isMD }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
