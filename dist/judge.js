/**
 * 信奥 C++ 评测引擎：编译 + 逐点运行 + 比对。
 *
 * 只依赖 Node 内置模块，不依赖框架，便于单独测试与复用。
 * 判题约定（与 OI/NOI 一致）：忽略每行行尾空白，忽略文件末尾空行，
 * 其余逐字节比较。编译失败 / 运行异常都作为"领域结果"返回，不抛异常；
 * 只有外部取消（AbortSignal）会以 AbortError 拒绝。
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** 进程运行原始输出的采集上限（字节） */
export const MAX_CAPTURED_OUTPUT = 512 * 1024;
export const MAX_CAPTURED_ERROR = 256 * 1024;
/** 进入规范值 / 渲染文本的单段文本上限（字符） */
export const MAX_VALUE_TEXT = 4000;
const COMPILE_TIMEOUT_MS = 30_000;
/**
 * 运行一个子进程并采集输出。超时强制结束进程；外部取消以 AbortError 拒绝。
 * 启动失败不抛异常，而是以 error 字段返回（判题场景下"找不到编译器"是领域结果）。
 */
export function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let aborted = options.signal?.aborted === true;
        let settled = false;
        const started = Date.now();
        let timer;
        let child;
        const killChild = () => {
            if (child !== undefined && child.exitCode === null && child.signalCode === null) {
                child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
            }
        };
        const onAbort = () => {
            aborted = true;
            killChild();
        };
        const cleanup = () => {
            if (timer !== undefined)
                clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
        };
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            if (aborted) {
                reject(new DOMException('xinao judge aborted', 'AbortError'));
            }
            else {
                resolve(result);
            }
        };
        if (aborted) {
            cleanup();
            reject(new DOMException('xinao judge aborted', 'AbortError'));
            return;
        }
        try {
            child = spawn(command, [...args], {
                cwd: options.cwd,
                env: process.env,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
        }
        catch (error) {
            settle({
                code: null,
                stdout: '',
                stderr: '',
                timedOut: false,
                durationMs: 0,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                killChild();
            }, options.timeoutMs);
        }
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk) => {
            if (stdout.length < MAX_CAPTURED_OUTPUT) {
                stdout += chunk;
                if (stdout.length > MAX_CAPTURED_OUTPUT)
                    stdout = stdout.slice(0, MAX_CAPTURED_OUTPUT);
            }
        });
        child.stderr?.on('data', (chunk) => {
            if (stderr.length < MAX_CAPTURED_ERROR) {
                stderr += chunk;
                if (stderr.length > MAX_CAPTURED_ERROR)
                    stderr = stderr.slice(0, MAX_CAPTURED_ERROR);
            }
        });
        child.on('error', (error) => {
            settle({
                code: null,
                stdout,
                stderr,
                timedOut,
                durationMs: Date.now() - started,
                error: error.message,
            });
        });
        child.on('close', (code) => {
            settle({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
        });
        // 子进程若不读 stdin 且输入较大，可能阻塞写端；直接 end 并让管道自然处理。
        try {
            child.stdin?.end(options.input ?? '');
        }
        catch {
            // 子进程已退出时忽略写入错误
        }
    });
}
/**
 * 判题输出归一化：CRLF→LF、去掉每行行尾空白、去掉文件末尾空行。
 * 这是 OI/NOI 判题的标准"宽松空白"约定。
 */
export function normalizeOutput(text) {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+$/g, ''));
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines.join('\n');
}
/** 根据运行结果与期望输出给出判定。 */
export function verdictFor(details) {
    if (details.timedOut)
        return 'TLE';
    if (details.code !== 0)
        return 'RE';
    return normalizeOutput(details.output) === normalizeOutput(details.expected) ? 'AC' : 'WA';
}
/** 截断长文本，保留尾部说明。 */
export function truncateText(text, max) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}\n…[已截断，共 ${text.length} 字符]`;
}
/**
 * 取编译器报的第一条错误（优先含 `error:` 的行，否则第一条非空行）。
 * 教学上"一次只指出第一处错误"比一次倒出全部报错更有效。
 */
export function extractFirstError(stderr) {
    const lines = stderr
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');
    const errorLine = lines.find(line => /error:/i.test(line));
    return errorLine ?? lines[0];
}
/**
 * 评测一段 C++ 代码。
 *
 * @param code 学生提交的 C++ 源码
 * @param tests 测试数据（input/expected）
 * @param config 评测配置
 * @param signal 外部取消信号（评测中会传递并终止子进程）
 * @param run 进程运行实现，默认 runProcess；测试可注入替身
 */
export async function judgeCpp(code, tests, config, signal, run = runProcess) {
    if (tests.length === 0) {
        return {
            ok: false,
            message: '没有提供测试数据（tests 为空）：请至少给出一组 input/expected。',
            workDir: '',
            compile: null,
            results: [],
            summary: { total: 0, accepted: 0 },
        };
    }
    const useTemp = config.workDir.trim() === '';
    const workDir = useTemp ? await mkdtemp(join(tmpdir(), 'dsh-xinao-')) : config.workDir;
    try {
        await mkdir(workDir, { recursive: true });
        const sourcePath = join(workDir, 'main.cpp');
        const exeName = process.platform === 'win32' ? 'main.exe' : 'main';
        const exePath = join(workDir, exeName);
        await writeFile(sourcePath, code, 'utf8');
        const compileArgs = [config.std, config.optimization, sourcePath, '-o', exePath].filter((arg) => arg !== '');
        const compileRun = await run(config.compiler, compileArgs, {
            timeoutMs: COMPILE_TIMEOUT_MS,
            cwd: workDir,
            ...(signal !== undefined ? { signal } : {}),
        });
        const compile = {
            ok: compileRun.error === undefined && !compileRun.timedOut && compileRun.code === 0,
            command: [config.compiler, ...compileArgs].join(' '),
            durationMs: compileRun.durationMs,
            stderr: truncateText(compileRun.stderr, MAX_VALUE_TEXT),
            ...(compileRun.code !== 0 || compileRun.timedOut
                ? (() => {
                    const first = extractFirstError(compileRun.stderr);
                    return first !== undefined ? { firstError: first } : {};
                })()
                : {}),
        };
        if (!compile.ok) {
            const reason = compileRun.error !== undefined
                ? `无法启动编译器「${config.compiler}」：${compileRun.error}`
                : compileRun.timedOut
                    ? '编译超时'
                    : '编译失败（请检查代码语法与编译器参数）';
            return {
                ok: false,
                message: reason,
                workDir: useTemp ? '' : workDir,
                compile,
                results: [],
                summary: { total: 0, accepted: 0 },
            };
        }
        const results = [];
        let firstFailIndex;
        for (let i = 0; i < tests.length; i += 1) {
            const test = tests[i];
            if (test === undefined)
                continue;
            const testRun = await run(exePath, [], {
                input: test.input,
                timeoutMs: config.timeLimitMs,
                cwd: workDir,
                ...(signal !== undefined ? { signal } : {}),
            });
            const verdict = verdictFor({
                timedOut: testRun.timedOut,
                code: testRun.code,
                output: testRun.stdout,
                expected: test.expected,
            });
            const stdout = truncateText(testRun.stdout, MAX_VALUE_TEXT);
            const stderr = truncateText(testRun.stderr, MAX_VALUE_TEXT);
            results.push({
                index: i + 1,
                verdict,
                runtimeMs: testRun.durationMs,
                stdout,
                stderr,
                expected: truncateText(test.expected, MAX_VALUE_TEXT),
                truncated: testRun.stdout.length > stdout.length || testRun.stderr.length > stderr.length,
            });
            if (verdict !== 'AC' && firstFailIndex === undefined) {
                firstFailIndex = i + 1;
            }
        }
        const accepted = results.filter(result => result.verdict === 'AC').length;
        const ok = accepted === tests.length;
        const summary = {
            total: tests.length,
            accepted,
            ...(firstFailIndex !== undefined ? { firstFailIndex } : {}),
        };
        return {
            ok,
            message: ok ? '全部测试点通过' : `${accepted}/${tests.length} 个测试点通过`,
            workDir: useTemp ? '' : workDir,
            compile,
            results,
            summary,
        };
    }
    finally {
        if (useTemp) {
            await rm(workDir, { recursive: true, force: true }).catch(() => { });
        }
    }
}
const COMPILER_ADVICE = [
    '安装 g++（需支持 C++14，GCC ≥ 5）：',
    '  Windows : winget install -e --id Mingw-w64（或装 TDM-GCC，把其 bin\\ 目录加入 PATH）',
    '  Linux   : sudo apt-get install -y g++（Fedora/RHEL: sudo dnf install -y gcc-c++）',
    '  macOS   : brew install gcc（装出 g++-<ver>，建软链或调用写全名）',
    '装完后重开终端，运行 g++ --version 确认能看到版本号再继续评测。',
].join('\n');
/** 检测编译器是否可用（找不到/版本偏旧都作为领域结果返回）。 */
export async function checkCompiler(command, signal, run = runProcess) {
    const result = await run(command, ['--version'], {
        timeoutMs: 10_000,
        ...(signal !== undefined ? { signal } : {}),
    });
    if (result.error !== undefined || result.timedOut || result.code !== 0) {
        return {
            ok: false,
            command,
            message: result.error !== undefined
                ? `未检测到编译器「${command}」：${result.error}`
                : result.timedOut
                    ? `调用「${command} --version」超时`
                    : `「${command} --version」退出码 ${result.code ?? 'null'}`,
            advice: COMPILER_ADVICE,
        };
    }
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const headline = output.split('\n')[0]?.trim() ?? '';
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
    const version = match === null ? undefined : `${match[1]}.${match[2]}.${match[3]}`;
    const major = match === null ? undefined : Number.parseInt(match[1] ?? '0', 10);
    if (major !== undefined && major < 5) {
        return {
            ok: false,
            command,
            ...(version !== undefined ? { version } : {}),
            headline,
            versionMajor: major,
            message: `编译器主版本 ${major} < 5，对 C++14 支持可能不完整`,
            advice: COMPILER_ADVICE,
        };
    }
    return {
        ok: true,
        command,
        ...(version !== undefined ? { version } : {}),
        headline,
        ...(major !== undefined ? { versionMajor: major } : {}),
    };
}
