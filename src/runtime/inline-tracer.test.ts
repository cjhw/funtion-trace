import { describe, it, expect, beforeEach } from 'vitest';
import { InlineTracer } from './inline-tracer';

describe('InlineTracer CallTree Building', () => {
  let tracer: InlineTracer;

  beforeEach(() => {
    tracer = new InlineTracer();
  });

  describe('基本调用树构建', () => {
    it('应该构建简单的同步调用树', () => {
      // 模拟调用链: main -> func1 -> func2
      const mainId = tracer.enter("main", "test.js", [], {});
      const func1Id = tracer.enter("func1", "test.js", [], {});
      const func2Id = tracer.enter("func2", "test.js", [], {});
      
      tracer.exit(func2Id, "result2");
      tracer.exit(func1Id, "result1");
      tracer.exit(mainId, "result");
      
      const tree = tracer.buildCallTree();
      
      expect(tree).toHaveLength(1);
      expect(tree[0]?.name).toBe("main()");
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.name).toBe("func1()");
      expect(tree[0]?.children?.[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.children?.[0]?.name).toBe("func2()");
    });

    it('应该正确处理多个根节点', () => {
      // 两个独立的调用链
      const main1Id = tracer.enter("main1", "test1.js", [], {});
      tracer.exit(main1Id, "result1");
      
      const main2Id = tracer.enter("main2", "test2.js", [], {});
      tracer.exit(main2Id, "result2");
      
      const tree = tracer.buildCallTree();
      
      // 应该创建虚拟根节点包装多个根
      expect(tree).toHaveLength(1);
      expect(tree[0]?.name).toContain("函数调用总览");
      expect(tree[0]?.children).toHaveLength(2);
    });

    it('应该正确处理空调用历史', () => {
      const tree = tracer.buildCallTree();
      expect(tree).toHaveLength(0);
    });
  });

  describe('跨文件调用测试', () => {
    it('应该正确构建跨文件调用树', () => {
      // 模拟跨文件调用链
      const mainId = tracer.enter("main", "main.js", [], {});
      const userServiceId = tracer.enter("UserService.addUser", "user.js", ["Alice"], {});
      const mathId = tracer.enter("MathUtils.add", "math.js", [1, 2], {});
      
      tracer.exit(mathId, 3);
      tracer.exit(userServiceId, { id: 1, name: "Alice" });
      tracer.exit(mainId, "completed");
      
      const tree = tracer.buildCallTree();
      
      expect(tree).toHaveLength(1);
      expect(tree[0]?.name).toBe("main()");
      expect(tree[0]?.filePath).toBe("main.js");
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.name).toBe("UserService.addUser()");
      expect(tree[0]?.children?.[0]?.filePath).toBe("user.js");
      expect(tree[0]?.children?.[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.children?.[0]?.name).toBe("MathUtils.add()");
      expect(tree[0]?.children?.[0]?.children?.[0]?.filePath).toBe("math.js");
    });
  });

  describe('递归调用测试', () => {
    it('应该正确处理递归调用（限制深度）', () => {
      // 模拟 fibonacci 递归调用
      function simulateFibonacci(n: number): number {
        if (n <= 1) return n;
        
        const callId = tracer.enter("fibonacci", "math.js", [n], {});
        
        // 模拟递归调用
        const result1 = simulateFibonacci(n - 1);
        const result2 = simulateFibonacci(n - 2);
        const result = result1 + result2;
        
        tracer.exit(callId, result);
        return result;
      }
      
      // 测试适中深度的递归 (fibonacci(4))
      simulateFibonacci(4);
      
      const tree = tracer.buildCallTree();
      const nodeCount = countNodes(tree);
      
      expect(tree.length).toBeGreaterThan(0);
      expect(nodeCount).toBeGreaterThan(1);
      expect(nodeCount).toBeLessThan(50); // 确保不会递归爆炸
      
      // 验证根节点存在
      const rootNode = findNodeByName(tree, "fibonacci()");
      expect(rootNode).toBeTruthy();
      if (rootNode) {
        expect(rootNode.children?.length).toBeGreaterThan(0);
      }
    });

    it('应该限制深度避免栈溢出', () => {
      // 模拟非常深的递归
      function simulateDeepRecursion(n: number): void {
        if (n <= 0) return;
        
        const callId = tracer.enter("deepFunc", "test.js", [n], {});
        simulateDeepRecursion(n - 1);
        tracer.exit(callId);
      }
      
      // 测试深递归
      simulateDeepRecursion(25);
      
      const tree = tracer.buildCallTree();
      
      // 检查树的最大深度
      const maxDepth = getMaxTreeDepth(tree);
      expect(maxDepth).toBeLessThan(30); // 确保深度被合理控制
    });
  });

  describe('异步调用测试', () => {
    it('应该正确处理异步调用', async () => {
      // 模拟异步函数
      async function simulateAsyncFunc(): Promise<string> {
        const callId = tracer.enter("asyncFunc", "async.js", [], {});
        
        // 模拟异步操作
        await new Promise(resolve => setTimeout(resolve, 1));
        
        tracer.exit(callId, "async_result");
        return "async_result";
      }
      
      const mainId = tracer.enter("main", "test.js", [], {});
      await simulateAsyncFunc();
      tracer.exit(mainId, "main_result");
      
      const tree = tracer.buildCallTree();
      
      expect(tree.length).toBeGreaterThan(0);
      
      // 验证主函数存在
      const mainNode = findNodeByName(tree, "main()");
      expect(mainNode).toBeTruthy();
      
      // 验证异步函数被正确追踪
      const asyncNode = findNodeByName(tree, "asyncFunc()");
      expect(asyncNode).toBeTruthy();
    });

    it('应该正确处理多个并发异步调用', async () => {
      const mainId = tracer.enter("main", "test.js", [], {});
      
      // 启动多个异步调用
      const async1Promise = (async () => {
        const callId = tracer.enter("async1", "async.js", [], {});
        await new Promise(resolve => setTimeout(resolve, 5));
        tracer.exit(callId, "result1");
      })();
      
      const async2Promise = (async () => {
        const callId = tracer.enter("async2", "async.js", [], {});
        await new Promise(resolve => setTimeout(resolve, 3));
        tracer.exit(callId, "result2");
      })();
      
      await Promise.all([async1Promise, async2Promise]);
      tracer.exit(mainId, "main_result");
      
      const tree = tracer.buildCallTree();
      
      expect(tree.length).toBeGreaterThan(0);
      
      // 验证所有异步调用都被正确追踪
      const mainNode = findNodeByName(tree, "main()");
      expect(mainNode).toBeTruthy();
      
      const async1Node = findNodeByName(tree, "async1()");
      const async2Node = findNodeByName(tree, "async2()");
      expect(async1Node || async2Node).toBeTruthy(); // 至少有一个异步调用被追踪到
    });
  });

  describe('错误处理测试', () => {
    it('应该正确处理错误调用', () => {
      const mainId = tracer.enter("main", "test.js", [], {});
      const errorFuncId = tracer.enter("errorFunc", "test.js", [], {});
      
      // 模拟错误
      const error = new Error("测试错误");
      tracer.error(errorFuncId, error);
      tracer.exit(mainId, "completed");
      
      const tree = tracer.buildCallTree();
      
      expect(tree).toHaveLength(1);
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.status).toBe("error");
      expect(tree[0]?.children?.[0]?.itemStyle?.color).toBe("#ff4d4f");
    });
  });

  describe('ECharts 报告生成测试', () => {
    it('应该生成包含调用树的完整报告', () => {
      // 创建一些调用记录
      const mainId = tracer.enter("main", "main.js", [], {});
      const func1Id = tracer.enter("func1", "utils.js", [], {});
      tracer.exit(func1Id, "result1");
      tracer.exit(mainId, "result");
      
      const report = tracer.generateEChartsReport();
      
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('charts');
      expect(report.charts).toHaveProperty('callTree');
      expect(report.charts.callTree.data).toHaveLength(1);
      expect(report.charts.callTree.data[0]?.name).toBe("main()");
      expect(report.charts.callTree.data[0]?.children).toHaveLength(1);
    });

    it('应该正确处理递归调用的ECharts数据', () => {
      // 模拟递归调用
      function simulateFib(n: number): number {
        if (n <= 1) return n;
        
        const callId = tracer.enter("fib", "math.js", [n], {});
        const result = simulateFib(n - 1) + simulateFib(n - 2);
        tracer.exit(callId, result);
        return result;
      }
      
      simulateFib(3);
      
      const report = tracer.generateEChartsReport();
      
      expect(report.charts.callTree.data).toHaveLength(1);
      expect(report.charts.callTree.data[0]?.children?.length).toBeGreaterThan(0);
    });
  });

  describe('性能测试', () => {
    it('应该能处理大量调用记录', () => {
      const startTime = performance.now();
      
      // 创建大量调用记录
      const callIds: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const callId = tracer.enter(`func${i}`, `file${i % 10}.js`, [i], {});
        callIds.push(callId);
      }
      
      // 完成所有调用
      callIds.reverse().forEach(callId => {
        tracer.exit(callId, `result`);
      });
      
      const tree = tracer.buildCallTree();
      const endTime = performance.now();
      
      expect(tree.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(2000); // 应该在2秒内完成
      expect(countNodes(tree)).toBeLessThanOrEqual(1000);
    });
  });
});

// 辅助函数
function countNodes(tree: any[]): number {
  let count = 0;
  function traverse(nodes: any[]): void {
    for (const node of nodes) {
      count++;
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  traverse(tree);
  return count;
}

function findNodeByName(tree: any[], name: string): any | null {
  for (const node of tree) {
    if (node.name === name) {
      return node;
    }
    if (node.children) {
      const found = findNodeByName(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

function getMaxTreeDepth(tree: any[], currentDepth = 0): number {
  let maxDepth = currentDepth;
  for (const node of tree) {
    if (node.children && node.children.length > 0) {
      maxDepth = Math.max(maxDepth, getMaxTreeDepth(node.children, currentDepth + 1));
    }
  }
  return maxDepth;
}