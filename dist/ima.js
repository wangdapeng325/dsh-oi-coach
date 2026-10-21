/**
 * ima 接入模块：连接 ima 知识库检索 + 归档到 4 个笔记本。
 *
 * 通过腾讯官方 ima-skill 自带的命令行调用器 `ima_api.cjs` 访问使用者自己的 ima 账号：
 *   node <ima_api.cjs> "<endpoint>" '<json body>'
 * 成功时 stdout 输出 `{code:0,msg,data}`；失败时 stderr 输出 `{code,msg}` 且退出码非 0。
 *
 * 设计原则（与 oi-coach 技能一致）：
 * - 凭证优先级：插件配置 → 环境变量 → ~/.config/ima/{client_id,api_key}；
 *   并把最终凭证显式注入子进程的 IMA_CLIENT_ID/IMA_API_KEY，覆盖可能残留的旧变量。
 * - 笔记本不硬编码 folder_id：每次归档前用 list_notebook 按名称动态解析。
 * - 目标笔记本不存在时明确跳过，绝不静默把笔记丢到根目录。
 * - 不假装：任何失败都返回结构化结果与真实错误码。
 *
 * 本模块只依赖 Node 内置模块，便于单独测试。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const NOTEBOOK_KEYS = ['archive', 'mistakes', 'plan', 'report'];
/** 归档正文顶部的默认署名。 */
export const DEFAULT_ARCHIVER = '信奥教练插件';
export const DEFAULT_NOTEBOOKS = {
    archive: '信奥教练-学习档案',
    mistakes: '信奥教练-错题本',
    plan: '信奥教练-学习计划',
    report: '信奥教练-学习报告',
};
/** 视为"鉴权失败"的错误码（含 ima 各版本不同写法）。 */
const AUTH_CODES = new Set([200002, 20004, 20002]);
/** skill 需要更新的错误码 */
const UPDATE_CODE = -200;
export function notebookName(notebooks, key) {
    return notebooks[key];
}
/** 常见技能目录（按顺序探测）。 */
export function knownSkillRoots(home) {
    return [
        join(home, '.workbuddy', 'skills'),
        join(home, '.dsh', 'skills'),
        join(home, '.claude', 'skills'),
        join(home, '.codex', 'skills'),
        join(home, '.cursor', 'skills'),
    ];
}
/** 在若干技能根目录下按有限深度搜索 ima_api.cjs。 */
export function searchImaCli(roots, maxDepth = 2) {
    const found = [];
    const walk = (dir, depth) => {
        if (depth > maxDepth || found.length > 0)
            return;
        let names;
        try {
            names = readdirSync(dir);
        }
        catch {
            return;
        }
        if (names.includes('ima_api.cjs')) {
            found.push(join(dir, 'ima_api.cjs'));
            return;
        }
        for (const name of names) {
            if (name.startsWith('.'))
                continue;
            const child = join(dir, name);
            if (!isDirectory(child))
                continue;
            walk(child, depth + 1);
            if (found.length > 0)
                return;
        }
    };
    for (const root of roots) {
        if (!existsSync(root))
            continue;
        walk(root, 0);
        if (found.length > 0)
            break;
    }
    return found;
}
function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
/** 按 配置 → 环境变量 → 已知技能目录 → 搜索 的顺序定位 ima_api.cjs。 */
export function discoverImaCli(config, options = {}) {
    const home = options.homeDir ?? homedir();
    const env = options.env ?? process.env;
    const candidates = [];
    if (config.cliPath.trim() !== '')
        candidates.push({ path: config.cliPath.trim(), source: 'config' });
    const fromEnv = (env.IMA_API_CJS ?? '').trim();
    if (fromEnv !== '')
        candidates.push({ path: fromEnv, source: 'env' });
    for (const root of knownSkillRoots(home)) {
        candidates.push({ path: join(root, 'ima-skill', 'ima_api.cjs'), source: 'known' });
    }
    for (const candidate of candidates) {
        if (existsSync(candidate.path))
            return candidate;
    }
    const searched = searchImaCli(knownSkillRoots(home));
    const first = searched[0];
    if (first !== undefined)
        return { path: first, source: 'search' };
    return undefined;
}
/** 按 配置 → 环境变量 → ~/.config/ima 文件 的顺序解析凭证。 */
export function resolveCredentials(config, options = {}) {
    const home = options.homeDir ?? homedir();
    const env = options.env ?? process.env;
    const configId = config.clientId.trim();
    const configKey = config.apiKey.trim();
    if (configId !== '' && configKey !== '') {
        return { clientId: configId, apiKey: configKey, source: 'config' };
    }
    const envId = (env.IMA_CLIENT_ID ?? '').trim();
    const envKey = (env.IMA_API_KEY ?? '').trim();
    if (envId !== '' && envKey !== '') {
        return { clientId: envId, apiKey: envKey, source: 'env' };
    }
    const fileId = readTextFile(join(home, '.config', 'ima', 'client_id'));
    const fileKey = readTextFile(join(home, '.config', 'ima', 'api_key'));
    if (fileId !== '' && fileKey !== '') {
        return { clientId: fileId, apiKey: fileKey, source: 'file' };
    }
    return { clientId: '', apiKey: '', source: 'none' };
}
function readTextFile(path) {
    try {
        return readFileSync(path, 'utf8').trim();
    }
    catch {
        return '';
    }
}
/** 执行 ima_api.cjs（不抛异常，失败以结果形式返回）。 */
export function runImaCli(cliPath, endpoint, body, options) {
    return new Promise((resolve) => {
        const env = { ...process.env };
        // 显式注入最高优先级凭证，覆盖可能残留的 IMA_OPENAPI_*（否则一律 200002）
        if (options.credentials.source !== 'none') {
            env.IMA_CLIENT_ID = options.credentials.clientId;
            env.IMA_API_KEY = options.credentials.apiKey;
        }
        let child;
        let settled = false;
        let timedOut = false;
        let stdout = '';
        let stderr = '';
        let timer;
        const killChild = () => {
            if (child !== undefined && child.exitCode === null && child.signalCode === null) {
                child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
            }
        };
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
            resolve(result);
        };
        const onAbort = () => {
            killChild();
            settle({ code: null, stdout, stderr, timedOut: false, error: 'aborted' });
        };
        if (options.signal?.aborted === true) {
            resolve({ code: null, stdout: '', stderr: '', timedOut: false, error: 'aborted' });
            return;
        }
        try {
            child = spawn(process.execPath, [cliPath, endpoint, JSON.stringify(body)], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
        }
        catch (error) {
            settle({
                code: null,
                stdout: '',
                stderr: '',
                timedOut: false,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });
        const timeoutMs = options.timeoutMs ?? 20_000;
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                killChild();
            }, timeoutMs);
        }
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk) => { stdout += chunk; });
        child.stderr?.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => {
            settle({ code: null, stdout, stderr, timedOut, error: error.message });
        });
        child.on('close', (code) => {
            settle({ code, stdout, stderr, timedOut });
        });
    });
}
/** 调用一个 ima 接口并归一化结果。 */
export async function callIma(endpoint, body, options) {
    const run = await runImaCli(options.cliPath, endpoint, body, options);
    if (run.error === 'aborted') {
        throw new DOMException('xinao ima call aborted', 'AbortError');
    }
    if (run.error !== undefined) {
        return { ok: false, code: -100, msg: `无法启动 ima 调用器：${run.error}`, data: undefined, kind: 'programmatic', raw: run.error };
    }
    if (run.timedOut) {
        return { ok: false, code: -100, msg: `ima 调用超时（${options.timeoutMs ?? 20_000}ms）`, data: undefined, kind: 'programmatic', raw: '' };
    }
    const stdoutText = run.stdout.trim();
    const parsed = parseJson(stdoutText);
    if (parsed !== undefined) {
        const code = typeof parsed.code === 'number' ? parsed.code : -100;
        const msg = typeof parsed.msg === 'string' ? parsed.msg : '';
        return normalize(code, msg, parsed.data, stdoutText || run.stderr.trim());
    }
    // 调用器在失败时把错误写到 stderr 并退出码非 0
    const stderrParsed = parseJson(run.stderr.trim());
    if (stderrParsed !== undefined) {
        const code = typeof stderrParsed.code === 'number' ? stderrParsed.code : -100;
        const msg = typeof stderrParsed.msg === 'string' ? stderrParsed.msg : '';
        return normalize(code, msg, undefined, run.stderr.trim());
    }
    const fallback = stdoutText === '' ? run.stderr.trim() : stdoutText;
    return {
        ok: false,
        code: -100,
        msg: fallback === '' ? `ima 调用器无输出（退出码 ${run.code ?? 'null'}）` : `ima 返回无法解析：${fallback.slice(0, 300)}`,
        data: undefined,
        kind: 'programmatic',
        raw: fallback,
    };
}
function normalize(code, msg, data, raw) {
    if (code === 0)
        return { ok: true, code, msg, data, kind: 'ok', raw };
    const kind = AUTH_CODES.has(code) ? 'auth' : code === UPDATE_CODE ? 'update' : code < 0 ? 'programmatic' : 'error';
    return { ok: false, code, msg, data, kind, raw };
}
function parseJson(text) {
    if (text === '')
        return undefined;
    try {
        const value = JSON.parse(text);
        if (typeof value === 'object' && value !== null)
            return value;
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** 鉴权失败的统一提示（供工具层直接展示）。 */
export function authAdvice(response) {
    return `ima 鉴权失败（code=${response.code}）：请到 https://ima.qq.com/agent-interface 重新生成 Client ID / API Key，` +
        '并写入环境变量 IMA_CLIENT_ID / IMA_API_KEY 或 ~/.config/ima/{client_id,api_key} 后重试。';
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
function str(value) {
    return typeof value === 'string' ? value : '';
}
/** 数字或数字字符串（ima 的部分计数字段是字符串）。 */
function num(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function firstArray(data, keys) {
    const record = asRecord(data);
    if (record === undefined)
        return [];
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value))
            return value;
    }
    return [];
}
export async function imaSearchKnowledgeBase(query, options) {
    const response = await callIma('openapi/wiki/v1/search_knowledge_base', {
        query,
        cursor: '',
        limit: options.limit ?? 20,
    }, options);
    const bases = firstArray(response.data, ['info_list', 'knowledge_base_list']).map((item) => {
        const record = asRecord(item) ?? {};
        // 真实返回字段为 kb_id / kb_name（此处兼容 id / name 变体）
        return { id: str(record.kb_id) || str(record.id), name: str(record.kb_name) || str(record.name) };
    }).filter(base => base.id !== '');
    return { response, bases };
}
export async function imaSearchKnowledge(query, knowledgeBase, options) {
    const response = await callIma('openapi/wiki/v1/search_knowledge', {
        query,
        cursor: '',
        knowledge_base_id: knowledgeBase.id,
    }, options);
    const hits = firstArray(response.data, ['info_list', 'knowledge_list']).map((item) => {
        const record = asRecord(item) ?? {};
        return {
            knowledgeBase: knowledgeBase.name,
            knowledgeBaseId: knowledgeBase.id,
            title: str(record.title),
            mediaId: str(record.media_id),
            highlight: str(record.highlight_content) || str(record.content),
        };
    });
    return { response, hits };
}
export async function imaGetMediaInfo(mediaId, options) {
    return callIma('openapi/wiki/v1/get_media_info', { media_id: mediaId }, options);
}
export function parseMediaDetail(mediaId, response) {
    const data = asRecord(response.data) ?? {};
    const urlInfo = asRecord(data.url_info) ?? {};
    const notebookExt = asRecord(data.notebook_ext_info) ?? {};
    const url = str(urlInfo.url);
    const noteId = str(notebookExt.notebook_id);
    return {
        mediaId,
        mediaType: num(data.media_type),
        ...(url !== '' ? { url } : {}),
        ...(noteId !== '' ? { noteId } : {}),
    };
}
/** list_notebook 的 limit 上限为 20，超出会被服务端拒绝，因此按 cursor 翻页。 */
export const NOTEBOOK_PAGE_LIMIT = 20;
const MAX_NOTEBOOK_PAGES = 10;
export async function imaListNotebooks(options) {
    const collected = [];
    let cursor = '0';
    let lastResponse;
    for (let page = 0; page < MAX_NOTEBOOK_PAGES; page += 1) {
        const response = await callIma('openapi/note/v1/list_notebook', { cursor, limit: NOTEBOOK_PAGE_LIMIT }, options);
        lastResponse = response;
        if (!response.ok)
            break;
        const pageItems = firstArray(response.data, ['note_folder_infos', 'folders', 'notebook_infos']).map((item) => {
            const record = asRecord(item) ?? {};
            return {
                id: str(record.folder_id) || str(record.id),
                name: str(record.name),
                noteNumber: num(record.note_number),
            };
        }).filter(notebook => notebook.id !== '');
        collected.push(...pageItems);
        const data = asRecord(response.data) ?? {};
        const isEnd = data.is_end === true;
        const next = str(data.next_cursor);
        if (isEnd || next === '' || next === cursor || pageItems.length === 0)
            break;
        cursor = next;
    }
    const response = lastResponse ?? {
        ok: false,
        code: -100,
        msg: '未执行 list_notebook',
        data: undefined,
        kind: 'programmatic',
        raw: '',
    };
    return { response, notebooks: collected };
}
export async function imaListNotes(folderId, options) {
    const response = await callIma('openapi/note/v1/list_note', {
        folder_id: folderId,
        cursor: '',
        limit: options.limit ?? 20,
        sort_type: 0,
    }, options);
    const notes = firstArray(response.data, ['note_book_list', 'note_infos', 'notes', 'note_list']).map((item) => {
        const record = asRecord(item) ?? {};
        return { id: str(record.note_id) || str(record.id), title: str(record.title) };
    }).filter(note => note.id !== '');
    return { response, notes };
}
export async function imaImportDoc(content, options) {
    const body = { content_format: 1, content };
    if (options.folderId !== undefined && options.folderId !== '')
        body.folder_id = options.folderId;
    const response = await callIma('openapi/note/v1/import_doc', body, options);
    const noteId = parseNoteId(response);
    return noteId === undefined ? { response } : { response, noteId };
}
export async function imaAppendDoc(noteId, content, options) {
    const response = await callIma('openapi/note/v1/append_doc', { note_id: noteId, content_format: 1, content }, options);
    const returned = parseNoteId(response);
    return returned === undefined ? { response } : { response, noteId: returned };
}
function parseNoteId(response) {
    const data = asRecord(response.data) ?? {};
    const direct = str(data.note_id);
    if (direct !== '')
        return direct;
    const nested = asRecord(data.note_info) ?? {};
    const nestedId = str(nested.note_id);
    if (nestedId !== '')
        return nestedId;
    const note = asRecord(data.note) ?? {};
    const noteId = str(note.note_id);
    return noteId === '' ? undefined : noteId;
}
// ---------------------------------------------------------------------------
// 归档正文模板
// ---------------------------------------------------------------------------
export function formatDateTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
/**
 * 归档正文的抬头：归档人 + 归档时间（yyyy-MM-dd HH:mm:ss），上下各一条分隔线。
 * 传入 meta 时，把"是否查询/是否使用/实际检索知识库"三项紧跟在归档时间下面（纯文本、无圆点）。
 *
 * 注意：
 * 1. 实测 ima 的笔记标题取**正文第一行**（不是首个 `# ` 行），所以抬头必须放在
 *    H1 标题之后；否则每条笔记的标题都会变成"归档人：…"。
 * 2. 分隔线前后保留空行：`---` 紧跟文本行时会被 Markdown 解析成上一行的
 *    setext 标题（把"归档时间：…"变成 H2），空行可确保渲染为水平分隔线。
 */
export function archiveHeader(time, archiver = DEFAULT_ARCHIVER, meta) {
    const lines = ['---', '', `归档人：${archiver}`, `归档时间：${time}`];
    if (meta !== undefined) {
        const queried = meta.queryStatus !== '未查询';
        const used = meta.queryStatus === '已查询，已使用';
        const bases = meta.queriedBases.length > 0 ? meta.queriedBases.join('、') : '无';
        lines.push(`是否查询知识库：${queried ? '已查询' : '未查询'}`, `是否使用知识库内容：${used ? '已使用' : '未使用'}`, `实际检索知识库：${queried ? bases : '无'}`);
    }
    lines.push('', '---', '');
    return lines.join('\n');
}
/** 按 oi-coach 技能的归档格式生成 markdown（标题不含日期时间）。 */
export function buildArchiveMarkdown(input) {
    const lines = [
        // H1 必须留在第一行：ima 用首行作为笔记标题
        `# ${input.title}`,
        '',
        // 抬头内：归档人 / 归档时间 / 知识库检索三项（纯文本，无圆点）
        archiveHeader(input.time, input.archiver ?? DEFAULT_ARCHIVER, {
            queryStatus: input.queryStatus,
            queriedBases: input.queriedBases,
        }),
        '',
    ];
    if (input.question !== undefined && input.question.trim() !== '') {
        lines.push('## 用户提问', input.question.trim(), '', '---', '');
    }
    lines.push('## 教练回复', input.reply.trim(), '', '---', '');
    return lines.join('\n');
}
/** 按 oi-coach 技能的"错题模板"生成 markdown（H1 首行 + 归档人/归档时间抬头）。 */
export function buildMistakeMarkdown(input) {
    const review = input.reviewDate !== undefined && input.reviewDate.trim() !== ''
        ? `是（建议复习日期：${input.reviewDate.trim()}）`
        : '否';
    return [
        `# ${input.title}`,
        '',
        archiveHeader(input.time, input.archiver ?? DEFAULT_ARCHIVER),
        '',
        '## 错题记录',
        `- 日期 / 题号来源：${input.source}`,
        `- 错误现象：${input.phenomenon}`,
        `- 错误类型：${input.mistakeType}`,
        `- 卡点记录：${input.blocker}`,
        `- 正确思路：${input.correctIdea}`,
        `- 复盘提问答案：${input.reviewQa}`,
        `- 所属知识点：${input.topic}`,
        `- 待复习标记：${review}`,
        '',
        '---',
        '',
    ].join('\n');
}
function statusLineFor(outcome) {
    switch (outcome.action) {
        case 'created':
        case 'appended':
            return `[归档：成功 note_id=${outcome.noteId ?? '未知'} 标题=${outcome.title} 笔记本=${outcome.notebook}]`;
        case 'skipped':
            return `[归档：跳过 原因=${outcome.message} 笔记本=${outcome.notebook}]`;
        case 'failed':
            return `[归档：失败${outcome.code !== undefined ? ` code=${outcome.code}` : ''} 原因=${outcome.message} 笔记本=${outcome.notebook}]`;
    }
}
function finish(outcome) {
    return { ...outcome, statusLine: statusLineFor(outcome) };
}
/** ima 笔记单张图片上限（官方脚本同样限制为 <3MiB）。 */
const MAX_NOTE_IMAGE_BYTES = 3 * 1024 * 1024;
/** 读取本地图片为 data URL（供 append_doc 把图片写进 ima 笔记）。 */
export function imageDataUrl(path) {
    let data;
    try {
        const stat = statSync(path);
        if (!stat.isFile() || stat.size >= MAX_NOTE_IMAGE_BYTES)
            return undefined;
        data = readFileSync(path);
    }
    catch {
        return undefined;
    }
    const lower = path.toLowerCase();
    const type = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return `data:${type};base64,${data.toString('base64')}`;
}
/**
 * 把"推荐关注 + 二维码"追加到已有笔记末尾。
 * 与官方 note-images.cjs 一致：文本一次 append_doc，图片转 data URL 后写入。
 * 提供 strip（横向拼接图）时只追加一张图（天然满足"一行展示 + 固定间隔"）。
 * 注意：归档正文本身已以 `---` 结尾，这里不再重复加分隔线，避免出现两条横线。
 */
export async function appendPromo(noteId, promo, options) {
    const text = promo.text.trim();
    if (text !== '') {
        const result = await imaAppendDoc(noteId, `\n\n## 推荐关注\n\n${text}\n`, options);
        if (!result.response.ok) {
            return { ok: false, message: result.response.kind === 'auth' ? authAdvice(result.response) : result.response.msg };
        }
    }
    const strip = promo.strip !== undefined ? imageDataUrl(promo.strip) : undefined;
    if (strip !== undefined) {
        const result = await imaAppendDoc(noteId, `\n![二维码](${strip})\n`, options);
        if (!result.response.ok) {
            return { ok: false, message: result.response.kind === 'auth' ? authAdvice(result.response) : result.response.msg };
        }
        return { ok: true };
    }
    for (const image of promo.images ?? []) {
        const dataUrl = imageDataUrl(image.path);
        if (dataUrl === undefined)
            continue;
        const result = await imaAppendDoc(noteId, `\n![${image.label}](${dataUrl})\n`, options);
        if (!result.response.ok) {
            return { ok: false, message: result.response.kind === 'auth' ? authAdvice(result.response) : result.response.msg };
        }
    }
    return { ok: true };
}
/** 归档成功后（可选）追加推广内容；失败不影响归档结果本身。 */
async function attachPromo(outcome, promo, options) {
    if (promo === undefined || (outcome.action !== 'created' && outcome.action !== 'appended'))
        return outcome;
    const noteId = outcome.noteId;
    if (noteId === undefined || noteId === '') {
        return { ...outcome, promoMessage: '笔记未返回 note_id，跳过推广追加' };
    }
    const result = await appendPromo(noteId, promo, options);
    if (result.ok)
        return { ...outcome, promoAppended: true };
    return { ...outcome, promoAppended: false, ...(result.message !== undefined ? { promoMessage: result.message } : {}) };
}
/** 把一轮问答（或错题）归档到指定笔记本。 */
export async function archiveToIma(request, options) {
    const { config } = options;
    const notebook = request.notebookName?.trim() !== undefined && request.notebookName?.trim() !== ''
        ? String(request.notebookName).trim()
        : notebookName(config.notebooks, request.notebookKey);
    if (!config.enabled) {
        return finish({ action: 'skipped', notebook, title: request.title, message: 'ima 功能未启用（配置 ima.enabled=false）' });
    }
    const cli = discoverImaCli(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    if (cli === undefined) {
        return finish({ action: 'skipped', notebook, title: request.title, message: '未找到 ima-skill 的 ima_api.cjs（请安装 ima-skill 或设置 ima.cliPath / IMA_API_CJS）' });
    }
    const credentials = resolveCredentials(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    if (credentials.source === 'none') {
        return finish({ action: 'skipped', notebook, title: request.title, message: '未配置 IMA 凭证（IMA_CLIENT_ID / IMA_API_KEY 或 ~/.config/ima/）' });
    }
    const callOptions = {
        cliPath: cli.path,
        credentials,
        timeoutMs: config.timeoutMs,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };
    const listed = await imaListNotebooks(callOptions);
    if (!listed.response.ok) {
        const advice = listed.response.kind === 'auth' ? authAdvice(listed.response) : listed.response.msg;
        return finish({
            action: 'failed',
            notebook,
            title: request.title,
            message: advice,
            code: listed.response.code,
        });
    }
    const target = listed.notebooks.find(item => item.name === notebook);
    if (target === undefined) {
        const available = listed.notebooks.map(item => item.name).join('、');
        return finish({
            action: 'skipped',
            notebook,
            title: request.title,
            message: `笔记本"${notebook}"不存在，请在 ima 客户端先创建（现有：${available === '' ? '无' : available}）`,
        });
    }
    const now = request.now ?? new Date();
    const time = formatDateTime(now);
    const configuredArchiver = config.archiver;
    const archiver = typeof configuredArchiver === 'string' && configuredArchiver.trim() !== ''
        ? configuredArchiver.trim()
        : DEFAULT_ARCHIVER;
    const markdown = request.mistake !== undefined
        ? buildMistakeMarkdown({ ...request.mistake, title: request.title, time, archiver })
        : buildArchiveMarkdown({
            title: request.title,
            time,
            ...(request.question !== undefined ? { question: request.question } : {}),
            reply: request.reply,
            queryStatus: request.queryStatus,
            queriedBases: request.queriedBases,
            archiver,
        });
    // append / auto：先看看目标笔记本里是否已有同名笔记
    if (request.mode === 'append' || request.mode === 'auto') {
        const existing = await findExistingNote(target.id, request.title, callOptions);
        if (existing !== undefined) {
            const appended = await imaAppendDoc(existing.id, `\n## 补充\n\n${markdown}`, callOptions);
            if (!appended.response.ok) {
                return finish({
                    action: 'failed',
                    notebook,
                    folderId: target.id,
                    title: request.title,
                    message: appended.response.kind === 'auth' ? authAdvice(appended.response) : appended.response.msg,
                    code: appended.response.code,
                });
            }
            return attachPromo(finish({
                action: 'appended',
                notebook,
                folderId: target.id,
                ...(appended.noteId !== undefined ? { noteId: appended.noteId } : {}),
                title: request.title,
                message: '已追加到同名笔记',
            }), request.promo, callOptions);
        }
        if (request.mode === 'append') {
            return finish({ action: 'skipped', notebook, folderId: target.id, title: request.title, message: '未找到同名笔记，无法追加（改用 mode=create 可新建）' });
        }
    }
    const imported = await imaImportDoc(markdown, { ...callOptions, folderId: target.id });
    if (!imported.response.ok) {
        return finish({
            action: 'failed',
            notebook,
            folderId: target.id,
            title: request.title,
            message: imported.response.kind === 'auth' ? authAdvice(imported.response) : imported.response.msg,
            code: imported.response.code,
        });
    }
    return attachPromo(finish({
        action: 'created',
        notebook,
        folderId: target.id,
        ...(imported.noteId !== undefined ? { noteId: imported.noteId } : {}),
        title: request.title,
        message: imported.noteId !== undefined ? '已新建笔记' : '已新建笔记（返回未含 note_id）',
    }), request.promo, callOptions);
}
async function findExistingNote(folderId, title, options) {
    const listed = await imaListNotes(folderId, { ...options, limit: 20 });
    if (!listed.response.ok)
        return undefined;
    const exact = listed.notes.find(note => note.title === title);
    if (exact !== undefined)
        return exact;
    // 同日同题可能已顺延为 -2 / -3
    const numbered = listed.notes
        .filter(note => /-\d+$/.test(note.title) && note.title.replace(/-\d+$/, '') === title)
        .sort((a, b) => a.title.localeCompare(b.title));
    return numbered[numbered.length - 1];
}
export async function searchImaKnowledge(request, options) {
    const { config } = options;
    const empty = (message) => ({
        ok: false,
        message,
        query: request.query,
        knowledgeBases: [],
        searchedBases: [],
        hits: [],
        media: [],
        authFailed: false,
    });
    if (!config.enabled)
        return empty('ima 功能未启用（配置 ima.enabled=false）');
    const cli = discoverImaCli(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    if (cli === undefined)
        return empty('未找到 ima-skill 的 ima_api.cjs（请安装 ima-skill 或设置 ima.cliPath / IMA_API_CJS）');
    const credentials = resolveCredentials(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    if (credentials.source === 'none')
        return empty('未配置 IMA 凭证（IMA_CLIENT_ID / IMA_API_KEY 或 ~/.config/ima/）');
    const callOptions = {
        cliPath: cli.path,
        credentials,
        timeoutMs: config.timeoutMs,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };
    // 1) 找到目标知识库：指定名字优先，其次按 query 搜索，再退回"信奥"
    const locate = async (query) => imaSearchKnowledgeBase(query, { ...callOptions, limit: 20 });
    let located = await locate(request.knowledgeBase !== undefined && request.knowledgeBase.trim() !== '' ? request.knowledgeBase.trim() : request.query);
    if (located.response.ok && located.bases.length === 0 && (request.knowledgeBase === undefined || request.knowledgeBase.trim() === '')) {
        located = await locate('信奥');
    }
    if (!located.response.ok) {
        const authFailed = located.response.kind === 'auth';
        return {
            ok: false,
            message: authFailed ? authAdvice(located.response) : located.response.msg,
            query: request.query,
            knowledgeBases: [],
            searchedBases: [],
            hits: [],
            media: [],
            code: located.response.code,
            authFailed,
        };
    }
    let bases = located.bases;
    if (request.knowledgeBase !== undefined && request.knowledgeBase.trim() !== '') {
        const wanted = request.knowledgeBase.trim();
        const exact = bases.filter(base => base.name === wanted);
        bases = exact.length > 0 ? exact : bases.filter(base => base.name.includes(wanted));
    }
    if (bases.length === 0) {
        return {
            ok: true,
            message: '当前账号可见知识库中没有匹配项；请确认已在 ima 客户端订阅相关知识库。',
            query: request.query,
            knowledgeBases: located.bases,
            searchedBases: [],
            hits: [],
            media: [],
            authFailed: false,
        };
    }
    // 2) 在选中的知识库内检索
    const selected = bases.slice(0, Math.max(1, request.maxBases));
    const hits = [];
    const searchedBases = [];
    let lastCode;
    let lastMsg = '';
    let authFailed = false;
    for (const base of selected) {
        const result = await imaSearchKnowledge(request.query, base, callOptions);
        if (!result.response.ok) {
            lastCode = result.response.code;
            lastMsg = result.response.msg;
            if (result.response.kind === 'auth')
                authFailed = true;
            continue;
        }
        searchedBases.push(base.name);
        hits.push(...result.hits);
    }
    if (authFailed) {
        return {
            ok: false,
            message: `ima 鉴权失败（code=${lastCode ?? 200002}）：请重新生成 Client ID / API Key 后重试。`,
            query: request.query,
            knowledgeBases: located.bases,
            searchedBases,
            hits,
            media: [],
            ...(lastCode !== undefined ? { code: lastCode } : {}),
            authFailed: true,
        };
    }
    // 3) 可选：取媒体详情（笔记类型可直接读正文）；同一 media 只取一次
    const media = [];
    if (request.fetchContent) {
        const seen = new Set();
        for (const hit of hits) {
            if (media.length >= 3)
                break;
            if (hit.mediaId === '' || seen.has(hit.mediaId))
                continue;
            seen.add(hit.mediaId);
            const info = await imaGetMediaInfo(hit.mediaId, callOptions);
            if (!info.ok)
                continue;
            media.push(parseMediaDetail(hit.mediaId, info));
        }
    }
    return {
        ok: true,
        message: hits.length === 0
            ? `已在知识库（${searchedBases.join('、') || '无'}）中检索，暂未命中；可换关键词或基于内置知识作答。`
            : `命中 ${hits.length} 条（检索了：${searchedBases.join('、')}）`,
        query: request.query,
        knowledgeBases: located.bases,
        searchedBases,
        hits,
        media,
        ...(lastCode !== undefined && hits.length === 0 ? { code: lastCode } : {}),
        authFailed: false,
        ...(lastMsg !== '' && hits.length === 0 ? {} : {}),
    };
}
export async function imaDoctor(options) {
    const { config } = options;
    const base = {
        enabled: config.enabled,
        credentials: 'none',
        connected: false,
        notebooks: NOTEBOOK_KEYS.map(key => ({ key, name: config.notebooks[key], exists: false })),
        availableNotebooks: [],
        message: '',
    };
    if (!config.enabled)
        return { ...base, message: 'ima 功能未启用' };
    const cli = discoverImaCli(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    if (cli === undefined)
        return { ...base, message: '未找到 ima_api.cjs：请安装 ima-skill，或设置 ima.cliPath' };
    const credentials = resolveCredentials(config, { ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}), ...(options.env !== undefined ? { env: options.env } : {}) });
    const withCli = { ...base, cliPath: cli.path, cliSource: cli.source, credentials: credentials.source };
    if (credentials.source === 'none') {
        return { ...withCli, message: '未配置 IMA 凭证：请设置 IMA_CLIENT_ID / IMA_API_KEY，或写入 ~/.config/ima/' };
    }
    const callOptions = {
        cliPath: cli.path,
        credentials,
        timeoutMs: config.timeoutMs,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };
    const listed = await imaListNotebooks(callOptions);
    if (!listed.response.ok) {
        return {
            ...withCli,
            code: listed.response.code,
            message: listed.response.kind === 'auth' ? authAdvice(listed.response) : listed.response.msg,
        };
    }
    const notebooks = NOTEBOOK_KEYS.map(key => {
        const name = config.notebooks[key];
        const match = listed.notebooks.find(item => item.name === name);
        return match === undefined
            ? { key, name, exists: false }
            : { key, name, exists: true, folderId: match.id };
    });
    const missing = notebooks.filter(item => !item.exists).map(item => item.name);
    return {
        ...withCli,
        connected: true,
        notebooks,
        availableNotebooks: listed.notebooks.map(item => item.name),
        message: missing.length === 0
            ? 'ima 已连接，4 个归档笔记本就绪'
            : `ima 已连接；以下笔记本缺失，请在 ima 客户端手动创建：${missing.join('、')}`,
    };
}
