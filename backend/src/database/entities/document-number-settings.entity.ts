import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

export interface DocumentNumberConfig {
  documentName: string;
  prefix: string;
  numberFormat: string;
  nextNumber: number;
}

@Entity('document_number_settings')
export class DocumentNumberSettings extends BaseEntity {
  @Column({ type: 'jsonb', default: [] })
  configurations: DocumentNumberConfig[];
}
