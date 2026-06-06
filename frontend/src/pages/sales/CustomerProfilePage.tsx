import { Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import PersonIcon from '@mui/icons-material/Person';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EntityStatusChip } from '@/components/common/EntityStatusChip';
import PageHeader from '@/components/common/PageHeader';
import { TABLE_STYLES } from '@/constants/tableStyles';
import { useGetCustomerBySlugQuery } from '@/store/api/salesApi';

import CustomerOrdersTab from './components/CustomerOrdersTab';
import CustomerOverviewTab from './components/CustomerOverviewTab';
import CustomerPaymentsTab from './components/CustomerPaymentsTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>{children}</Box>}
    </Box>
  );
}

export default function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 3);

  const { data: customer, isLoading, isError } = useGetCustomerBySlugQuery(slug ?? skipToken);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !customer) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Customer not found.</Typography>
      </Box>
    );
  }

  const profilePath = `/sales/customers/${customer.slug}/view`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={customer.name}
        titleBadge={<EntityStatusChip status={customer.isActive ? 'active' : 'inactive'} />}
        backAction={() => navigate('/sales/customers')}
        primaryAction={{
          label: 'Edit Customer',
          onClick: () =>
            navigate(`/sales/customers/${customer.slug}/edit`, {
              state: { returnTo: 'profile', profilePath, breadcrumbTitle: customer.name },
            }),
        }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) =>
            setSearchParams({ tab: String(value) }, { replace: true })
          }
          sx={{ minHeight: 36 }}
        >
          <Tab
            icon={<PersonIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Overview"
            sx={{ minHeight: 36 }}
          />
          <Tab
            icon={<ShoppingCartIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Orders"
            sx={{ minHeight: 36 }}
          />
          <Tab
            icon={<PaymentIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Payments"
            sx={{ minHeight: 36 }}
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <CustomerOverviewTab customer={customer} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <CustomerOrdersTab customerId={customer.id} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <CustomerPaymentsTab customerId={customer.id} />
      </TabPanel>
    </Box>
  );
}
