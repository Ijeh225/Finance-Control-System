import { createContext, useContext, useState, ReactNode } from "react";

interface ViewingAsState {
  selectedUserId: string | undefined;
  selectedUserName: string | undefined;
  setSelectedUser: (id: string, name: string) => void;
  clearSelectedUser: () => void;
}

const ViewingAsContext = createContext<ViewingAsState>({
  selectedUserId: undefined,
  selectedUserName: undefined,
  setSelectedUser: () => {},
  clearSelectedUser: () => {},
});

export function ViewingAsProvider({ children }: { children: ReactNode }) {
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [selectedUserName, setSelectedUserName] = useState<string | undefined>(undefined);

  const setSelectedUser = (id: string, name: string) => {
    setSelectedUserId(id);
    setSelectedUserName(name);
  };

  const clearSelectedUser = () => {
    setSelectedUserId(undefined);
    setSelectedUserName(undefined);
  };

  return (
    <ViewingAsContext.Provider value={{ selectedUserId, selectedUserName, setSelectedUser, clearSelectedUser }}>
      {children}
    </ViewingAsContext.Provider>
  );
}

export function useViewingAs() {
  return useContext(ViewingAsContext);
}

/**
 * Returns the effective userId to pass to API queries.
 * - PA: always scoped to their own id
 * - MD with a PA selected: the selected PA's id
 * - MD with no PA selected: undefined (sees all)
 */
export function useEffectiveUserId(userRole: string | undefined, userId: string | undefined): string | undefined {
  const { selectedUserId } = useViewingAs();
  if (userRole !== "md") return userId;
  return selectedUserId;
}
