import { ASTCodeTransformer } from './ast-transformer.js';
import type {
  ICodeTransformer,
  TransformResult,
  PluginOptions
} from '../core/types.js';

/**
 * 代码转换器（基于 AST）
 * 使用精确的 AST 分析进行函数识别和插桩
 */
export class CodeTransformer implements ICodeTransformer {
  private readonly astTransformer: ASTCodeTransformer;

  constructor(options: PluginOptions) {
    // 直接使用 AST transformer 进行精确的代码分析和插桩
    this.astTransformer = new ASTCodeTransformer(options);
  }

  /**
   * 转换源代码
   * 使用 AST 进行精确插桩
   */
  transform(code: string, filePath: string): TransformResult {
    return this.astTransformer.transform(code, filePath);
  }
}