import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  Box,
  CircularProgress,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface Category {
  id: string;
  name: string;
}

interface CategoryDeleteError {
  message: string;
  productCount?: number;
  categoryName?: string;
  suggestions?: string[];
}

interface SmartCategoryDeleteDialogProps {
  open: boolean;
  category: Category | null;
  error: CategoryDeleteError | null;
  onClose: () => void;
  onConfirm: (moveToUncategorized: boolean) => Promise<void>;
}

type DeleteStep = 'options' | 'confirm' | 'loading';
type ActionType = 'manual' | 'move' | '';

export const SmartCategoryDeleteDialog: React.FC<SmartCategoryDeleteDialogProps> = ({
  open,
  category,
  error,
  onClose,
  onConfirm,
}) => {
  const [step, setStep] = useState<DeleteStep>('options');
  const [selectedAction, setSelectedAction] = useState<ActionType>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('options');
      setSelectedAction('');
      setIsLoading(false);
    }
  }, [open]);

  const handleActionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedAction(event.target.value as ActionType);
  };

  const handleNext = () => {
    if (selectedAction === 'manual') {
      onClose();
      return;
    }

    if (selectedAction === 'move') {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setStep('loading');

    try {
      await onConfirm(selectedAction === 'move');
      onClose();
    } catch (error) {
      console.error('Failed to delete category:', error);
      setIsLoading(false);
      setStep('options');
    }
  };

  if (!category || !error) {
    return null;
  }

  const productCount = error.productCount || 0;

  const renderOptionsStep = () => (
    <>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon color="warning" />
          Category Contains Products
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          <strong>"{category.name}"</strong> contains{' '}
          <strong>{productCount} product{productCount === 1 ? '' : 's'}</strong>.
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          What would you like to do?
        </Typography>

        <RadioGroup value={selectedAction} onChange={handleActionChange}>
          <FormControlLabel
            value="manual"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight="medium">
                  I'll handle the products myself
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Move or delete products manually, then try deleting the category again
                </Typography>
              </Box>
            }
            sx={{ mb: 2, alignItems: 'flex-start' }}
          />

          <FormControlLabel
            value="move"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight="medium">
                  Move all products to "Uncategorized" and delete category
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Products will be automatically moved to the "Uncategorized" category
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start' }}
          />
        </RadioGroup>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleNext}
          disabled={!selectedAction}
          variant="contained"
        >
          {selectedAction === 'manual' ? 'OK' : 'Continue'}
        </Button>
      </DialogActions>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <DialogTitle>Confirm Deletion</DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This action will:
        </Alert>

        <Box component="ul" sx={{ mt: 1, mb: 2, pl: 2 }}>
          <Typography component="li" variant="body2">
            Delete category <strong>"{category.name}"</strong>
          </Typography>
          <Typography component="li" variant="body2">
            Move <strong>{productCount} product{productCount === 1 ? '' : 's'}</strong> to "Uncategorized"
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary">
          This action can be undone by restoring the category from the deleted categories list.
          Products moved to "Uncategorized" will need to be reorganized manually.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={() => setStep('options')}>Back</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          color="error"
          variant="contained"
          disabled={isLoading}
        >
          Delete & Move Products
        </Button>
      </DialogActions>
    </>
  );

  const renderLoadingStep = () => (
    <>
      <DialogTitle>Deleting Category...</DialogTitle>

      <DialogContent>
        <Box display="flex" alignItems="center" gap={2} py={3}>
          <CircularProgress size={24} />
          <Typography>
            Deleting category and moving products to "Uncategorized"...
          </Typography>
        </Box>
      </DialogContent>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      {step === 'options' && renderOptionsStep()}
      {step === 'confirm' && renderConfirmStep()}
      {step === 'loading' && renderLoadingStep()}
    </Dialog>
  );
};