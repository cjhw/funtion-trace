/**
 * 运行时追踪器模块
 * 这个模块会被注入到转换后的代码中，提供全局的追踪器实例
 */
import { globalTracer } from '../core/tracer.js';

// 导出全局追踪器实例
export { globalTracer };

// 为了兼容性，也导出为默认导出
export default globalTracer;

// 在浏览器环境中，将追踪器挂载到全局对象
if (typeof window !== 'undefined') {
  (window as any).__FUNCTION_TRACER__ = globalTracer;
}

// 在 Node.js 环境中，将追踪器挂载到全局对象
if (typeof global !== 'undefined') {
  (global as any).__FUNCTION_TRACER__ = globalTracer;
}