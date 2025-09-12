import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Switch,
  Alert,
  LinearProgress,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Collapse,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useNotification } from '@/hooks/useNotification';
import { ApiService } from '@/services/api';

interface ProductImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

interface ImportResult {
  totalRows: number;
  successCount: number;
  failureCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value?: any;
  }>;
  warnings: Array<{
    row: number;
    message: string;
  }>;
  importedProductIds: string[];
}

export const ProductImportDialog: React.FC<ProductImportDialogProps> = ({
  open,
  onClose,
  onImportSuccess
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { showSuccess, showError } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImportResult(null); // Clear previous results
      
      // Auto-detect format based on file extension
      const extension = selectedFile.name.toLowerCase().split('.').pop();
      if (extension === 'xlsx' || extension === 'xls') {
        setFormat('excel');
      } else if (extension === 'csv') {
        setFormat('csv');
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await ApiService.get('/inventory/products/import-template', {
        responseType: 'blob',
      });
      
      const blob = new Blob([response.data as string], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'product-import-template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      showSuccess('Template downloaded successfully');
    } catch (error) {
      console.error('Template download error:', error);
      showError('Failed to download template');
    }
  };

  const handleImport = async () => {
    if (!file) {
      showError('Please select a file to import');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      formData.append('skipDuplicates', skipDuplicates.toString());
      formData.append('updateExisting', updateExisting.toString());

      const response = await ApiService.post('/inventory/products/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = response.data as ImportResult;
      setImportResult(result);

      if (result.successCount > 0 || result.updatedCount > 0) {
        showSuccess(
          `Import completed: ${result.successCount} created, ${result.updatedCount} updated`
        );
        onImportSuccess(); // Refresh the products list
      }

      if (result.failureCount > 0) {
        showError(`${result.failureCount} products failed to import. Check the results below.`);
      }

    } catch (error: any) {
      console.error('Import error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Import failed';
      showError(errorMessage);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    setFormat('csv');
    setSkipDuplicates(false);
    setUpdateExisting(false);
    setShowErrors(false);
    setShowWarnings(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const renderImportResults = () => {
    if (!importResult) return null;

    const hasErrors = importResult.errors.length > 0;
    const hasWarnings = importResult.warnings.length > 0;

    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Import Results
        </Typography>
        
        {/* Summary Cards */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            icon={<CheckCircleIcon />}
            label={`${importResult.successCount} Created`}
            color="success"
            variant="outlined"
            size="small"
          />
          <Chip
            icon={<CheckCircleIcon />}
            label={`${importResult.updatedCount} Updated`}
            color="info"
            variant="outlined"
            size="small"
          />
          {importResult.skippedCount > 0 && (
            <Chip
              label={`${importResult.skippedCount} Skipped`}
              color="default"
              variant="outlined"
              size="small"
            />
          )}
          {importResult.failureCount > 0 && (
            <Chip
              icon={<ErrorIcon />}
              label={`${importResult.failureCount} Failed`}
              color="error"
              variant="outlined"
              size="small"
            />
          )}
        </Box>

        {/* Progress Summary */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Processed: {importResult.totalRows} rows
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(((importResult.successCount + importResult.updatedCount + importResult.skippedCount) / importResult.totalRows) * 100)}% Complete
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={((importResult.successCount + importResult.updatedCount + importResult.skippedCount) / importResult.totalRows) * 100}
            color="success"
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {/* Errors Section */}
        {hasErrors && (
          <Box sx={{ mb: 2 }}>
            <Button
              startIcon={showErrors ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setShowErrors(!showErrors)}
              color="error"
              size="small"
            >
              {importResult.errors.length} Error{importResult.errors.length !== 1 ? 's' : ''}
            </Button>
            <Collapse in={showErrors}>
              <TableContainer component={Paper} sx={{ mt: 1, maxHeight: 200 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Field</TableCell>
                      <TableCell>Message</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importResult.errors.map((error, index) => (
                      <TableRow key={index}>
                        <TableCell>{error.row}</TableCell>
                        <TableCell>{error.field}</TableCell>
                        <TableCell>{error.message}</TableCell>
                        <TableCell>{error.value || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}

        {/* Warnings Section */}
        {hasWarnings && (
          <Box sx={{ mb: 2 }}>
            <Button
              startIcon={showWarnings ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setShowWarnings(!showWarnings)}
              color="warning"
              size="small"
            >
              {importResult.warnings.length} Warning{importResult.warnings.length !== 1 ? 's' : ''}
            </Button>
            <Collapse in={showWarnings}>
              <TableContainer component={Paper} sx={{ mt: 1, maxHeight: 200 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importResult.warnings.map((warning, index) => (
                      <TableRow key={index}>
                        <TableCell>{warning.row}</TableCell>
                        <TableCell>{warning.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          maxHeight: isMobile ? '100vh' : '90vh',
          width: isMobile ? '100vw' : 'auto',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="div">
          Import Products
        </Typography>
        {isMobile && (
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent sx={{ pb: 2 }}>
        {!importResult ? (
          <>
            {/* File Upload Section */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Upload a CSV or Excel file containing your product data. Make sure to follow the template format.
              </Typography>
            </Alert>

            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadTemplate}
                  size="small"
                >
                  Download Template
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Download the CSV template with required headers and sample data
                </Typography>
              </Box>
              
              <Divider sx={{ my: 2 }} />

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="import-file-input"
              />
              <label htmlFor="import-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<CloudUploadIcon />}
                  fullWidth={isMobile}
                  sx={{ mb: 2 }}
                >
                  {file ? file.name : 'Choose File'}
                </Button>
              </label>

              {file && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Format Selection */}
            <FormControl component="fieldset" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>File Format</Typography>
              <RadioGroup
                row
                value={format}
                onChange={(e) => setFormat(e.target.value as 'csv' | 'excel')}
              >
                <FormControlLabel value="csv" control={<Radio size="small" />} label="CSV" />
                <FormControlLabel value="excel" control={<Radio size="small" />} label="Excel" />
              </RadioGroup>
            </FormControl>

            {/* Import Options */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Import Options</Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={skipDuplicates}
                    onChange={(e) => {
                      setSkipDuplicates(e.target.checked);
                      if (e.target.checked) setUpdateExisting(false);
                    }}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Skip Duplicates</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Skip products with duplicate names or barcodes
                    </Typography>
                  </Box>
                }
                sx={{ mb: 1, alignItems: 'flex-start' }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={updateExisting}
                    onChange={(e) => {
                      setUpdateExisting(e.target.checked);
                      if (e.target.checked) setSkipDuplicates(false);
                    }}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Update Existing</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Update existing products when duplicates are found
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start' }}
              />
            </Box>

            {importing && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                  Importing products, please wait...
                </Typography>
              </Box>
            )}
          </>
        ) : (
          renderImportResults()
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={importing}>
          {importResult ? 'Close' : 'Cancel'}
        </Button>
        
        {importResult ? (
          <Button
            onClick={handleReset}
            variant="outlined"
            disabled={importing}
          >
            Import Another File
          </Button>
        ) : (
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={!file || importing}
          >
            {importing ? 'Importing...' : 'Import Products'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProductImportDialog;