// 数学工具模块
export class MathUtils {
  static add(a: number, b: number): number {
    console.log(`Computing ${a} + ${b}`);
    return a + b;
  }

  static multiply(a: number, b: number): number {
    return a * b;
  }

  static power(base: number, exponent: number): number {
    if (exponent === 0) return 1;
    return base * this.power(base, exponent - 1);
  }
}

export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

export const asyncDelay = async (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};