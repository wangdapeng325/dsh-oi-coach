/**
 * 信奥 C++ 评测引擎：编译 + 逐点运行 + 比对。
 *
 * 只依赖 Node 内置模块，不依赖框架，便于单独测试与复用。
 * 判题约定（与 OI/NOI 一致）：忽略每行行尾空白，忽略文件末尾空行，
 * 其余逐字节比较。编译失败 / 运行异常都作为"领域结果"返回，不抛异常；
 * 只有外部取消（AbortSignal）会以 AbortError 拒绝。
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE'

export interface TestCase {
  input: string
  expected: string
}

export interface TestResult {
  index: number
  verdict: Verdict
  runtimeMs: number
  /** 与期望比对的程序输出（截断后的展示值） */
  stdout: string
  stderr: string
  expected: string
  truncated: boolean
}

export interface CompileInfo {
  ok: boolean
  command: string
  durationMs: number
  stderr: string
  /** 第一条编译器错误（教练"一次只指出第一处错误"用） */
  firstError?: string
}

export interface JudgeSummary {
  total: number
  accepted: number
  firstFailIndex?: number
}

export interface JudgeOutcome {
  ok: boolean
  message: string
  /** 仅在配置了 workDir（保留现场）时非空 */
  workDir: string
  compile: CompileInfo | null
  results: TestResult[]
  summary: JudgeSummary
}

export interface JudgeConfig {
  /** 编译器命令（应在 PATH 上，或不含空格的可执行文件路径） */
  compiler: string
  /** 语言标准参数，如 -std=c++17 */
  std: string
  /** 优化参数，如 -O2 */
  optimization: string
  /** 单测试点时间限制（毫秒） */
  timeLimitMs: number
  /** 工作目录；空字符串表示使用临时目录（评测后自动清理） */
  workDir: string
}

/** 进程运行原始输出的采集上限（字节） */
export const MAX_CAPTURED_OUTPUT = 512 * 1024
export const MAX_CAPTURED_ERROR = 256 * 1024
/** 进入规范值 / 渲染文本的单段文本上限（字符） */
export const MAX_VALUE_TEXT = 4000
const COMPILE_TIMEOUT_MS = 30_000

export interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
  /** 启动失败（如找不到可执行文件）时的错误信息 */
  error?: string
}

export interface RunProcessOptions {
  input?: string
  timeoutMs?: number
  cwd?: string
  signal?: AbortSignal
}

/**
 * 运行一个子进程并采集输出。超时强制结束进程；外部取消以 AbortError 拒绝。
 * 启动失败不抛异常，而是以 error 字段返回（判题场景下"找不到编译器"是领域结果）。
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = options.signal?.aborted === true
    let settled = false
    const started = Date.now()
    let timer: NodeJS.Timeout | undefined
    let child: ReturnType<typeof spawn> | undefined

    const killChild = (): void => {
      if (child !== undefined && child.exitCode === null && child.signalCode === null) {
        child.kill(process.platform === 'win32' ? undefined : 'SIGKILL')
      }
    }
    const onAbort = (): void => {
      aborted = true
      killChild()
    }
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
    const settle = (result: ProcessResult): void => {
      if (settled) return
      settled = true
      cleanup()
      if (aborted) {
        reject(new DOMException('xinao judge aborted', 'AbortError'))
      } else {
        resolve(result)
      }
    }

    if (aborted) {
      cleanup()
      reject(new DOMException('xinao judge aborted', 'AbortError'))
      return
    }

    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      settle({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        killChild()
      }, options.timeoutMs)
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < MAX_CAPTURED_OUTPUT) {
        stdout += chunk
        if (stdout.length > MAX_CAPTURED_OUTPUT) stdout = stdout.slice(0, MAX_CAPTURED_OUTPUT)
      }
    })
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < MAX_CAPTURED_ERROR) {
        stderr += chunk
        if (stderr.length > MAX_CAPTURED_ERROR) stderr = stderr.slice(0, MAX_CAPTURED_ERROR)
      }
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      settle({
        code: null,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - started,
        error: error.message,
      })
    })
    child.on('close', (code: number | null) => {
      settle({ code, stdout, stderr, timedOut, durationMs: Date.now() - started })
    })

    // 子进程若不读 stdin 且输入较大，可能阻塞写端；直接 end 并让管道自然处理。
    try {
      child.stdin?.end(options.input ?? '')
    } catch {
      // 子进程已退出时忽略写入错误
    }
  })
}

/**
 * 判题输出归一化：CRLF→LF、去掉每行行尾空白、去掉文件末尾空行。
 * 这是 OI/NOI 判题的标准"宽松空白"约定。
 */
export function normalizeOutput(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n')
}

/** 根据运行结果与期望输出给出判定。 */
export function verdictFor(details: {
  timedOut: boolean
  code: number | null
  output: string
  expected: string
}): Verdict {
  if (details.timedOut) return 'TLE'
  if (details.code !== 0) return 'RE'
  return normalizeOutput(details.output) === normalizeOutput(details.expected) ? 'AC' : 'WA'
}

/** 截断长文本，保留尾部说明。 */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…[已截断，共 ${text.length} 字符]`
}

/**
 * 取编译器报的第一条错误（优先含 `error:` 的行，否则第一条非空行）。
 * 教学上"一次只指出第一处错误"比一次倒出全部报错更有效。
 */
export function extractFirstError(stderr: string): string | undefined {
  const lines = stderr
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
  const errorLine = lines.find(line => /error:/i.test(line))
  return errorLine ?? lines[0]
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
export async function judgeCpp(
  code: string,
  tests: TestCase[],
  config: JudgeConfig,
  signal?: AbortSignal,
  run: typeof runProcess = runProcess,
): Promise<JudgeOutcome> {
  if (tests.length === 0) {
    return {
      ok: false,
      message: '没有提供测试数据（tests 为空）：请至少给出一组 input/expected。',
      workDir: '',
      compile: null,
      results: [],
      summary: { total: 0, accepted: 0 },
    }
  }

  const useTemp = config.workDir.trim() === ''
  const workDir = useTemp ? await mkdtemp(join(tmpdir(), 'dsh-xinao-')) : config.workDir
  try {
    await mkdir(workDir, { recursive: true })
    const sourcePath = join(workDir, 'main.cpp')
    const exeName = process.platform === 'win32' ? 'main.exe' : 'main'
    const exePath = join(workDir, exeName)
    await writeFile(sourcePath, code, 'utf8')

    const compileArgs = [config.std, config.optimization, sourcePath, '-o', exePath].filter(
      (arg): arg is string => arg !== '',
    )
    const compileRun = await run(config.compiler, compileArgs, {
      timeoutMs: COMPILE_TIMEOUT_MS,
      cwd: workDir,
      ...(signal !== undefined ? { signal } : {}),
    })
    const compile: CompileInfo = {
      ok: compileRun.error === undefined && !compileRun.timedOut && compileRun.code === 0,
      command: [config.compiler, ...compileArgs].join(' '),
      durationMs: compileRun.durationMs,
      stderr: truncateText(compileRun.stderr, MAX_VALUE_TEXT),
      ...(compileRun.code !== 0 || compileRun.timedOut
        ? (() => {
            const first = extractFirstError(compileRun.stderr)
            return first !== undefined ? { firstError: first } : {}
          })()
        : {}),
    }
    if (!compile.ok) {
      const reason = compileRun.error !== undefined
        ? `无法启动编译器「${config.compiler}」：${compileRun.error}`
        : compileRun.timedOut
          ? '编译超时'
          : '编译失败（请检查代码语法与编译器参数）'
      return {
        ok: false,
        message: reason,
        workDir: useTemp ? '' : workDir,
        compile,
        results: [],
        summary: { total: 0, accepted: 0 },
      }
    }

    const results: TestResult[] = []
    let firstFailIndex: number | undefined
    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i]
      if (test === undefined) continue
      const testRun = await run(exePath, [], {
        input: test.input,
        timeoutMs: config.timeLimitMs,
        cwd: workDir,
        ...(signal !== undefined ? { signal } : {}),
      })
      const verdict = verdictFor({
        timedOut: testRun.timedOut,
        code: testRun.code,
        output: testRun.stdout,
        expected: test.expected,
      })
      const stdout = truncateText(testRun.stdout, MAX_VALUE_TEXT)
      const stderr = truncateText(testRun.stderr, MAX_VALUE_TEXT)
      results.push({
        index: i + 1,
        verdict,
        runtimeMs: testRun.durationMs,
        stdout,
        stderr,
        expected: truncateText(test.expected, MAX_VALUE_TEXT),
        truncated: testRun.stdout.length > stdout.length || testRun.stderr.length > stderr.length,
      })
      if (verdict !== 'AC' && firstFailIndex === undefined) {
        firstFailIndex = i + 1
      }
    }

    const accepted = results.filter(result => result.verdict === 'AC').length
    const ok = accepted === tests.length
    const summary: JudgeSummary = {
      total: tests.length,
      accepted,
      ...(firstFailIndex !== undefined ? { firstFailIndex } : {}),
    }
    return {
      ok,
      message: ok ? '全部测试点通过' : `${accepted}/${tests.length} 个测试点通过`,
      workDir: useTemp ? '' : workDir,
      compile,
      results,
      summary,
    }
  } finally {
    if (useTemp) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

// ---------------------------------------------------------------------------
// 编译器体检（对应 oi-coach 技能的 check_gpp.cjs）
// ---------------------------------------------------------------------------

export type CompilerInfo = {
  /** 是否可用于真实评测（存在且主版本 >= 5，完整支持 C++14） */
  ok: boolean
  command: string
  /** 形如 13.2.0 */
  version?: string
  /** 版本输出首行 */
  headline?: string
  versionMajor?: number
  /** 未就绪时的原因 */
  message?: string
  /** 分平台安装指引 */
  advice?: string
}

const COMPILER_ADVICE = [
  '安装 g++（需支持 C++14，GCC ≥ 5）：',
  '  Windows : winget install -e --id Mingw-w64（或装 TDM-GCC，把其 bin\\ 目录加入 PATH）',
  '  Linux   : sudo apt-get install -y g++（Fedora/RHEL: sudo dnf install -y gcc-c++）',
  '  macOS   : brew install gcc（装出 g++-<ver>，建软链或调用写全名）',
  '装完后重开终端，运行 g++ --version 确认能看到版本号再继续评测。',
].join('\n')

/** 检测编译器是否可用（找不到/版本偏旧都作为领域结果返回）。 */
export async function checkCompiler(
  command: string,
  signal?: AbortSignal,
  run: typeof runProcess = runProcess,
): Promise<CompilerInfo> {
  const result = await run(command, ['--version'], {
    timeoutMs: 10_000,
    ...(signal !== undefined ? { signal } : {}),
  })
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
    }
  }
  const output = `${result.stdout}\n${result.stderr}`.trim()
  const headline = output.split('\n')[0]?.trim() ?? ''
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output)
  const version = match === null ? undefined : `${match[1]}.${match[2]}.${match[3]}`
  const major = match === null ? undefined : Number.parseInt(match[1] ?? '0', 10)
  if (major !== undefined && major < 5) {
    return {
      ok: false,
      command,
      ...(version !== undefined ? { version } : {}),
      headline,
      versionMajor: major,
      message: `编译器主版本 ${major} < 5，对 C++14 支持可能不完整`,
      advice: COMPILER_ADVICE,
    }
  }
  return {
    ok: true,
    command,
    ...(version !== undefined ? { version } : {}),
    headline,
    ...(major !== undefined ? { versionMajor: major } : {}),
  }
}
