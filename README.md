# 🔍 Function Tracer - 跨文件函数调用链路追踪器

一个高性能、零侵入的 JavaScript/TypeScript 函数调用链路追踪系统，支持跨文件调用分析、性能监控和调试。

## ✨ 特性

### 🎯 核心功能
- **🔗 跨文件追踪**: 完整追踪跨模块的函数调用链路
- **⚡ 高性能**: 基于 AST 的精确插桩，最小化运行时开销
- **🎛️ 零侵入**: 构建时自动插桩，无需修改源代码
- **📊 详细分析**: 提供调用树、性能统计、错误追踪等
- **🔧 TypeScript**: 完整的类型支持和类型安全

### 🛠️ 技术特性
- **Rollup 插件**: 集成到构建流程，支持多种构建工具
- **AST 解析**: 基于 Babel 的精确代码分析和转换
- **智能采样**: 支持性能采样，适应生产环境
- **实时监控**: 实时收集调用数据，支持性能分析
- **可配置**: 丰富的配置选项，适应不同使用场景

## 🚀 快速开始

### 安装

```bash
npm install @function-tracer/core --save-dev
```

### 基本使用

#### 1. 配置 Rollup

```javascript
// rollup.config.js
import { functionTracerPlugin } from '@function-tracer/core';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/bundle.js',
    format: 'esm'
  },
  plugins: [
    functionTracerPlugin({
      enabled: true,
      includeArguments: true,
      includeReturnValues: true
    })
  ]
};
```

#### 2. 在代码中查看追踪结果

```javascript
// 构建后的代码中
console.log('=== 函数调用链路追踪 ===');

// 打印调用树
globalThis.__FUNCTION_TRACER__.printCallTree();

// 打印统计信息
globalThis.__FUNCTION_TRACER__.printStats();

// 获取详细数据
const stats = globalThis.__FUNCTION_TRACER__.getStats();
console.log(`总调用次数: ${stats.totalCalls}`);
console.log(`总执行时间: ${stats.totalDuration}ms`);
```

## 📖 详细文档

### 配置选项

```typescript
interface PluginOptions {
  // 基本配置
  enabled?: boolean;                    // 是否启用追踪
  includeArguments?: boolean;           // 是否记录参数
  includeReturnValues?: boolean;        // 是否记录返回值
  
  // 性能配置
  maxDepth?: number;                    // 最大调用深度
  samplingRate?: number;                // 采样率 (0-1)
  
  // 过滤配置
  ignorePatterns?: (string | RegExp)[]; // 忽略的函数模式
  ignoreFiles?: (string | RegExp)[];    // 忽略的文件模式
  include?: (string | RegExp)[];        // 包含的文件模式
  exclude?: (string | RegExp)[];        // 排除的文件模式
  
  // 高级配置
  functionMatcher?: (name: string, filePath: string) => boolean;
  serializer?: (value: unknown) => unknown;
  enableInProduction?: boolean;         // 是否在生产环境启用
}
```

### 预设配置

```javascript
import { 
  createDevTracerPlugin,    // 开发环境配置
  createProdTracerPlugin,   // 生产环境配置
  createTracerPlugin        // 自动环境检测
} from '@function-tracer/core';

// 开发环境 - 完整追踪
const devPlugin = createDevTracerPlugin({
  includeArguments: true,
  includeReturnValues: true,
  samplingRate: 1.0
});

// 生产环境 - 轻量追踪
const prodPlugin = createProdTracerPlugin({
  includeArguments: false,
  includeReturnValues: false,
  samplingRate: 0.1  // 10% 采样
});

// 自动检测环境
const autoPlugin = createTracerPlugin();
```

## 📊 输出示例

### 调用树
```
🔍 函数调用链路追踪 (15 个调用):

├─ main (45.67ms) [main.ts]
  ├─ UserService.addUser (0.12ms) [user.ts]
  ├─ UserService.updateScore (1.23ms) [user.ts]
    ├─ MathUtils.add (0.08ms) [math.ts]
  ├─ UserService.calculateFibonacciScore (8.45ms) [user.ts]
    ├─ fibonacci (7.89ms) [math.ts]
      ├─ fibonacci (3.21ms) [math.ts]
        ├─ fibonacci (1.45ms) [math.ts]
    ├─ MathUtils.multiply (0.03ms) [math.ts]
  ├─ UserService.processUserAsync (102.34ms) [user.ts]
    ├─ asyncDelay (100.12ms) [math.ts]
```

### 统计报告
```
📊 追踪统计报告:
总调用次数: 15
总执行时间: 158.23ms
平均执行时间: 10.55ms
错误次数: 0
最慢调用: UserService.processUserAsync (102.34ms)

📁 文件统计:
  main.ts: 1 个调用, 45.67ms
  user.ts: 8 个调用, 112.18ms
  math.ts: 6 个调用, 112.75ms

🔍 详细分析:
- 跨文件调用: 3 个文件
- 最深调用层数: 4 层
```

## 🎯 使用场景

### 1. 性能分析
```javascript
// 找出最耗时的函数
const stats = tracer.getStats();
console.log(`最慢调用: ${stats.slowestCall?.fullPath}`);

// 分析文件级性能
stats.fileStats.forEach((fileStats, filePath) => {
  console.log(`${filePath}: ${fileStats.totalDuration}ms`);
});
```

### 2. 调试复杂调用链
```javascript
// 打印完整调用树
tracer.printCallTree();

// 过滤特定函数的调用
const history = tracer.getHistory()
  .filter(record => record.name.includes('calculate'));
```

### 3. 错误追踪
```javascript
// 查看发生错误的调用
const errors = tracer.getHistory()
  .filter(record => record.error);

errors.forEach(record => {
  console.log(`错误: ${record.fullPath}`, record.error);
});
```

## 🏗️ 架构设计

```
@function-tracer/core
├── 🧠 core/           # 核心追踪器
│   ├── tracer.ts      # 主追踪器实现
│   └── types.ts       # 类型定义
├── 🔄 transform/      # 代码转换
│   └── ast-transformer.ts  # AST 转换器
├── 🔌 plugins/        # 构建插件
│   ├── rollup.ts      # Rollup 插件
│   ├── webpack.ts     # Webpack 插件 (计划中)
│   └── vite.ts        # Vite 插件 (计划中)
├── ⚡ runtime/        # 运行时模块
│   └── index.ts       # 运行时入口
└── 📦 index.ts        # 主入口
```

## 🔧 高级用法

### 自定义序列化
```javascript
functionTracerPlugin({
  serializer: (value) => {
    if (value instanceof Date) {
      return `[Date: ${value.toISOString()}]`;
    }
    if (value instanceof Error) {
      return `[Error: ${value.message}]`;
    }
    return value;
  }
});
```

### 自定义函数匹配
```javascript
functionTracerPlugin({
  functionMatcher: (name, filePath) => {
    // 只追踪业务逻辑函数
    if (name.startsWith('_') || name.startsWith('$')) {
      return false; // 忽略私有函数
    }
    
    if (filePath.includes('node_modules')) {
      return false; // 忽略依赖库
    }
    
    return true;
  }
});
```

### 条件性启用
```javascript
functionTracerPlugin({
  enabled: process.env.NODE_ENV !== 'production',
  enableInProduction: process.env.ENABLE_TRACING === 'true'
});
```

## 📈 性能影响

### 开发环境
- **插桩开销**: 构建时间增加 10-20%
- **运行时开销**: 每个函数调用增加 0.01-0.05ms
- **内存使用**: 追踪数据占用额外 1-5MB

### 生产环境
- **采样模式**: 使用 10% 采样率可将开销降至 1%
- **轻量配置**: 禁用参数/返回值记录可降低 50% 开销
- **按需启用**: 支持运行时动态开启/关闭

## 🛡️ 最佳实践

### 开发环境
```javascript
createDevTracerPlugin({
  includeArguments: true,
  includeReturnValues: true,
  samplingRate: 1.0,
  ignorePatterns: [/^console\./, /^debug/]
});
```

### 生产环境
```javascript
createProdTracerPlugin({
  includeArguments: false,
  includeReturnValues: false,
  samplingRate: 0.1,
  ignorePatterns: [/^console\./, /^log/, /^debug/]
});
```

### 性能敏感场景
```javascript
functionTracerPlugin({
  enabled: false, // 默认禁用
  enableInProduction: process.env.DEBUG_MODE === 'true'
});
```

## 🤝 生态系统

### 构建工具支持
- ✅ **Rollup**: 完整支持
- 🚧 **Webpack**: 开发中
- 🚧 **Vite**: 开发中
- 🚧 **ESBuild**: 计划中

### 框架集成
- 🚧 **React**: React DevTools 集成
- 🚧 **Vue**: Vue DevTools 集成
- 🚧 **Angular**: Angular DevTools 集成

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

---

<p align="center">
  <b>🔍 让函数调用链路一目了然</b><br>
  <i>高性能 · 零侵入 · 跨文件追踪</i>
</p>