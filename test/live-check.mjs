/**
 * 真实环境联通性自检（手动运行，不在 node --test 里跑）。
 *
 * 以 dsh 的实际加载方式（tsx + 仓库 tsconfig paths）加载插件，注册全部工具，
 * 并用真实 ima 凭证做**只读**检查（列笔记本 + 知识库检索）。
 * 不会写入任何 ima 笔记。
 *
 * 运行（必须在 dsh 仓库根目录，tsx 才找得到 tsconfig 的 paths）：
 *   node <REPO>/node_modules/tsx/dist/cli.mjs <REPO>/dsh-oi-coach/test/live-check.mjs
 */
import { DEFAULT_HELP_ARTICLES, apply } from '../dist/index.js'

const tools = new Map()
const sections = []
const ctx = {
  tools: { register: (definition) => { tools.set(definition.name, definition); return () => {} } },
  systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
}

apply(ctx, {
  judge: { compiler: 'g++', std: '-std=c++14', optimization: '-O2', timeLimitMs: 2000, workDir: '' },
  ima: {
    enabled: true,
    cliPath: '',
    clientId: '',
    apiKey: '',
    timeoutMs: 20000,
    notebooks: {
      archive: '信奥教练-学习档案',
      mistakes: '信奥教练-错题本',
      plan: '信奥教练-学习计划',
      report: '信奥教练-学习报告',
    },
  },
  weeklyHours: 5,
  defaultStage: 'j',
  promptSection: true,
  recommend: {
    enabled: true,
    text: '想学更多信奥知识，请关注 欣泽编程 公众号、欣泽编程 视频号、欣泽编程-信奥知识大全 知识库、信奥编程算法 小程序。',
    showQrcodes: true,
  },
  help: {
    articles: [...DEFAULT_HELP_ARTICLES],
  },
})

console.log('已注册工具:', [...tools.keys()].join(', '))
console.log('提示词段落:', sections.map(section => `${section.name}@${section.order}`).join(', ') || '（无）')
if (tools.size !== 7) {
  console.error(`FAIL: 期望 7 个工具，实际 ${tools.size}`)
  process.exit(1)
}
// 教练规则里应带出推荐内容（第 9 条），并规定只在适当时机出现
const coachSection = sections.find(section => section.name === 'xinao:coach-rules')
const coachText = typeof coachSection?.text === 'string' ? coachSection.text : ''
if (!coachText.includes('欣泽编程 公众号') || !coachText.includes('信奥编程算法 小程序')) {
  console.error('FAIL: 教练规则段落里的推荐内容不完整（应含公众号与小程序）')
  process.exit(1)
}
if (!coachText.includes('9. 资源推荐')) {
  console.error('FAIL: 教练规则段落缺少"资源推荐/适当时机"条款')
  process.exit(1)
}
console.log('资源推荐条款: 已注入 ✅')
// 资料检索优先：信奥相关提问先查 ima 知识库
if (!coachText.includes('资料检索优先') || !coachText.includes('先调用 xinao_ima_search')) {
  console.error('FAIL: 教练规则段落缺少"资料检索优先（先查 ima 知识库）"条款')
  process.exit(1)
}
console.log('资料检索优先条款: 已注入 ✅')
// 使用帮助条款：不会用时给的上手路径 + 两篇文章链接
if (!coachText.includes('10. 使用帮助')) {
  console.error('FAIL: 教练规则段落缺少"使用帮助"条款')
  process.exit(1)
}
for (const url of [
  'https://mp.weixin.qq.com/s/wCZ45tAxpPhkA7z5YpnvMg',
  'https://mp.weixin.qq.com/s/wCnaFl_hdgbWMS10qbizCg',
  'https://mp.weixin.qq.com/s/gJ7AuyBbYIyUTTzLmF9hqw',
  'https://mp.weixin.qq.com/s/6xZbOt232HGVZfLxKrzpKA',
]) {
  if (!coachText.includes(url)) {
    console.error(`FAIL: 使用帮助条款里缺少文章链接 ${url}`)
    process.exit(1)
  }
}
console.log('使用帮助条款: 已注入 ✅（含 4 篇文章链接）')
// 推荐关注小节：回复末尾的「## 推荐关注」+ 一行四个的二维码条图
if (!coachText.includes('## 推荐关注')) {
  console.error('FAIL: 教练规则段落缺少「## 推荐关注」小节说明')
  process.exit(1)
}
if (!coachText.includes('note-qrcodes.jpg')) {
  console.error('FAIL: 推荐关注小节里缺少二维码条图路径')
  process.exit(1)
}
console.log('推荐关注小节: 已注入 ✅（含二维码条图路径）')

const exec = { signal: new AbortController().signal }

console.log('\n=== xinao_doctor ===')
const doctor = await tools.get('xinao_doctor').execute({}, exec)
console.log('插件版本:', doctor.pluginVersion)
console.log('g++:', doctor.compiler?.ok
  ? `就绪 ${doctor.compiler.version ?? ''}`
  : `不可用（${doctor.compiler?.message ?? '未检测'}）`)
console.log('ima connected:', doctor.ima?.connected, '| 凭证来源:', doctor.ima?.credentials)
console.log('ima 调用器:', doctor.ima?.cliPath ?? '未找到', `(${doctor.ima?.cliSource ?? '-'})`)
for (const notebook of doctor.ima?.notebooks ?? []) {
  console.log(`  ${notebook.exists ? '✅' : '❌'} ${notebook.name}${notebook.folderId ? ` (${notebook.folderId})` : ''}`)
}
console.log('结论:', doctor.ima?.message)
console.log('账号内笔记本:', (doctor.ima?.availableNotebooks ?? []).join('、') || '（无）')

console.log('\n=== xinao_ima_search（只读）===')
const search = await tools.get('xinao_ima_search').execute({ query: '信奥 算法', maxBases: 2, fetchContent: false }, exec)
console.log('ok:', search.ok, '|', search.message)
console.log('实际检索库:', search.searchedBases.join('、') || '（无）')
for (const hit of search.hits.slice(0, 3)) {
  console.log(`  - 【${hit.knowledgeBase}】${hit.title}${hit.highlight ? ` — ${hit.highlight.slice(0, 80)}` : ''}`)
}

console.log('\n=== xinao_plan（路线图末尾应带资源推荐）===')
const plan = await tools.get('xinao_plan').execute({ targetStage: 'j', fromStage: 'entry', weeklyHours: 5 }, exec)
console.log('阶段数:', plan.stages.length, '| 总周数:', plan.totalWeeks)
console.log('推荐:', plan.recommendation ?? '（无）')
if (!String(plan.recommendation ?? '').includes('欣泽编程')) {
  console.error('FAIL: 路线图输出未带出推荐内容')
  process.exit(1)
}

console.log('\n=== 归档能力（本次未写入真实账号）===')
const archive = tools.get('xinao_ima_archive')
console.log('xinao_ima_archive 参数:', Object.keys(archive.parameters.properties ?? {}).join(', '))
console.log('如需真实验证写入，可在 GUI 里说："把这轮问答归档到学习档案。"')
