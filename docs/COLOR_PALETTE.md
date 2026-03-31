# ERP Color Palette

The frontend has two approved color sources:

1. [`frontend/src/styles/theme.ts`](/home/blur/erp2/frontend/src/styles/theme.ts) for live UI
2. [`frontend/src/styles/printTokens.ts`](/home/blur/erp2/frontend/src/styles/printTokens.ts) for print and PDF output

Do not add hardcoded hex colors in component code unless the exception is explicitly documented.

## UI Usage

Use `useTheme()` and `theme.palette.*` in React components.

```tsx
import { alpha, useTheme } from '@mui/material/styles'

const theme = useTheme()

<Box sx={{ color: theme.palette.text.primary }} />
<Box sx={{ bgcolor: theme.palette.background.paper }} />
<Box sx={{ bgcolor: alpha(theme.palette.primary.main, 0.2) }} />
```

Preferred semantic tokens:

- `theme.palette.background.default`: page background
- `theme.palette.background.paper`: cards, dialogs, menus, elevated surfaces
- `theme.palette.background.sidebar`: sidebar/navigation background
- `theme.palette.text.primary`: primary text
- `theme.palette.text.secondary`: supporting text
- `theme.palette.divider`: borders and separators
- `theme.palette.action.hover`: hover state backgrounds
- `theme.palette.action.selected`: selected or active backgrounds
- `theme.palette.primary.main`: primary emphasis
- `theme.palette.success.main`: success emphasis
- `theme.palette.warning.main`: warning emphasis
- `theme.palette.error.main`: error emphasis

## Print Usage

Use `printColors` for generated print HTML, print-only layouts, and PDF output.

```ts
import { printColors } from '@/styles/printTokens'

`<tr style="background-color: ${printColors.groupRow};">`
```

Available print tokens:

- `printColors.background`
- `printColors.text`
- `printColors.border`
- `printColors.tableBorder`
- `printColors.tableHeaderBg`
- `printColors.tableRowAlt`
- `printColors.successRow`
- `printColors.infoRow`
- `printColors.groupRow`

## Rules

- Use theme tokens for live React UI.
- Use `printColors` for print and PDF contexts.
- Prefer semantic theme tokens over raw greys.
- If you need transparency in UI code, use `alpha(...)` with a theme token.
