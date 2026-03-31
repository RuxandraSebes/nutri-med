import { createContext, useContext } from "react";

export const theme = {
  colors: {
    primary: "#0F52BA",
    primaryLight: "#EFF6FF",
    primaryMid: "#DBEAFE",
    nutrition: "#10B981",
    nutritionLight: "#ECFDF5",
    warning: "#F59E0B",
    warningLight: "#FFFBEB",
    danger: "#EF4444",
    dangerLight: "#FEF2F2",
    surface: "#FFFFFF",
    bg: "#F9FAFB",
    border: "#E5E7EB",
    textPrimary: "#111827",
    textSecondary: "#4B5563",
    textMuted: "#9CA3AF",
  },
  font: {
    sans: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    mono: "'DM Mono', ui-monospace, monospace",
    sizes: { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 18, "2xl": 22 },
  },
  radius: { sm: 6, md: 10, lg: 14, xl: 20 },
  shadow: {
    xs: "0 1px 2px rgba(0,0,0,0.05)",
    sm: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04)",
    lg: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
  },
};

const ThemeContext = createContext(theme);

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
