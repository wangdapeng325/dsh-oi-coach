/**
 * 真实写入一条 ima 归档笔记并回读，用于人工确认最终格式。
 *
 * 用法（必须在 dsh 仓库根目录，tsx 才找得到 tsconfig 的 paths）：
 *   node <REPO>/node_modules/tsx/dist/cli.mjs <REPO>/dsh-oi-coach/test/write-test-note.mjs [标题]
 *
 * 默认标题带"（可删除）"标记；不传标题时用默认值。
 * 会真实写入使用者的 ima「信奥教练-学习档案」，ima 无删除 API，请在客户端自行删除。
 */
import { apply } from '../dist/index.js'
import {
  discoverImaCli,
  imaListNotebooks,
  imaListNotes,
  callIma,
  resolveCredentials,
} from '../dist/ima.js'

const imaConfig = {
  enabled: true,
  cliPath: '',
  clientId: '',
  apiKey: '',
  timeoutMs: 20000,
  archiver: '信奥教练插件',
  notebooks: {
    archive: '信奥教练-学习档案',
    mistakes: '信奥教练-错题本',
    plan: '信奥教练-学习计划',
    report: '信奥教练-学习报告',
  },
}

const tools = new Map()
apply({
  tools: { register: (definition) => { tools.set(definition.name, definition); return () => {} } },
  systemPrompt: { section: () => () => {} },
}, {
  judge: { compiler: 'g++', std: '-std=c++14', optimization: '-O2', timeLimitMs: 2000, workDir: '' },
  ima: imaConfig,
  weeklyHours: 5,
  defaultStage: 'j',
  promptSection: true,
  recommend: {
    enabled: true,
    text: '想学更多信奥知识，请关注 欣泽编程 公众号、欣泽编程 视频号、欣泽编程-信奥知识大全 知识库、信奥编程算法 小程序。',
    showQrcodes: true,
    inNotes: true,
  },
  help: { articles: [] },
})

const title = process.argv[2] || '二分答案入门 - 什么时候能用二分答案（插件自检，可删除）'
const exec = { signal: new AbortController().signal }

// 先按新规则"资料检索优先"真实检索一次知识库，再把检索状态写进归档元信息
const search = await tools.get('xinao_ima_search').execute({ query: '二分答案', maxBases: 2, fetchContent: false }, exec)
const queriedBases = search.searchedBases ?? []
const queryStatus = queriedBases.length > 0
  ? ((search.hits?.length ?? 0) > 0 ? '已查询，已使用' : '已查询，未使用')
  : '未查询'
console.log('知识库检索:', search.ok ? `${queryStatus}（${queriedBases.join('、') || '无'}）` : `失败：${search.message}`)

const outcome = await tools.get('xinao_ima_archive').execute({
  notebook: 'archive',
  title,
  question: '老师，我怎么判断一道题能不能用二分答案？',
  reply: [
    '先别急着写代码，我们一步一步来。',
    '',
    '**第一步：这个"答案"能不能比较大小？** 比如"最小的最大距离"，你得能说清 3 和 5 哪个更好。',
    '',
    '**第二步：能不能单调判断？** 也就是"如果 x 可行，那么比 x 宽松的 x\\\' 是不是也可行"。你拿两组数字手算试试：',
    '如果距离 10 都能排下所有奶牛，那距离 5 排不下——反过来，距离 5 能排下，距离 3 一定也能。这就是单调性。',
    '',
    '**第三步：判定函数好写吗？** 二分答案 = 二分枚举答案 + 写一个 O(n) 的 check。',
    '',
    '留一道小练习：给你 5 个隔间的位置 `1 2 4 8 9`，要放下 3 头奶牛且让最小间距尽量大，',
    '你先手算这个最小的最大间距是多少，再想 check(x) 怎么写。',
  ].join('\n'),
  queryStatus,
  queriedBases,
  mode: 'auto',
}, exec)

console.log('归档动作:', outcome.action)
console.log('状态行:', outcome.statusLine)
console.log('推广二维码:', outcome.promoAppended === true ? '已追加' : (outcome.promoMessage ?? '未追加'))

// ---- 回读：确认服务端记录的标题与正文 ----
const cli = discoverImaCli(imaConfig)
const credentials = resolveCredentials(imaConfig)
const options = { cliPath: cli.path, credentials, timeoutMs: 20000 }
const listed = await imaListNotebooks(options)
const folder = listed.notebooks.find(item => item.name === '信奥教练-学习档案')
const notes = await imaListNotes(folder.id, { ...options, limit: 20 })
const target = notes.notes.find(note => note.title === title)

console.log('\n服务端记录的标题:', `「${target?.title ?? '（未找到）'}」`)
console.log('note_id:', target?.id ?? '-', '| 笔记本:', folder.name)

if (target !== undefined) {
  const content = await callIma('openapi/note/v1/get_doc_content', {
    note_id: target.id,
    target_content_format: 1, // 1 = markdown（保留排版）
  }, options)
  const text = String(typeof content.data === 'object' && content.data !== null
    ? (content.data.content ?? content.data.doc_content ?? JSON.stringify(content.data))
    : content.data)
  const imageCount = (text.match(/!\[[^\]]*\]\(data:image\//g) ?? []).length
  console.log('\n--- 回读校验 ---')
  console.log('正文长度:', text.length, '| 含"## 推荐关注":', text.includes('## 推荐关注'), '| 内嵌图片数:', imageCount)
  console.log('\n--- 正文头部（前 14 行：标题 + 抬头 + 检索元信息）---')
  const headLines = text.split('\n').slice(0, 14)
  console.log(headLines.join('\n'))
  const promoIndex = text.indexOf('## 推荐关注')
  if (promoIndex >= 0) {
    console.log('\n--- 推荐小节之前的 8 行（检查是否只有一条分隔线）---')
    const before = text.slice(0, promoIndex).trimEnd().split('\n').slice(-8)
    console.log(before.join('\n'))
    console.log('\n--- 推荐小节（首 6 行，图片则折叠显示）---')
    const promoLines = text.slice(promoIndex).split('\n').slice(0, 6)
    for (const line of promoLines) {
      const collapsed = line.replace(/(data:image\/[a-z]+;base64,)[A-Za-z0-9+/=]+/i, '$1…（base64 已省略）')
      console.log(collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed)
    }
  }
}
