/**
 * dsh-oi-coach —— 信奥教练插件（功能对齐 oi-coach 技能）。
 *
 * 为 DeepSeek Harness 注册面向"信息学奥林匹克竞赛（GESP / CSP-J/S、NOIP、NOI）"
 * 教学场景的模型工具与教练规则提示词：
 *
 * - xinao_doctor      环境自检（g++ 是否可真实评测 + ima 凭证/调用器/4 个笔记本就绪）
 * - xinao_plan        制定学习路线图（内置知识图谱推导）
 * - xinao_knowledge   讲解知识点（图谱匹配 + 讲解大纲）
 * - xinao_problem     生成练习题（命题要点 + 评测建议，支持螺旋递进）
 * - xinao_judge       评测 C++ 代码（真实编译运行，逐测试点判定 AC/WA/TLE/RE）
 * - xinao_ima_search  检索使用者的 ima 知识库（透明列出实际检索的库名）
 * - xinao_ima_archive 归档本轮问答/错题/计划/报告到 4 个 ima 笔记本
 *
 * 插件形态：函数插件（name/inject/apply/Config），加载即注册工具与提示词段落。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { STAGE_IDS, STAGES, buildRoadmap, resolveTopic, stageById, suggestTopics, } from "./knowledge.js";
import { checkCompiler, judgeCpp, } from "./judge.js";
import { DEFAULT_ARCHIVER, DEFAULT_NOTEBOOKS, archiveToIma, imaDoctor, searchImaKnowledge, } from "./ima.js";
export const name = 'dsh-oi-coach';
export const inject = ['tools', 'systemPrompt'];
/** 二维码资源目录：dist/index.js 的上一级 assets/qrcodes。 */
const QRCODE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'qrcodes');
/** 推广渠道与对应二维码文件名（位于 assets/qrcodes/）。 */
export const QRCODE_CHANNELS = [
    { label: '欣泽编程 公众号', file: 'wechat-official.jpg' },
    { label: '欣泽编程 视频号', file: 'wechat-channels.jpg' },
    { label: '欣泽编程-信奥知识大全 知识库', file: 'ima-kb.jpg' },
    { label: '信奥编程算法 小程序', file: 'mini-program.jpg' },
];
/** 四个渠道二维码的绝对路径（供提示词与文档引用）。 */
export function qrcodeImagePaths() {
    return QRCODE_CHANNELS.map(channel => join(QRCODE_DIR, channel.file));
}
/** 插件版本（与 package.json、README 保持一致）。 */
export const PLUGIN_VERSION = '1.0.8';
/** 默认推荐文案（可在配置 recommend.text 中替换）。 */
export const DEFAULT_RECOMMEND_TEXT = '想学更多信奥知识，请关注 欣泽编程 公众号、欣泽编程 视频号、欣泽编程-信奥知识大全 知识库、信奥编程算法 小程序。';
/** 默认使用帮助文章（使用者不会用时由教练原样发出，可在配置 help.articles 中替换）。 */
export const DEFAULT_HELP_ARTICLES = [
    '[学习系统和AI工具](https://mp.weixin.qq.com/s/wCZ45tAxpPhkA7z5YpnvMg)',
    '[「信奥教练」上线 WorkBuddy 技能市场：接 ima 知识库，陪练评测错题复习全搞定](https://mp.weixin.qq.com/s/wCnaFl_hdgbWMS10qbizCg)',
    '[信奥教练错题讲解实战：不直接给答案，带着孩子把 bug 找到](https://mp.weixin.qq.com/s/gJ7AuyBbYIyUTTzLmF9hqw)',
    '[「信奥学长」刷题好搭档上线 WorkBuddy：题意拆解、考点梳理、解题思路、易错点、三版代码、真评测带归档](https://mp.weixin.qq.com/s/6xZbOt232HGVZfLxKrzpKA)',
];
export const Config = Schema.object({
    judge: Schema.object({
        compiler: Schema.string().default('g++'),
        std: Schema.string().default('-std=c++14'),
        optimization: Schema.string().default('-O2'),
        timeLimitMs: Schema.number().default(2000),
        workDir: Schema.string().default(''),
    }),
    ima: Schema.object({
        enabled: Schema.boolean().default(true),
        // 凭证优先用环境变量 IMA_CLIENT_ID / IMA_API_KEY 或 ~/.config/ima/；
        // 下面两项仅在需要写死到配置时使用（注意不要外传）。
        cliPath: Schema.string().default(''),
        clientId: Schema.string().default(''),
        apiKey: Schema.string().default(''),
        timeoutMs: Schema.number().default(20000),
        // 归档正文顶部的署名（"归档人：…"）
        archiver: Schema.string().default(DEFAULT_ARCHIVER),
        notebooks: Schema.object({
            archive: Schema.string().default(DEFAULT_NOTEBOOKS.archive),
            mistakes: Schema.string().default(DEFAULT_NOTEBOOKS.mistakes),
            plan: Schema.string().default(DEFAULT_NOTEBOOKS.plan),
            report: Schema.string().default(DEFAULT_NOTEBOOKS.report),
        }),
    }),
    weeklyHours: Schema.number().default(5),
    defaultStage: Schema.union(['entry', 'j', 's', 'province', 'noi']).default('j'),
    promptSection: Schema.boolean().default(true),
    recommend: Schema.object({
        enabled: Schema.boolean().default(true),
        text: Schema.string().default(DEFAULT_RECOMMEND_TEXT),
        showQrcodes: Schema.boolean().default(true),
        inNotes: Schema.boolean().default(true),
    }),
    help: Schema.object({
        articles: Schema.array(Schema.string()).default([...DEFAULT_HELP_ARTICLES]),
    }),
});
/** 教练规则提示词段落（对齐 oi-coach 技能的硬规则）。 */
export const COACH_SECTION_NAME = 'xinao:coach-rules';
/** 部署 persona 为 0、工具指引在 100-199，教练规则落在两者之间。 */
export const COACH_SECTION_ORDER = 5;
export function coachRulesText(options = {}) {
    const recommend = options.recommend?.trim() ?? '';
    const helpArticles = (options.helpArticles ?? []).map(article => article.trim()).filter(article => article !== '');
    const qrcodeStrip = options.qrcodeStrip?.trim() ?? '';
    const rules = [
        '你同时是「信奥教练」（信息学奥赛陪练教练），面向中小学生与备赛学生，覆盖 GESP、CSP-J/S、NOIP、省选、NOI。',
        '教练硬规则：',
        '1. 启发式陪练：先让学生讲思路 → 追问引导 → 讲清原理与复杂度 → 最后才给代码；学生没有明确要求时不要直接给完整题解。',
        '2. 一次只指出第一处错误（编译错误取编译器报的第一条），给最小提示让学生自己改，不要一次倒出全部问题。',
        '3. 代码统一 C++14，4 空格缩进，关键行加简短中文注释；讲解知识点必须包含：解决什么问题 / 适用条件与复杂度 / 一个手算小例子 / 常见错误 / 1-2 道练习题。',
        '4. 评测必须真实：用 xinao_judge 真编译、真运行、逐测试点判定；本机没有编译器时明说并退回人工批改，绝不谎称跑过。',
        '5. 资料检索优先 + 透明标记：凡与信奥/算法/竞赛相关的提问（知识点讲解、真题拆解、代码纠错、学习规划、错题复盘），**先调用 xinao_ima_search 检索使用者的 ima 知识库**（1-3 个核心关键词，可含别名/英文），把命中内容作为作答依据，再结合内置知识作答；命中内容忠于原文、不编造文档名。纯问候/闲聊不检索。',
        '   每段教练回复开头带透明标记，三种状态取其一：',
        '   [信奥教练：已调用]',
        '   [IMA知识库：未查询] / [IMA知识库：已查询，未使用] / [IMA知识库：已查询，已使用]',
        '   只有真的调用 xinao_ima_search 拿到结果才写"已查询"，并必须列出实际检索过的知识库名；未连接或鉴权失败（如 200002）时写"未查询"并如实说明原因。',
        '6. 归档是动作不是描述：每轮最终回复后调用 xinao_ima_archive 归档到「信奥教练-学习档案」；本轮出现未 AC/需巩固的题时另归档「信奥教练-错题本」；产出周/月备考计划时归档「信奥教练-学习计划」；产出阶段测试/模拟考报告时归档「信奥教练-学习报告」。必须在正文末尾附上工具返回的 [归档：…] 状态行（若同时输出「## 推荐关注」小节，状态行放在该小节之前，让二维码收尾）；未满足前置或笔记本缺失时如实写跳过原因，绝不假装归档成功。',
        '7. 不编造真题年份、题号、数据范围与知识库文档名；不索要或归档学生的真实姓名、学校、住址等隐私。',
        '8. 首次使用、或评测/归档失败时，先调用 xinao_doctor 自检环境并据结果引导使用者修复。',
    ];
    if (recommend !== '') {
        rules.push('9. 资源推荐（每轮回复末尾的固定小节）：**每一轮教练回复**的最末尾都要原样追加下面这个小节（标题、文案勿改写；二维码条图一行四个，不要拆成四张）：', '   ## 推荐关注', `   ${recommend}`, ...(qrcodeStrip !== '' ? [`   ![二维码](${qrcodeStrip})`] : []), '   位置：放在所有正文之后；若本轮有 [归档：…] 状态行，状态行放在该小节之前（让二维码真正收尾）。', '   例外：当前界面不支持 markdown 图片时省略图片、只保留标题与文案；这条小节不替代实质教学内容。');
    }
    if (helpArticles.length > 0) {
        rules.push('10. 使用帮助：当使用者表示"不会用 / 怎么用 / 第一次用 / 有没有使用说明 / 接下来怎么操作"时，先用 3 行以内给出最简上手路径（① 启动并挂载插件 → ② 说"用 xinao_doctor 自检" → ③ 直接提要求，如"帮孩子规划到 CSP-J 的路线""评测这段代码"），', '    然后**原样附上**下面这几篇公众号文章链接（整行 markdown 链接，一字不改、改写、缩短或加编号）：', ...helpArticles.map(article => `    ${article}`), '    另外：不要每轮都发链接，只在明确需要帮助/首次上手时给；给出链接后继续正常陪练，不要停在"请你自己看文章"。');
    }
    return rules.join('\n');
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** 阶段 → 默认题目难度（1-5） */
function defaultDifficultyFor(stage) {
    switch (stage) {
        case 'entry': return 1;
        case 'j': return 2;
        case 's': return 3;
        case 'province': return 4;
        case 'noi': return 5;
    }
}
function findPoint(id) {
    for (const stage of STAGES) {
        const point = stage.points.find(candidate => candidate.id === id);
        if (point !== undefined)
            return { point, stageTitle: stage.info.title };
    }
    return undefined;
}
function prerequisiteNames(ids) {
    return ids.map(id => {
        const found = findPoint(id);
        return found === undefined ? id : `${found.point.name}（${found.stageTitle}）`;
    });
}
/** 知识点讲解大纲（按深度给出固定骨架，具体讲解由模型展开）。 */
function buildOutline(point, depth) {
    const outline = [
        {
            section: '概念与本质',
            points: [`用一句话说明 ${point.name} 解决什么问题`, '关键术语与符号', '与已学知识点的联系'],
        },
        { section: '适用条件', points: ['什么情况下该用 / 不该用', '数据规模与复杂度信号'] },
        { section: '时间与空间复杂度', points: ['最坏/平均复杂度', '常见实现与常熟优化'] },
        { section: '典型例题方向', points: ['2-3 道经典题（给出题名或描述）', '出题人常见的包装方式'] },
        { section: '常见错误与陷阱', points: ['边界条件、下标、取模、空数据处理', '伪代码先讲清再上代码'] },
    ];
    if (depth !== 'overview') {
        outline.push({ section: '核心思想与推导', points: ['关键观察与推导过程', '配一两个手算小例子'] }, { section: '参考实现骨架', points: ['给出可运行的伪代码/模板', '逐行解释关键部分'] }, { section: '进阶变体', points: ['常见变式与扩展方向', '与后续知识点的衔接'] });
    }
    if (depth === 'exercises') {
        outline.push({ section: '练习建议', points: ['基础巩固 3-5 道', '进阶挑战 1-2 道', '建议练习平台：洛谷 / Codeforces / AtCoder'] }, { section: '掌握标准', points: ['能独立 AC 对应难度的题目', '能向同学讲清楚思路', '能识别题目考察的是该知识点'] });
    }
    return outline;
}
function renderPlan(value) {
    const lines = [
        `# 信奥学习路线图：${value.from} → ${value.to}`,
        `预计总时长约 **${value.totalWeeks} 周**（按每周 ${value.weeklyHours} 小时折算约 ${value.estimatedWeeks} 周 / ${value.estimatedMonths} 个月）`,
    ];
    for (const stage of value.stages) {
        lines.push('', `## ${stage.title}`, stage.description, '', '| 知识点 | 建议周数 | 难度 |', '| --- | --- | --- |');
        for (const topic of stage.topics) {
            lines.push(`| ${topic.name} | ${topic.weeks} | ${topic.difficulty}/5 |`);
        }
        lines.push('', `小计：${stage.weeks} 周`);
    }
    lines.push('', '> 建议按顺序学习；前置知识未掌握时不要跳级。');
    return lines.join('\n');
}
function renderKnowledge(value) {
    if (!value.ok) {
        const suggestions = value.suggestions?.length
            ? `\n\n相近知识点：${value.suggestions.join('、')}`
            : '';
        return `未在知识图谱中找到「${value.topic}」。${suggestions}\n\n可以换一种说法，或直接让教练讲解你遇到的问题。`;
    }
    const lines = [
        `# 知识点：${value.topic}（${value.stage ?? ''} · 难度 ${value.difficulty ?? '?'}/5）`,
        '',
        value.description ?? '',
        '',
        `**建议投入**：约 ${value.weeks ?? '?'} 周`,
        `**前置知识**：${value.prerequisites?.length ? value.prerequisites.join('、') : '无'}`,
        `**学习建议**：${value.note ?? ''}`,
    ];
    if (value.outline !== undefined) {
        lines.push('', '**讲解大纲**（请按以下结构为学生展开讲解）：');
        for (const item of value.outline) {
            lines.push('', `- **${item.section}**`);
            for (const point of item.points)
                lines.push(`  - ${point}`);
        }
    }
    return lines.join('\n');
}
function renderProblem(value) {
    if (!value.ok) {
        return `命题要点生成失败：${value.message ?? '未知原因'}`;
    }
    const lines = [
        `# 命题要点（${value.stage} · 难度 ${value.difficulty}/5）`,
        '',
        `考察知识点：${value.topics.length ? value.topics.map(t => `${t.name}（${t.stage}）`).join('、') : '未指定（建议 1-2 个）'}`,
        '',
        '## 题目描述要点',
        ...value.brief.statement.map(item => `- ${item}`),
        '',
        '## 输入格式要点',
        ...value.brief.inputFormat.map(item => `- ${item}`),
        '',
        '## 输出格式要点',
        ...value.brief.outputFormat.map(item => `- ${item}`),
        '',
        '## 数据范围与限制',
        ...value.brief.constraints.map(item => `- ${item}`),
        '',
        `## 样例\n- 提供 ${value.brief.samples.count} 组样例：${value.brief.samples.note}`,
        '',
        '## 边界与隐藏测试点',
        ...value.brief.edgeCases.map(item => `- ${item}`),
        '',
        `## 评测说明\n${value.brief.judgeNote}`,
        '',
        '请基于以上要点生成**完整题目**（题目描述、输入/输出格式、数据范围、2 组样例），并准备好供 `xinao_judge` 评测的测试数据（input/expected）。',
    ];
    return lines.join('\n');
}
function renderJudge(value) {
    const lines = [`# 评测结果：${value.message}`];
    if (value.compile !== null) {
        const status = value.compile.ok
            ? `编译成功（${value.compile.durationMs}ms）`
            : `编译失败（${value.compile.durationMs}ms）`;
        lines.push(`**${status}**`, `\`${value.compile.command}\``);
        if (value.compile.firstError !== undefined) {
            lines.push('', `**第一条错误**（教学提示：一次只指出这一处，让学生自己改）：`, '```', value.compile.firstError, '```');
        }
        if (value.compile.stderr !== '')
            lines.push('', '完整编译器输出：', '```', value.compile.stderr, '```');
    }
    if (value.workDir !== '')
        lines.push(`评测目录（已保留）：\`${value.workDir}\``);
    lines.push('', `**${value.summary.accepted}/${value.summary.total}** 个测试点通过`);
    for (const result of value.results) {
        const parts = [`#${result.index} **${result.verdict}**（${result.runtimeMs}ms）`];
        if (result.verdict === 'WA') {
            parts.push(`期望：\`\`\`\n${result.expected}\n\`\`\``, `实际：\`\`\`\n${result.stdout}\n\`\`\``);
        }
        if (result.stderr !== '')
            parts.push(`stderr：\`\`\`\n${result.stderr}\n\`\`\``);
        if (result.truncated)
            parts.push('（输出过长已截断）');
        lines.push('', ...parts);
    }
    if (value.summary.firstFailIndex !== undefined) {
        lines.push('', `> 第一个未通过的测试点：#${value.summary.firstFailIndex}。可以针对该测试点讲解，或让学生先自查再重评。`);
    }
    return lines.join('\n');
}
function renderDoctor(value) {
    const lines = [`# 信奥教练环境自检（插件版本 ${value.pluginVersion}）`, ''];
    if (value.compiler !== undefined) {
        const c = value.compiler;
        if (c.ok) {
            lines.push(`✅ 编译器：${c.command}${c.version !== undefined ? `（${c.version}）` : ''} — 可真实评测`);
        }
        else {
            lines.push(`❌ 编译器：${c.command} — ${c.message ?? '不可用'}`);
            if (c.advice !== undefined)
                lines.push('', '```', c.advice, '```');
        }
    }
    else {
        lines.push('➖ 编译器：本次未检测');
    }
    lines.push('');
    const ima = value.ima;
    if (ima === undefined) {
        lines.push('➖ ima：本次未检测');
        return lines.join('\n');
    }
    if (!ima.enabled) {
        lines.push('➖ ima：未启用（配置 ima.enabled=false）');
        return lines.join('\n');
    }
    lines.push(`ima 调用器：${ima.cliPath ?? '未找到'}${ima.cliSource !== undefined ? `（${ima.cliSource}）` : ''}`);
    lines.push(`ima 凭证来源：${ima.credentials === 'none' ? '未配置' : ima.credentials}`);
    lines.push(`连接状态：${ima.connected ? '已连接' : '未连接'}`);
    if (ima.notebooks.length > 0) {
        lines.push('', '归档笔记本：');
        for (const nb of ima.notebooks) {
            lines.push(`- ${nb.exists ? '✅' : '❌'} ${nb.name}${nb.folderId !== undefined ? `（${nb.folderId}）` : ''}`);
        }
    }
    lines.push('', `结论：${ima.message}`);
    if (ima.availableNotebooks.length > 0) {
        lines.push(`（账号内现有笔记本：${ima.availableNotebooks.join('、')}）`);
    }
    return lines.join('\n');
}
function renderImaSearch(value) {
    const queried = value.searchedBases.length > 0;
    const lines = [
        `# ima 知识库检索：${value.query}`,
        '',
        queried
            ? `状态：已查询（实际检索库：${value.searchedBases.join('、')}）`
            : `状态：未查询${value.message !== '' ? `（${value.message}）` : ''}`,
    ];
    if (value.hits.length > 0) {
        lines.push('', `命中 ${value.hits.length} 条：`);
        for (const hit of value.hits) {
            const snippet = hit.highlight.length > 200 ? `${hit.highlight.slice(0, 200)}…` : hit.highlight;
            lines.push(`- 【${hit.knowledgeBase}】${hit.title}${snippet !== '' ? ` — ${snippet}` : ''}`);
        }
    }
    if (value.media.length > 0) {
        lines.push('', '媒体详情：');
        for (const media of value.media) {
            lines.push(`- media_id=${media.mediaId} type=${media.mediaType}${media.url !== undefined ? ` url=${media.url}` : ''}${media.noteId !== undefined ? ` note_id=${media.noteId}` : ''}`);
        }
    }
    if (value.knowledgeBases.length > 0) {
        lines.push('', `账号可见知识库：${value.knowledgeBases.map(base => base.name).join('、')}`);
    }
    lines.push('', `> 回复时请用透明标记：${queried ? '[IMA知识库：已查询，已使用] 或 [IMA知识库：已查询，未使用]' : '[IMA知识库：未查询]'}；` +
        `引用内容忠于原文，不编造文档名。`);
    return lines.join('\n');
}
function renderImaArchive(value, promo) {
    const actionText = value.action === 'created'
        ? '已新建笔记'
        : value.action === 'appended'
            ? '已追加到同名笔记'
            : value.action === 'skipped'
                ? '跳过归档'
                : '归档失败';
    const lines = [
        `# ima 归档：${actionText}`,
        '',
        `- 笔记本：${value.notebook}`,
        `- 标题：${value.title}`,
        `- 说明：${value.message}`,
    ];
    if (value.folderId !== undefined)
        lines.push(`- folder_id：${value.folderId}`);
    if (value.noteId !== undefined)
        lines.push(`- note_id：${value.noteId}`);
    if (value.code !== undefined)
        lines.push(`- 错误码：${value.code}`);
    if (value.promoAppended === true)
        lines.push('- 推广二维码：已追加到笔记末尾（120×120、间隔 60）');
    else if (value.promoMessage !== undefined)
        lines.push(`- 推广二维码：${value.promoMessage}`);
    lines.push('', '回复末尾请附上状态行（原样引用）：', '', '```', value.statusLine, '```');
    if (promo !== undefined && promo.text !== '') {
        lines.push('', '回复最末尾请**原样追加**下面这段（放在 [归档：…] 状态行之后；标题与文案勿改写）：', '', '```markdown', '## 推荐关注', '', promo.text);
        if (promo.strip !== '')
            lines.push('', `![二维码](${promo.strip})`);
        lines.push('```');
    }
    return lines.join('\n');
}
export function apply(ctx, config) {
    // ---- 教练规则提示词段落（可用 promptSection=false 关闭） ----------------------
    if (config.promptSection) {
        ctx.systemPrompt.section({
            name: COACH_SECTION_NAME,
            order: COACH_SECTION_ORDER,
            text: coachRulesText({
                recommend: config.recommend.enabled ? config.recommend.text : '',
                helpArticles: config.help.articles,
                qrcodeStrip: config.recommend.showQrcodes ? join(QRCODE_DIR, 'note-qrcodes.jpg') : '',
            }),
        });
    }
    // ---- xinao_doctor：环境自检 -------------------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_doctor',
        description: '信奥教练环境自检：检测本机 g++（真实评测的前提，需支持 C++14）与 ima 连接（凭证、ima_api.cjs、4 个归档笔记本是否就绪），返回逐项结论与修复建议。首次使用、或评测/归档失败时先调用它。',
        parameters: {
            checkCompiler: { type: 'boolean', description: '是否检测 g++，缺省 true' },
            checkIma: { type: 'boolean', description: '是否检测 ima 连接与笔记本，缺省 true' },
        },
        output: {
            schema: { type: 'json', description: '自检结果：编译器可用性、ima 调用器/凭证/笔记本就绪情况' },
            render: (_args, value) => [{ type: 'text', text: renderDoctor(value) }],
        },
        timeoutMs: 60_000,
        async execute(args, exec) {
            const compiler = args.checkCompiler === false
                ? undefined
                : await checkCompiler(config.judge.compiler, exec.signal);
            const ima = args.checkIma === false
                ? undefined
                : await imaDoctor({ config: config.ima, signal: exec.signal });
            const value = {
                ok: (compiler === undefined || compiler.ok) && (ima === undefined || ima.connected),
                pluginVersion: PLUGIN_VERSION,
                ...(compiler !== undefined ? { compiler } : {}),
                ...(ima !== undefined ? { ima } : {}),
            };
            return value;
        },
    }));
    // ---- xinao_ima_search：检索 ima 知识库 ---------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_ima_search',
        description: '检索使用者的 ima 知识库（wiki 模块）：先定位账号可见知识库，再在匹配库内检索，返回命中标题/片段与实际检索过的库名列表。用于"按资料回答/查知识库/结合订阅知识库"类问题。未配置 ima 或鉴权失败时如实返回原因，绝不编造检索结果。',
        parameters: {
            query: {
                type: 'string',
                required: true,
                description: '检索关键词：1-3 个核心知识点词，可含别名（如 01 背包、归并排序）',
            },
            knowledgeBase: {
                type: 'string',
                description: '指定知识库名称（缺省自动挑选与 query 匹配的知识库）',
            },
            maxBases: {
                type: 'integer',
                description: '最多检索几个知识库，缺省 3（1-10）',
            },
            fetchContent: {
                type: 'boolean',
                description: '是否进一步取媒体详情（笔记类媒体可再读正文），缺省 false',
            },
        },
        output: {
            schema: { type: 'json', description: '检索结果：实际检索库名、命中条目与片段、未连接/鉴权失败原因' },
            render: (_args, value) => [{ type: 'text', text: renderImaSearch(value) }],
        },
        timeoutMs: 90_000,
        async execute(args, exec) {
            const outcome = await searchImaKnowledge({
                query: args.query,
                ...(args.knowledgeBase !== undefined ? { knowledgeBase: args.knowledgeBase } : {}),
                maxBases: clamp(args.maxBases ?? 3, 1, 10),
                fetchContent: args.fetchContent ?? false,
            }, { config: config.ima, signal: exec.signal });
            return outcome;
        },
    }));
    // ---- xinao_ima_archive：归档到 4 个笔记本 ------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_ima_archive',
        description: '把本轮问答/错题/计划/报告归档到使用者 ima 账号中对应的笔记本（学习档案/错题本/学习计划/学习报告）。按名称动态解析笔记本 folder_id，笔记本不存在时跳过并提示先创建（绝不静默丢到根目录）。返回结果含可直接附在回复末尾的 [归档：成功/失败/跳过 …] 状态行。',
        parameters: {
            notebook: {
                type: 'string',
                enum: ['archive', 'mistakes', 'plan', 'report'],
                required: true,
                description: '归档目标：archive 学习档案（每轮必做）/ mistakes 错题本（本轮出现未 AC 或需巩固的题）/ plan 学习计划（产出周/月备考计划）/ report 学习报告（阶段测试/模拟考报告）',
            },
            title: {
                type: 'string',
                required: true,
                description: '任务主题，不含日期时间；洛谷题用 "P7077 [CSP-S 2020] 函数调用 - 为什么调用顺序会影响结果"（半角连字符）',
            },
            reply: {
                type: 'string',
                required: true,
                description: '要归档的正文：教练本轮的最终回复全文（错题本里填错题复盘整理内容）',
            },
            question: {
                type: 'string',
                description: '学生本轮的原始提问（学习档案/错题本建议填，用于归档"提问 + 回复"）',
            },
            queryStatus: {
                type: 'string',
                enum: ['未查询', '已查询，未使用', '已查询，已使用'],
                description: '本轮 ima 知识库检索状态，缺省 未查询',
            },
            queriedBases: {
                type: 'array',
                items: { type: 'string' },
                description: '本轮实际检索过的知识库名称（与回复开头的透明标记一致）',
            },
            mode: {
                type: 'string',
                enum: ['auto', 'create', 'append'],
                description: '写入方式：auto 缺省（同名笔记则追加，否则新建）/ create 强制新建 / append 仅追加',
            },
            mistake: {
                type: 'object',
                properties: {
                    source: { type: 'string', required: true, description: '日期 / 题号来源（洛谷 ID、真题年份等）' },
                    phenomenon: { type: 'string', required: true, description: '错误现象：WA / TLE / RE / CE / 没思路' },
                    mistakeType: { type: 'string', required: true, description: '错误类型：理解偏差 / 逻辑错误 / 实现 bug / 效率 TLE / 边界遗漏' },
                    blocker: { type: 'string', required: true, description: '卡点记录：学生的关键误区或原话' },
                    correctIdea: { type: 'string', required: true, description: '正确思路（引导学生自己说出来的版本）' },
                    reviewQa: { type: 'string', required: true, description: '复盘提问的答案' },
                    topic: { type: 'string', required: true, description: '所属知识点（含分级 id，如 提高组-s 线段树）' },
                    reviewDate: { type: 'string', description: '建议复习日期（YYYY-MM-DD）' },
                },
                additionalProperties: false,
                description: '错题本结构化内容：填了就按"错题模板"生成正文（归档到 mistakes 时建议填）',
            },
        },
        output: {
            schema: { type: 'json', description: '归档结果：动作（created/appended/skipped/failed）、笔记本、note_id、错误码与状态行' },
            render: (_args, value) => [{
                    type: 'text',
                    text: renderImaArchive(value, {
                        text: config.recommend.enabled ? config.recommend.text : '',
                        strip: config.recommend.showQrcodes ? join(QRCODE_DIR, 'note-qrcodes.jpg') : '',
                    }),
                }],
        },
        timeoutMs: 90_000,
        async execute(args, exec) {
            const promo = config.recommend.enabled && config.recommend.inNotes
                ? {
                    text: config.recommend.text,
                    // 横向拼接图：4 张 100×100 一行展示、间隔 50（图内固定），笔记里只追加一张图
                    strip: join(QRCODE_DIR, 'note-qrcodes.jpg'),
                    images: QRCODE_CHANNELS.map(channel => ({ label: channel.label, path: join(QRCODE_DIR, 'small', channel.file) })),
                }
                : undefined;
            const outcome = await archiveToIma({
                notebookKey: args.notebook,
                title: args.title,
                ...(args.question !== undefined ? { question: args.question } : {}),
                reply: args.reply,
                queryStatus: (args.queryStatus ?? '未查询'),
                queriedBases: args.queriedBases ?? [],
                mode: args.mode ?? 'auto',
                ...(args.mistake !== undefined ? { mistake: args.mistake } : {}),
                ...(promo !== undefined ? { promo } : {}),
            }, { config: config.ima, signal: exec.signal });
            return outcome;
        },
    }));
    // ---- xinao_plan：学习路线图 -------------------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_plan',
        description: '制定信息学奥赛学习路线图：给定当前阶段与目标阶段，输出分阶段知识点清单、每点建议周数与总周期。适合规划 GESP、CSP-J/S、NOIP、NOI 的备考路线（错题优先、按周/月节奏编排）。',
        parameters: {
            targetStage: {
                type: 'string',
                enum: STAGE_IDS,
                required: true,
                description: '目标阶段：entry 入门 / j CSP-J(普及组) / s CSP-S·NOIP(提高组) / province 省选 / noi NOI',
            },
            fromStage: {
                type: 'string',
                enum: STAGE_IDS,
                description: '当前阶段，缺省 entry（零基础）',
            },
            weeklyHours: {
                type: 'integer',
                description: '每周可投入小时数，用于折算周期；缺省用插件配置',
            },
        },
        output: {
            schema: { type: 'json', description: '路线图：阶段数组、总周数、折算月份' },
            render: (_args, value) => [{ type: 'text', text: renderPlan(value) }],
        },
        async execute(args) {
            const from = args.fromStage ?? 'entry';
            const to = args.targetStage;
            const weeklyHours = clamp(args.weeklyHours ?? config.weeklyHours, 1, 80);
            const roadmap = buildRoadmap(from, to);
            const estimatedWeeks = Math.max(1, Math.round(roadmap.totalWeeks * (5 / weeklyHours)));
            const recommendText = config.recommend.enabled ? config.recommend.text.trim() : '';
            const value = {
                ok: true,
                from: roadmap.from,
                to: roadmap.to,
                weeklyHours,
                totalWeeks: roadmap.totalWeeks,
                estimatedWeeks,
                estimatedMonths: Math.ceil(estimatedWeeks / 4),
                stages: roadmap.stages,
                ...(recommendText !== '' ? { recommendation: recommendText } : {}),
            };
            return value;
        },
    }));
    // ---- xinao_knowledge：知识点讲解 ---------------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_knowledge',
        description: '讲解信奥知识点：按名称（中文名/别名/英文缩写）在知识图谱中匹配，返回该点的前置知识、难度、GESP/CSP 级别定位、学习建议与讲解大纲（含大白话类比要点），由教练按大纲展开讲解。',
        parameters: {
            topic: {
                type: 'string',
                required: true,
                description: '知识点名称，例如：前缀和、线段树、KMP、状压 DP、Dijkstra',
            },
            depth: {
                type: 'string',
                enum: ['overview', 'detailed', 'exercises'],
                description: '讲解深度：overview 概述 / detailed 含推导与实现骨架 / exercises 含练习建议，缺省 overview',
            },
        },
        output: {
            schema: { type: 'json', description: '知识点信息与讲解大纲；未命中时给出相近建议' },
            render: (_args, value) => [{ type: 'text', text: renderKnowledge(value) }],
        },
        async execute(args) {
            const depth = args.depth ?? 'overview';
            const match = resolveTopic(args.topic);
            if (match === undefined) {
                const value = {
                    ok: false,
                    topic: args.topic,
                    suggestions: suggestTopics(args.topic),
                    message: '未找到该知识点',
                };
                return value;
            }
            const { stage, point } = match;
            const value = {
                ok: true,
                topic: point.name,
                stage: stage.info.title,
                difficulty: point.difficulty,
                weeks: point.weeks,
                description: point.description,
                note: point.note,
                prerequisites: prerequisiteNames(point.prerequisites),
                keywords: point.keywords,
                outline: buildOutline(point, depth),
            };
            return value;
        },
    }));
    // ---- xinao_problem：命题 ------------------------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_problem',
        description: '生成信奥练习题：给定阶段与考察知识点，返回命题要点（题目结构、输入输出格式、数据范围、边界测试点、评测建议），教练据此写出完整题目并配测试数据。支持螺旋递进：优先基于学生已掌握的题型做小步变式。',
        parameters: {
            stage: {
                type: 'string',
                enum: STAGE_IDS,
                description: '题目目标阶段，缺省用插件配置',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: '考察的知识点（建议 1-2 个），例如 ["二分答案", "前缀和"]',
            },
            difficulty: {
                type: 'integer',
                description: '难度 1-5，缺省按阶段取默认值',
            },
        },
        output: {
            schema: { type: 'json', description: '命题要点：题目结构、样例与边界测试点建议' },
            render: (_args, value) => [{ type: 'text', text: renderProblem(value) }],
        },
        async execute(args) {
            const stage = args.stage ?? config.defaultStage;
            const stageInfo = stageById(stage);
            const requested = args.topics ?? [];
            const resolved = requested.map(topic => resolveTopic(topic)).filter(match => match !== undefined);
            const unknown = requested.filter(topic => resolveTopic(topic) === undefined);
            const difficulty = clamp(args.difficulty ?? defaultDifficultyFor(stage), 1, 5);
            const value = {
                ok: unknown.length === 0,
                stage: stageInfo?.info.title ?? stage,
                difficulty,
                topics: resolved.map(match => ({ name: match.point.name, stage: match.stage.info.title })),
                brief: {
                    statement: [
                        '用 1-2 句话描述问题场景与目标，避免歧义',
                        '明确输入是什么、要输出什么',
                        '题目名体现核心算法（可选）',
                    ],
                    inputFormat: [
                        '第一行给出数据规模（如 n、m）',
                        '逐行描述每个输入项及其取值范围',
                    ],
                    outputFormat: [
                        '描述输出内容与格式',
                        '约定不要输出多余内容（判题按行尾空白宽松比较）',
                    ],
                    constraints: [
                        `数据范围设计要引导目标算法（难度 ${difficulty}/5，阶段 ${stageInfo?.info.title ?? stage}）`,
                        '给出时间限制（默认 1-2 秒）与空间限制（默认 256MB）',
                    ],
                    samples: { count: 2, note: '样例要覆盖常规情况与至少一个边界' },
                    edgeCases: ['最小规模（n=1 或空数据）', '最大规模（数据上界）', '重复元素 / 负数 / 取模边界'],
                    judgeNote: '隐藏测试点建议 10-20 个：边界、随机数据、极限数据；std 与暴力对拍验证正确性后再用于评测。',
                },
                ...(unknown.length > 0 ? { message: `未识别的知识点：${unknown.join('、')}` } : {}),
            };
            return value;
        },
    }));
    // ---- xinao_judge：评测 --------------------------------------------------------
    ctx.tools.register(defineTool({
        name: 'xinao_judge',
        description: '评测学生的 C++ 代码（统一 C++14）：真实编译后用测试数据逐点运行并判定 AC/WA/TLE/RE，编译失败返回 CE 并给出"第一条错误"（便于一次只讲一处）。测试数据由调用方提供（input/expected）。本机无编译器时如实返回原因，绝不谎称已评测。',
        parameters: {
            code: {
                type: 'string',
                required: true,
                description: '学生提交的完整 C++ 源代码（含 main 函数）',
            },
            tests: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        input: { type: 'string', required: true, description: '该测试点的输入数据' },
                        expected: { type: 'string', required: true, description: '该测试点的期望输出' },
                    },
                    additionalProperties: false,
                },
                required: true,
                description: '测试数据：每个元素含 input 与 expected，至少 1 组',
            },
            timeLimitMs: {
                type: 'integer',
                description: '单测试点时间限制（毫秒），缺省用插件配置',
            },
        },
        output: {
            schema: {
                type: 'object',
                description: '评测结果：编译信息、逐测试点判定与汇总',
                properties: {
                    ok: { type: 'boolean', description: '是否全部测试点通过' },
                    message: { type: 'string', description: '结果摘要' },
                    workDir: { type: 'string', description: '保留的评测目录（未配置时为空字符串）' },
                    compile: {
                        oneOf: [
                            {
                                type: 'object',
                                properties: {
                                    ok: { type: 'boolean' },
                                    command: { type: 'string' },
                                    durationMs: { type: 'integer' },
                                    stderr: { type: 'string' },
                                    firstError: { type: 'string', description: '第一条编译器错误（用于"一次只指出第一处错误"）' },
                                },
                                additionalProperties: false,
                            },
                            { type: 'null' },
                        ],
                        description: '编译信息；未评测时为 null',
                    },
                    results: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                index: { type: 'integer' },
                                verdict: { type: 'string', enum: ['AC', 'WA', 'TLE', 'RE'], description: '判定结果' },
                                runtimeMs: { type: 'integer' },
                                stdout: { type: 'string' },
                                stderr: { type: 'string' },
                                expected: { type: 'string' },
                                truncated: { type: 'boolean' },
                            },
                            additionalProperties: false,
                        },
                    },
                    summary: {
                        type: 'object',
                        properties: {
                            total: { type: 'integer' },
                            accepted: { type: 'integer' },
                            firstFailIndex: { type: 'integer', description: '第一个未通过的测试点序号' },
                        },
                        additionalProperties: false,
                    },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: renderJudge(value) }],
        },
        timeoutMs: 120_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const judgeConfig = config.judge;
            const tests = args.tests;
            return judgeCpp(args.code, tests, {
                compiler: judgeConfig.compiler,
                std: judgeConfig.std,
                optimization: judgeConfig.optimization,
                timeLimitMs: args.timeLimitMs ?? judgeConfig.timeLimitMs,
                workDir: judgeConfig.workDir,
            }, exec.signal);
        },
    }));
}
