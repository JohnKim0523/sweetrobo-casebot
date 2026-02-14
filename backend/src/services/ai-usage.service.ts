import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

// AI Usage log entry
export interface AIUsageLog {
  machineId: string;
  timestamp: string;
  type: 'edit' | 'generate' | 'outpaint';
  sessionId: string;
  cost: number;
  prompt?: string;
}

// Aggregated stats for a machine
export interface MachineAIStats {
  machineId: string;
  total: { edits: number; generations: number; cost: number };
  daily: {
    [date: string]: { edits: number; generations: number; cost: number };
  };
  weekly: {
    [week: string]: { edits: number; generations: number; cost: number };
  };
  monthly: {
    [month: string]: { edits: number; generations: number; cost: number };
  };
}

// All machines summary
export interface AIUsageSummary {
  totalEdits: number;
  totalGenerations: number;
  totalCost: number;
  machines: MachineAIStats[];
}

class AIUsageService {
  private client: DynamoDBClient | null = null;
  private docClient: DynamoDBDocumentClient | null = null;
  private tableName: string = 'sweetrobo-ai-usage';
  private initialized: boolean = false;

  // Cost per operation (matches vertexAI.service.ts)
  private readonly COST_PER_EDIT = 0.05;
  private readonly COST_PER_GENERATE = 0.05;

  constructor() {
    // Lazy initialization
  }

  /**
   * Initialize DynamoDB client
   */
  private initialize() {
    if (this.initialized) return;

    try {
      this.client = new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      this.docClient = DynamoDBDocumentClient.from(this.client, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });

      this.initialized = true;
      console.log('✅ AI Usage Service initialized (DynamoDB)');
    } catch (error) {
      console.error('❌ Failed to initialize AI Usage Service:', error);
    }
  }

  /**
   * Get ISO week number from date
   */
  private getWeekNumber(date: Date): string {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
  }

  /**
   * Log an AI usage event
   */
  async logUsage(params: {
    machineId: string;
    type: 'edit' | 'generate' | 'outpaint';
    sessionId: string;
    prompt?: string;
  }): Promise<boolean> {
    this.initialize();

    if (!this.docClient) {
      console.error('❌ DynamoDB client not initialized');
      return false;
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const date = timestamp.split('T')[0]; // YYYY-MM-DD
    const month = date.substring(0, 7); // YYYY-MM
    const week = this.getWeekNumber(now);
    const cost =
      params.type === 'edit' ? this.COST_PER_EDIT : this.COST_PER_GENERATE;

    // Use machineId as partition key and timestamp as sort key
    // This allows efficient queries by machine
    const item = {
      machineId: params.machineId || 'unknown',
      timestamp,
      type: params.type,
      sessionId: params.sessionId || 'unknown',
      cost,
      date,
      month,
      week,
      prompt: params.prompt?.substring(0, 200), // Truncate long prompts
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        }),
      );

      console.log(
        `📊 AI Usage logged: ${params.machineId} - ${params.type} - $${cost.toFixed(3)}`,
      );
      return true;
    } catch (error: any) {
      // If table doesn't exist, log warning but don't crash
      if (error.name === 'ResourceNotFoundException') {
        console.warn(
          '⚠️ DynamoDB table not found. AI usage not logged. Run setup to create table.',
        );
        return false;
      }
      console.error('❌ Failed to log AI usage:', error);
      return false;
    }
  }

  /**
   * Get AI usage stats for a specific machine
   */
  async getMachineStats(machineId: string): Promise<MachineAIStats | null> {
    this.initialize();

    if (!this.docClient) {
      return null;
    }

    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'machineId = :machineId',
          ExpressionAttributeValues: {
            ':machineId': machineId,
          },
        }),
      );

      const items = result.Items || [];
      return this.aggregateStats(machineId, items);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.warn('⚠️ DynamoDB table not found');
        return null;
      }
      console.error('❌ Failed to get machine stats:', error);
      return null;
    }
  }

  /**
   * Get AI usage stats for all machines
   */
  async getAllStats(): Promise<AIUsageSummary> {
    this.initialize();

    const defaultSummary: AIUsageSummary = {
      totalEdits: 0,
      totalGenerations: 0,
      totalCost: 0,
      machines: [],
    };

    if (!this.docClient) {
      return defaultSummary;
    }

    try {
      // Scan all items (for admin use - not for high-frequency calls)
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
        }),
      );

      const items = result.Items || [];

      // Group by machine
      const machineGroups: { [machineId: string]: any[] } = {};
      for (const item of items) {
        const machineId = item.machineId || 'unknown';
        if (!machineGroups[machineId]) {
          machineGroups[machineId] = [];
        }
        machineGroups[machineId].push(item);
      }

      // Aggregate stats for each machine
      const machines: MachineAIStats[] = [];
      let totalEdits = 0;
      let totalGenerations = 0;
      let totalCost = 0;

      for (const [machineId, machineItems] of Object.entries(machineGroups)) {
        const stats = this.aggregateStats(machineId, machineItems);
        machines.push(stats);
        totalEdits += stats.total.edits;
        totalGenerations += stats.total.generations;
        totalCost += stats.total.cost;
      }

      // Sort machines by total usage (highest first)
      machines.sort(
        (a, b) =>
          b.total.edits +
          b.total.generations -
          (a.total.edits + a.total.generations),
      );

      return {
        totalEdits,
        totalGenerations,
        totalCost,
        machines,
      };
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.warn('⚠️ DynamoDB table not found');
        return defaultSummary;
      }
      console.error('❌ Failed to get all stats:', error);
      return defaultSummary;
    }
  }

  /**
   * Aggregate raw items into stats
   */
  private aggregateStats(machineId: string, items: any[]): MachineAIStats {
    const stats: MachineAIStats = {
      machineId,
      total: { edits: 0, generations: 0, cost: 0 },
      daily: {},
      weekly: {},
      monthly: {},
    };

    for (const item of items) {
      const type = item.type as 'edit' | 'generate';
      const cost =
        item.cost ||
        (type === 'edit' ? this.COST_PER_EDIT : this.COST_PER_GENERATE);
      const date = item.date || item.timestamp?.split('T')[0] || 'unknown';
      const week = item.week || 'unknown';
      const month = item.month || date?.substring(0, 7) || 'unknown';

      // Total
      if (type === 'edit') {
        stats.total.edits++;
      } else {
        stats.total.generations++;
      }
      stats.total.cost += cost;

      // Daily
      if (!stats.daily[date]) {
        stats.daily[date] = { edits: 0, generations: 0, cost: 0 };
      }
      if (type === 'edit') {
        stats.daily[date].edits++;
      } else {
        stats.daily[date].generations++;
      }
      stats.daily[date].cost += cost;

      // Weekly
      if (!stats.weekly[week]) {
        stats.weekly[week] = { edits: 0, generations: 0, cost: 0 };
      }
      if (type === 'edit') {
        stats.weekly[week].edits++;
      } else {
        stats.weekly[week].generations++;
      }
      stats.weekly[week].cost += cost;

      // Monthly
      if (!stats.monthly[month]) {
        stats.monthly[month] = { edits: 0, generations: 0, cost: 0 };
      }
      if (type === 'edit') {
        stats.monthly[month].edits++;
      } else {
        stats.monthly[month].generations++;
      }
      stats.monthly[month].cost += cost;
    }

    return stats;
  }

  /**
   * Get today's stats for a machine
   */
  async getTodayStats(
    machineId: string,
  ): Promise<{ edits: number; generations: number; cost: number }> {
    const stats = await this.getMachineStats(machineId);
    if (!stats) {
      return { edits: 0, generations: 0, cost: 0 };
    }

    const today = new Date().toISOString().split('T')[0];
    return stats.daily[today] || { edits: 0, generations: 0, cost: 0 };
  }

  /**
   * Get this week's stats for a machine
   */
  async getWeekStats(
    machineId: string,
  ): Promise<{ edits: number; generations: number; cost: number }> {
    const stats = await this.getMachineStats(machineId);
    if (!stats) {
      return { edits: 0, generations: 0, cost: 0 };
    }

    const thisWeek = this.getWeekNumber(new Date());
    return stats.weekly[thisWeek] || { edits: 0, generations: 0, cost: 0 };
  }

  /**
   * Get this month's stats for a machine
   */
  async getMonthStats(
    machineId: string,
  ): Promise<{ edits: number; generations: number; cost: number }> {
    const stats = await this.getMachineStats(machineId);
    if (!stats) {
      return { edits: 0, generations: 0, cost: 0 };
    }

    const thisMonth = new Date().toISOString().substring(0, 7);
    return stats.monthly[thisMonth] || { edits: 0, generations: 0, cost: 0 };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; tableExists: boolean }> {
    this.initialize();

    if (!this.docClient) {
      return { healthy: false, tableExists: false };
    }

    try {
      // Try to query the table (will fail if doesn't exist)
      await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'machineId = :machineId',
          ExpressionAttributeValues: {
            ':machineId': 'health-check',
          },
          Limit: 1,
        }),
      );

      return { healthy: true, tableExists: true };
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return { healthy: true, tableExists: false };
      }
      return { healthy: false, tableExists: false };
    }
  }
}

// Export singleton instance
export const aiUsageService = new AIUsageService();
export default aiUsageService;
