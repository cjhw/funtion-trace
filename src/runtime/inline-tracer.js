// 内联的函数追踪器实现
class InlineTracer {
  constructor() {
    this.callStack = [];
    this.callHistory = [];
    this.fileStats = new Map();
    this.currentDepth = 0;
    this.enabled = true;
  }

  enter(functionName, filePath, args, metadata) {
    if (!this.enabled) return '';
    
    const callId = `call_${performance.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const parentId = this.callStack.length > 0 ? this.callStack[this.callStack.length - 1].id : null;
    
    const record = {
      id: callId,
      name: functionName,
      fullPath: `${filePath}:${functionName}`,
      filePath,
      args: Array.isArray(args) ? args : Array.from(args),
      status: 'active',
      depth: this.currentDepth,
      startTime: performance.now(),
      parentId,
      childrenIds: [],
      metadata
    };

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

  exit(callId, returnValue) {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.callStack.findIndex(call => call.id === callId);

    if (callIndex === -1) return;

    const record = this.callStack[callIndex];
    record.endTime = endTime;
    record.duration = endTime - record.startTime;
    record.status = 'completed';
    record.returnValue = returnValue;

    this.callStack.splice(callIndex, 1);
    this.callHistory.push(record);
    this.currentDepth--;
    this.updateFileStats(record);
  }

  error(callId, error) {
    if (!callId || !this.enabled) return;

    const endTime = performance.now();
    const callIndex = this.callStack.findIndex(call => call.id === callId);

    if (callIndex === -1) return;

    const record = this.callStack[callIndex];
    record.endTime = endTime;
    record.duration = endTime - record.startTime;
    record.status = 'error';
    record.error = {
      name: error.name,
      message: error.message,
      stack: error.stack || ''
    };

    this.callStack.splice(callIndex, 1);
    this.callHistory.push(record);
    this.currentDepth--;
    this.updateFileStats(record);
  }

  getHistory() {
    return [...this.callHistory].sort((a, b) => a.startTime - b.startTime);
  }

  getStats() {
    const totalCalls = this.callHistory.length;
    const totalDuration = this.callHistory.reduce((sum, record) => sum + (record.duration || 0), 0);
    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const errorCount = this.callHistory.filter(record => record.error).length;

    return {
      totalCalls,
      totalDuration,
      averageDuration,
      errorCount,
      fileStats: new Map(this.fileStats)
    };
  }

  printCallTree() {
    console.log(`\n🔍 函数调用链路追踪 (${this.callHistory.length} 个调用):\n`);
    
    if (this.callHistory.length === 0) {
      console.log('暂无调用记录');
      return;
    }

    for (const record of this.callHistory) {
      const duration = record.duration ? record.duration.toFixed(2) : '?';
      const errorIndicator = record.error ? ' ❌' : '';
      const filePath = record.filePath.split('/').pop() || record.filePath;
      console.log(`├─ ${record.name} (${duration}ms) [${filePath}]${errorIndicator}`);
    }
  }

  printStats() {
    const stats = this.getStats();
    console.log('\n📊 追踪统计报告:');
    console.log(`总调用次数: ${stats.totalCalls}`);
    console.log(`总执行时间: ${stats.totalDuration.toFixed(2)}ms`);
    console.log(`平均执行时间: ${stats.averageDuration.toFixed(2)}ms`);
    console.log(`错误次数: ${stats.errorCount}`);
    
    console.log('\n📁 文件统计:');
    for (const [filePath, fileStats] of stats.fileStats) {
      console.log(`  ${filePath}: ${fileStats.callCount} 个调用, ${fileStats.totalDuration.toFixed(2)}ms`);
    }
  }

  // 新增：生成ECharts可视化报告
  generateEChartsReport() {
    const stats = this.getStats();
    const history = this.getHistory();

    // 按文件统计数据
    const fileData = [];
    const fileDurationData = [];
    for (const [filePath, fileStats] of stats.fileStats) {
      const fileName = filePath.split('/').pop() || filePath;
      fileData.push({
        name: fileName,
        value: fileStats.callCount,
        duration: fileStats.totalDuration
      });
      fileDurationData.push({
        name: fileName,
        value: fileStats.totalDuration.toFixed(2)
      });
    }

    // 按函数统计执行时间Top10
    const functionDurations = history
      .filter(record => record.duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(record => ({
        name: `${record.name} [${record.filePath.split('/').pop()}]`,
        value: record.duration.toFixed(2)
      }));

    // 时间线数据
    const timelineData = history.map(record => ({
      name: record.name,
      value: [record.startTime, record.endTime || record.startTime, record.duration || 0],
      filePath: record.filePath.split('/').pop()
    }));

    // 调用深度统计
    const depthStats = {};
    history.forEach(record => {
      depthStats[record.depth] = (depthStats[record.depth] || 0) + 1;
    });
    
    const depthData = Object.entries(depthStats)
      .map(([depth, count]) => ({ depth: parseInt(depth), count }))
      .sort((a, b) => a.depth - b.depth);

    return {
      summary: {
        totalCalls: stats.totalCalls,
        totalDuration: stats.totalDuration,
        averageDuration: stats.averageDuration,
        errorCount: stats.errorCount,
        fileCount: stats.fileStats.size
      },
      charts: {
        fileCallDistribution: {
          title: '文件调用分布',
          type: 'pie',
          data: fileData
        },
        fileDurationDistribution: {
          title: '文件执行时间分布',
          type: 'pie', 
          data: fileDurationData
        },
        topFunctions: {
          title: '函数执行时间Top10',
          type: 'bar',
          data: functionDurations
        },
        timeline: {
          title: '函数调用时间线',
          type: 'gantt',
          data: timelineData
        },
        depthDistribution: {
          title: '调用深度分布',
          type: 'line',
          data: depthData
        }
      }
    };
  }

  // 生成HTML报告
  generateHTMLReport() {
    const reportData = this.generateEChartsReport();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>函数调用链路追踪报告</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-value { font-size: 2em; font-weight: bold; color: #1890ff; }
    .summary-label { color: #666; margin-top: 8px; }
    .chart-container { width: 100%; height: 400px; margin-bottom: 30px; }
    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .chart-full { width: 100%; height: 500px; margin-bottom: 30px; }
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
      <div class="summary-value">${reportData.summary.totalDuration.toFixed(2)}ms</div>
      <div class="summary-label">总执行时间</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${reportData.summary.averageDuration.toFixed(2)}ms</div>
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

  <script>
    const reportData = ${JSON.stringify(reportData)};

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

    // 响应式处理
    window.addEventListener('resize', () => {
      fileCallChart.resize();
      fileDurationChart.resize();
      topFunctionsChart.resize();
      depthChart.resize();
    });
  </script>
</body>
</html>`;

    return html;
  }

  updateFileStats(record) {
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
}

// 创建全局追踪器实例
const globalTracer = new InlineTracer();

// 自动设置为全局追踪器
if (typeof globalThis !== 'undefined') {
  globalThis.__FUNCTION_TRACER__ = globalTracer;
  globalThis.__tracer = globalTracer;
}
if (typeof window !== 'undefined') {
  window.__FUNCTION_TRACER__ = globalTracer;
  window.__tracer = globalTracer;
}
if (typeof global !== 'undefined') {
  global.__FUNCTION_TRACER__ = globalTracer;
  global.__tracer = globalTracer;
}

export { globalTracer };
export default globalTracer;