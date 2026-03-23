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

  @Column({ type: 'varchar', length: 100 })
  resultType: string;

  @Column({ type: 'varchar', length: 255 })
  resultId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultLabel: string | null;

  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
