import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('search_queries')
@Index(['userId'])
@Index(['resultCount', 'createdAt'])
export class SearchQuery {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'int', name: 'result_count' })
  resultCount: number;

  @Column({ type: 'int', name: 'execution_time_ms' })
  executionTimeMs: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  @Index()
  createdAt: Date;
}
