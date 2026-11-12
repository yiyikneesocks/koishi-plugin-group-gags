// fudu.ts —— 复读服务
// 从原 dedide dedide.ts 原样迁移。
export function reverseString(input: string): string {
  return input.split('').reverse().join('');
}

/**
 * 复读服务：同一句话在本群连发两次时，有一定概率复读（可能倒序）。
 * 状态按 guildId 分开保存。
 */
export class FuduService {
  static guildrptData: { [guildId: string]: string } = {};

  static fudu(initContent: string, guildId: string, probability = 0.8) {
    let replacedContent = initContent;
    let send = 0;
    if (initContent === FuduService.guildrptData[guildId]) {
      const rd = Math.random();
      if (rd < probability) {
        replacedContent = Math.random() > 0.5 ? replacedContent : reverseString(replacedContent);
        send = 1;
      }
    }
    FuduService.guildrptData[guildId] = initContent;
    return send === 1 ? replacedContent : '';
  }
}
