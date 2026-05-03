import React from 'react'
import { Box, Typography, Paper, List, ListItem, ListItemIcon, ListItemText, Chip } from '@mui/material'
import { default as AdminIcon } from '@mui/icons-material/SupervisorAccount'
import { default as ManagerIcon } from '@mui/icons-material/Business'
import { default as SalesIcon } from '@mui/icons-material/ShoppingCart'
import { default as InventoryIcon } from '@mui/icons-material/Inventory'
import { default as ProcurementIcon } from '@mui/icons-material/LocalShipping'
import { default as CheckIcon } from '@mui/icons-material/Check'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'

interface RolePermission {
  description: string
}

interface RoleInfo {
  name: string
  color: 'error' | 'warning' | 'info' | 'success' | 'primary'
  icon: React.ReactElement
  description: string
  permissions: RolePermission[]
}

const roles: RoleInfo[] = [
  {
    name: 'Admin',
    color: 'error',
    icon: <AdminIcon sx={{ fontSize: 40 }} />,
    description: 'Full system access with all privileges',
    permissions: [
      { description: 'User management and access control' },
      { description: 'All module access (Inventory, Sales, Purchasing)' },
      { description: 'System settings and configuration' },
      { description: 'Security settings and audit logs' },
      { description: 'Database backup and restore' },
      { description: 'View and generate all reports' },
    ],
  },
  {
    name: 'Manager',
    color: 'warning',
    icon: <ManagerIcon sx={{ fontSize: 40 }} />,
    description: 'All operations except user management',
    permissions: [
      { description: 'Full inventory, sales, and purchasing access' },
      { description: 'View and generate reports' },
      { description: 'Company settings and configuration' },
      { description: 'Document numbering and pricing settings' },
      { description: 'Cannot manage users or security settings' },
    ],
  },
  {
    name: 'Sales Staff',
    color: 'info',
    icon: <SalesIcon sx={{ fontSize: 40 }} />,
    description: 'Sales and customer management',
    permissions: [
      { description: 'Manage customers and contacts' },
      { description: 'Create and manage sales orders' },
      { description: 'Create invoices and process payments' },
      { description: 'View inventory (read-only)' },
      { description: 'View and generate sales reports' },
    ],
  },
  {
    name: 'Inventory Staff',
    color: 'success',
    icon: <InventoryIcon sx={{ fontSize: 40 }} />,
    description: 'Inventory and stock management',
    permissions: [
      { description: 'Manage products and categories' },
      { description: 'Perform stock adjustments' },
      { description: 'View stock movements and history' },
      { description: 'View and generate inventory reports' },
      { description: 'Cannot access sales or purchasing modules' },
    ],
  },
  {
    name: 'Procurement Staff',
    color: 'primary',
    icon: <ProcurementIcon sx={{ fontSize: 40 }} />,
    description: 'Purchasing and supplier management',
    permissions: [
      { description: 'Manage suppliers and contacts' },
      { description: 'Create and manage purchase orders' },
      { description: 'Process goods received notes' },
      { description: 'Process vendor payments' },
      { description: 'View inventory (read-only)' },
      { description: 'View and generate purchasing reports' },
    ],
  },
]

const RoleManagementPage: React.FC = () => {
  return (
    <GenericOverviewPage>
      {/* Header */}
      <PageHeader
        title="Roles & Permissions"
        subtitle="Overview of user roles and their permissions"
      />
      {/* Information Alert */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'info.lighter', borderLeft: 4, borderColor: 'info.main' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          About Role-Based Access Control
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Roles define what actions users can perform in the system. Each user is assigned exactly one role.
          Admins can assign roles when creating or editing users in User Management.
        </Typography>
      </Paper>
      {/* Roles Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {roles.map((role) => (
          <Paper key={role.name}
              sx={{
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.3s',
                '&:hover': {
                  boxShadow: 4,
                },
              }}
            >
              {/* Role Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ color: `${role.color}.main` }}>{role.icon}</Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {role.name}
                    </Typography>
                    <Chip
                      label={role.name.replace(' ', '_').toLowerCase()}
                      size="small"
                      color={role.color}
                    />
                  </Box>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    {role.description}
                  </Typography>
                </Box>
              </Box>

              {/* Permissions List */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Permissions:
                </Typography>
                <List dense>
                  {role.permissions.map((permission, index) => (
                    <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon sx={{ fontSize: 18, color: `${role.color}.main` }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={permission.description}
                        slotProps={{
                          primary: {
                            variant: 'body2',
                            sx: { fontSize: '0.875rem' },
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </Paper>
        ))}
      </Box>
      {/* Bottom Note */}
      <Paper sx={{ p: 2, mt: 3, bgcolor: 'grey.50' }}>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          <strong>Note:</strong> To modify user roles or create new users, go to Settings → Users. Only
          administrators can manage user accounts and assign roles.
        </Typography>
      </Paper>
    </GenericOverviewPage>
  );
}

export default RoleManagementPage
