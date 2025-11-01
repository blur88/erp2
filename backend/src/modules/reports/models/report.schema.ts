import * as mongoose from 'mongoose';
import {
  ReportCategory,
  ReportFormat,
  ReportFrequency
} from '../interfaces/report-types.interface';

export const ScheduledReportSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  reportType: { 
    type: String, 
    required: true 
  },
  frequency: { 
    type: String, 
    enum: Object.values(ReportFrequency),
    required: true 
  },
  recipients: [{ 
    type: String, 
    required: true 
  }],
  format: { 
    type: String, 
    enum: Object.values(ReportFormat),
    default: ReportFormat.CSV 
  },
  lastRunAt: { 
    type: Date 
  },
  nextRunAt: { 
    type: Date 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

export const ReportTemplateSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    enum: Object.values(ReportCategory),
    required: true 
  },
  template: { 
    type: String, 
    required: true 
  },
  fields: [{
    type: String,
    required: true
  }]
}, { 
  timestamps: true 
});