import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('search_queries')
@Index(['userId'])
@Index(['resultCount', 'createdAt'])
export class SearchQuery {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  resultCount: number;

  @Column({ type: 'int' })
  executionTimeMs: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  createdAt: Date;
}
