# ERP System Frontend

A modern, comprehensive React frontend application for the ERP system built with TypeScript, Material-UI, and Vite.

## Features

### 🚀 Core Features
- **Modern React Architecture** - React 18 with TypeScript, hooks, and context API
- **Responsive Design** - Mobile-first approach with Material-UI components
- **State Management** - Redux Toolkit for predictable state management
- **Authentication** - JWT token management with route protection
- **Real-time Updates** - WebSocket integration for live data updates
- **Module-based Navigation** - Sidebar navigation for different ERP modules

### 📱 UI/UX Features
- **Responsive layout** that works on desktop, tablet, and mobile
- **Dark/light theme** support with theme switching
- **Internationalization** support (i18n) ready
- **Loading states** and comprehensive error handling
- **Data tables** with sorting, filtering, and pagination
- **Form validation** with real-time feedback
- **Charts and visualizations** for dashboard and reports
- **Export functionality** (Excel, PDF, CSV) ready

### 🛠 Technical Features
- **API integration** with the NestJS backend
- **Error handling** with proper user feedback
- **Performance optimization** with lazy loading and code splitting
- **Accessibility** compliance (WCAG guidelines)
- **Progressive Web App** features ready
- **TypeScript** for type safety and better developer experience

## Tech Stack

- **React 18** - Modern React with concurrent features
- **TypeScript** - Type-safe JavaScript
- **Material-UI v5** - Comprehensive UI component library
- **Redux Toolkit** - State management with Redux best practices
- **React Router v6** - Client-side routing
- **Vite** - Fast build tool and dev server
- **React Hook Form** - Performant forms with easy validation
- **Yup** - Schema validation
- **Axios** - HTTP client with interceptors
- **Chart.js & Recharts** - Data visualization
- **Socket.io Client** - Real-time communication
- **Date-fns** - Date manipulation library

## Project Structure

```
/frontend/
├── public/                 # Static assets
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── common/       # Common components (Layout, Loading, etc.)
│   │   ├── forms/        # Form components
│   │   └── tables/       # Table components
│   ├── pages/            # Page components organized by modules
│   │   ├── auth/         # Authentication pages
│   │   ├── dashboard/    # Dashboard pages
│   │   ├── inventory/    # Inventory management
│   │   ├── sales/        # Sales management
│   │   ├── purchasing/   # Purchasing management
│   │   ├── reports/      # Report generation
│   │   └── settings/     # Application settings
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API service layer
│   ├── store/            # Redux store and slices
│   ├── utils/            # Utility functions
│   ├── types/            # TypeScript type definitions
│   ├── styles/           # Global styles and theme
│   └── assets/           # Images, icons, etc.
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite configuration
├── Dockerfile            # Docker containerization
└── nginx.conf            # Nginx configuration for production
```

## Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher
- Backend API running on port 3001 (see backend README)

### Installation

1. **Clone the repository**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   VITE_API_BASE_URL=http://localhost:3001/api
   VITE_SOCKET_URL=http://localhost:3001
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build locally

# Code Quality
npm run lint             # Run ESLint
npm run type-check       # Run TypeScript compiler check

# Testing
npm run test             # Run tests
npm run test:ui          # Run tests with UI
npm run test:coverage    # Run tests with coverage report
```

## Core Modules

### 🏠 Dashboard
- **KPI Cards** - Key performance indicators with trend analysis
- **Charts & Analytics** - Sales trends, top products, performance metrics
- **Recent Activity** - Real-time feed of business activities
- **Quick Actions** - Fast access to common operations

### 📦 Inventory Management
- **Product Catalog** - Complete product management with categories
- **Stock Tracking** - Real-time inventory levels and movements
- **Low Stock Alerts** - Automated notifications for reorder points
- **Barcode Support** - Product identification and scanning ready

### 💰 Sales Management
- **Customer Database** - Comprehensive customer relationship management
- **Order Processing** - Complete sales order lifecycle
- **Invoice Generation** - Professional invoicing with PDF export
- **Payment Tracking** - Payment status and history management

### 🛒 Purchasing
- **Supplier Management** - Vendor database and relationship tracking
- **Purchase Orders** - Purchase requisition and order management
- **Goods Received Notes (GRN)** - Inventory receiving workflow
- **Supplier Invoicing** - Vendor invoice processing

### 📊 Reports & Analytics
- **Financial Reports** - P&L, balance sheet, cash flow
- **Inventory Reports** - Stock levels, movements, valuation
- **Sales Analytics** - Customer analysis, product performance
- **Export Options** - PDF, Excel, CSV export capabilities

### ⚙️ Settings & Administration
- **User Management** - Role-based access control
- **System Configuration** - Application settings and preferences
- **Theme Customization** - Light/dark mode, color schemes
- **Backup & Recovery** - Data management tools

## Authentication & Security

### JWT Token Management
- **Automatic token refresh** - Seamless session management
- **Secure storage** - Tokens stored securely in localStorage
- **Route protection** - Private routes with authentication guards
- **Role-based access** - Permission-based feature access

### Security Features
- **Input sanitization** - XSS prevention
- **CSRF protection** - Cross-site request forgery protection
- **Rate limiting** - API request throttling
- **Secure headers** - Security headers for production

## State Management

### Redux Store Structure
```typescript
{
  auth: {
    user: User | null,
    token: string | null,
    isAuthenticated: boolean,
    isLoading: boolean
  },
  theme: {
    mode: 'light' | 'dark',
    primaryColor: string,
    secondaryColor: string
  },
  notifications: {
    notifications: Notification[],
    unreadCount: number
  },
  // Module-specific state...
}
```

### Real-time Updates
- **WebSocket integration** - Live data synchronization
- **Optimistic updates** - Immediate UI feedback
- **Conflict resolution** - Handling concurrent modifications
- **Offline support** - Queue operations when offline

## API Integration

### Service Architecture
```typescript
// Service layer example
class InventoryService {
  static async getProducts(params: QueryParams): Promise<Product[]>
  static async createProduct(data: CreateProductDto): Promise<Product>
  static async updateProduct(id: string, data: UpdateProductDto): Promise<Product>
  static async deleteProduct(id: string): Promise<void>
}
```

### Error Handling
- **Global error boundaries** - Catch and display React errors
- **API error interceptors** - Centralized API error handling
- **User-friendly messages** - Contextual error notifications
- **Retry mechanisms** - Automatic retry for failed requests

## Performance Optimization

### Code Splitting
- **Route-based splitting** - Load pages on demand
- **Component lazy loading** - Reduce initial bundle size
- **Vendor chunking** - Separate vendor libraries

### Bundle Analysis
```bash
npm run build:analyze    # Analyze bundle size and dependencies
```

### Performance Monitoring
- **Core Web Vitals** - Track loading performance
- **Component profiling** - React DevTools integration
- **Memory leak detection** - Development warnings

## Deployment

### Docker Deployment

1. **Build the image**
   ```bash
   docker build -t erp-frontend .
   ```

2. **Run the container**
   ```bash
   docker run -p 80:80 \
     -e VITE_API_BASE_URL=https://api.yourdomain.com/api \
     -e VITE_SOCKET_URL=https://api.yourdomain.com \
     erp-frontend
   ```

### Production Build
```bash
npm run build           # Creates optimized production build in /dist
```

The build includes:
- **Minified assets** - Optimized for production
- **Source maps** - For debugging in production
- **Service worker** - Offline capabilities
- **Progressive web app** - Install prompt and offline support

### Environment Variables

Production environment variables:
```env
VITE_API_BASE_URL=https://your-api-domain.com/api
VITE_SOCKET_URL=https://your-api-domain.com
VITE_APP_NAME=Your Company ERP
VITE_APP_VERSION=1.0.0
```

## Development Guidelines

### Code Style
- **TypeScript strict mode** - Full type safety
- **ESLint configuration** - Consistent code style
- **Prettier integration** - Automatic code formatting
- **Import organization** - Consistent import ordering

### Component Guidelines
```typescript
// Example component structure
interface Props {
  // Define props with TypeScript
}

const MyComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  // Use custom hooks for logic
  const { data, loading, error } = useCustomHook()
  
  // Handle loading and error states
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  
  return (
    <Box>
      {/* Component JSX */}
    </Box>
  )
}

export default MyComponent
```

### Testing Strategy
- **Unit tests** - Individual component testing
- **Integration tests** - Component interaction testing
- **E2E tests** - Full user workflow testing
- **Accessibility tests** - WCAG compliance verification

## Browser Support

- **Chrome** (last 2 versions)
- **Firefox** (last 2 versions)
- **Safari** (last 2 versions)
- **Edge** (last 2 versions)

## Contributing

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## Support

For support, please:
1. Check the [documentation](docs/)
2. Search [existing issues](https://github.com/yourorg/erp-system/issues)
3. Create a [new issue](https://github.com/yourorg/erp-system/issues/new) if needed

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.