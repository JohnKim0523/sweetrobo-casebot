import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sessions')
export class Session {
  @PrimaryColumn()
  sessionId: string;

  @Column()
  machineId: string;

  @Column({ nullable: true })
  phoneModelId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastAccessedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}
