/**
 * 函数调用链路追踪系统
 * 
 * @packageDocumentation
 */

// 核心类型
export type * from './core/types.js';

// 核心追踪器
export { 
  FunctionTracer, 
  globalTracer, 
  createTracer 
} from './core/tracer.js';

// 代码转换器
export { CodeTransformer } from './transform/code-transformer.js';

// Rollup 插件
export { 
  functionTracerPlugin,
  createDevTracerPlugin,
  createProdTracerPlugin,
  createTracerPlugin
} from './plugins/rollup.js';

// 运行时
export { globalTracer as runtime } from './runtime/index.js';

// 默认导出插件
export { functionTracerPlugin as default } from './plugins/rollup.js';