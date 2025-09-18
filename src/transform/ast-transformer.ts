import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

// 修复 traverse 和 generate 默认导入问题  
const traverseDefault = (traverse as any).default || traverse;
const generateDefault = (generate as any).default || generate;
import type {
  ICodeTransformer,
  TransformResult,
  PluginOptions,
  FunctionInfo,
  FunctionType
} from '../core/types.js';

/**
 * 基于 Babel AST 的代码转换器
 * 支持精确的函数识别和插桩
 */
export class ASTCodeTransformer implements ICodeTransformer {
  private readonly options: PluginOptions;

  constructor(options: PluginOptions) {
    this.options = {
      includeArguments: true,
      includeReturnValues: true,
      ignorePatterns: [],
      ignoreFiles: [],
      ...options
    };
  }

  /**
   * 转换源代码
   */
  transform(code: string, filePath: string): TransformResult {
    try {
      if (this.shouldSkipFile(filePath)) {
        return {
          code,
          transformed: false
        };
      }

      // 解析 AST
      const ast = parse(code, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'dynamicImport',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'nullishCoalescingOperator',
          'optionalChaining'
        ]
      });

      let transformed = false;
      const functionsToInstrument: FunctionInfo[] = [];

      // 遍历 AST，收集需要插桩的函数
      traverseDefault(ast, {
        // 函数声明
        FunctionDeclaration: (path: any) => {
          const info = this.extractFunctionInfo(path.node, filePath, 'function-declaration');
          if (info && this.shouldInstrumentFunction(info)) {
            functionsToInstrument.push(info);
            this.instrumentFunction(path, info);
            transformed = true;
          }
        },

        // 函数表达式
        FunctionExpression: (path: any) => {
          const info = this.extractFunctionInfo(path.node, filePath, 'function-expression');
          if (info && this.shouldInstrumentFunction(info)) {
            functionsToInstrument.push(info);
            this.instrumentFunction(path, info);
            transformed = true;
          }
        },

        // 箭头函数
        ArrowFunctionExpression: (path: any) => {
          const info = this.extractFunctionInfo(path.node, filePath, 'arrow-function');
          if (info && this.shouldInstrumentFunction(info)) {
            functionsToInstrument.push(info);
            this.instrumentArrowFunction(path, info);
            transformed = true;
          }
        },

        // 类方法
        ClassMethod: (path: any) => {
          const info = this.extractMethodInfo(path, filePath);
          if (info && this.shouldInstrumentFunction(info)) {
            functionsToInstrument.push(info);
            this.instrumentFunction(path, info);
            transformed = true;
          }
        },

        // 对象方法
        ObjectMethod: (path: any) => {
          const info = this.extractFunctionInfo(path.node, filePath, 'method');
          if (info && this.shouldInstrumentFunction(info)) {
            functionsToInstrument.push(info);
            this.instrumentFunction(path, info);
            transformed = true;
          }
        }
      });

      if (transformed) {
        // 添加追踪器导入
        this.addTracerImport(ast);
      }

      // 生成代码
      const result = generateDefault(ast, {
        retainLines: true,
        sourceMaps: true
      });

      return {
        code: result.code,
        map: JSON.stringify(result.map),
        transformed
      };

    } catch (error) {
      console.warn(`[ASTCodeTransformer] Failed to transform ${filePath}:`, error);
      return {
        code,
        transformed: false
      };
    }
  }

  private shouldSkipFile(filePath: string): boolean {
    return this.options.ignoreFiles?.some(pattern => {
      if (typeof pattern === 'string') {
        return filePath.includes(pattern);
      }
      return pattern.test(filePath);
    }) || false;
  }

  private shouldInstrumentFunction(info: FunctionInfo): boolean {
    if (!this.options.functionMatcher) {
      return !this.options.ignorePatterns?.some(pattern => {
        if (typeof pattern === 'string') {
          return info.name.includes(pattern);
        }
        return pattern.test(info.name);
      });
    }

    return this.options.functionMatcher(info.name, info.location.file);
  }

  private extractFunctionInfo(
    node: t.Function, 
    filePath: string, 
    type: FunctionType
  ): FunctionInfo | null {
    let name = 'anonymous';

    if (t.isFunctionDeclaration(node) && node.id) {
      name = node.id.name;
    } else if (t.isFunctionExpression(node) && node.id) {
      name = node.id.name;
    }

    return {
      name,
      type,
      location: {
        file: filePath,
        line: node.loc?.start.line || 0,
        column: node.loc?.start.column || 0
      },
      node
    };
  }

  private extractMethodInfo(path: any, filePath: string): FunctionInfo | null {
    const node = path.node as t.ClassMethod;
    let name = 'anonymous';
    let type: FunctionType = 'method';

    // 获取方法名
    if (t.isIdentifier(node.key)) {
      name = node.key.name;
    } else if (t.isStringLiteral(node.key)) {
      name = node.key.value;
    }

    // 获取类名
    let className = 'Unknown';
    const classNode = path.findParent((p: any) => p.isClassDeclaration() || p.isClassExpression());
    if (classNode) {
      const classDeclaration = classNode.node;
      if (t.isClassDeclaration(classDeclaration) && classDeclaration.id && t.isIdentifier(classDeclaration.id)) {
        className = classDeclaration.id.name;
      } else if (t.isClassExpression(classDeclaration) && classDeclaration.id && t.isIdentifier(classDeclaration.id)) {
        className = classDeclaration.id.name;
      }
    }

    // 在方法名前加上类名
    name = `${className}.${name}`;

    if (node.kind === 'constructor') {
      type = 'constructor';
      name = `${className}.constructor`;
    } else if (node.kind === 'get') {
      type = 'getter';
    } else if (node.kind === 'set') {
      type = 'setter';
    }

    return {
      name,
      type,
      location: {
        file: filePath,
        line: node.loc?.start.line || 0,
        column: node.loc?.start.column || 0
      },
      node
    };
  }

  private instrumentFunction(path: any, info: FunctionInfo): void {
    const { node } = path;
    
    // 创建 callId 变量
    const callIdDeclaration = t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__callId'),
        this.createTracerEnterCall(info)
      )
    ]);

    // 创建 try-catch 包装
    const originalBody = Array.isArray(node.body.body) ? node.body.body : [node.body];
    
    const tryBlock = t.blockStatement([
      ...this.instrumentStatements(originalBody, info)
    ]);

    const catchBlock = t.catchClause(
      t.identifier('__error'),
      t.blockStatement([
        this.createTracerErrorCall(),
        t.throwStatement(t.identifier('__error'))
      ])
    );

    const tryStatement = t.tryStatement(tryBlock, catchBlock);

    // 替换函数体
    node.body = t.blockStatement([callIdDeclaration, tryStatement]);
  }

  private instrumentArrowFunction(path: any, info: FunctionInfo): void {
    const { node } = path;

    // 如果是表达式体，转换为块语句体
    if (!t.isBlockStatement(node.body)) {
      const expression = node.body;
      node.body = t.blockStatement([
        t.returnStatement(expression)
      ]);
    }

    this.instrumentFunction(path, info);
  }

  private instrumentStatements(statements: t.Statement[], _info: FunctionInfo): t.Statement[] {
    return statements.map(stmt => {
      if (t.isReturnStatement(stmt)) {
        return this.instrumentReturnStatement(stmt);
      }
      return stmt;
    });
  }

  private instrumentReturnStatement(stmt: t.ReturnStatement): t.BlockStatement {
    const returnValueId = t.identifier('__returnValue');
    
    const statements: t.Statement[] = [
      // const __returnValue = originalReturnValue;
      t.variableDeclaration('const', [
        t.variableDeclarator(returnValueId, stmt.argument ?? t.identifier('undefined'))
      ]),
      // __tracer.exit(__callId, __returnValue);
      this.createTracerExitCall(returnValueId),
      // return __returnValue;
      t.returnStatement(returnValueId)
    ];

    return t.blockStatement(statements);
  }

  private createTracerEnterCall(info: FunctionInfo): t.CallExpression {
    const metadata = this.createMetadataObject(info);
    
    // 对于箭头函数，需要手动创建参数数组，因为箭头函数没有 arguments 对象
    let argsExpression: t.Expression;
    if (info.type === 'arrow-function') {
      // 为箭头函数创建参数数组 [...arguments] 或 [param1, param2, ...]
      const params = (info.node as t.ArrowFunctionExpression).params;
      if (params.length === 0) {
        argsExpression = t.arrayExpression([]);
      } else {
        const paramIdentifiers = params.map(param => {
          if (t.isIdentifier(param)) {
            return param;
          } else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
            return param.left;
          } else {
            return t.identifier('undefined'); // 对于复杂参数模式，暂时使用 undefined
          }
        });
        argsExpression = t.arrayExpression(paramIdentifiers);
      }
    } else {
      // 对于普通函数和方法，使用 arguments 对象
      argsExpression = t.identifier('arguments');
    }
    
    return t.callExpression(
      t.memberExpression(
        t.identifier('__tracer'),
        t.identifier('enter')
      ),
      [
        t.stringLiteral(info.name),           // functionName
        t.stringLiteral(info.location.file),  // filePath
        argsExpression,                       // args
        metadata                              // metadata
      ]
    );
  }

  private createTracerExitCall(returnValue?: t.Expression): t.ExpressionStatement {
    const args: (t.Expression | t.SpreadElement)[] = [t.identifier('__callId')];
    if (returnValue) {
      args.push(returnValue);
    }

    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.identifier('__tracer'),
          t.identifier('exit')
        ),
        args
      )
    );
  }

  private createTracerErrorCall(): t.ExpressionStatement {
    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.identifier('__tracer'),
          t.identifier('error')
        ),
        [t.identifier('__callId'), t.identifier('__error')]
      )
    );
  }

  private createMetadataObject(info: FunctionInfo): t.ObjectExpression {
    const properties: t.ObjectProperty[] = [
      t.objectProperty(
        t.identifier('functionType'),
        t.stringLiteral(info.type)
      ),
      t.objectProperty(
        t.identifier('isAsync'),
        t.booleanLiteral(t.isFunction(info.node) && info.node.async === true)
      ),
      t.objectProperty(
        t.identifier('isGenerator'),
        t.booleanLiteral(t.isFunction(info.node) && info.node.generator === true)
      ),
      t.objectProperty(
        t.identifier('isMethod'),
        t.booleanLiteral(info.type === 'method' || info.type === 'constructor')
      ),
      t.objectProperty(
        t.identifier('location'),
        t.objectExpression([
          t.objectProperty(t.identifier('file'), t.stringLiteral(info.location.file)),
          t.objectProperty(t.identifier('line'), t.numericLiteral(info.location.line)),
          t.objectProperty(t.identifier('column'), t.numericLiteral(info.location.column))
        ])
      )
    ];

    return t.objectExpression(properties);
  }

  private addTracerImport(ast: t.File): void {
    const importDeclaration = t.importDeclaration(
      [t.importSpecifier(t.identifier('__tracer'), t.identifier('globalTracer'))],
      t.stringLiteral('@function-tracer/runtime')
    );

    // 添加到文件顶部
    if (t.isProgram(ast.program)) {
      ast.program.body.unshift(importDeclaration);
    }
  }
}