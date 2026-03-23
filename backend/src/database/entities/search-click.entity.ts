import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SearchQuery } from './search-query.entity';

@Entity('search_clicks')
export class SearchClick {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SearchQuery, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'search_query_id' })
  @Index()
  searchQuery: SearchQuery | null;

  @Column({ type: 'uuid', nullable: true, name: 'search_query_id' })
  searchQueryId: string | null;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'varchar', length: 100, name: 'result_type' })
  resultType: string;

  @Column({ type: 'varchar', length: 255, name: 'result_id' })
  resultId: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'result_label' })
  resultLabel: string | null;

  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  @Index()
  createdAt: Date;
}
