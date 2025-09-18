import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { functionTracerPlugin } from "../dist/index.mjs";

export default defineConfig({
  input: "src/main.ts",
  output: {
    file: "dist/bundle.js",
    format: "esm",
    sourcemap: true,
  },
  plugins: [
    // TypeScript 编译
    typescript({
      target: "ES2020",
      module: "ESNext",
      strict: true,
    }),

    // 解析 node_modules
    nodeResolve({
      preferBuiltins: false,
    }),

    // 🔍 函数调用追踪插件
    functionTracerPlugin({
      enabled: true,
      includeArguments: true,
      includeReturnValues: true,
      samplingRate: 1.0,
      ignorePatterns: [/^console\./, /^Math\.min/, /^Math\.max/],
      ignoreFiles: [
        /node_modules/,
        /runtime\/index\.js$/, // 排除 runtime 文件
        /function-tracer/, // 排除所有 tracer 相关文件
        /@function-tracer/, // 排除 @function-tracer 包相关文件
      ],
      functionMatcher: (name, filePath) => {
        // 自定义函数匹配逻辑
        if (name.startsWith("_") || name.startsWith("$")) {
          return false; // 忽略私有函数
        }

        if (filePath.includes("test") || filePath.includes("spec")) {
          return false; // 忽略测试文件
        }

        return true;
      },
    }),
  ],

  onwarn(warning, warn) {
    // 忽略一些警告
    if (warning.code === "THIS_IS_UNDEFINED") return;
    if (warning.code === "EVAL") return;
    warn(warning);
  },
});
