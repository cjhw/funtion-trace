import type {
  ITracer,
  CallRecord,
  CallMetadata,
  CallTreeNode,
  TracingStats,
  TracerOptions,
  TraceExport,
  FileStats
} from './types.js';

/**
 * 高性能函数调用追踪器
 * 支持跨文件调用追踪，提供完整的调用链路分析
 */
export class FunctionTracer implements ITracer {
  private readonly options: Required<TracerOptions>;
  private readonly callStack: CallRecord[] = [];
  private readonly callHistory: CallRecord[] = [];
  private readonly fileStats = new Map<string, FileStats>();
  private currentDepth = 0;
  private enabled = true;

  constructor(options: TracerOptions = {}) {
    this.options = {
      enabled: true,
      includeArguments: true,
      includeReturnValues: true,
      maxDepth: 100,
      ignorePatterns: [
        /^console\./,
        /^__TRACER__/,
        /^Date\./,
        /^performance\./,
        /^JSON\./,
        /^Math\./
      ],
      ignoreFiles: [
        /node_modules/,
        /\.min\./
      ],
      samplingRate: 1.0,
      serializer: this.defaultSerializer,
      ...options
    };

    this.enabled = this.options.enabled;
  }

  /**
   * 进入函数调用
   */
  enter(
    functionName: string,
    filePath: string,
    args: unknown[] | IArguments,
    metadata: CallMetadata
  ): string {
    if (!this.shouldTrace(functionName, filePath)) {
      return '';
    }

    // 检查采样率
    if (Math.random() > this.options.samplingRate) {
      return '';
    }

    // 检查最大深度
    if (this.currentDepth >= this.options.maxDepth) {
      return '';
    }

    const callId = this.generateCallId();
    const parentId = this.callStack.length > 0 
      ? this.callStack[this.callStack.length - 1]!.id 
      : null;

    const record: CallRecord = {
      id: callId,
      name: functionName,
      fullPath: `${filePath}:${functionName}`,
      filePath,
      args: this.options.includeArguments ? this.serializeArgs(args) : [],
      status: 'active',
      depth: this.currentDepth,
      startTime: performance.now(),
      parentId,
      childrenIds: [],
      metadata
    };

    // 更新父调用的子调用列表
    if (parentId) {
      const parent = this.callStack.find(call => call.id === parentId);
      if (parent) {
        parent.childrenIds.push(callId);
      }
    }

    this.callStack.push(record);
    this.currentDepth++;

    return callId;
  }

  /**
   * 退出函数调用
   */
  exit(callId: string, returnValue?: unknown): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.findCallInStack(callId);

    if (callIndex === -1) {
      console.warn(`[FunctionTracer] Call not found in stack: ${callId}`);
      return;
    }

    const record = this.callStack[callIndex]!;
    record.endTime = endTime;
    record.duration = endTime - record.startTime;
    record.status = 'completed';

    if (this.options.includeReturnValues && returnValue !== undefined) {
      record.returnValue = this.options.serializer(returnValue);
    }

    // 从调用栈移除并添加到历史记录
    this.callStack.splice(callIndex, 1);
    this.callHistory.push(record);
    this.currentDepth--;

    // 更新文件统计
    this.updateFileStats(record);
  }

  /**
   * 记录错误
   */
  error(callId: string, error: Error): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.findCallInStack(callId);

    if (callIndex === -1) {
      console.warn(`[FunctionTracer] Call not found in stack: ${callId}`);
      return;
    }

    const record = this.callStack[callIndex]!;
    record.endTime = endTime;
    record.duration = endTime - record.startTime;
    record.status = 'error';
    record.error = {
      name: error.name,
      message: error.message,
      stack: error.stack || ''
    };

    // 从调用栈移除并添加到历史记录
    this.callStack.splice(callIndex, 1);
    this.callHistory.push(record);
    this.currentDepth--;

    // 更新文件统计
    this.updateFileStats(record);
  }

  /**
   * 获取调用历史
   */
  getHistory(): CallRecord[] {
    return [...this.callHistory].sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 获取调用树
   */
  getCallTree(): CallTreeNode[] {
    const allRecords = [...this.callHistory, ...this.callStack];
    const rootRecords = allRecords.filter(record => !record.parentId);
    
    return rootRecords.map(record => this.buildTreeNode(record, allRecords));
  }

  /**
   * 获取统计信息
   */
  getStats(): TracingStats {
    // 统计所有记录：已完成的(callHistory) + 正在进行的(callStack)
    const completedRecords = this.callHistory;
    const activeRecords = this.callStack;
    const allRecords = [...completedRecords, ...activeRecords];
    
    const totalCalls = allRecords.length;
    const totalDuration = completedRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
    const averageDuration = completedRecords.length > 0 ? totalDuration / completedRecords.length : 0;

    const durations = completedRecords
      .filter(record => record.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    const slowestCall = durations[0] || null;
    const fastestCall = durations[durations.length - 1] || null;
    const errorCount = completedRecords.filter(record => record.error).length;

    return {
      totalCalls,
      totalDuration,
      averageDuration,
      slowestCall,
      fastestCall,
      errorCount,
      fileStats: new Map(this.fileStats)
    };
  }

  /**
   * 清空追踪数据
   */
  clear(): void {
    this.callStack.length = 0;
    this.callHistory.length = 0;
    this.fileStats.clear();
    this.currentDepth = 0;
  }

  /**
   * 启用/禁用追踪
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 导出追踪数据
   */
  export(): TraceExport {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      records: this.getHistory(),
      stats: this.getStats(),
      options: this.options
    };
  }

  /**
   * 打印调用树
   */
  printCallTree(): void {
    const tree = this.getCallTree();
    console.log(`\n🔍 函数调用链路追踪 (${this.callHistory.length} 个调用):\n`);
    
    if (tree.length === 0) {
      console.log('暂无调用记录');
      return;
    }

    tree.forEach(node => this.printTreeNode(node, 0));
  }

  /**
   * 打印统计报告
   */
  printStats(): void {
    const stats = this.getStats();
    console.log('\n📊 追踪统计报告:');
    console.log(`总调用次数: ${stats.totalCalls}`);
    console.log(`总执行时间: ${stats.totalDuration.toFixed(2)}ms`);
    console.log(`平均执行时间: ${stats.averageDuration.toFixed(2)}ms`);
    console.log(`错误次数: ${stats.errorCount}`);
    
    if (stats.slowestCall) {
      console.log(`最慢调用: ${stats.slowestCall.fullPath} (${stats.slowestCall.duration?.toFixed(2)}ms)`);
    }

    console.log('\n📁 文件统计:');
    for (const [filePath, fileStats] of stats.fileStats) {
      console.log(`  ${filePath}: ${fileStats.callCount} 个调用, ${fileStats.totalDuration.toFixed(2)}ms`);
    }
  }

  private shouldTrace(functionName: string, filePath: string): boolean {
    if (!this.enabled) return false;

    // 检查文件忽略模式
    if (this.options.ignoreFiles.some(pattern => this.matchPattern(filePath, pattern))) {
      return false;
    }

    // 检查函数忽略模式
    if (this.options.ignorePatterns.some(pattern => this.matchPattern(functionName, pattern))) {
      return false;
    }

    return true;
  }

  private matchPattern(text: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return text.includes(pattern);
    }
    return pattern.test(text);
  }

  private generateCallId(): string {
    const timestamp = performance.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `call_${timestamp}_${random}`;
  }

  private findCallInStack(callId: string): number {
    // 从栈顶开始查找（LIFO）
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i]!.id === callId) {
        return i;
      }
    }
    return -1;
  }

  private serializeArgs(args: unknown[] | IArguments): unknown[] {
    const argsArray = Array.isArray(args) ? args : Array.from(args);
    return argsArray.map(arg => this.options.serializer(arg));
  }

  private defaultSerializer = (value: unknown): unknown => {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }

    if (typeof value === 'object') {
      try {
        // 防止循环引用
        return JSON.parse(JSON.stringify(value, (_key, val) => {
          if (typeof val === 'function') {
            return `[Function: ${val.name || 'anonymous'}]`;
          }
          return val;
        }));
      } catch {
        return '[Object: non-serializable]';
      }
    }

    return value;
  };

  private updateFileStats(record: CallRecord): void {
    const { filePath } = record;
    let stats = this.fileStats.get(filePath);

    if (!stats) {
      stats = {
        filePath,
        callCount: 0,
        totalDuration: 0,
        functions: new Set()
      };
      this.fileStats.set(filePath, stats);
    }

    stats.callCount++;
    stats.totalDuration += record.duration || 0;
    stats.functions.add(record.name);
  }

  private buildTreeNode(record: CallRecord, allRecords: CallRecord[]): CallTreeNode {
    const children = allRecords
      .filter(r => r.parentId === record.id)
      .map(r => this.buildTreeNode(r, allRecords));

    return { record, children };
  }

  private printTreeNode(node: CallTreeNode, depth: number): void {
    const indent = '  '.repeat(depth);
    const { record } = node;
    const duration = record.duration?.toFixed(2) || '?';
    const errorIndicator = record.error ? ' ❌' : '';
    const filePath = record.filePath.split('/').pop() || record.filePath;
    
    console.log(`${indent}├─ ${record.name} (${duration}ms) [${filePath}]${errorIndicator}`);
    
    node.children.forEach(child => this.printTreeNode(child, depth + 1));
  }
}

/**
 * 全局追踪器实例
 */
export const globalTracer = new FunctionTracer();

/**
 * 追踪器工厂函数
 */
export function createTracer(options?: TracerOptions): FunctionTracer {
  return new FunctionTracer(options);
}