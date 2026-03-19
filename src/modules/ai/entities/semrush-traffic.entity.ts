import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('semrush_traffic')
export class SemrushTraffic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  domain: string;

  @Column({ type: 'jsonb', nullable: true })
  traffic: any;

  @Column({ type: 'jsonb', nullable: true })
  authority: any;

  @Column({ type: 'jsonb', nullable: true })
  aiOverview: any;

  @Column({ type: 'jsonb', nullable: true })
  trendData: any;

  @Column({ type: 'jsonb', nullable: true })
  competitors: any;

  @Column({ type: 'jsonb', nullable: true })
  aiSources: any;

  @Column({ type: 'text', nullable: true })
  rawResponse: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
