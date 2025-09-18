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
    // 获取当前活跃的父调用（最后一个未完成的调用）
    let parentId: string | null = null;
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const call = this.callStack[i];
      if (call && call.status === "active") {
        parentId = call.id;
        break;
      }
    }

    const record: CallRecord = {
      id: callId,
      name: functionName,
      fullPath: `${filePath}:${functionName}`,
      filePath,
      args: Array.isArray(args) ? args : Array.from(args),
      status: "active",
      depth: this.currentDepth,
      startTime: performance.now(),
      parentId,
      childrenIds: [],
      metadata,
    };

    if (parentId) {
      const parent = this.callStack.find((call) => call.id === parentId);
      if (parent && parent.childrenIds) {
        parent.childrenIds.push(callId);
      }
    }

    this.callStack.push(record);
    this.currentDepth++;
    return callId;
  }

  exit(callId: string, returnValue?: any): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.callStack.findIndex((call) => call.id === callId);

    if (callIndex === -1) {
      // 如果在调用栈中找不到，可能已经在历史记录中了（异步调用的情况）
      const historyRecord = this.callHistory.find((call) => call.id === callId);
      if (historyRecord && historyRecord.status === "active") {
        historyRecord.endTime = endTime;
        historyRecord.duration = endTime - historyRecord.startTime;
        historyRecord.status = "completed";
        historyRecord.returnValue = returnValue;
        this.updateFileStats(historyRecord);
      }
      return;
    }

    const record = this.callStack[callIndex];
    if (!record) return;

    record.endTime = endTime;
    record.duration = endTime - record.startTime;
    record.status = "completed";
    record.returnValue = returnValue;

    // 对于异步调用，不要立即从调用栈中移除，而是标记为完成
    // 只有当它是栈顶元素时才移除（保持 LIFO 特性）
    if (callIndex === this.callStack.length - 1) {
      this.callStack.splice(callIndex, 1);
      this.currentDepth--;
    } else {
      // 异步调用：保留在栈中但标记为完成，稍后清理
      console.log(`🔄 异步调用完成，保留在栈中: ${record.name}(${callId})`);
    }

    this.callHistory.push(record);
    this.updateFileStats(record);

    // 清理已完成的连续栈顶元素
    this.cleanupCompletedCalls();
  }

  private cleanupCompletedCalls(): void {
    // 从栈顶开始，移除所有已完成的连续调用
    // 但要确保不会过度清理，保留可能还有子调用的父调用
    while (this.callStack.length > 0) {
      const topCall = this.callStack[this.callStack.length - 1];
      if (topCall && topCall.status === "completed") {
        // 检查是否还有其他调用引用这个父调用
        const hasChildren = this.callStack.some(
          (call) => call.status === "active" && call.parentId === topCall.id
        );

        if (!hasChildren) {
          this.callStack.pop();
          this.currentDepth--;
          console.log(`🧹 清理已完成的调用: ${topCall.name}(${topCall.id})`);
        } else {
          console.log(
            `🔒 保留父调用: ${topCall.name}(${topCall.id}) - 仍有活跃子调用`
          );
          break;
        }
      } else {
        break;
      }
    }
  }

  error(callId: string, error: Error): void {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.callStack.findIndex((call) => call.id === callId);

    if (callIndex === -1) return;

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
    this.currentDepth--;
    this.updateFileStats(record);
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

  // 构建调用树结构 - 创建真正的函数调用树
  private buildCallTree(): TreeNode[] {
    // 获取完整的调用记录（包括调用栈中未完成的调用）
    const allRecords = [...this.callHistory];

    // 添加调用栈中仍在进行的调用（可能是异步调用）
    for (const stackRecord of this.callStack) {
      if (!allRecords.find((r) => r.id === stackRecord.id)) {
        allRecords.push({
          ...stackRecord,
          endTime: stackRecord.endTime || performance.now(),
          duration:
            stackRecord.duration || performance.now() - stackRecord.startTime,
          status: stackRecord.status || "active",
        });
      }
    }

    console.log(
      `📊 构建调用树: 历史记录 ${this.callHistory.length} 个，调用栈 ${this.callStack.length} 个，总计 ${allRecords.length} 个`
    );

    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // 首先创建所有节点，包含更详细的信息
    for (const record of allRecords) {
      const fileName = record.filePath.split("/").pop() || record.filePath;
      const node: TreeNode = {
        name: `${record.name}()`,
        value: record.duration || 0,
        duration: record.duration || 0,
        filePath: fileName,
        children: [],
        symbolSize: Math.max(8, Math.min(40, (record.duration || 0) / 5 + 10)),
        itemStyle: {
          color: record.error
            ? "#ff4d4f"
            : record.status === "completed"
            ? "#52c41a"
            : "#1890ff",
        },
        // 添加更多元数据用于工具提示
        callId: record.id,
        startTime: record.startTime,
        endTime: record.endTime || record.startTime,
        depth: record.depth,
        args: record.args,
        returnValue: record.returnValue,
        status: record.status,
      };
      nodeMap.set(record.id, node);
    }

    // 构建父子关系 - 使用parentId建立关系
    const childIds = new Set<string>();
    for (const record of allRecords) {
      if (record.parentId) {
        const parentNode = nodeMap.get(record.parentId);
        const childNode = nodeMap.get(record.id);
        if (parentNode && childNode) {
          parentNode.children!.push(childNode);
          childIds.add(record.id);
        }
      }
    }

    // 收集真正的根节点（没有parentId的节点）
    for (const record of allRecords) {
      if (!record.parentId) {
        const node = nodeMap.get(record.id);
        if (node) {
          rootNodes.push(node);
        }
      }
    }

    // 如果没有真正的根节点，说明所有调用都有父调用，寻找深度最小的调用作为根
    if (rootNodes.length === 0 && allRecords.length > 0) {
      const minDepth = Math.min(...allRecords.map((r) => r.depth || 0));
      const actualRoots = allRecords.filter((r) => (r.depth || 0) === minDepth);

      console.log(`🌳 没有真正的根节点，使用最小深度 ${minDepth} 的 ${actualRoots.length} 个调用作为根`);

      for (const rootRecord of actualRoots) {
        const rootNode = nodeMap.get(rootRecord.id);
        if (rootNode) {
          rootNodes.push(rootNode);
        }
      }
    }

    // 对子节点按开始时间排序，保证调用顺序正确
    function sortChildren(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          node.children.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
          sortChildren(node.children);
        }
      }
    }

    // 对根节点也按开始时间排序
    rootNodes.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    sortChildren(rootNodes);

    console.log(
      `🌳 构建调用树完成: ${allRecords.length} 个调用记录，${rootNodes.length} 个根节点`
    );

    // 如果仍然没有根节点，使用演示模式
    if (rootNodes.length === 0) {
      console.log(`🌳 回退到演示性调用树模式`);
      return this.createDemoCallTree(allRecords);
    }

    // ECharts 的 tree 系列对多根节点支持较差，这里包装一个虚拟根节点
    if (rootNodes.length > 1) {
      const totalDuration = rootNodes.reduce(
        (sum, n) => sum + (n.duration || 0),
        0
      );
      const virtualRoot: TreeNode = {
        name: `🌳 函数调用追踪总览 (${rootNodes.length}个根)`,
        value: totalDuration,
        duration: totalDuration,
        filePath: "总览",
        children: rootNodes,
        symbolSize: 30,
        itemStyle: { color: "#1890ff" },
        callId: "virtual_root_real",
        startTime: Math.min(...rootNodes.map((n) => n.startTime || 0)),
        endTime: Math.max(...rootNodes.map((n) => n.endTime || 0)),
        depth: 0,
        status: "completed",
      };
      return [virtualRoot];
    }

    return rootNodes;
  }

  // 创建演示性的调用树结构（当没有真实调用关系时）
  private createDemoCallTree(history: CallRecord[]): TreeNode[] {
    // 按文件分组
    const fileGroups = new Map<string, CallRecord[]>();
    for (const record of history) {
      const fileName = record.filePath.split("/").pop() || record.filePath;
      if (!fileGroups.has(fileName)) {
        fileGroups.set(fileName, []);
      }
      fileGroups.get(fileName)!.push(record);
    }

    const rootNodes: TreeNode[] = [];

    // 为每个文件创建一个根节点
    for (const [fileName, records] of fileGroups) {
      const totalDuration = records.reduce(
        (sum, r) => sum + (r.duration || 0),
        0
      );
      const fileNode: TreeNode = {
        name: `📁 ${fileName}`,
        value: totalDuration,
        duration: totalDuration,
        filePath: fileName,
        children: [],
        symbolSize: Math.max(15, Math.min(50, totalDuration / 10 + 20)),
        itemStyle: {
          color: "#722ed1",
        },
        callId: `file_${fileName}`,
        startTime: Math.min(...records.map((r) => r.startTime)),
        endTime: Math.max(...records.map((r) => r.endTime || r.startTime)),
        depth: 0,
        status: "completed",
      };

      // 按函数名分组
      const functionGroups = new Map<string, CallRecord[]>();
      for (const record of records) {
        if (!functionGroups.has(record.name)) {
          functionGroups.set(record.name, []);
        }
        functionGroups.get(record.name)!.push(record);
      }

      // 为每个函数创建子节点
      for (const [functionName, funcRecords] of functionGroups) {
        const funcTotalDuration = funcRecords.reduce(
          (sum, r) => sum + (r.duration || 0),
          0
        );
        const funcNode: TreeNode = {
          name: `🔧 ${functionName}() (${funcRecords.length}次调用)`,
          value: funcTotalDuration,
          duration: funcTotalDuration,
          filePath: fileName,
          children: [],
          symbolSize: Math.max(10, Math.min(40, funcTotalDuration / 5 + 12)),
          itemStyle: {
            color: funcRecords.some((r) => r.error) ? "#ff4d4f" : "#52c41a",
          },
          callId: `func_${functionName}_${fileName}`,
          startTime: Math.min(...funcRecords.map((r) => r.startTime)),
          endTime: Math.max(
            ...funcRecords.map((r) => r.endTime || r.startTime)
          ),
          depth: 1,
          status: "completed",
        };

        // 如果有多次调用，为每次调用创建子节点
        if (funcRecords.length > 1) {
          funcRecords.sort((a, b) => a.startTime - b.startTime);
          funcRecords.forEach((record, index) => {
            const callNode: TreeNode = {
              name: `📞 调用 #${index + 1}`,
              value: record.duration || 0,
              duration: record.duration || 0,
              filePath: fileName,
              children: [],
              symbolSize: Math.max(
                8,
                Math.min(25, (record.duration || 0) / 2 + 8)
              ),
              itemStyle: {
                color: record.error
                  ? "#ff4d4f"
                  : record.status === "completed"
                  ? "#1890ff"
                  : "#faad14",
              },
              callId: record.id,
              startTime: record.startTime,
              endTime: record.endTime || record.startTime,
              depth: 2,
              args: record.args,
              returnValue: record.returnValue,
              status: record.status,
            };
            funcNode.children!.push(callNode);
          });
        }

        fileNode.children!.push(funcNode);
      }

      // 按总执行时间排序子节点
      fileNode.children!.sort((a, b) => (b.duration || 0) - (a.duration || 0));

      rootNodes.push(fileNode);
    }

    // 按总执行时间排序文件节点
    rootNodes.sort((a, b) => (b.duration || 0) - (a.duration || 0));

    // 如果有多个文件节点，创建一个虚拟根节点包含所有文件
    if (rootNodes.length > 1) {
      const totalDuration = rootNodes.reduce(
        (sum, node) => sum + (node.duration || 0),
        0
      );
      const virtualRoot: TreeNode = {
        name: `🌳 函数调用追踪总览 (${rootNodes.length}个文件)`,
        value: totalDuration,
        duration: totalDuration,
        filePath: "总览",
        children: rootNodes,
        symbolSize: Math.max(20, Math.min(60, totalDuration / 20 + 30)),
        itemStyle: {
          color: "#1890ff",
        },
        callId: "virtual_root",
        startTime: Math.min(...rootNodes.map((n) => n.startTime || 0)),
        endTime: Math.max(...rootNodes.map((n) => n.endTime || 0)),
        depth: 0,
        status: "completed",
      };
      return [virtualRoot];
    }

    return rootNodes;
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
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular Reference]";
        }
        seen.add(value);
      }
      // 过滤掉可能引起循环引用的复杂对象
      if (key === "args" && Array.isArray(value)) {
        return value.map((arg) => {
          if (typeof arg === "object" && arg !== null) {
            try {
              JSON.stringify(arg);
              return arg;
            } catch {
              return "[Complex Object]";
            }
          }
          return arg;
        });
      }
      return value;
    }, 2);
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
