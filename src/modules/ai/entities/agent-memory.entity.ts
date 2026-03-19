import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * AgentMemory entity stores the summarized historical actions of an AI Agent per thread.
 * Instead of saving the full message history (which can cause context overflow),
 * we only save concise summaries of what the agent has achieved in previous steps.
 */
@Entity('agent_memory')
export class AgentMemory {
  @PrimaryColumn()
  threadId: string;

  @Column({ type: 'jsonb', default: [] })
  memory: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
