// 内联的函数追踪器实现 - TypeScript版本

// 类型定义
interface CallRecord {
  id: string;
  name: string;
  fullPath: string;
  filePath: string;
  args: any[];
  status: "active" | "completed" | "error";
  depth: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  parentId: string | null;
  childrenIds: string[];
  returnValue?: any;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
  metadata?: any;
}

interface FileStats {
  filePath: string;
  callCount: number;
  totalDuration: number;
  functions: Set<string>;
}

interface TracerStats {
  totalCalls: number;
  totalDuration: number;
  averageDuration: number;
  errorCount: number;
  fileStats: Map<string, FileStats>;
}

interface ChartData {
  name: string;
  value: number | string;
  duration?: number;
  filePath?: string;
}

interface TreeNode {
  name: string;
  value: number;
  duration: number;
  filePath: string;
  children?: TreeNode[];
  symbolSize?: number;
  itemStyle?: {
    color: string;
  };
  // 额外的调用信息
  callId?: string;
  startTime?: number;
  endTime?: number;
  depth?: number;
  args?: any[];
  returnValue?: any;
  status?: string;
}

interface DepthData {
  depth: number;
  count: number;
}

interface TimelineData {
  name: string;
  value: [number, number, number];
  filePath: string;
}

interface EChartsReportData {
  summary: {
    totalCalls: number;
    totalDuration: number;
    averageDuration: number;
    errorCount: number;
    fileCount: number;
  };
  charts: {
    fileCallDistribution: {
      title: string;
      type: string;
      data: ChartData[];
    };
    fileDurationDistribution: {
      title: string;
      type: string;
      data: ChartData[];
    };
    topFunctions: {
      title: string;
      type: string;
      data: ChartData[];
    };
    timeline: {
      title: string;
      type: string;
      data: TimelineData[];
    };
    depthDistribution: {
      title: string;
      type: string;
      data: DepthData[];
    };
    callTree: {
      title: string;
      type: string;
      data: TreeNode[];
    };
  };
}

class InlineTracer {
  private callStack: CallRecord[] = [];
  private callHistory: CallRecord[] = [];
  private fileStats: Map<string, FileStats> = new Map();
  private currentDepth: number = 0;
  private enabled: boolean = true;

  constructor() {
    this.callStack = [];
    this.callHistory = [];
    this.fileStats = new Map();
    this.currentDepth = 0;
    this.enabled = true;
  }

  // 通用智能父节点查找算法 - 基于调用特征而非硬编码名称
  private findParentCall(functionName: string, filePath: string, currentTime: number): { parentId: string | null, depth: number } {
    if (this.callStack.length === 0) {
      return { parentId: null, depth: 0 };
    }

    // 1. 直接父子关系检测（时空邻近性）
    const directParent = this.findDirectParent(functionName, filePath, currentTime);
    if (directParent) {
      return { parentId: directParent.id, depth: directParent.depth + 1 };
    }

    // 2. 递归模式检测和跳过
    const nonRecursiveParent = this.findNonRecursiveParent(functionName, filePath);
    if (nonRecursiveParent) {
      return { parentId: nonRecursiveParent.id, depth: nonRecursiveParent.depth + 1 };
    }

    // 3. 异步调用边界检测
    const asyncParent = this.findAsyncBoundaryParent(currentTime);
    if (asyncParent) {
      return { parentId: asyncParent.id, depth: asyncParent.depth + 1 };
    }

    // 4. 跨模块调用检测
    const crossModuleParent = this.findCrossModuleParent(filePath);
    if (crossModuleParent) {
      return { parentId: crossModuleParent.id, depth: crossModuleParent.depth + 1 };
    }

    // 5. 回退策略 - 使用最近的非递归调用
    const fallbackParent = this.findFallbackParent(functionName);
    if (fallbackParent) {
      return { parentId: fallbackParent.id, depth: fallbackParent.depth + 1 };
    }

    // 6. 最终回退 - 使用栈顶
    const topCall = this.callStack[this.callStack.length - 1];
    return { parentId: topCall?.id || null, depth: (topCall?.depth || 0) + 1 };
  }

  // 检测直接父子关系（时间和空间邻近性）
  private findDirectParent(functionName: string, filePath: string, currentTime: number): CallRecord | null {
    console.log(functionName);
    
    const topCall = this.callStack[this.callStack.length - 1];
    if (!topCall || topCall.status !== "active") return null;

    const timeDiff = currentTime - topCall.startTime;
    const isSameFile = topCall.filePath === filePath;
    const isShortInterval = timeDiff < 50; // 50ms内认为是直接调用

    // 同文件且时间间隔很短 = 直接父子关系
    if (isSameFile && isShortInterval) {
      return topCall;
    }

    return null;
  }

  // 查找非递归父调用（基于调用模式识别递归）
  private findNonRecursiveParent(functionName: string, filePath: string): CallRecord | null {
    // 检测是否可能是递归调用（函数名相同且文件相同）
    const isLikelyRecursive = this.isLikelyRecursiveCall(functionName, filePath);
    
    if (!isLikelyRecursive) {
      // 对于非递归调用，跳过相同函数名的调用找到真正的调用者
      return this.findNonSameFunctionParent(functionName);
    }

    return null;
  }

  // 检测是否可能是递归调用
  private isLikelyRecursiveCall(functionName: string, filePath: string): boolean {
    // 检查调用栈中是否有相同函数名且文件相同的调用
    let sameNameCount = 0;
    for (const call of this.callStack) {
      if (call.name === functionName && call.filePath === filePath && call.status === "active") {
        sameNameCount++;
        if (sameNameCount >= 3) { // 3层以上相同调用认为是递归
          return true;
        }
      }
    }
    return false;
  }

  // 查找非同名函数的父调用
  private findNonSameFunctionParent(functionName: string): CallRecord | null {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const call = this.callStack[i];
      if (call && call.status === "active" && call.name !== functionName) {
        return call;
      }
    }
    return null;
  }

  // 异步调用边界检测（基于时间间隔）
  private findAsyncBoundaryParent(currentTime: number): CallRecord | null {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const call = this.callStack[i];
      if (call && call.status === "active") {
        const timeDiff = currentTime - call.startTime;
        
        // 时间间隔很长，可能跨越了异步边界
        if (timeDiff > 100) {
          // 检查是否是异步函数（包含 Async 或 async 关键字）
          if (this.isAsyncFunction(call.name)) {
            return call;
          }
        }
      }
    }
    return null;
  }

  // 检测是否是异步函数
  private isAsyncFunction(functionName: string): boolean {
    const asyncPatterns = ['Async', 'async', 'Promise', 'await'];
    return asyncPatterns.some(pattern => functionName.includes(pattern));
  }

  // 跨模块调用检测（基于文件路径差异）
  private findCrossModuleParent(filePath: string): CallRecord | null {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const call = this.callStack[i];
      if (call && call.status === "active") {
        // 如果文件不同，可能是跨模块调用
        if (call.filePath !== filePath) {
          // 进一步检查是否是合理的跨模块调用
          if (this.isReasonableCrossModuleCall(call.filePath, filePath)) {
            return call;
          }
        }
      }
    }
    return null;
  }

  // 检测是否是合理的跨模块调用
  private isReasonableCrossModuleCall(parentFile: string, childFile: string): boolean {
    // 基于文件层次结构判断
    const parentParts = parentFile.split('/');
    const childParts = childFile.split('/');
    
    // 同一目录下的文件更可能有调用关系
    const sameDir = parentParts.slice(0, -1).join('/') === childParts.slice(0, -1).join('/');
    
    // 或者是从上层目录调用下层目录
    const parentIsHigher = parentParts.length < childParts.length;
    
    return sameDir || parentIsHigher;
  }

  // 回退策略：找到最近的不同类型调用
  private findFallbackParent(functionName: string): CallRecord | null {
    // 优先选择不同函数名的调用
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const call = this.callStack[i];
      if (call && call.status === "active" && call.name !== functionName) {
        return call;
      }
    }
    
    // 如果都是同名函数，选择最老的那个（可能是最初的调用者）
    for (let i = 0; i < this.callStack.length; i++) {
      const call = this.callStack[i];
      if (call && call.status === "active") {
        return call;
      }
    }
    
    return null;
  }

  enter(
    functionName: string,
    filePath: string,
    args: any[],
    metadata?: any
  ): string {
    if (!this.enabled) return "";

    const callId = `call_${performance.now().toString(36)}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;
    
    const currentTime = performance.now();
    
    // 使用通用智能父节点查找算法
    const { parentId, depth } = this.findParentCall(functionName, filePath, currentTime);

    const record: CallRecord = {
      id: callId,
      name: functionName,
      fullPath: `${filePath}:${functionName}`,
      filePath,
      args: Array.isArray(args) ? args : Array.from(args),
      status: "active",
      depth: depth,
      startTime: currentTime,
      parentId,
      childrenIds: [],
      metadata,
    };

    // 更新父调用的子调用列表
    if (parentId) {
      const parent = this.callStack.find((call) => call.id === parentId);
      if (parent && parent.childrenIds) {
        parent.childrenIds.push(callId);
      }
    }

    this.callStack.push(record);
    this.currentDepth = Math.max(this.currentDepth, depth);
    return callId;
  }

  exit(callId: string, returnValue?: any): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    
    // 优先查找调用栈顶部，因为正常情况下应该是LIFO顺序
    let callIndex = -1;
    
    // 先检查栈顶是否是要退出的调用（最常见情况）
    if (this.callStack.length > 0 && this.callStack[this.callStack.length - 1]?.id === callId) {
      callIndex = this.callStack.length - 1;
    } else {
      // 如果不是栈顶，则在整个调用栈中查找
      callIndex = this.callStack.findIndex((call) => call.id === callId);
    }
    
    if (callIndex !== -1) {
      // 在调用栈中找到了调用记录
      const record = this.callStack[callIndex];
      if (!record) return;

      record.endTime = endTime;
      record.duration = endTime - record.startTime;
      record.status = "completed";
      record.returnValue = returnValue;

      // 从调用栈移除并添加到历史记录
      this.callStack.splice(callIndex, 1);
      this.callHistory.push(record);
      this.updateFileStats(record);
      
      // 调整当前深度
      if (this.callStack.length === 0) {
        this.currentDepth = 0;
      } else {
        this.currentDepth = Math.max(...this.callStack.map(c => c.depth), 0);
      }
      
      return;
    }
    
    // 如果在调用栈中找不到，查找历史记录（处理异步调用完成的情况）
    const historyRecord = this.callHistory.find((call) => call.id === callId);
    if (historyRecord && historyRecord.status === "active") {
      historyRecord.endTime = endTime;
      historyRecord.duration = endTime - historyRecord.startTime;
      historyRecord.status = "completed";
      historyRecord.returnValue = returnValue;
      this.updateFileStats(historyRecord);
      return;
    }
    
    // 如果都找不到，可能是深层递归调用顺序问题，创建一个补充记录
    console.warn(`[InlineTracer] 调用记录未找到，创建补充记录: ${callId}`);
    
    // 尝试从callId推断一些信息（如果可能的话）
    const supplementRecord: CallRecord = {
      id: callId,
      name: "unknown",
      fullPath: "unknown",
      filePath: "unknown",
      args: [],
      status: "completed",
      depth: this.currentDepth,
      startTime: endTime - 1, // 假设执行了1ms
      endTime: endTime,
      duration: 1,
      parentId: this.callStack.length > 0 ? this.callStack[this.callStack.length - 1]?.id || null : null,
      childrenIds: [],
      returnValue: returnValue,
    };
    
    this.callHistory.push(supplementRecord);
    this.updateFileStats(supplementRecord);
  }

  error(callId: string, error: Error): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    
    // 在调用栈中查找
    const callIndex = this.callStack.findIndex((call) => call.id === callId);
    if (callIndex !== -1) {
      const record = this.callStack[callIndex];
      if (!record) return;

      record.endTime = endTime;
      record.duration = endTime - record.startTime;
      record.status = "error";
      record.error = {
        name: error.name,
        message: error.message,
        stack: error.stack || "",
      };

      this.callStack.splice(callIndex, 1);
      this.callHistory.push(record);
      this.updateFileStats(record);
      
      // 调整当前深度
      if (this.callStack.length === 0) {
        this.currentDepth = 0;
      } else {
        this.currentDepth = Math.max(...this.callStack.map(c => c.depth), 0);
      }
      return;
    }
    
    // 在历史记录中查找
    const historyRecord = this.callHistory.find((call) => call.id === callId);
    if (historyRecord && historyRecord.status === "active") {
      historyRecord.endTime = endTime;
      historyRecord.duration = endTime - historyRecord.startTime;
      historyRecord.status = "error";
      historyRecord.error = {
        name: error.name,
        message: error.message,
        stack: error.stack || "",
      };
      this.updateFileStats(historyRecord);
    }
  }

  getHistory(): CallRecord[] {
    return [...this.callHistory].sort((a, b) => a.startTime - b.startTime);
  }

  getStats(): TracerStats {
    const totalCalls = this.callHistory.length;
    const totalDuration = this.callHistory.reduce(
      (sum, record) => sum + (record.duration || 0),
      0
    );
    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const errorCount = this.callHistory.filter((record) => record.error).length;

    return {
      totalCalls,
      totalDuration,
      averageDuration,
      errorCount,
      fileStats: new Map(this.fileStats),
    };
  }

  printCallTree(): void {
    console.log(`\n🔍 函数调用链路追踪 (${this.callHistory.length} 个调用):\n`);

    if (this.callHistory.length === 0) {
      console.log("暂无调用记录");
      return;
    }

    for (const record of this.callHistory) {
      const duration = record.duration ? record.duration.toFixed(2) : "?";
      const errorIndicator = record.error ? " ❌" : "";
      const filePath = record.filePath.split("/").pop() || record.filePath;
      console.log(
        `├─ ${record.name} (${duration}ms) [${filePath}]${errorIndicator}`
      );
    }
  }

  printStats(): void {
    const stats = this.getStats();
    console.log("\n📊 追踪统计报告:");
    console.log(`总调用次数: ${stats.totalCalls}`);
    console.log(`总执行时间: ${stats.totalDuration.toFixed(2)}ms`);
    console.log(`平均执行时间: ${stats.averageDuration.toFixed(2)}ms`);
    console.log(`错误次数: ${stats.errorCount}`);

    console.log("\n📁 文件统计:");
    for (const [filePath, fileStats] of stats.fileStats) {
      console.log(
        `  ${filePath}: ${
          fileStats.callCount
        } 个调用, ${fileStats.totalDuration.toFixed(2)}ms`
      );
    }
  }

  // 构建真正准确的调用树结构
  buildCallTree(): TreeNode[] {
    // 收集所有调用记录（已完成的和正在进行的）
    const allRecords = [...this.callHistory];
    
    // 添加仍在调用栈中的记录（未完成的调用）
    for (const stackRecord of this.callStack) {
      if (!allRecords.find((r) => r.id === stackRecord.id)) {
        allRecords.push({
          ...stackRecord,
          endTime: stackRecord.endTime || performance.now(),
          duration: stackRecord.duration || performance.now() - stackRecord.startTime,
          status: stackRecord.status || "active",
        });
      }
    }

    console.log(`📊 构建调用树: 总计 ${allRecords.length} 个调用记录`);

    if (allRecords.length === 0) {
      return [];
    }

    // 创建简化的节点映射，避免循环引用
    const nodeMap = new Map<string, TreeNode>();
    
    // 创建所有节点，但暂时不设置children关系
    for (const record of allRecords) {
      const fileName = record.filePath.split("/").pop() || record.filePath;
      // 简化args和returnValue，避免复杂对象引起的循环引用
      const safeArgs = this.simplifyValue(record.args);
      const safeReturnValue = this.simplifyValue(record.returnValue);
      
      const node: TreeNode = {
        name: `${record.name}()`,
        value: record.duration || 0,
        duration: record.duration || 0,
        filePath: fileName,
        children: [], // 先设为空数组
        symbolSize: Math.max(8, Math.min(40, (record.duration || 0) / 5 + 10)),
        itemStyle: {
          color: record.error
            ? "#ff4d4f"
            : record.status === "completed"
            ? "#52c41a"
            : "#1890ff",
        },
        callId: record.id,
        startTime: record.startTime,
        endTime: record.endTime || record.startTime,
        depth: record.depth,
        args: safeArgs,
        returnValue: safeReturnValue,
        status: record.status,
      };
      nodeMap.set(record.id, node);
    }

    // 建立父子关系 - 移除深度限制，允许显示所有调用
    const rootNodes: TreeNode[] = [];
    const childIds = new Set<string>();

    for (const record of allRecords) {
      const node = nodeMap.get(record.id);
      if (!node) continue;

      if (record.parentId) {
        // 有父调用，添加到父节点
        const parentNode = nodeMap.get(record.parentId);
        if (parentNode && parentNode.children) {
          parentNode.children.push(node);
          childIds.add(record.id);
        } else {
          // 父调用不存在，可能是跨异步边界，作为根节点
          console.log(`🔗 未找到父调用 ${record.parentId}，${record.name} 作为根节点`);
          rootNodes.push(node);
        }
      } else {
        // 没有父调用，是根节点
        rootNodes.push(node);
      }
    }

    // 对所有子节点按开始时间排序
    function sortChildrenByTime(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          node.children.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
          sortChildrenByTime(node.children);
        }
      }
    }

    // 对根节点按开始时间排序
    rootNodes.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    sortChildrenByTime(rootNodes);

    console.log(`🌳 构建完成: ${rootNodes.length} 个根节点, ${childIds.size} 个子节点`);

    // 如果没有根节点，可能所有调用都有问题的父子关系，回退到按深度分组
    if (rootNodes.length === 0 && allRecords.length > 0) {
      console.log(`🔧 回退到深度分组模式`);
      return this.buildTreeByDepth(allRecords);
    }

    // 如果只有一个根节点，直接返回
    if (rootNodes.length === 1) {
      return rootNodes;
    }

    // 如果有多个根节点，创建虚拟根包装它们
    if (rootNodes.length > 1) {
      const totalDuration = rootNodes.reduce((sum, n) => sum + (n.duration || 0), 0);
      const virtualRoot: TreeNode = {
        name: `🌳 函数调用总览 (${rootNodes.length}个入口)`,
        value: totalDuration,
        duration: totalDuration,
        filePath: "总览",
        children: rootNodes,
        symbolSize: 30,
        itemStyle: { color: "#1890ff" },
        callId: "virtual_root",
        startTime: Math.min(...rootNodes.map((n) => n.startTime || 0)),
        endTime: Math.max(...rootNodes.map((n) => n.endTime || 0)),
        depth: -1,
        status: "completed",
      };
      return [virtualRoot];
    }

    return rootNodes;
  }

  // 简化复杂值，避免循环引用
  private simplifyValue(value: any, depth = 0): any {
    if (depth > 3) return "[Max Depth]";
    
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === "function") {
      return "[Function]";
    }
    
    if (typeof value === "symbol") {
      return "[Symbol]";
    }
    
    if (typeof value !== "object") {
      return value;
    }
    
    if (Array.isArray(value)) {
      if (value.length > 10) {
        return `[Array(${value.length})]`;
      }
      return value.slice(0, 10).map(item => this.simplifyValue(item, depth + 1));
    }
    
    // 对于对象，只保留基本属性
    const result: any = {};
    let count = 0;
    for (const [key, val] of Object.entries(value)) {
      if (count >= 5) {
        result["..."] = `[${Object.keys(value).length - 5} more properties]`;
        break;
      }
      
      if (typeof val === "function" || key.startsWith("_")) {
        continue;
      }
      
      result[key] = this.simplifyValue(val, depth + 1);
      count++;
    }
    
    return result;
  }

  // 按调用深度构建树结构（回退方案）
  private buildTreeByDepth(records: CallRecord[]): TreeNode[] {
    // 按深度分组
    const depthGroups = new Map<number, CallRecord[]>();
    for (const record of records) {
      const depth = record.depth || 0;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      depthGroups.get(depth)!.push(record);
    }

    // 从最小深度开始构建
    const minDepth = Math.min(...Array.from(depthGroups.keys()));
    const rootRecords = depthGroups.get(minDepth) || [];

    const rootNodes: TreeNode[] = [];
    
    for (const rootRecord of rootRecords) {
      const fileName = rootRecord.filePath.split("/").pop() || rootRecord.filePath;
      const rootNode: TreeNode = {
        name: `${rootRecord.name}()`,
        value: rootRecord.duration || 0,
        duration: rootRecord.duration || 0,
        filePath: fileName,
        children: [],
        symbolSize: Math.max(10, Math.min(40, (rootRecord.duration || 0) / 5 + 12)),
        itemStyle: {
          color: rootRecord.error ? "#ff4d4f" : rootRecord.status === "completed" ? "#52c41a" : "#1890ff",
        },
        callId: rootRecord.id,
        startTime: rootRecord.startTime,
        endTime: rootRecord.endTime || rootRecord.startTime,
        depth: rootRecord.depth,
        args: this.simplifyValue(rootRecord.args),
        returnValue: this.simplifyValue(rootRecord.returnValue),
        status: rootRecord.status,
      };

      // 递归构建子节点（基于时间顺序和深度）
      this.buildChildrenByDepthAndTime(rootNode, records, rootRecord.depth + 1, rootRecord.startTime, rootRecord.endTime || performance.now());
      
      rootNodes.push(rootNode);
    }

    return rootNodes;
  }

  // 根据深度和时间范围构建子节点
  private buildChildrenByDepthAndTime(parentNode: TreeNode, allRecords: CallRecord[], targetDepth: number, startTime: number, endTime: number) {
    const childRecords = allRecords.filter(record => 
      record.depth === targetDepth && 
      record.startTime >= startTime && 
      record.startTime <= endTime
    );

    for (const childRecord of childRecords) {
      const fileName = childRecord.filePath.split("/").pop() || childRecord.filePath;
      const childNode: TreeNode = {
        name: `${childRecord.name}()`,
        value: childRecord.duration || 0,
        duration: childRecord.duration || 0,
        filePath: fileName,
        children: [],
        symbolSize: Math.max(8, Math.min(30, (childRecord.duration || 0) / 3 + 8)),
        itemStyle: {
          color: childRecord.error ? "#ff4d4f" : childRecord.status === "completed" ? "#52c41a" : "#1890ff",
        },
        callId: childRecord.id,
        startTime: childRecord.startTime,
        endTime: childRecord.endTime || childRecord.startTime,
        depth: childRecord.depth,
        args: this.simplifyValue(childRecord.args),
        returnValue: this.simplifyValue(childRecord.returnValue),
        status: childRecord.status,
      };

      // 递归构建更深层的子节点
      this.buildChildrenByDepthAndTime(childNode, allRecords, targetDepth + 1, childRecord.startTime, childRecord.endTime || performance.now());
      
      parentNode.children!.push(childNode);
    }

    // 按开始时间排序子节点
    parentNode.children!.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  }

  // 生成ECharts可视化报告
  generateEChartsReport(): EChartsReportData {
    const stats = this.getStats();
    const history = this.getHistory();

    // 按文件统计数据
    const fileData: ChartData[] = [];
    const fileDurationData: ChartData[] = [];
    for (const [filePath, fileStats] of stats.fileStats) {
      const fileName = filePath.split("/").pop() || filePath;
      fileData.push({
        name: fileName,
        value: fileStats.callCount,
        duration: fileStats.totalDuration,
      });
      fileDurationData.push({
        name: fileName,
        value: fileStats.totalDuration.toFixed(2),
      });
    }

    // 按函数统计执行时间Top10
    const functionDurations: ChartData[] = history
      .filter((record) => record.duration)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map((record) => ({
        name: `${record.name} [${record.filePath.split("/").pop()}]`,
        value: (record.duration || 0).toFixed(2),
      }));

    // 时间线数据
    const timelineData: TimelineData[] = history.map((record) => ({
      name: record.name,
      value: [
        record.startTime,
        record.endTime || record.startTime,
        record.duration || 0,
      ],
      filePath: record.filePath.split("/").pop() || record.filePath,
    }));

    // 调用深度统计
    const depthStats: Record<number, number> = {};
    history.forEach((record) => {
      depthStats[record.depth] = (depthStats[record.depth] || 0) + 1;
    });

    const depthData: DepthData[] = Object.entries(depthStats)
      .map(([depth, count]) => ({ depth: parseInt(depth), count }))
      .sort((a, b) => a.depth - b.depth);

    // 构建调用树
    const callTree = this.buildCallTree();

    return {
      summary: {
        totalCalls: stats.totalCalls,
        totalDuration: stats.totalDuration,
        averageDuration: stats.averageDuration,
        errorCount: stats.errorCount,
        fileCount: stats.fileStats.size,
      },
      charts: {
        fileCallDistribution: {
          title: "文件调用分布",
          type: "pie",
          data: fileData,
        },
        fileDurationDistribution: {
          title: "文件执行时间分布",
          type: "pie",
          data: fileDurationData,
        },
        topFunctions: {
          title: "函数执行时间Top10",
          type: "bar",
          data: functionDurations,
        },
        timeline: {
          title: "函数调用时间线",
          type: "gantt",
          data: timelineData,
        },
        depthDistribution: {
          title: "调用深度分布",
          type: "line",
          data: depthData,
        },
        callTree: {
          title: "函数调用树",
          type: "tree",
          data: callTree,
        },
      },
    };
  }

  // 安全的JSON序列化，避免循环引用
  private safeStringify(obj: any): string {
    const seen = new WeakSet();
    
    const stringify = (value: any, depth = 0): any => {
      // 增加深度限制以支持更深的树结构
      if (depth > 100) {
        return "[Max Depth Exceeded]";
      }
      
      if (value === null || value === undefined) {
        return value;
      }
      
      if (typeof value === "function") {
        return "[Function]";
      }
      
      if (typeof value === "symbol") {
        return "[Symbol]";
      }
      
      if (typeof value !== "object") {
        return value;
      }
      
      // 检查循环引用
      if (seen.has(value)) {
        return "[Circular Reference]";
      }
      
      // 检查DOM元素等
      if (value.nodeType) {
        return "[DOM Element]";
      }
      
      // 检查特殊对象类型
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      if (value instanceof Error) {
        return `[Error: ${value.message}]`;
      }
      
      // 跳过可能有问题的内置对象
      if (value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet) {
        return `[${value.constructor.name}]`;
      }
      
      seen.add(value);
      
      try {
        if (Array.isArray(value)) {
          const result = value.slice(0, 50).map((item) => {
            return stringify(item, depth + 1);
          });
          seen.delete(value);
          if (value.length > 50) {
            result.push(`[... ${value.length - 50} more items]`);
          }
          return result;
        }
        
        const result: any = {};
        let count = 0;
        for (const [key, val] of Object.entries(value)) {
          if (count >= 20) { // 增加对象属性数量限制
            result["..."] = `[${Object.keys(value).length - 20} more properties]`;
            break;
          }
          
          // 跳过特定的可能有问题的属性
          if (typeof val === "function" || 
              key.startsWith("_") || 
              key === "constructor" ||
              key === "prototype" ||
              key === "callStack" ||
              key === "callHistory" ||
              key === "__proto__") {
            continue;
          }
          
          result[key] = stringify(val, depth + 1);
          count++;
        }
        
        seen.delete(value);
        return result;
      } catch (error) {
        seen.delete(value);
        return "[Serialization Error]";
      }
    };
    
    try {
      return JSON.stringify(stringify(obj), null, 2);
    } catch (error) {
      return JSON.stringify({
        error: "Failed to serialize object",
        message: error instanceof Error ? error.message : String(error),
        type: "SafeStringifyFallback"
      }, null, 2);
    }
  }

  // 生成HTML报告
  generateHTMLReport(): string {
    const reportData = this.generateEChartsReport();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>函数调用链路追踪报告</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; background: #fafafa; }
    .header { text-align: center; margin-bottom: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .summary-value { font-size: 2em; font-weight: bold; color: #1890ff; }
    .summary-label { color: #666; margin-top: 8px; }
    .chart-container { width: 100%; height: 400px; margin-bottom: 30px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .chart-full { width: 100%; height: 500px; margin-bottom: 30px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .tree-chart { width: 100%; height: 600px; margin-bottom: 30px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 函数调用链路追踪报告</h1>
    <p>生成时间: ${new Date().toLocaleString()}</p>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.totalCalls}</div>
      <div class="summary-label">总调用次数</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.totalDuration.toFixed(
        2
      )}ms</div>
      <div class="summary-label">总执行时间</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.averageDuration.toFixed(
        2
      )}ms</div>
      <div class="summary-label">平均执行时间</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.errorCount}</div>
      <div class="summary-label">错误次数</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.fileCount}</div>
      <div class="summary-label">涉及文件数</div>
    </div>
  </div>

  <div class="chart-row">
    <div id="fileCallChart" class="chart-container"></div>
    <div id="fileDurationChart" class="chart-container"></div>
  </div>

  <div id="topFunctionsChart" class="chart-full"></div>

  <div id="depthChart" class="chart-full"></div>

  <div id="callTreeChart" class="tree-chart"></div>

  <script>
    const reportData = ${this.safeStringify(reportData)};

    // 文件调用分布饼图
    const fileCallChart = echarts.init(document.getElementById('fileCallChart'));
    fileCallChart.setOption({
      title: { text: '文件调用分布', left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: '60%',
        data: reportData.charts.fileCallDistribution.data,
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
    });

    // 文件执行时间分布饼图
    const fileDurationChart = echarts.init(document.getElementById('fileDurationChart'));
    fileDurationChart.setOption({
      title: { text: '文件执行时间分布', left: 'center' },
      tooltip: { trigger: 'item', formatter: '{b}: {c}ms ({d%})' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: '60%',
        data: reportData.charts.fileDurationDistribution.data,
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
    });

    // Top函数执行时间柱状图
    const topFunctionsChart = echarts.init(document.getElementById('topFunctionsChart'));
    topFunctionsChart.setOption({
      title: { text: '函数执行时间Top10', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: reportData.charts.topFunctions.data.map(item => item.name), axisLabel: { rotate: 45 } },
      yAxis: { type: 'value', name: '执行时间(ms)' },
      series: [{
        type: 'bar',
        data: reportData.charts.topFunctions.data.map(item => parseFloat(item.value)),
        itemStyle: { color: '#1890ff' }
      }]
    });

    // 调用深度分布图
    const depthChart = echarts.init(document.getElementById('depthChart'));
    depthChart.setOption({
      title: { text: '调用深度分布', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: reportData.charts.depthDistribution.data.map(item => \`深度 \${item.depth}\`) },
      yAxis: { type: 'value', name: '调用次数' },
      series: [{
        type: 'line',
        data: reportData.charts.depthDistribution.data.map(item => item.count),
        smooth: true,
        itemStyle: { color: '#52c41a' },
        areaStyle: { opacity: 0.3 }
      }]
    });

    // 函数调用树图
    const callTreeChart = echarts.init(document.getElementById('callTreeChart'));
    // 在渲染前，尝试自动展开包含关键函数的路径，便于定位
    const callTreeData = reportData.charts.callTree.data;
    (function autoExpandImportantPaths() {
      function expandPathByKeywords(nodes, keywords) {
        function dfs(node) {
          const name = (node && node.name) ? String(node.name) : '';
          const isMatch = keywords.some(k => name.includes(k));
          let hasMatchedDescendant = false;
          if (Array.isArray(node.children) && node.children.length > 0) {
            for (const child of node.children) {
              if (dfs(child)) {
                hasMatchedDescendant = true;
              }
            }
          }
          // 如果子孙中匹配，则展开当前节点
          if (hasMatchedDescendant) {
            node.collapsed = false;
          }
          return isMatch || hasMatchedDescendant;
        }
        if (Array.isArray(nodes)) {
          for (const root of nodes) dfs(root);
        }
      }
      expandPathByKeywords(callTreeData, ['processUserAsync', 'calculateFibonacciScore']);
    })();
    callTreeChart.setOption({
      title: {
        text: '函数调用树 - 点击节点展开/折叠',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        formatter: function(params) {
          const data = params.data;
          let tooltip = \`<div style="max-width: 300px;">
            <strong style="color: #1890ff; font-size: 14px;">\${data.name}</strong><br/>
            <span style="color: #666;">📁 文件:</span> \${data.filePath}<br/>
            <span style="color: #666;">⏱️ 执行时间:</span> \${data.duration.toFixed(2)}ms<br/>
            <span style="color: #666;">📊 状态:</span> <span style="color: \${data.status === 'completed' ? '#52c41a' : data.status === 'error' ? '#ff4d4f' : '#1890ff'}">\${data.status === 'completed' ? '✅ 完成' : data.status === 'error' ? '❌ 错误' : '🔄 执行中'}</span><br/>
            <span style="color: #666;">🏗️ 调用深度:</span> \${data.depth}<br/>\`;

          if (data.args && data.args.length > 0) {
            tooltip += \`<span style="color: #666;">📥 参数:</span> \${JSON.stringify(data.args).substring(0, 50)}\${data.args.length > 50 ? '...' : ''}<br/>\`;
          }

          if (data.returnValue !== undefined) {
            tooltip += \`<span style="color: #666;">📤 返回值:</span> \${JSON.stringify(data.returnValue).substring(0, 50)}<br/>\`;
          }

          if (data.children && data.children.length > 0) {
            tooltip += \`<span style="color: #666;">👥 子调用:</span> \${data.children.length} 个\`;
          }

          tooltip += '</div>';
          return tooltip;
        }
      },
      series: [{
        type: 'tree',
        data: callTreeData,
        top: '8%',
        left: '5%',
        bottom: '5%',
        right: '5%',
        layout: 'orthogonal',  // 使用正交布局
        orient: 'LR',          // 从左到右展开
        symbolSize: function(val, params) {
          return params.data.symbolSize || 12;
        },
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          fontSize: 10,
          fontWeight: 'normal',
          color: '#333',
          formatter: function(params) {
            // 限制标签长度避免重叠
            const name = params.data.name;
            return name.length > 30 ? name.substring(0, 30) + '...' : name;
          }
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
            fontSize: 10,
            fontWeight: 'normal',
            color: '#333'
          }
        },
        emphasis: {
          focus: 'descendant',
          itemStyle: {
            borderWidth: 2,
            borderColor: '#1890ff'
          },
          label: {
            fontWeight: 'bold',
            fontSize: 11
          }
        },
        expandAndCollapse: true,
        initialTreeDepth: 5,  // 提高初始展开层数，便于看到深层节点
        animationDuration: 400,
        animationDurationUpdate: 600,
        lineStyle: {
          curveness: 0.3,
          width: 1.5,
          color: '#999'
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1.5
        },
        roam: true  // 启用缩放和平移
      }]
    });

    // 响应式处理
    window.addEventListener('resize', () => {
      fileCallChart.resize();
      fileDurationChart.resize();
      topFunctionsChart.resize();
      depthChart.resize();
      callTreeChart.resize();
    });
  </script>
</body>
</html>`;

    return html;
  }

  private updateFileStats(record: CallRecord): void {
    const { filePath } = record;
    let stats = this.fileStats.get(filePath);

    if (!stats) {
      stats = {
        filePath,
        callCount: 0,
        totalDuration: 0,
        functions: new Set(),
      };
      this.fileStats.set(filePath, stats);
    }

    stats.callCount++;
    stats.totalDuration += record.duration || 0;
    stats.functions.add(record.name);
  }

  // 新增方法：启用/禁用追踪
  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  // 新增方法：清空追踪数据
  clear(): void {
    this.callStack = [];
    this.callHistory = [];
    this.fileStats.clear();
    this.currentDepth = 0;
  }

  // 新增方法：获取当前活跃的调用栈
  getActiveStack(): CallRecord[] {
    return [...this.callStack];
  }

  // 新增方法：导出数据为JSON
  exportData(): string {
    return this.safeStringify({
      history: this.getHistory(),
      stats: this.getStats(),
      activeStack: this.getActiveStack(),
    });
  }
}

// 创建全局追踪器实例
const globalTracer = new InlineTracer();

// 自动设置为全局追踪器
declare global {
  var __FUNCTION_TRACER__: InlineTracer;
  var __tracer: InlineTracer;
}

if (typeof globalThis !== "undefined") {
  globalThis.__FUNCTION_TRACER__ = globalTracer;
  globalThis.__tracer = globalTracer;
}

if (typeof window !== "undefined") {
  (window as any).__FUNCTION_TRACER__ = globalTracer;
  (window as any).__tracer = globalTracer;
}

if (typeof global !== "undefined") {
  (global as any).__FUNCTION_TRACER__ = globalTracer;
  (global as any).__tracer = globalTracer;
}

export { InlineTracer, globalTracer };
export type { CallRecord, FileStats, TracerStats, TreeNode, EChartsReportData };
export default globalTracer;
