import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('company_settings')
export class CompanySettings extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * Business registration number (SSM), e.g. '201901234567' or '1234567-A'.
   *
   * Structured rather than buried in miscInfo: it is a statutory identifier
   * that Form B (#1174) prints as N1a, and parsing it out of free text would
   * risk emitting a wrong registration number on a tax filing.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  registrationNumber: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string;

  @Column({ type: 'text', nullable: true })
  miscInfo: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string;
}
