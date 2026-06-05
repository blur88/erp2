import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs';
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace';
import type { AppDispatch } from '@/store';
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi';
import { setSelectedPayment } from '@/store/slices/salesSlice';

export interface PaymentListItem {
  id: string;
  paymentNumber: string;
  customerName?: string;
  amount: number;
  paymentDate: string | Date;
  paymentMethodId?: string;
  paymentMethod?: string;
  paymentMethodEntity?: {
    id: string;
    code: string;
    name: string;
  };
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  notes?: string;
  reference?: string;
  relatedOrderId?: string;
  relatedOrderNumber?: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  salesOrder?: {
    id: string;
    orderNumber: string;
  };
}

export interface UsePaymentsWorkspaceConfig {
  dispatch: AppDispatch;
  payments: PaymentListItem[];
  selectedPayment: PaymentListItem | null;
  refetch: () => void;
}

export function usePaymentsWorkspace({
  dispatch,
  payments,
  selectedPayment,
  refetch,
}: UsePaymentsWorkspaceConfig) {
  const navigate = useNavigate();
  const location = useLocation();
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery();
  const [relatedOrder, setRelatedOrder] = useState<any>(null);
  const selectedPaymentRef = useRef<PaymentListItem | null>(null);

  const workspace = useEntityWorkspace({
    entities: payments,
    selectedEntity: selectedPayment,
    selectEntity: (payment) => dispatch(setSelectedPayment(payment as any)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    locationStateHighlightKey: 'highlightPaymentId',
    routes: {
      create: '/sales/payments/create',
      edit: (id) => `/sales/payments/${id}/edit`,
    },
    onEnter: () => {},
  });
  const { focusedIndex } = workspace;

  useEffect(() => {
    if (selectedPayment?.relatedOrderId) {
      triggerGetSalesOrder(selectedPayment.relatedOrderId)
        .unwrap()
        .then(setRelatedOrder)
        .catch(() => setRelatedOrder(null));
    } else {
      setRelatedOrder(null);
    }
  }, [selectedPayment?.relatedOrderId, triggerGetSalesOrder]);

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } =
    useJournalEntryRefs([
      { sourceType: 'payment', sourceId: selectedPayment?.id },
      {
        sourceType: 'sales_order',
        sourceId: relatedOrder?.isFulfilled ? relatedOrder?.id : undefined,
      },
    ]);

  useEffect(() => {
    selectedPaymentRef.current = selectedPayment;
  }, [selectedPayment]);

  useEffect(() => {
    if (location.pathname === '/sales/payments') {
      void refetch();
    }
  }, [location.pathname, refetch]);

  useEffect(() => {
    if (payments.length === 0 || !selectedPaymentRef.current) {
      return;
    }

    const freshPayment = payments.find((payment) => payment.id === selectedPaymentRef.current?.id);
    if (!freshPayment) {
      return;
    }

    if (JSON.stringify(freshPayment) !== JSON.stringify(selectedPaymentRef.current)) {
      dispatch(setSelectedPayment(freshPayment as any));
    }
  }, [dispatch, payments]);

  const handleSelect = useCallback(
    (payment: PaymentListItem) => {
      workspace.handleSelect(payment);
    },
    [workspace],
  );

  const handleOrderClick = useCallback(
    (orderId: string, event: MouseEvent) => {
      event.stopPropagation();
      navigate(`/sales/orders?highlight=${orderId}`);
    },
    [navigate],
  );

  const handleNavigateToJournalEntry = useCallback(() => {
    navigateToJournalEntries();
  }, [navigateToJournalEntries]);

  return {
    ...workspace,
    focusedPaymentIndex: focusedIndex,
    paymentListRef: workspace.listRef,
    deletedPaymentsDialogOpen,
    setDeletedPaymentsDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRefs,
    journalEntryRefsLoading,
    handleSelect,
    handlePaymentSelect: handleSelect,
    handleOrderClick,
    handleNavigateToJournalEntry,
  };
}
