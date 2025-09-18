import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionTracer } from '../core/tracer.js';

describe('FunctionTracer', () => {
  let tracer: FunctionTracer;

  beforeEach(() => {
    tracer = new FunctionTracer({
      includeArguments: true,
      includeReturnValues: true
    });
  });

  it('should create a tracer instance', () => {
    expect(tracer).toBeDefined();
    expect(tracer.getStats().totalCalls).toBe(0);
  });

  it('should track function calls', () => {
    const callId = tracer.enter('testFunction', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 1, column: 0 }
    });

    expect(callId).toBeDefined();
    expect(tracer.getStats().totalCalls).toBe(1);

    tracer.exit(callId, 'return value');

    const history = tracer.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.name).toBe('testFunction');
    expect(history[0]!.returnValue).toBe('return value');
  });

  it('should track nested function calls', () => {
    const parentId = tracer.enter('parentFunction', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 1, column: 0 }
    });

    const childId = tracer.enter('childFunction', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 5, column: 0 }
    });

    tracer.exit(childId, 'child result');
    tracer.exit(parentId, 'parent result');

    const history = tracer.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.depth).toBe(0);
    expect(history[1]!.depth).toBe(1);
  });

  it('should handle errors correctly', () => {
    const callId = tracer.enter('errorFunction', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 1, column: 0 }
    });

    const error = new Error('Test error');
    tracer.error(callId, error);

    const history = tracer.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.error).toEqual({
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    expect(history[0]!.status).toBe('error');
  });

  it('should generate call tree correctly', () => {
    const parentId = tracer.enter('parent', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 1, column: 0 }
    });

    const child1Id = tracer.enter('child1', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 5, column: 0 }
    });

    tracer.exit(child1Id);

    const child2Id = tracer.enter('child2', '/test.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/test.js', line: 10, column: 0 }
    });

    tracer.exit(child2Id);
    tracer.exit(parentId);

    const tree = tracer.getCallTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]!.record.name).toBe('parent');
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children[0]?.record.name).toBe('child1');
    expect(tree[0]!.children[1]?.record.name).toBe('child2');
  });

  it('should collect file statistics', () => {
    const call1Id = tracer.enter('func1', '/file1.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/file1.js', line: 1, column: 0 }
    });

    const call2Id = tracer.enter('func2', '/file2.js', [], {
      functionType: 'function-declaration',
      isAsync: false,
      isGenerator: false,
      isMethod: false,
      location: { file: '/file2.js', line: 1, column: 0 }
    });

    // 需要调用 exit 才会更新文件统计
    tracer.exit(call1Id);
    tracer.exit(call2Id);

    const stats = tracer.getStats();
    expect(stats.fileStats.size).toBe(2);
    expect(stats.fileStats.has('/file1.js')).toBe(true);
    expect(stats.fileStats.has('/file2.js')).toBe(true);
  });
});