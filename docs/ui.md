If your **base background is `#111827`**, you should build a **complete color system** around it. A good UI (especially ERP/dashboard) normally has these color groups:

1. Background layers
2. Text colors
3. Border colors
4. Primary / accent colors
5. Status colors (success, warning, error)
6. Table colors
7. Interactive states (hover, active)

Below is a **complete dark UI palette based on `#111827`**.

---

# 1. Background Colors

These create **depth and hierarchy**.

| Usage           | Color        | Hex       |
| --------------- | ------------ | --------- |
| Main Background | Dark Slate   | `#111827` |
| Sidebar         | Darker Slate | `#0F172A` |
| Card / Panel    | Gray Slate   | `#1F2937` |
| Secondary Card  | Dark Gray    | `#374151` |
| Hover Surface   | Soft Gray    | `#4B5563` |

Example structure:

```
App Background      #111827
Sidebar             #0F172A
Card / Table        #1F2937
Hover               #374151
```

---

# 2. Text Colors

Text should **never be pure white**.

| Usage          | Color      | Hex       |
| -------------- | ---------- | --------- |
| Primary Text   | Light Gray | `#E5E7EB` |
| Secondary Text | Muted Gray | `#9CA3AF` |
| Placeholder    | Soft Gray  | `#6B7280` |
| Disabled       | Dark Gray  | `#4B5563` |

Example:

```
Title          #E5E7EB
Description    #9CA3AF
Hint text      #6B7280
```

---

# 3. Border & Divider

Borders should be **subtle**.

| Usage         | Hex       |
| ------------- | --------- |
| Border        | `#374151` |
| Soft Border   | `#2D3748` |
| Table Divider | `#1F2937` |

---

# 4. Primary Brand Colors

Good for **ERP actions like Save / Create / Submit**.

| Type           | Color       | Hex       |
| -------------- | ----------- | --------- |
| Primary        | Blue        | `#3B82F6` |
| Primary Hover  | Darker Blue | `#2563EB` |
| Primary Active | Strong Blue | `#1D4ED8` |

Example button:

```
Button BG        #3B82F6
Button Hover     #2563EB
Text             #FFFFFF
```

---

# 5. Status Colors

Important for **ERP alerts and validation**.

### Success

| Usage         | Hex       |
| ------------- | --------- |
| Success       | `#10B981` |
| Success Hover | `#059669` |

### Warning

| Usage         | Hex       |
| ------------- | --------- |
| Warning       | `#F59E0B` |
| Warning Hover | `#D97706` |

### Error

| Usage       | Hex       |
| ----------- | --------- |
| Error       | `#EF4444` |
| Error Hover | `#DC2626` |

### Info

| Usage | Hex       |
| ----- | --------- |
| Info  | `#38BDF8` |

---

# 6. Table Colors (Important for ERP)

ERP apps show **lots of tables**, so these matter.

| Usage             | Hex       |
| ----------------- | --------- |
| Table Background  | `#1F2937` |
| Header Background | `#111827` |
| Row Hover         | `#374151` |
| Selected Row      | `#1D4ED8` |
| Divider           | `#374151` |

---

# 7. Input Fields

Forms are common in ERP.

| Usage            | Hex       |
| ---------------- | --------- |
| Input Background | `#1F2937` |
| Input Border     | `#374151` |
| Focus Border     | `#3B82F6` |
| Disabled Input   | `#4B5563` |

---

# 8. Icon Colors

Icons follow text hierarchy.

| Usage          | Hex       |
| -------------- | --------- |
| Primary Icon   | `#E5E7EB` |
| Secondary Icon | `#9CA3AF` |
| Disabled Icon  | `#6B7280` |

---

# 9. Complete Example Layout

```
App Background      #111827
Sidebar             #0F172A

Card                #1F2937
Border              #374151

Primary Button      #3B82F6
Success             #10B981
Warning             #F59E0B
Error               #EF4444

Text Primary        #E5E7EB
Text Secondary      #9CA3AF

