# 🎨 Dark Theme Palette (Base: #121212)

---

## 🧱 1. Core Background Layers

| Usage | Color |
|------|------|
| App Background | #121212 |
| Surface (cards, tables) | #1E1E1E |
| Surface 2 (sections) | #232323 |
| Hover / Active | #2C2C2C |
| Sidebar | #0D0D0D |
| Overlay | #000000 |

---

## ✍️ 2. Text Colors

| Usage | Color |
|------|------|
| Primary Text | #E0E0E0 |
| Secondary Text | #A0A0A0 |
| Muted / Disabled | #6B7280 |
| Inverse Text | #111827 |

---

## 🎯 3. Primary / Accent

| Usage | Color |
|------|------|
| Primary | #3B82F6 |
| Primary Hover | #2563EB |
| Primary Active | #1D4ED8 |
| Primary Soft BG | #172554 |

---

## ⚠️ 4. Semantic Colors

### Success
| Usage | Color |
|------|------|
| Text / Icon | #22C55E |
| Background | #052E16 |

### Warning
| Usage | Color |
|------|------|
| Text / Icon | #F59E0B |
| Background | #451A03 |

### Error
| Usage | Color |
|------|------|
| Text / Icon | #EF4444 |
| Background | #450A0A |

### Info
| Usage | Color |
|------|------|
| Text / Icon | #38BDF8 |
| Background | #082F49 |

---

## 🧩 5. Borders & Dividers

| Usage | Color |
|------|------|
| Default Border | #2A2A2A |
| Strong Border | #3A3A3A |
| Subtle Divider | #1A1A1A |

---

## 🖱️ 6. Interaction States

| Usage | Color |
|------|------|
| Hover | #2C2C2C |
| Active Item Background | #1F2937 |
| Focus Ring | #3B82F6 |
| Selected Row | #172554 |

---

## 📊 7. Table Colors

| Usage | Color |
|------|------|
| Header Background | #1A1A1A |
| Row Background | #121212 |
| Alternate Row | #161616 |
| Row Hover | #1F1F1F |
| Border | #2A2A2A |

---

## 📦 8. Sidebar

| Usage | Color |
|------|------|
| Background | #0D0D0D |
| Item | #121212 |
| Hover | #1E1E1E |
| Active Background | #1F2937 |
| Active Text | #FFFFFF |
| Text | #9CA3AF |
| Icon | #6B7280 |
| Active Icon | #3B82F6 |

---

## 🧠 Final Theme Object

```ts
export const DARK_THEME = {
  background: "#121212",
  surface: "#1E1E1E",
  surface2: "#232323",
  hover: "#2C2C2C",

  sidebar: "#0D0D0D",

  textPrimary: "#E0E0E0",
  textSecondary: "#A0A0A0",
  textMuted: "#6B7280",

  primary: "#3B82F6",
  primaryHover: "#2563EB",
  primaryActive: "#1D4ED8",

  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#38BDF8",

  border: "#2A2A2A",
  borderStrong: "#3A3A3A"
}