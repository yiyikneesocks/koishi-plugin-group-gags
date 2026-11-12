// koishi-plugin-group-gags
// 群聊整活合集：你好 / 问…… / 复读 / Mock 名人名言。
// 数据层是 koishi-plugin-chatlog（收集器）：本插件只读不写，经 ctx.chatlog 服务访问。
import { Schema, Context, h } from 'koishi'
import { } from 'koishi-plugin-jieba'
import { } from 'koishi-plugin-chatlog'
import { restoreFaces } from 'koishi-plugin-chatlog'

export const name = 'group-gags'
export const inject = { required: ['database', 'chatlog', 'jieba'] }

export interface Config {
  // —— 功能开关 ——
  enableGreeting?: boolean
  enableWen?: boolean
  enableFudu?: boolean
  enableMock?: boolean
  // —— Mock 概率与媒体 ——
  imageReplyChance?: number
  urlReplyChance?: number
  // —— 「你好」——
  greetingText?: string
  // —— 复读 ——
  fuduProbability?: number
  // —— mock / imitate 命令 ——
  famousNames?: string[]
  quoteFooter?: string
  anonymousName?: string
}

export const Config: Schema<Config> = Schema.object({
  enableGreeting: Schema.boolean().description('是否启用「你好」回复').default(true),
  enableWen: Schema.boolean().description('是否启用「问……」玩法').default(true),
  enableFudu: Schema.boolean().description('是否启用复读（同一句连发两次时复读）').default(true),
  enableMock: Schema.boolean().description('是否启用 Mock（用本群历史消息替换当前消息）').default(true),
  imageReplyChance: Schema.number().description('收到图片时回复旧图片的概率（0~1）').default(0.05).min(0).max(1),
  urlReplyChance: Schema.number().description('收到链接时回复旧链接的概率（0~1）').default(0.05).min(0).max(1),

  greetingText: Schema.string().description('「你好」的回复内容').default('你emoji活了'),

  fuduProbability: Schema.number()
    .description('复读概率（0~1）').default(0.8).min(0).max(1),

  famousNames: Schema.array(Schema.string())
    .description('「mock」命令的随机名人库（留空用内置库）'),
  quoteFooter: Schema.string().description('名人名言署名前的破折号').default('——'),
  anonymousName: Schema.string().description('没有昵称时的署名').default('佚名'),
})

// 内置名人库：知名度高 / 有梗 / 有点争议，读起来有反差幽默感
const DEFAULT_FAMOUS_NAMES = [
  '爱因斯坦', '牛顿', '达尔文', '特斯拉', '霍金', '伽利略',
  '尼采', '苏格拉底', '柏拉图', '亚里士多德', '马克思', '鲁迅',
  '莎士比亚', '托尔斯泰', '陀思妥耶夫斯基', '卡夫卡', '海明威',
  '博尔赫斯', '加缪', '李白', '杜甫', '苏轼', '曹雪芹',
  '贝多芬', '莫扎特', '巴赫', '梵高', '毕加索', '达利',
  '乔布斯', '马斯克', '比尔盖茨', '图灵', '冯诺依曼',
  '特朗普', '罗永浩', '周杰伦', '蔡徐坤', '吴京', '六小龄童',
  '陈冠希', '王思聪', '雷军', '罗翔', '张雪峰',
]

function pickRandom<T>(list: T[]): T | undefined {
  if (!list?.length) return undefined
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 把本地图片文件转成可发送的元素。
 * NapCat/OneBot 不接受 file:// 路径（retcode 1200），但接受 base64://。
 */
function localImage(file: string): any {
  try {
    const buf = require('fs').readFileSync(file)
    return h('image', { src: `data:image/${guessExt(file)};base64,${buf.toString('base64')}` })
  } catch (e: any) {
    console.warn('[group-gags] 读取图片失败:', e?.message || e)
    return null
  }
}

function guessExt(file: string): string {
  const m = /\.(jpe?g|png|gif|webp|bmp)$/i.exec(file)
  if (!m) return 'jpeg'
  const e = m[1].toLowerCase()
  return e === 'jpg' ? 'jpeg' : e
}

export function apply(ctx: Context, config: Config) {
  const famousNames = config.famousNames?.length ? config.famousNames : DEFAULT_FAMOUS_NAMES
  const quoteFooter = config.quoteFooter ?? '——'
  const anonymousName = config.anonymousName ?? '佚名'

  /**
   * 渲染「名人名言」：有昵称 → 昵称·名人；无昵称 → 随机名人。
   */
  function renderQuote(message: string, nickname: string | null | undefined) {
    const base = nickname?.trim()
    const famous = pickRandom(famousNames)
    let who: string
    if (base && famous) who = `${base}·${famous}`
    else if (base) who = base
    else if (famous) who = famous
    else who = anonymousName
    return `「${message}」\n${quoteFooter} ${who}`
  }

  // ── 你好 ──
  if (config.enableGreeting !== false) {
    ctx.middleware(async (session, next) => {
      if (session.content === '你好') return config.greetingText ?? '你emoji活了'
      return next()
    }, true)
  }

  // ── 问 ──
  if (config.enableWen !== false) {
    ctx.middleware(async (session, next) => {
      const content = session.content || ''
      if (!content.startsWith('问')) return next()

      if (content.includes('谁')) {
        const memberl = (await session.bot.getGuildMemberList(session.guildId)).data
        return await Wen(content, ctx, session.guildId, memberl)
      }
      if (content.includes('什么')) {
        return await Wen(content, ctx)
      }
      const rC = await Wen(content)
      return rC || next()
    }, true)
  }

  // ── 复读 ──
  if (config.enableFudu !== false) {
    ctx.middleware(async (session, next) => {
      const c = session.content || ''
      // 跳过分享卡片，避免复读一张卡片
      const isShareCard =
        /\[CQ:(json|xml)/i.test(c) ||
        /^\[分享\]/.test(c) ||
        /<json|com\.tencent\.(tuwen|structmsg)/i.test(c)
      if (isShareCard) return next()

      const rC = FuduService.fudu(c, session.guildId, config.fuduProbability ?? 0.8)
      return rC ? next(rC) : next()
    })
  }

  // ── Mock（中间件：按概率用历史消息替换当前消息）──
  if (config.enableMock !== false) {
    ctx.middleware(async (session, next) => {
      const mockrd = Math.random()
      const rC = await mockMiddleware(
        session.content, ctx, session.guildId, mockrd, session.author?.name,
        {
          imageReplyChance: config.imageReplyChance,
          urlReplyChance: config.urlReplyChance,
        },
      )
      if (!rC) return next()
      // [image]<本地路径> → 当作图片段发送
      if (rC.startsWith('[image]')) {
        const img = localImage(rC.slice(7))
        return img ?? next()
      }
      // 文本里可能含 [face:id] 占位符 → 还原成真正的 QQ 表情
      return next(restoreFaces(rC))
    })
  }

  // ── mock / imitate 命令：名人名言 ──
  ctx.command('mock [keyword:text]', '从本群历史消息里模仿一句（名人名言格式）')
    .alias('imitate')
    .alias('模仿')
    .usage('mock [关键词] —— 不带关键词则随机取一句')
    .action(async ({ session }, keyword) => {
      if (!session.guildId) return '只能在群里用哦'

      let rows: any[]
      try {
        rows = await ctx.chatlog.getMessages(session.guildId)
      } catch {
        return '读取历史消息失败'
      }
      if (!rows.length) return '本群还没有可供模仿的消息'

      if (keyword?.trim()) {
        const low = keyword.trim().toLowerCase()
        const filtered = rows.filter((r) => (r.message || '').toLowerCase().includes(low))
        if (!filtered.length) return `本群没有包含「${keyword.trim()}」的消息`
        rows = filtered
      }

      // 命令可返回：文字（名人名言）/ 图片（图片 + 署名）；绝不返回链接
      const pool = rows.filter((r) =>
        r.message && r.message.length >= 2 &&
        r.kind !== 'url' && !/^https?:\/\//i.test(r.message),
      )
      if (!pool.length) return '本群还没有可供模仿的消息'

      const pick = pool[Math.floor(Math.random() * pool.length)]

      // 图片：发送「图片 + —— 名人」，不回写、不删除
      if (pick.kind === 'image' && pick.media) {
        const who = renderQuote('', pick.nickname).split('\n')[1]
        const img = localImage(pick.media)
        if (img) return [img, h('text', { content: '\n' + who })]
      }

      // 不删除，只把时间刷新到今天：7 天内不会再被抽中，但总条数不减
      try {
        await ctx.chatlog.touchMessage(pick.message)
      } catch (e: any) {
        ctx.logger('group-gags').warn('刷新 mock 时间失败:', e?.message || e)
      }

      return renderQuote(pick.message, pick.nickname)
    })
}

// ─────────────────────────────────────────────────────────────
// Mock 中间件核心逻辑（读 chatlog 服务，不再自己写库）
// ─────────────────────────────────────────────────────────────
import { Wen } from './wen'
import { FuduService } from './fudu'
import { normalizeContent, isMediaOnly, isFaceOnly, extractImageUrl, extractUrl, removeImage, saveImage } from 'koishi-plugin-chatlog'

async function mockMiddleware(
  content: string,
  ctx: Context,
  guildId: string,
  mockrd: number,
  nickname?: string,
  opts: { imageReplyChance?: number; urlReplyChance?: number } = {},
): Promise<string> {
  const log = ctx.logger('group-gags')
  let replacedContent = content;

  // ── 图片：按概率回放（写库归收集器，这里只做回放）──
  const imageUrl = extractImageUrl(content)
  if (imageUrl) {
    if (Math.random() < (opts.imageReplyChance ?? 0.05)) {
      const picked = await ctx.chatlog.pickMessage(guildId, 'image')
      if (picked) {
        await ctx.chatlog.removeMedia(picked.media)
        await ctx.chatlog.removeMessage(picked.message)
        return `[image]${picked.media}`   // 由调用方转成图片段
      }
    }
    return ''
  }

  // ── 纯链接消息：按概率回放 ──
  const url = extractUrl(content)
  if (url) {
    if (Math.random() < (opts.urlReplyChance ?? 0.05)) {
      const picked = await ctx.chatlog.pickMessage(guildId, 'url')
      if (picked) {
        await ctx.chatlog.removeMessage(picked.message)
        return picked.media
      }
    }
    return ''
  }

  // 其它媒体（卡片等）：不入库、不匹配
  if (isMediaOnly(content)) return ''

  // 只有表情、没有文字 → 丢弃（不存、不匹配，也不会触发上面的图片/链接回放）
  if (isFaceOnly(content)) return ''

  // 把 <at .../> → "@名字"，[CQ:face] → "[face:id]"，后续分词/存储都用纯文本
  const plain = normalizeContent(content)

  // 保留分词结果中的「候选 token」：
  //   - 普通词：码点长度 >= 2（用码点而非 UTF-16 单元，避免 😀/⏰ 行为不一致）
  //   - emoji：单个也算（允许 emoji 作为可匹配 token）
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  let jbFltList = ctx.jieba.cut(plain)
    .filter((word) => word.trim().length > 0)
    .filter((word) => [...word].length >= 2 || EMOJI_RE.test(word));

  if (mockrd >= 0.5 && jbFltList && jbFltList.length >= 1) {
    // 洗牌取 2 个候选词
    const shuffled = [...jbFltList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const reFltList = shuffled.slice(0, 2);
    if (reFltList) {
      const sevenDaysRecords = await ctx.chatlog.findSimilar(guildId)

      let matchingEntry: any | null = null;

      // 低概率模式：当随机值达到阈值时
      if (mockrd >= 0.8) {
        // 查找同时满足：
        // - 消息内容不同于当前替换内容
        // - jbmsg字段包含第一个过滤词
        matchingEntry = sevenDaysRecords.find(entry =>
          entry.message !== replacedContent &&
          entry.jbmsg.includes(reFltList[0])
        ) || null;
      }
      // 双词匹配模式：当过滤词数量为2时
      else if (reFltList.length === 2) {
        // 查找同时满足：
        // - 消息内容不同于当前替换内容
        // - jbmsg字段包含全部两个过滤词
        matchingEntry = sevenDaysRecords.find(entry =>
          entry.message !== replacedContent &&
          reFltList.every(str => entry.jbmsg.includes(str))
        ) || null;
      }

      if (matchingEntry) {
        replacedContent = matchingEntry.message;
        // 复用后直接删除该条：既节省存储，又避免同一句话被反复模仿。
        await ctx.chatlog.removeMessage(replacedContent);
      }
    }
  }

  return replacedContent === content ? '' : replacedContent;
}
