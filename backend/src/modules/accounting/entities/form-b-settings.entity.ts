import { Entity, Column, PrimaryColumn, Check } from 'typeorm';

/**
 * Form B business identity (N1-N2a). A DEDICATED singleton, not extra columns
 * on accounting_settings: that table configures posting, and a tax concern does
 * not belong in it.
 *
 * Every column is nullable. businessName falls back to PrintSettings.companyName
 * when NULL; the other three have no fallback source and simply read as absent,
 * raising an incomplete finding rather than blocking the report.
 *
 * The CHECK is declared here as well as in the migration so verify-baseline.sh
 * (which diffs a migrated schema against schema:sync) agrees.
 */
@Entity('form_b_settings')
@Check(`"id" = true`)
export class FormBSettings {
  @PrimaryColumn({ type: 'boolean', default: true })
  id: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  businessName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  registrationNumber: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  businessCode: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  activityType: string | null;
}
