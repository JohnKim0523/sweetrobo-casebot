import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  machineId: string;

  @Column({ type: 'text' })
  imageUrl: string;

  @Column()
  phoneModel: string;

  @Column()
  phoneModelId: string;

  @Column({ nullable: true })
  productId: string;

  @Column({ nullable: true })
  chituOrderId: string;

  @Column({ type: 'jsonb' })
  dimensions: {
    widthPX: number;
    heightPX: number;
    widthMM: number;
    heightMM: number;
  };

  @Column({ default: 'waiting' })
  status: 'waiting' | 'processing' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'int', default: 0 })
  priority: number;
}
