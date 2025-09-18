import { UserService } from './user.js';
import { MathUtils } from './math.js';
import * as fs from 'fs';
import * as path from 'path';

// 应用程序主逻辑
class Application {
  private userService = new UserService();

  async run(): Promise<void> {
    console.log('🚀 启动跨文件函数调用追踪演示');
    
    // 基本操作
    console.log('\n=== 1. 基本用户操作 ===');
    const user1 = this.userService.addUser('Alice');
    const user2 = this.userService.addUser('Bob');
    
    console.log(`创建用户: ${user1.name} (ID: ${user1.id})`);
    console.log(`创建用户: ${user2.name} (ID: ${user2.id})`);

    // 跨文件调用
    console.log('\n=== 2. 跨模块分数计算 ===');
    this.userService.updateScore(user1.id, 5);
    this.userService.updateScore(user2.id, 8);
    
    console.log('分数更新完成');

    // 复杂的跨文件调用链
    console.log('\n=== 3. 复杂调用链 (斐波那契计算) ===');
    const fibScore1 = this.userService.calculateFibonacciScore(user1.id);
    const fibScore2 = this.userService.calculateFibonacciScore(user2.id);
    
    console.log(`${user1.name} 的斐波那契分数: ${fibScore1}`);
    console.log(`${user2.name} 的斐波那契分数: ${fibScore2}`);

    // 异步跨文件调用
    console.log('\n=== 4. 异步跨文件调用 ===');
    const result1 = await this.userService.processUserAsync(user1.id);
    const result2 = await this.userService.processUserAsync(user2.id);
    
    console.log(result1);
    console.log(result2);

    // 直接使用数学工具
    console.log('\n=== 5. 直接数学运算 ===');
    const powerResult = MathUtils.power(2, 5);
    console.log(`2^5 = ${powerResult}`);

    // 展示追踪结果
    this.showTraceResults();
  }

  private showTraceResults(): void {
    console.log('\n=== 📊 函数调用链路追踪结果 ===');
    
    // 访问全局追踪器
    const tracer = (globalThis as any).__FUNCTION_TRACER__;
    
    if (tracer) {
      // 打印调用树
      tracer.printCallTree();
      
      // 打印统计信息
      tracer.printStats();
      
      // 获取详细数据
      const stats = tracer.getStats();
      console.log('\n🔍 详细分析:');
      console.log(`- 跨文件调用: ${this.countCrossFileCallsFromStats(stats)}`);
      console.log(`- 最深调用层数: ${this.getMaxDepthFromHistory(tracer.getHistory())}`);
      
      // 生成可视化报告
      this.generateVisualizationReport(tracer);
      
    } else {
      console.log('❌ 追踪器未找到，请确保启用了函数追踪插件');
    }
  }

  private generateVisualizationReport(tracer: any): void {
    try {
      console.log('\n📊 正在生成ECharts可视化报告...');
      
      // 生成HTML报告
      const htmlReport = tracer.generateHTMLReport();
      const reportPath = path.resolve(process.cwd(), 'trace-report.html');
      fs.writeFileSync(reportPath, htmlReport, 'utf-8');
      
      console.log(`✅ 可视化报告已生成: ${reportPath}`);
      console.log('🌐 请在浏览器中打开该文件查看详细的可视化分析');
      
      // 生成JSON数据
      const reportData = tracer.generateEChartsReport();
      const jsonPath = path.resolve(process.cwd(), 'trace-data.json');
      fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf-8');
      console.log(`📄 追踪数据已保存: ${jsonPath}`);
      
    } catch (error) {
      console.error('❌ 生成可视化报告失败:', error);
    }
  }

  private countCrossFileCallsFromStats(stats: any): number {
    return stats.fileStats.size;
  }

  private getMaxDepthFromHistory(history: any[]): number {
    return Math.max(...history.map(record => record.depth), 0);
  }
}

// 程序入口
async function main(): Promise<void> {
  const app = new Application();
  
  try {
    await app.run();
    console.log('\n✅ 演示完成!');
  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
  }
}

// 错误处理演示
function demonstrateErrorTracking(): void {
  console.log('\n=== 6. 错误追踪演示 ===');
  
  try {
    // 故意制造一个错误
    MathUtils.power(-1, 0.5); // 可能的数学错误
  } catch (error) {
    console.log('捕获到错误，追踪器应该记录了这个错误');
  }
}

// 执行
if (typeof window === 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    demonstrateErrorTracking();
  });
}

export { main, Application };