import { describe, it, expect, beforeEach } from 'vitest';
import { CodeTransformer } from '../transform/code-transformer.js';
import type { PluginOptions } from '../core/types.js';

describe('CodeTransformer', () => {
  let transformer: CodeTransformer;

  beforeEach(() => {
    const options: PluginOptions = {
      includeArguments: true,
      includeReturnValues: true,
      ignorePatterns: [],
      ignoreFiles: []
    };
    transformer = new CodeTransformer(options);
  });

  it('should create transformer instance', () => {
    expect(transformer).toBeDefined();
  });

  it('should transform function declarations', () => {
    const code = `
function testFunction() {
  return 42;
}
`;

    const result = transformer.transform(code, '/test.js');
    
    expect(result.transformed).toBe(true);
    expect(result.code).toContain('__tracer.enter');
    expect(result.code).toContain('__callId');
  });

  it('should transform arrow functions', () => {
    const code = `
const arrowFunc = () => {
  return 'hello';
};
`;

    const result = transformer.transform(code, '/test.js');
    
    expect(result.transformed).toBe(true);
    expect(result.code).toContain('__tracer.enter');
  });

  it('should skip ignored files', () => {
    const options: PluginOptions = {
      ignoreFiles: [/node_modules/]
    };
    const ignoredTransformer = new CodeTransformer(options);

    const code = `
function testFunction() {
  return 42;
}
`;

    const result = ignoredTransformer.transform(code, '/node_modules/test.js');
    
    expect(result.transformed).toBe(false);
    expect(result.code).toBe(code);
  });

  it('should skip ignored function patterns', () => {
    const options: PluginOptions = {
      ignorePatterns: ['consoleLog']
    };
    const patternTransformer = new CodeTransformer(options);

    const code = `
function consoleLog() {
  return 42;
}

function normalFunction() {
  return 42;
}
`;

    const result = patternTransformer.transform(code, '/test.js');
    
    expect(result.transformed).toBe(true);
    // consoleLog 应该被忽略，normalFunction 应该被转换
    expect(result.code).toContain('normalFunction');
    // 检查 consoleLog 没有被插桩（不应该有 __tracer.enter 调用）
    const normalFunctionInstrumented = result.code.includes('__tracer.enter("normalFunction"');
    const consoleLogInstrumented = result.code.includes('__tracer.enter("consoleLog"');
    
    expect(normalFunctionInstrumented).toBe(true);
    expect(consoleLogInstrumented).toBe(false);
  });

  it('should add tracer import when transforming', () => {
    const code = `
function testFunction() {
  return 42;
}
`;

    const result = transformer.transform(code, '/test.js');
    
    expect(result.code).toContain("import { globalTracer as __tracer } from \"@function-tracer/runtime\"");
  });

  it('should handle transformation errors gracefully', () => {
    // 提供无效的代码
    const invalidCode = `
function testFunction( {
  // 缺少闭合括号
`;

    const result = transformer.transform(invalidCode, '/test.js');
    
    // 转换失败时应该返回原始代码
    expect(result.transformed).toBe(false);
    expect(result.code).toBe(invalidCode);
  });

  describe('AST-based complex syntax handling', () => {
    it('should handle nested functions correctly', () => {
      const code = `
function outerFunction() {
  function innerFunction() {
    return 'inner';
  }
  return innerFunction();
}
`;
      const result = transformer.transform(code, '/test.js');
      
      expect(result.transformed).toBe(true);
      expect(result.code).toContain('__tracer.enter');
      // 应该为两个函数都插桩
      const enterCalls = (result.code.match(/__tracer\.enter/g) || []).length;
      expect(enterCalls).toBeGreaterThanOrEqual(2);
    });

    it('should handle class methods correctly', () => {
      const code = `
class TestClass {
  constructor() {
    this.name = 'test';
  }
  
  async asyncMethod() {
    return Promise.resolve('async');
  }
  
  get getter() {
    return this.name;
  }
  
  set setter(value) {
    this.name = value;
  }
}
`;
      const result = transformer.transform(code, '/test.js');
      
      expect(result.transformed).toBe(true);
      expect(result.code).toContain('__tracer.enter');
    });

    it('should handle complex arrow functions', () => {
      const code = `
const complexArrow = async (a, b) => {
  const nested = (x) => x * 2;
  return await Promise.resolve(nested(a + b));
};

const returnExpression = () => 42;
`;
      const result = transformer.transform(code, '/test.js');
      
      expect(result.transformed).toBe(true);
      expect(result.code).toContain('__tracer.enter');
    });

    it('should handle function expressions correctly', () => {
      const code = `
const funcExpr = function namedFunction(x) {
  return x * 2;
};

const anonFuncExpr = function(y) {
  return y + 1;
};
`;
      const result = transformer.transform(code, '/test.js');
      
      expect(result.transformed).toBe(true);
      expect(result.code).toContain('__tracer.enter');
    });

    it('should handle TypeScript syntax correctly', () => {
      const code = `
interface TestInterface {
  method(param: string): number;
}

class TypedClass implements TestInterface {
  method(param: string): number {
    return param.length;
  }
  
  genericMethod<T>(param: T): T {
    return param;
  }
}

const typedArrow: (x: number) => string = (x) => {
  return x.toString();
};
`;
      const result = transformer.transform(code, '/test.ts');
      
      expect(result.transformed).toBe(true);
      expect(result.code).toContain('__tracer.enter');
    });

    it('should preserve accurate line and column information', () => {
      const code = `
// Line 2
function testFunction() {
  return 'test';  // Line 4
}
`;
      const result = transformer.transform(code, '/test.js');
      
      expect(result.transformed).toBe(true);
      // 检查是否包含位置信息
      expect(result.code).toContain('line:');
      expect(result.code).toContain('column:');
    });
  });
});