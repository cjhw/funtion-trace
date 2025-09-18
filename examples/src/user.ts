import { MathUtils, fibonacci, asyncDelay } from './math.js';

// 用户模块
export interface User {
  id: number;
  name: string;
  score: number;
}

export class UserService {
  private users: User[] = [];

  addUser(name: string): User {
    const id = this.generateId();
    const user: User = {
      id,
      name,
      score: 0
    };
    this.users.push(user);
    return user;
  }

  updateScore(userId: number, points: number): boolean {
    const user = this.findUser(userId);
    if (!user) return false;

    // 使用数学模块计算新分数
    user.score = MathUtils.add(user.score, points);
    return true;
  }

  calculateFibonacciScore(userId: number): number | null {
    const user = this.findUser(userId);
    if (!user) return null;

    // 跨文件调用：使用斐波那契数列
    const fibValue = fibonacci(Math.min(user.score, 10));
    return MathUtils.multiply(fibValue, 10);
  }

  async processUserAsync(userId: number): Promise<string> {
    const user = this.findUser(userId);
    if (!user) return 'User not found';

    // 异步操作
    await asyncDelay(100);
    
    const fibScore = this.calculateFibonacciScore(userId);
    return `User ${user.name} has fibonacci score: ${fibScore}`;
  }

  private generateId(): number {
    return this.users.length + 1;
  }

  private findUser(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  getAllUsers(): readonly User[] {
    return [...this.users];
  }
}