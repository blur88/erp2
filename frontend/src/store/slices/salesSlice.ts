import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Customer, SalesOrder } from '@/types';

interface SalesState {
  selectedOrder: SalesOrder | null;
  selectedCustomer: Customer | null;
  error: string | null;
}

const initialState: SalesState = {
  selectedOrder: null,
  selectedCustomer: null,
  error: null,
};

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    setSelectedOrder: (state, action: PayloadAction<SalesOrder | null>) => {
      state.selectedOrder = action.payload;
    },
    setSelectedCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.selectedCustomer = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { setSelectedOrder, setSelectedCustomer, clearError } = salesSlice.actions;

export default salesSlice.reducer;
