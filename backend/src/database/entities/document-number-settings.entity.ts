import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("document_number_settings")
@Index(["documentName"], { unique: true })
export class DocumentNumberSetting extends BaseEntity {
  @Column({ type: "varchar", length: 50, unique: true })
  documentName: string;

  @Column({ type: "varchar", length: 10 })
  prefix: string;

  @Column({ type: "smallint", default: 3 })
  paddingDigits: number;

  @Column({ type: "int", default: 1 })
  nextNumber: number;

  @Column({ type: "smallint" })
  lastResetYear: number;
}
