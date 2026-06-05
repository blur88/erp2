import React, { useState } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Divider,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { default as PreviewIcon } from '@mui/icons-material/Visibility'
import { default as DocumentIcon } from '@mui/icons-material/Description'
import TemplatePreview from './TemplatePreview'

interface TemplatesTabProps {
  settings: any
  onUpdate: (settings: any) => void
}

const templates = [
  {
    id: 'salesOrder',
    title: 'Sales Order',
    description: 'Standard template for sales orders',
    icon: <DocumentIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
  },
  {
    id: 'paymentReceipt',
    title: 'Payment Receipt',
    description: 'Standard template for payment receipts',
    icon: <DocumentIcon sx={{ fontSize: 40, color: 'info.main' }} />,
  },
  {
    id: 'purchaseOrder',
    title: 'Purchase Order',
    description: 'Standard template for purchase orders',
    icon: <DocumentIcon sx={{ fontSize: 40, color: 'warning.main' }} />,
  },
  {
    id: 'grn',
    title: 'Goods Received Note',
    description: 'Standard template for GRN documents',
    icon: <DocumentIcon sx={{ fontSize: 40, color: 'secondary.main' }} />,
  },
  {
    id: 'vendorPayment',
    title: 'Vendor Payment',
    description: 'Standard template for vendor payments',
    icon: <DocumentIcon sx={{ fontSize: 40, color: 'error.main' }} />,
  },
]

const TemplatesTab: React.FC<TemplatesTabProps> = ({ settings, onUpdate }) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)

  const handlePreview = (template: any) => {
    const templateKey = `${template.id}Template`
    const templateData = settings?.[templateKey] || {}
    setSelectedTemplate({
      ...template,
      config: templateData,
    })
    setPreviewOpen(true)
  }

  const handleClosePreview = () => {
    setPreviewOpen(false)
    setSelectedTemplate(null)
  }

  return (
    <Box sx={{ px: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          Document Templates
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 3
          }}>
          All templates use a consistent standard format for professional documentation
        </Typography>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          {templates.map((template) => (
            <Grid
              key={template.id}
              size={{
                xs: 12,
                sm: 6,
                md: 4
              }}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                  <Box sx={{ mb: 2 }}>{template.icon}</Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {template.title}
                  </Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    {template.description}
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<PreviewIcon />}
                    onClick={() => handlePreview(template)}
                  >
                    Preview
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'info.lighter', borderRadius: 1 }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            <strong>Note:</strong> All templates follow a standard format with consistent styling.
            The document title automatically adjusts based on the document type (e.g., "Sales Order", "Invoice", etc.).
            You can customize headers and footers in the General tab.
          </Typography>
        </Box>
      </Paper>
      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={handleClosePreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedTemplate?.title} Template Preview
        </DialogTitle>
        <DialogContent>
          {selectedTemplate && (
            <TemplatePreview
              template={selectedTemplate}
              settings={settings}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePreview}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TemplatesTab
