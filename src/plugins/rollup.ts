import type { Plugin } from "rollup";
import { CodeTransformer } from "../transform/code-transformer.js";
import type { PluginOptions } from "../core/types.js";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

// ES 模块中获取 __dirname 的方法
let __dirname: string;
try {
  // 在 ES 模块环境中使用 import.meta
  const __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  // 在 CommonJS 环境中回退
  __dirname = process.cwd();
}

/**
 * Rollup 函数调用追踪插件
 * 支持跨文件的函数调用链路追踪
 */
export function functionTracerPlugin(options: PluginOptions = {}): Plugin {
  const {
    include = [/\.[jt]sx?$/],
    exclude = [/node_modules/, /\.min\./, /\.d\.ts$/],
    enableInProduction = false,
    runtimePath = "@function-tracer/runtime",
    ...transformOptions
  } = options;

  // 在生产环境中可能需要禁用
  const isProduction = process.env["NODE_ENV"] === "production";
  if (isProduction && !enableInProduction) {
    return {
      name: "function-tracer-disabled",
    };
  }

  const transformer = new CodeTransformer({
    ...transformOptions,
    runtimePath,
  });

  const trackedFiles = new Set<string>();

  return {
    name: "function-tracer",

    buildStart() {
      console.log("🔍 [Function Tracer] 开始构建，启用函数调用追踪...");
    },

    resolveId(id: string) {
      // 解析运行时模块
      if (id === "@function-tracer/runtime") {
        // 检测当前模块系统并选择对应的运行时版本
        let isCurrentESM = false;
        let currentFile = "unknown";

        try {
          // 在ESM中使用import.meta.url
          if (typeof import.meta !== "undefined" && import.meta.url) {
            currentFile = fileURLToPath(import.meta.url);
            isCurrentESM = currentFile.endsWith(".mjs");
          } else if (typeof __filename !== "undefined") {
            // 在CJS中使用__filename
            currentFile = __filename;
            isCurrentESM = currentFile.endsWith(".mjs");
          }
        } catch (e) {
          // 如果无法检测，默认使用.js版本
          isCurrentESM = false;
        }

        const mjsPath = path.resolve(__dirname, "../runtime/inline-tracer.mjs");
        const jsPath = path.resolve(__dirname, "../runtime/inline-tracer.js");

        // 根据当前文件类型选择对应的运行时版本
        if (isCurrentESM) {
          return {
            id: mjsPath,
            external: false,
          };
        } else {
          return {
            id: jsPath,
            external: false,
          };
        }
      }
      return null;
    },

    load(id: string) {
      // 加载运行时模块
      if (id.includes("/runtime/inline-tracer")) {
        // 从传入的id中提取实际文件路径
        try {
          return readFileSync(id, "utf-8");
        } catch (error) {
          console.error(
            `❌ [Function Tracer] 无法读取追踪器文件: ${id}`,
            error
          );
          throw new Error(
            `Failed to load tracer runtime: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      return null;
    },

    transform(code: string, id: string) {
      // 检查是否应该转换此文件
      if (!shouldTransformFile(id, include, exclude)) {
        return null;
      }

      try {
        const result = transformer.transform(code, id);

        if (result.transformed) {
          trackedFiles.add(id);
          console.log(
            `🔧 [Function Tracer] 已插桩: ${path.relative(process.cwd(), id)}`
          );

          return {
            code: result.code,
            map: result.map ? JSON.parse(result.map) : null,
          };
        }

        return null;
      } catch (error) {
        console.warn(`⚠️  [Function Tracer] 转换失败 ${id}:`, error);
        return null;
      }
    },

    generateBundle() {
      if (trackedFiles.size > 0) {
        console.log(
          `✅ [Function Tracer] 构建完成，已追踪 ${trackedFiles.size} 个文件`
        );
        console.log("📊 访问 globalThis.__FUNCTION_TRACER__ 查看追踪数据");
      }
    },
  };

  // 文件匹配辅助方法
  function shouldTransformFile(
    id: string,
    include: (string | RegExp)[],
    exclude: (string | RegExp)[]
  ): boolean {
    const normalizedId = path.normalize(id);

    // 检查排除规则
    for (const pattern of exclude) {
      if (matchPattern(normalizedId, pattern)) {
        return false;
      }
    }

    // 检查包含规则
    for (const pattern of include) {
      if (matchPattern(normalizedId, pattern)) {
        return true;
      }
    }

    return false;
  }

  function matchPattern(filePath: string, pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      return filePath.includes(pattern);
    }
    return pattern.test(filePath);
  }
}

/**
 * 创建开发环境的追踪插件配置
 */
export function createDevTracerPlugin(options: Partial<PluginOptions> = {}) {
  return functionTracerPlugin({
    enabled: true,
    includeArguments: true,
    includeReturnValues: true,
    samplingRate: 1.0,
    enableInProduction: false,
    ...options,
  });
}

/**
 * 创建生产环境的追踪插件配置
 */
export function createProdTracerPlugin(options: Partial<PluginOptions> = {}) {
  return functionTracerPlugin({
    enabled: true,
    includeArguments: false,
    includeReturnValues: false,
    samplingRate: 0.1, // 10% 采样
    enableInProduction: true,
    ignorePatterns: [/^console\./, /^debug/, /^log/, /^trace/],
    ...options,
  });
}

/**
 * 插件工厂，根据环境自动选择配置
 */
export function createTracerPlugin(
  options: Partial<PluginOptions> = {}
): Plugin {
  const isProduction = process.env["NODE_ENV"] === "production";

  if (isProduction) {
    return createProdTracerPlugin(options);
  } else {
    return createDevTracerPlugin(options);
  }
}

// 默认导出
export default functionTracerPlugin;
