/**
 * 真实知识点问答 + 归档 端到端验证（手动运行）：
 *   1) 先按"资料检索优先"检索 ima 知识库；
 *   2) 用 xinao_knowledge 取知识点（前置/难度/讲解大纲）；
 *   3) 模拟一轮真实陪练对话（学生提问 → 教练式回答）；
 *   4) 把问答归档到「信奥教练-学习档案」并回读。
 *
 * 用法（需在 dsh 仓库根目录运行）：
 *   node <REPO>/node_modules/tsx/dist/cli.mjs <REPO>/dsh-oi-coach/test/real-qa.mjs [场景]
 * 场景：bit（树状数组，默认）| dsu（并查集）
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

const SCENARIOS = {
  bit: {
    searchQuery: '树状数组 lowbit',
    topic: '树状数组',
    title: 'P3374 【模板】树状数组 1 - lowbit 原理答疑',
    question: 'P3374【模板】树状数组 1 的 add 和 query 我能背下来，但 lowbit 为什么能定位到父节点，理解不了这个原理。',
    reply: [
      '这个问题问得好——你不是背不下来，是缺"每个点管着哪一段"这层直觉。我们先不写代码，问三句：',
      '',
      '1. 你的 `add(i)` 里 `i += lowbit(i)`，`query(i)` 里 `i -= lowbit(i)`，这两条路径你手算过吗？拿 `i=6` 算一遍。',
      '2. `lowbit(6)` 等于多少？它取的是二进制里的哪一位？',
      '3. 树状数组里 `c[i]` 到底存的是哪一段的和？',
      '',
      '**先讲结论，再回代码里对：**',
      '',
      '`lowbit(x) = x & -x`，取的是 `x` 二进制**最低位的 1**（以及它后面所有 0）。',
      '- `x = 6 = 110`，最低位 1 是第 1 位（值 2），所以 `lowbit(6) = 2`。',
      '- `x = 8 = 1000`，`lowbit = 8`。',
      '',
      '**每个点管哪段？** 树状数组里 `c[i]` 管的区间是 `(i - lowbit(i), i]`：',
      '- `c[6]` 管 `(4, 6]`，即 `a[5] + a[6]`；',
      '- `c[4]` 管 `(0, 4]`，即 `a[1] + a[2] + a[3] + a[4]`。',
      '',
      '**为什么 `i + lowbit(i)` 是父节点？** 因为父节点管辖的区间，是那些把最低位 1 进位后覆盖的更长的区间。',
      '`6 + lowbit(6) = 8`，`c[8]` 管 `(0, 8]`，正好完整包含 `c[6]` 的范围；再往上 `8 + 8 = 16`……',
      '所以 `add(6)` 要一路更新 `c[6] → c[8] → c[16]`。',
      '',
      '**反过来 `query(i)` 为什么是 `i -= lowbit(i)`？** 要把 `(0, i]` 拆成互不重叠的几段：',
      '`query(7)`：`c[7]` 管 `(6,7]`，减成 `6`；`c[6]` 管 `(4,6]`，减成 `4`；`c[4]` 管 `(0,4]`，减成 `0` 结束。',
      '',
      '**常见错误**：`lowbit(0) = 0` 导致死循环（下标从 1 开始就避开了）；漏了 `long long`。',
      '',
      '**练习**：手算 `i=11` 的 `add` 路径与 `query` 路径，再对着代码走一遍——这一步走通，低位的 1 你就真的懂了。',
    ].join('\n'),
  },
  dsu: {
    searchQuery: '并查集 路径压缩',
    topic: '并查集',
    title: 'P3367 【模板】并查集 - 路径压缩为什么能变快',
    question: 'P3367【模板】并查集，我只会暴力合并：`fa[x] = y` 然后一路往上找根。为什么加了路径压缩就快那么多？会不会改完数据就不对了？',
    reply: [
      '这个问题很关键，而且你担心的"改完数据不对"正好是新手最容易卡的点。我们先问三句：',
      '',
      '1. 你手算一下：`1→2→3→4→5` 这样一条链，查 `5` 的根要往上走几步？',
      '2. 查完之后，`2`、`3`、`4` 的 `fa` 还是原来的值吗？',
      '3. 路径压缩改变的是"谁指向谁"，还是"谁和谁连通"？',
      '',
      '**结论先说：** 路径压缩只改**指向关系**（让点直接指到根），完全不改变**连通性**，所以结果不会错。',
      '',
      '**为什么快？** 查根时把路径上所有点都直接挂到根上：',
      '`find(5)` 沿 `5→4→3→2→1` 找到根 `1`，然后把 `5`、`4`、`3`、`2` 的 `fa` 全部改成 `1`。',
      '下次再查 `5`，一步就到；查 `4`、`3`、`2` 也都是一步。',
      '',
      '**复杂度**：路径压缩 + 按秩合并，均摊复杂度是反阿克曼函数 `α(n)`，实际可看作接近常数；单次最坏 O(log n)。',
      '',
      '**实现要点：**',
      '- 初始化 `fa[i] = i`；',
      '- 递归压缩：`int find(int x){ return fa[x] == x ? x : fa[x] = find(fa[x]); }`，注意 `fa[x] = ...` 的赋值别漏；',
      '- 合并前先 `find` 两个根，别直接用原始下标；',
      '- 这题数据不大，但养成"按秩合并"习惯，避免退化成链。',
      '',
      '**练习**：手算 `union(2,3)`、`union(3,4)`、`find(4)` 之后每个点的 `fa` 值，再对着代码走一遍。',
    ].join('\n'),
  },
}

const scenarioName = process.argv[2] ?? 'bit'
const scenario = SCENARIOS[scenarioName] ?? SCENARIOS.bit
const exec = { signal: new AbortController().signal }

// ---- 1) 资料检索优先 -------------------------------------------------------
const search = await tools.get('xinao_ima_search').execute({ query: scenario.searchQuery, maxBases: 2, fetchContent: false }, exec)
const queriedBases = search.searchedBases ?? []
const queryStatus = queriedBases.length > 0
  ? ((search.hits?.length ?? 0) > 0 ? '已查询，已使用' : '已查询，未使用')
  : '未查询'
console.log('知识库检索:', search.ok ? `${queryStatus}（${queriedBases.join('、') || '无'}）` : `失败：${search.message}`)
for (const hit of (search.hits ?? []).slice(0, 3)) {
  console.log(`  - 【${hit.knowledgeBase}】${hit.title}`)
}

// ---- 2) 知识点 ---------------------------------------------------------------
const knowledge = await tools.get('xinao_knowledge').execute({ topic: scenario.topic, depth: 'detailed' }, exec)
console.log('\n知识点:', knowledge.topic, '| 阶段:', knowledge.stage, '| 难度:', knowledge.difficulty, '| 前置:', (knowledge.prerequisites ?? []).join('、'))

// ---- 3+4) 归档 -----------------------------------------------------------------
const outcome = await tools.get('xinao_ima_archive').execute({
  notebook: 'archive',
  title: scenario.title,
  question: scenario.question,
  reply: scenario.reply,
  queryStatus,
  queriedBases,
  mode: 'create',
}, exec)

console.log('\n归档动作:', outcome.action, '| 状态行:', outcome.statusLine)
console.log('推广二维码:', outcome.promoAppended === true ? '已追加' : (outcome.promoMessage ?? '未追加'))

// ---- 5) 回读 ----------------------------------------------------------------
const cli = discoverImaCli(imaConfig)
const credentials = resolveCredentials(imaConfig)
const options = { cliPath: cli.path, credentials, timeoutMs: 20000 }
const listed = await imaListNotebooks(options)
const folder = listed.notebooks.find(item => item.name === '信奥教练-学习档案')
const notes = await imaListNotes(folder.id, { ...options, limit: 20 })
const target = notes.notes.find(note => note.title === scenario.title)
console.log('\n服务端标题:', `「${target?.title ?? '（未找到）'}」`, '| note_id:', target?.id ?? '-')
if (target !== undefined) {
  const content = await callIma('openapi/note/v1/get_doc_content', { note_id: target.id, target_content_format: 1 }, options)
  const text = String(content.data?.content ?? content.data?.doc_content ?? '')
  console.log('正文头部（前 12 行）:')
  console.log(text.split('\n').slice(0, 12).join('\n'))
  console.log('...')
  console.log('内嵌图片数:', (text.match(/!\[[^\]]*\]\(data:image\//g) ?? []).length)
}
