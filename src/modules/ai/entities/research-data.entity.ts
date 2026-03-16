import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('research_data')
@Index(['domain', 'category'])
export class ResearchData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  domain: string;

  @Column()
  category: string;

  @Column()
  key: string;

  @Column({ type: 'jsonb' })
  value: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
