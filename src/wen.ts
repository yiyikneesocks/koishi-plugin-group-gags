// wen.ts —— 「问……」玩法
// 从原 dedide wen.ts 原样迁移（去除注释代码），只把 mock/what 表读取
// 改为经 ctx.chatlog 服务（findSimilar / getVocab）。
import { Context } from 'koishi'
import { } from 'koishi-plugin-chatlog'

function Haishi(content: string): string {
  // 规则4：如果以"还是"开头，直接返回原字符串
  if (content.startsWith("还是")) return content;

  // 规则1-2：匹配含有“是”作为分隔符，但该“是”不能紧邻“还”
  // 使用负向后顾 (?<!还) 和负向前瞻 (?!还) 来区分"是"与"还是"
  const match = content.match(/^(.*?)(?<!还)是(?!还)(.*)$/);
  if (match) {
    const prefix = match[1];
    const optionsPart = match[2];
    // 按"还是"分割，空内容替换为单个英文空格（规则5）
    const options = optionsPart.split("还是").map(opt => opt.trim() || " ");
    if (options.length >= 2) {
      const selected = options[Math.floor(Math.random() * options.length)];
      return `${prefix}是${selected}`;
    }
  }

  // 规则3：纯“还是”结构（即没有符合上面正则的“是”）—直接将整个字符串按"还是"分割
  if (content.includes("还是")) {
    const options = content.split("还是").map(opt => opt.trim() || " ");
    if (options.length >= 2) {
      const selected = options[Math.floor(Math.random() * options.length)];
      return selected;
    }
  }

  return content;
}

export async function Wen(importContent: string, ctx?: Context, guildId?: string, memberl?: any[]) {
  importContent = importContent.replace(/你|您/g, '&replace').replace(/我/g, '你').replace(/&replace/g, '我');
  importContent = importContent.slice(1);
  let replacedContent = importContent;
  if (/(.)(不|没)\1/.test(replacedContent)) {
    let cg = replacedContent.match(/(.)(不|没)\1/g);
    for (let i = 0; i < cg.length; i++) {
      const randomV = Math.random();
      let change = [];
      // 对于每个匹配项，判断随机值并进行替换
      change[i] = cg[i].slice(randomV < 0.5 ? 1 : 2); // 删除字符
      // 使用正则替换进行替换
      replacedContent = replacedContent.replace(cg[i], change[i]);
    }
  }
  // 处理"多少"替换为0-100的随机数（包含0和100）
  replacedContent = replacedContent.replace(/多少/g, () =>
    Math.floor(Math.random() * 101).toString()
  );

  // 处理"几"替换为0-10的随机数（包含0和10）
  replacedContent = replacedContent.replace(/几/g, () =>
    Math.floor(Math.random() * 11).toString()
  );
  if (replacedContent.includes('还是')) {
    replacedContent = Haishi(replacedContent);
  }
  if (replacedContent.includes('为什么') && ctx?.chatlog) {
    // 直接获取 message 长度在 4 到 10 个字符之间的记录
    const rows = await ctx.chatlog.getMessages(guildId!)
    const guildjbList = rows.filter(r => r.kind === 'text' && 4 <= r.message.length && r.message.length <= 10)
    while (replacedContent.includes('为什么') && guildjbList.length) {
      const rnum = Math.floor(Math.random() * guildjbList.length);
      replacedContent = replacedContent.replace(/为什么/, `因为${guildjbList[rnum].message}，所以`);
    }
  }
  if (replacedContent.includes('什么') && ctx?.chatlog) {
    let whatreplaced = await ctx.chatlog.getVocab();
    if (whatreplaced.length > 1919) {
      await ctx.chatlog.trimVocab(1919);
      whatreplaced = await ctx.chatlog.getVocab();
    }
    while (replacedContent.includes('什么') && whatreplaced.length) {
      const rnum = Math.floor(Math.random() * whatreplaced.length);
      replacedContent = replacedContent.replace(/什么/, whatreplaced[rnum].words);
    }
  }
  if (replacedContent.includes('谁') && memberl?.length) {
    let shuffledIndexes = [];
    let currentIndex = 0;
    // 动态洗牌函数
    const reshuffle = () => {
      shuffledIndexes = Array.from({ length: memberl.length }, (_, i) => i);
      for (let i = shuffledIndexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledIndexes[i], shuffledIndexes[j]] = [shuffledIndexes[j], shuffledIndexes[i]];
      }
    };
    // 初始化首次洗牌
    reshuffle();
    // 替换逻辑
    replacedContent = replacedContent.replace(/谁/g, () => {
      if (currentIndex >= shuffledIndexes.length) {
        reshuffle();  // 当索引耗尽时重新洗牌
        currentIndex = 0;
      }
      const member = memberl[shuffledIndexes[currentIndex]];
      currentIndex++;
      return member.nick || member.user?.username || member.username || '某人';
    });
  }

  return replacedContent === importContent ? '' : replacedContent;
};
