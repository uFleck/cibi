import { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'dark'

export const AccountContext = createContext<{
  selectedAccountId: string | null
  setSelectedAccountId: (id: string | null) => void
}>({
  selectedAccountId: null,
  setSelectedAccountId: () => {},
})

export const ThemeContext = createContext<{
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

export interface ShellState {
  inspectorOpen: boolean
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  editMode: boolean
  setEditMode: (on: boolean) => void
  toggleEditMode: () => void
}

export const ShellContext = createContext<ShellState>({
  inspectorOpen: false,
  setInspectorOpen: () => {},
  toggleInspector: () => {},
  editMode: false,
  setEditMode: () => {},
  toggleEditMode: () => {},
})

export function useShell(): ShellState {
  return useContext(ShellContext)
}
