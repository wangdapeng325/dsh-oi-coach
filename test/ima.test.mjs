/**
 * dsh-oi-coach —— ima 接入模块测试。
 * 运行：node --test test/ima.test.mjs
 *
 * 用一个行为可控的假 ima_api.cjs（test/fixtures/fake_ima.cjs）验证：
 * 调用器定位、凭证优先级、API 调用与错误码映射、知识库检索、4 笔记本归档流程、归档模板格式。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_ARCHIVER,
  DEFAULT_NOTEBOOKS,
  archiveHeader,
  archiveToIma,
  buildArchiveMarkdown,
  buildMistakeMarkdown,
  callIma,
  discoverImaCli,
  formatDateTime,
  imageDataUrl,
  imaDoctor,
  imaListNotebooks,
  resolveCredentials,
  searchImaCli,
  searchImaKnowledge,
} from '../dist/ima.js'

const QR_SMALL = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'qrcodes', 'small')

const here = dirname(fileURLToPath(import.meta.url))
const FAKE_CLI = join(here, 'fixtures', 'fake_ima.cjs')

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    cliPath: FAKE_CLI,
    clientId: 'test-client',
    apiKey: 'test-key',
    timeoutMs: 15_000,
    archiver: DEFAULT_ARCHIVER,
    notebooks: { ...DEFAULT_NOTEBOOKS },
    ...overrides,
  }
}

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'dsh-xinao-home-'))
}

// ---------------------------------------------------------------------------
// 纯函数：模板
// ---------------------------------------------------------------------------

test('archiveHeader：归档人 + 归档时间（yyyy-MM-dd HH:mm:ss），上下各一条分隔线', () => {
  assert.equal(
    archiveHeader('2026-10-12 20:18:20'),
    '---\n\n归档人：信奥教练插件\n归档时间：2026-10-12 20:18:20\n\n---\n',
  )
  assert.ok(archiveHeader('2026-10-12 20:18:20', '自定义署名').includes('归档人：自定义署名'))
})

test('archiveHeader：传入 meta 时，检索三项紧跟在归档时间下面（无圆点）', () => {
  const header = archiveHeader('2026-10-12 20:18:20', '信奥教练插件', {
    queryStatus: '已查询，已使用',
    queriedBases: ['信奥知识库', '大话信奥'],
  })
  assert.equal(
    header,
    '---\n\n归档人：信奥教练插件\n归档时间：2026-10-12 20:18:20\n' +
      '是否查询知识库：已查询\n是否使用知识库内容：已使用\n实际检索知识库：信奥知识库、大话信奥\n\n---\n',
  )
  assert.ok(!header.includes('- 是否查询知识库'), '不应带圆点')
})

test('buildArchiveMarkdown：H1 首行（ima 用首行当标题）+ 抬头内含检索元信息', () => {
  const md = buildArchiveMarkdown({
    title: 'P7077 [CSP-S 2020] 函数调用 - 为什么调用顺序会影响结果',
    time: '2026-10-12 20:01:02',
    question: '这题的顺序为什么有影响？',
    reply: '我们先看你手算的那组数据……',
    queryStatus: '已查询，已使用',
    queriedBases: ['信奥知识库'],
  })
  // 第一行必须是标题（ima 取首行作为笔记标题）
  assert.ok(md.startsWith('# P7077 [CSP-S 2020] 函数调用 - 为什么调用顺序会影响结果\n'), '首行必须是 H1 标题')
  // 抬头被两条分隔线夹住，且检索三项在归档时间下面（无圆点）
  assert.ok(
    md.includes('---\n\n归档人：信奥教练插件\n归档时间：2026-10-12 20:01:02\n' +
      '是否查询知识库：已查询\n是否使用知识库内容：已使用\n实际检索知识库：信奥知识库\n\n---\n'),
    '抬头内应含归档人/归档时间/检索三项，且前后留空行',
  )
  assert.ok(md.indexOf('归档人：') < md.indexOf('## 用户提问'), '抬头应在正文内容之前')
  assert.ok(md.includes('## 用户提问'))
  assert.ok(md.includes('## 教练回复'))
  // 底部不再有"归档元信息"小节，也没有圆点列表
  assert.ok(!md.includes('## 归档元信息'), '底部不应再有归档元信息小节')
  assert.ok(!md.includes('- 是否查询知识库'), '不应带圆点')
  assert.equal(md.split('归档时间：').length - 1, 1, '全文只应出现一次"归档时间："')
  assert.ok(!md.includes('2026-10-12 20:01:02 #'), '标题行不得含日期')
})

test('buildArchiveMarkdown：署名可配置', () => {
  const md = buildArchiveMarkdown({
    title: '前缀和是什么',
    time: '2026-10-12 20:01:02',
    reply: '前缀和就是把前 i 项加起来……',
    queryStatus: '未查询',
    queriedBases: [],
    archiver: '我的信奥教练',
  })
  assert.ok(md.startsWith('# 前缀和是什么\n'))
  assert.ok(md.includes('\n归档人：我的信奥教练\n归档时间：2026-10-12 20:01:02\n'))
})

test('buildArchiveMarkdown：未查询时抬头内为未查询/无（无圆点）', () => {
  const md = buildArchiveMarkdown({
    title: '前缀和是什么',
    time: '2026-10-12 20:01:02',
    reply: '前缀和就是把前 i 项加起来……',
    queryStatus: '未查询',
    queriedBases: [],
  })
  assert.ok(md.includes('归档时间：2026-10-12 20:01:02\n是否查询知识库：未查询\n是否使用知识库内容：未使用\n实际检索知识库：无\n\n---\n'))
  assert.ok(!md.includes('- 是否查询知识库'))
  assert.ok(!md.includes('## 用户提问'))
})

test('buildMistakeMarkdown：包含错题模板全部字段', () => {
  const md = buildMistakeMarkdown({
    title: 'P1177 排序 - 边界漏写',
    time: '2026-10-12 20:01:02',
    source: '洛谷 P1177 / 2026-10-12',
    phenomenon: 'WA',
    mistakeType: '边界遗漏',
    blocker: '把 n=1 的情况漏了',
    correctIdea: '先处理 n<=1 直接输出',
    reviewQa: '数据范围下界要单独想一遍',
    topic: '排序进阶（入门）',
    reviewDate: '2026-10-15',
  })
  for (const field of ['日期 / 题号来源', '错误现象', '错误类型', '卡点记录', '正确思路', '复盘提问答案', '所属知识点', '待复习标记']) {
    assert.ok(md.includes(field), `缺少字段：${field}`)
  }
  assert.ok(md.startsWith('# P1177 排序 - 边界漏写\n'), '首行必须是 H1 标题')
  assert.ok(md.includes('\n归档人：信奥教练插件\n归档时间：2026-10-12 20:01:02\n'), '错题本正文也要带抬头')
  assert.ok(md.includes('待复习标记：是（建议复习日期：2026-10-15）'))
})

test('formatDateTime：YYYY-MM-DD HH:mm:ss', () => {
  const text = formatDateTime(new Date(2026, 9, 12, 8, 5, 3))
  assert.equal(text, '2026-10-12 08:05:03')
})

// ---------------------------------------------------------------------------
// 定位与凭证
// ---------------------------------------------------------------------------

test('discoverImaCli：config 指定优先，其次环境变量', () => {
  const home = tempHome()
  try {
    const byConfig = discoverImaCli({ cliPath: FAKE_CLI }, { homeDir: home, env: {} })
    assert.equal(byConfig?.path, FAKE_CLI)
    assert.equal(byConfig?.source, 'config')

    const byEnv = discoverImaCli({ cliPath: '' }, { homeDir: home, env: { IMA_API_CJS: FAKE_CLI } })
    assert.equal(byEnv?.path, FAKE_CLI)
    assert.equal(byEnv?.source, 'env')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('searchImaCli：能在技能目录中按深度找到 ima_api.cjs', () => {
  const home = tempHome()
  try {
    const dir = join(home, '.workbuddy', 'skills', 'ima-skill')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'ima_api.cjs'), '// fake')
    const found = searchImaCli([join(home, '.workbuddy', 'skills')])
    assert.equal(found.length, 1)
    assert.equal(found[0], join(dir, 'ima_api.cjs'))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('resolveCredentials：config → env → 文件 优先级', () => {
  const home = tempHome()
  try {
    mkdirSync(join(home, '.config', 'ima'), { recursive: true })
    writeFileSync(join(home, '.config', 'ima', 'client_id'), 'file-id')
    writeFileSync(join(home, '.config', 'ima', 'api_key'), 'file-key')

    assert.equal(resolveCredentials({ clientId: 'c-id', apiKey: 'c-key' }, { homeDir: home, env: {} }).source, 'config')
    assert.equal(resolveCredentials({ clientId: '', apiKey: '' }, { homeDir: home, env: { IMA_CLIENT_ID: 'e-id', IMA_API_KEY: 'e-key' } }).source, 'env')
    const fromFile = resolveCredentials({ clientId: '', apiKey: '' }, { homeDir: home, env: {} })
    assert.equal(fromFile.source, 'file')
    assert.equal(fromFile.clientId, 'file-id')
    assert.equal(resolveCredentials({ clientId: '', apiKey: '' }, { homeDir: join(home, 'nope'), env: {} }).source, 'none')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// API 调用
// ---------------------------------------------------------------------------

test('callIma：鉴权失败映射为 auth（200002）', async () => {
  const prev = process.env.FAKE_IMA_MODE
  process.env.FAKE_IMA_MODE = 'auth'
  try {
    const response = await callIma('openapi/note/v1/list_notebook', { cursor: '0', limit: 20 }, {
      cliPath: FAKE_CLI,
      credentials: { clientId: 'a', apiKey: 'b', source: 'config' },
    })
    assert.equal(response.ok, false)
    assert.equal(response.code, 200002)
    assert.equal(response.kind, 'auth')
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_MODE
    else process.env.FAKE_IMA_MODE = prev
  }
})

// ---------------------------------------------------------------------------
// 知识库检索
// ---------------------------------------------------------------------------

test('searchImaKnowledge：返回命中与实际检索库名', async () => {
  const outcome = await searchImaKnowledge(
    { query: '归并排序', maxBases: 2, fetchContent: true },
    { config: baseConfig(), env: {} },
  )
  assert.equal(outcome.ok, true)
  assert.deepEqual(outcome.searchedBases, ['信奥知识库', '算法竞赛资料'])
  assert.equal(outcome.hits.length, 2)
  assert.equal(outcome.hits[0].title, '归并排序求逆序对')
  assert.ok(outcome.hits[0].highlight.includes('O(n log n)'))
  assert.equal(outcome.media.length, 1)
  assert.equal(outcome.media[0].noteId, 'n-77')
  assert.equal(outcome.media[0].url, 'https://example.com/doc.md')
})

test('imaListNotebooks：解析 folder_id/name（note_number 为字符串）', async () => {
  const listed = await imaListNotebooks({
    cliPath: FAKE_CLI,
    credentials: { clientId: 'a', apiKey: 'b', source: 'config' },
  })
  assert.equal(listed.response.ok, true)
  const archive = listed.notebooks.find(item => item.name === '信奥教练-学习档案')
  assert.equal(archive?.id, 'f-archive')
  assert.equal(archive?.noteNumber, 1)
})

test('searchImaKnowledge：未启用时如实返回未查询', async () => {
  const outcome = await searchImaKnowledge(
    { query: '线段树', maxBases: 2, fetchContent: false },
    { config: baseConfig({ enabled: false }), env: {} },
  )
  assert.equal(outcome.ok, false)
  assert.equal(outcome.searchedBases.length, 0)
  assert.ok(outcome.message.includes('未启用'))
})

test('searchImaKnowledge：鉴权失败标记 authFailed', async () => {
  const prev = process.env.FAKE_IMA_MODE
  process.env.FAKE_IMA_MODE = 'auth'
  try {
    const outcome = await searchImaKnowledge(
      { query: '线段树', maxBases: 2, fetchContent: false },
      { config: baseConfig(), env: {} },
    )
    assert.equal(outcome.ok, false)
    assert.equal(outcome.authFailed, true)
    assert.ok(outcome.message.includes('200002'))
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_MODE
    else process.env.FAKE_IMA_MODE = prev
  }
})

// ---------------------------------------------------------------------------
// 归档
// ---------------------------------------------------------------------------

test('archiveToIma：新建笔记到 信奥教练-学习档案', async () => {
  const state = join(tempHome(), 'state.json')
  const prev = process.env.FAKE_IMA_STATE
  process.env.FAKE_IMA_STATE = state
  try {
    const outcome = await archiveToIma({
      notebookKey: 'archive',
      title: '前缀和是什么',
      question: '老师，前缀和是什么呀？',
      reply: '我们先看一个具体例子……',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'auto',
      now: new Date(2026, 9, 12, 20, 1, 2),
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.action, 'created')
    assert.equal(outcome.notebook, '信奥教练-学习档案')
    assert.equal(outcome.noteId, 'note-1')
    assert.ok(outcome.statusLine.startsWith('[归档：成功 note_id=note-1'))
    // 真实落到"笔记"里的正文：首行是标题（ima 据此取标题），紧随归档人/归档时间
    const stored = JSON.parse(readFileSync(state, 'utf8'))
    const content = stored.notes[0].content
    assert.ok(content.startsWith('# 前缀和是什么\n'), '首行必须是标题')
    assert.ok(content.includes('\n归档人：信奥教练插件\n归档时间：2026-10-12 20:01:02\n'))
    assert.equal(stored.notes[0].title, '前缀和是什么')
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_STATE
    else process.env.FAKE_IMA_STATE = prev
  }
})

test('imageDataUrl：读取 100×100 二维码为 data URL', () => {
  const dataUrl = imageDataUrl(join(QR_SMALL, 'wechat-official.jpg'))
  assert.ok(dataUrl?.startsWith('data:image/jpeg;base64,'))
  assert.ok((dataUrl ?? '').length > 1000)
  assert.equal(imageDataUrl(join(QR_SMALL, 'not-exists.jpg')), undefined)
})

test('archiveToIma：归档后把"推荐关注 + 横向二维码条"追加到笔记末尾', async () => {
  const state = join(tempHome(), 'state.json')
  const prev = process.env.FAKE_IMA_STATE
  process.env.FAKE_IMA_STATE = state
  const promo = {
    text: '想学更多信奥知识，请关注 欣泽编程 公众号、欣泽编程 视频号、欣泽编程-信奥知识大全 知识库、信奥编程算法 小程序。',
    // 4 张 100×100 一行展示、间隔 50 的横向拼接图
    strip: join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'qrcodes', 'note-qrcodes.jpg'),
    images: [
      { label: '欣泽编程 公众号', path: join(QR_SMALL, 'wechat-official.jpg') },
    ],
  }
  try {
    const outcome = await archiveToIma({
      notebookKey: 'archive',
      title: '推广追加验证',
      reply: '正文',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'create',
      promo,
      now: new Date(2026, 9, 12, 20, 1, 2),
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.action, 'created')
    assert.equal(outcome.promoAppended, true)
    const stored = JSON.parse(readFileSync(state, 'utf8'))
    const content = stored.notes[0].content
    assert.ok(content.includes('## 推荐关注'), '笔记末尾应有推荐小节')
    assert.ok(content.includes('欣泽编程 公众号'), '应含推广文案')
    // 提供 strip 时只追加一张图（一行展示）
    assert.equal((content.match(/!\[[^\]]*\]\(data:image\/jpeg;base64,/g) ?? []).length, 1)
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_STATE
    else process.env.FAKE_IMA_STATE = prev
  }
})

test('archiveToIma：没有 strip 时按 images 逐张追加', async () => {
  const state = join(tempHome(), 'state.json')
  const prev = process.env.FAKE_IMA_STATE
  process.env.FAKE_IMA_STATE = state
  try {
    const outcome = await archiveToIma({
      notebookKey: 'archive',
      title: '逐张追加验证',
      reply: '正文',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'create',
      promo: {
        text: '想学更多信奥知识，请关注 欣泽编程。',
        images: [
          { label: '欣泽编程 公众号', path: join(QR_SMALL, 'wechat-official.jpg') },
          { label: '信奥编程算法 小程序', path: join(QR_SMALL, 'mini-program.jpg') },
        ],
      },
      now: new Date(2026, 9, 12, 20, 1, 2),
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.promoAppended, true)
    const stored = JSON.parse(readFileSync(state, 'utf8'))
    assert.equal((stored.notes[0].content.match(/!\[[^\]]*\]\(data:image\/jpeg;base64,/g) ?? []).length, 2)
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_STATE
    else process.env.FAKE_IMA_STATE = prev
  }
})

test('archiveToIma：auto 模式同名笔记改为追加', async () => {
  const state = join(tempHome(), 'state.json')
  const prev = process.env.FAKE_IMA_STATE
  process.env.FAKE_IMA_STATE = state
  const request = {
    notebookKey: 'archive',
    title: '线段树入门',
    question: '线段树怎么建树？',
    reply: '先想清楚每个节点存什么……',
    queryStatus: '已查询，未使用',
    queriedBases: ['信奥知识库'],
    mode: 'auto',
    now: new Date(2026, 9, 12, 20, 1, 2),
  }
  try {
    const first = await archiveToIma(request, { config: baseConfig(), env: {} })
    assert.equal(first.action, 'created')
    const second = await archiveToIma({ ...request, reply: '补充：懒标记的理解' }, { config: baseConfig(), env: {} })
    assert.equal(second.action, 'appended')
    assert.equal(second.noteId, 'note-1')
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_STATE
    else process.env.FAKE_IMA_STATE = prev
  }
})

test('archiveToIma：错题本用错题模板写入', async () => {
  const state = join(tempHome(), 'state.json')
  const prev = process.env.FAKE_IMA_STATE
  process.env.FAKE_IMA_STATE = state
  try {
    const outcome = await archiveToIma({
      notebookKey: 'mistakes',
      title: 'P1177 排序 - 边界漏写',
      reply: '（错题模板正文）',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'create',
      mistake: {
        source: '洛谷 P1177',
        phenomenon: 'WA',
        mistakeType: '边界遗漏',
        blocker: '漏了 n=1',
        correctIdea: '特判 n<=1',
        reviewQa: '先看数据下界',
        topic: '排序进阶',
      },
      now: new Date(2026, 9, 12, 20, 1, 2),
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.action, 'created')
    assert.equal(outcome.notebook, '信奥教练-错题本')
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_STATE
    else process.env.FAKE_IMA_STATE = prev
  }
})

test('archiveToIma：笔记本不存在时跳过（绝不落到根目录）', async () => {
  const prev = process.env.FAKE_IMA_MODE
  process.env.FAKE_IMA_MODE = 'no-notebooks'
  try {
    const outcome = await archiveToIma({
      notebookKey: 'plan',
      title: '十月备考计划',
      reply: '本周先补线段树……',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'auto',
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.action, 'skipped')
    assert.equal(outcome.noteId, undefined)
    assert.ok(outcome.message.includes('不存在'))
    assert.ok(outcome.statusLine.startsWith('[归档：跳过'))
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_MODE
    else process.env.FAKE_IMA_MODE = prev
  }
})

test('archiveToIma：鉴权失败如实报错并带错误码', async () => {
  const prev = process.env.FAKE_IMA_MODE
  process.env.FAKE_IMA_MODE = 'auth'
  try {
    const outcome = await archiveToIma({
      notebookKey: 'archive',
      title: '任意主题',
      reply: '正文',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'auto',
    }, { config: baseConfig(), env: {} })
    assert.equal(outcome.action, 'failed')
    assert.equal(outcome.code, 200002)
    assert.ok(outcome.statusLine.includes('code=200002'))
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_MODE
    else process.env.FAKE_IMA_MODE = prev
  }
})

test('archiveToIma：未配置凭证时跳过且不调用接口', async () => {
  const home = tempHome()
  try {
    const outcome = await archiveToIma({
      notebookKey: 'archive',
      title: '任意主题',
      reply: '正文',
      queryStatus: '未查询',
      queriedBases: [],
      mode: 'auto',
    }, { config: baseConfig({ clientId: '', apiKey: '' }), homeDir: home, env: {} })
    assert.equal(outcome.action, 'skipped')
    assert.ok(outcome.message.includes('未配置 IMA 凭证'))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('imaDoctor：4 个笔记本就绪时 connected=true', async () => {
  const report = await imaDoctor({ config: baseConfig(), env: {} })
  assert.equal(report.connected, true)
  assert.equal(report.notebooks.length, 4)
  assert.ok(report.notebooks.every(item => item.exists))
  assert.equal(report.credentials, 'config')
  assert.ok(report.message.includes('就绪'))
})

test('imaDoctor：缺失笔记本时给出缺失清单', async () => {
  const prev = process.env.FAKE_IMA_MODE
  process.env.FAKE_IMA_MODE = 'no-notebooks'
  try {
    const report = await imaDoctor({ config: baseConfig(), env: {} })
    assert.equal(report.connected, true)
    assert.ok(report.notebooks.every(item => !item.exists))
    assert.ok(report.message.includes('信奥教练-学习档案'))
  } finally {
    if (prev === undefined) delete process.env.FAKE_IMA_MODE
    else process.env.FAKE_IMA_MODE = prev
  }
})
