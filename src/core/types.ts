/**
 * 函数调用追踪系统的类型定义
 */

/** 函数调用记录 */
export interface CallRecord {
  /** 唯一调用 ID */
  readonly id: string;
  /** 函数名称 */
  readonly name: string;
  /** 完整的函数路径（包含模块路径） */
  readonly fullPath: string;
  /** 源文件路径 */
  readonly filePath: string;
  /** 函数参数 */
  readonly args: unknown[];
  /** 返回值 */
  returnValue?: unknown;
  /** 错误信息 */
  error?: TracedError;
  /** 调用状态 */
  status?: 'active' | 'completed' | 'error';
  /** 调用深度 */
  readonly depth: number;
  /** 开始时间 */
  readonly startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行时长 */
  duration?: number;
  /** 父调用 ID */
  readonly parentId: string | null;
  /** 子调用 ID 列表 */
  childrenIds: string[];
  /** 调用元数据 */
  readonly metadata: CallMetadata;
}

/** 函数调用元数据 */
export interface CallMetadata {
  /** 函数类型 */
  readonly functionType: FunctionType;
  /** 是否为异步函数 */
  readonly isAsync: boolean;
  /** 是否为生成器函数 */
  readonly isGenerator: boolean;
  /** 是否为类方法 */
  readonly isMethod: boolean;
  /** 类名（如果是类方法） */
  readonly className?: string;
  /** 源码位置 */
  readonly location: SourceLocation;
}

/** 函数类型 */
export type FunctionType = 
  | 'function-declaration'
  | 'function-expression' 
  | 'arrow-function'
  | 'method'
  | 'constructor'
  | 'getter'
  | 'setter';

/** 源码位置 */
export interface SourceLocation {
  /** 文件路径 */
  readonly file: string;
  /** 行号 */
  readonly line: number;
  /** 列号 */
  readonly column: number;
}

/** 追踪的错误信息 */
export interface TracedError {
  /** 错误名称 */
  readonly name: string;
  /** 错误消息 */
  readonly message: string;
  /** 错误堆栈 */
  readonly stack?: string;
}

/** 调用树节点 */
export interface CallTreeNode {
  /** 调用记录 */
  readonly record: CallRecord;
  /** 子节点 */
  readonly children: CallTreeNode[];
}

/** 追踪统计信息 */
export interface TracingStats {
  /** 总调用次数 */
  readonly totalCalls: number;
  /** 总执行时间 */
  readonly totalDuration: number;
  /** 平均执行时间 */
  readonly averageDuration: number;
  /** 最慢的调用 */
  readonly slowestCall: CallRecord | null;
  /** 最快的调用 */
  readonly fastestCall: CallRecord | null;
  /** 错误次数 */
  readonly errorCount: number;
  /** 各文件的调用统计 */
  readonly fileStats: Map<string, FileStats>;
}

/** 文件统计信息 */
export interface FileStats {
  /** 文件路径 */
  readonly filePath: string;
  /** 调用次数 */
  callCount: number;
  /** 总执行时间 */
  totalDuration: number;
  /** 函数列表 */
  readonly functions: Set<string>;
}

/** 追踪器配置 */
export interface TracerOptions {
  /** 是否启用追踪 */
  enabled?: boolean;
  /** 是否记录参数 */
  includeArguments?: boolean;
  /** 是否记录返回值 */
  includeReturnValues?: boolean;
  /** 最大调用栈深度 */
  maxDepth?: number;
  /** 忽略的函数模式 */
  ignorePatterns?: (string | RegExp)[];
  /** 忽略的文件模式 */
  ignoreFiles?: (string | RegExp)[];
  /** 性能采样率 (0-1) */
  samplingRate?: number;
  /** 自定义序列化函数 */
  serializer?: (value: unknown) => unknown;
}

/** 插件配置 */
export interface PluginOptions extends TracerOptions {
  /** 输出追踪器运行时代码的位置 */
  runtimePath?: string;
  /** 是否在生产环境启用 */
  enableInProduction?: boolean;
  /** 自定义函数名匹配规则 */
  functionMatcher?: (name: string, filePath: string) => boolean;
  /** 转换包含/排除规则 */
  include?: (string | RegExp)[];
  exclude?: (string | RegExp)[];
}

/** 追踪器接口 */
export interface ITracer {
  /** 进入函数调用 */
  enter(
    functionName: string, 
    filePath: string,
    args: unknown[], 
    metadata: CallMetadata
  ): string;
  
  /** 退出函数调用 */
  exit(callId: string, returnValue?: unknown): void;
  
  /** 记录错误 */
  error(callId: string, error: Error): void;
  
  /** 获取调用历史 */
  getHistory(): readonly CallRecord[];
  
  /** 获取调用树 */
  getCallTree(): CallTreeNode[];
  
  /** 获取统计信息 */
  getStats(): TracingStats;
  
  /** 清空追踪数据 */
  clear(): void;
  
  /** 启用/禁用追踪 */
  setEnabled(enabled: boolean): void;
  
  /** 导出追踪数据 */
  export(): TraceExport;
}

/** 导出的追踪数据 */
export interface TraceExport {
  /** 版本信息 */
  readonly version: string;
  /** 生成时间 */
  readonly timestamp: number;
  /** 调用记录 */
  readonly records: CallRecord[];
  /** 统计信息 */
  readonly stats: TracingStats;
  /** 配置信息 */
  readonly options: TracerOptions;
}

/** 代码转换器接口 */
export interface ICodeTransformer {
  /** 转换源代码 */
  transform(code: string, filePath: string): TransformResult;
}

/** 转换结果 */
export interface TransformResult {
  /** 转换后的代码 */
  readonly code: string;
  /** Source Map */
  readonly map?: string;
  /** 是否进行了转换 */
  readonly transformed: boolean;
}

/** AST 节点访问器 */
export interface NodeVisitor {
  /** 访问函数声明 */
  visitFunctionDeclaration?(node: any, state: VisitorState): void;
  /** 访问函数表达式 */
  visitFunctionExpression?(node: any, state: VisitorState): void;
  /** 访问箭头函数 */
  visitArrowFunction?(node: any, state: VisitorState): void;
  /** 访问方法定义 */
  visitMethodDefinition?(node: any, state: VisitorState): void;
}

/** 访问器状态 */
export interface VisitorState {
  /** 当前文件路径 */
  readonly filePath: string;
  /** 转换选项 */
  readonly options: PluginOptions;
  /** 需要转换的函数列表 */
  functionsToTransform: FunctionInfo[];
}

/** 函数信息 */
export interface FunctionInfo {
  /** 函数名称 */
  readonly name: string;
  /** 函数类型 */
  readonly type: FunctionType;
  /** 位置信息 */
  readonly location: SourceLocation;
  /** AST 节点 */
  readonly node: any;
}