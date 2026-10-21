/**
 * dsh-oi-coach 评测引擎冒烟测试。
 * 运行：node --test test/
 * （judge.js 只依赖 Node 内置模块，可在无 g++ 的机器上运行本测试。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_VALUE_TEXT,
  checkCompiler,
  extractFirstError,
  judgeCpp,
  normalizeOutput,
  runProcess,
  truncateText,
  verdictFor,
} from '../dist/judge.js'

test('normalizeOutput：去除行尾空白、CRLF、末尾空行', () => {
  assert.equal(normalizeOutput('1 2 3  \n4\t\n\n\n'), '1 2 3\n4')
  assert.equal(normalizeOutput('a\r\nb\r\n'), 'a\nb')
  assert.equal(normalizeOutput(''), '')
})

test('verdictFor：AC 忽略空白差异', () => {
  assert.equal(verdictFor({ timedOut: false, code: 0, output: '1 2\n', expected: '1 2' }), 'AC')
  assert.equal(verdictFor({ timedOut: false, code: 0, output: '1 3', expected: '1 2' }), 'WA')
  assert.equal(verdictFor({ timedOut: true, code: null, output: '', expected: '1' }), 'TLE')
  assert.equal(verdictFor({ timedOut: false, code: 1, output: '', expected: '1' }), 'RE')
})

test('truncateText：超过上限截断并注明', () => {
  const out = truncateText('x'.repeat(100), 10)
  assert.ok(out.includes('已截断'))
  assert.equal(truncateText('short', 10), 'short')
})

test('runProcess：捕获子进程输出', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("hello 信奥")'])
  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello 信奥')
  assert.equal(result.error, undefined)
})

test('runProcess：通过 stdin 喂入输入', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdin.on("data", d => process.stdout.write(d.toString().trim().toUpperCase()))'], {
    input: 'abc\n',
  })
  assert.equal(result.stdout, 'ABC')
})

test('runProcess：超时强制结束并标记 timedOut', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 300 })
  assert.equal(result.timedOut, true)
  assert.ok(result.durationMs < 5000)
})

test('runProcess：命令不存在返回 error 字段而非抛异常', async () => {
  const result = await runProcess('definitely-not-a-real-command-xyz', [])
  assert.ok(result.error !== undefined && result.error !== '')
  assert.equal(result.code, null)
})

test('judgeCpp：无测试数据时给出明确提示', async () => {
  const outcome = await judgeCpp('int main(){}', [], {
    compiler: 'g++', std: '-std=c++17', optimization: '-O2', timeLimitMs: 1000, workDir: '',
  })
  assert.equal(outcome.ok, false)
  assert.match(outcome.message, /没有提供测试数据/)
})

test('judgeCpp：编译器不存在时优雅失败', async () => {
  const outcome = await judgeCpp('int main(){}', [{ input: '', expected: '' }], {
    compiler: 'definitely-not-a-real-command-xyz',
    std: '-std=c++17', optimization: '-O2', timeLimitMs: 1000, workDir: '',
  })
  assert.equal(outcome.ok, false)
  assert.match(outcome.message, /无法启动编译器/)
  assert.equal(outcome.results.length, 0)
})

test('judgeCpp：注入替身 runner 验证 AC/WA/TLE/RE 判定与汇总', async () => {
  /** 编译成功；运行期按输入返回固定输出。 */
  const fakeRun = async (command, args, options) => {
    if (args.includes('main.cpp')) {
      return { code: 0, stdout: '', stderr: '', timedOut: false, durationMs: 50 }
    }
    const input = options.input ?? ''
    if (input.trim() === '3') {
      return { code: 0, stdout: 'answer 3', stderr: '', timedOut: false, durationMs: 5 }
    }
    if (input.trim() === '4') {
      return { code: 0, stdout: 'answer 4', stderr: '', timedOut: false, durationMs: 5 }
    }
    if (input.trim() === '5') {
      return { code: null, stdout: '', stderr: '', timedOut: true, durationMs: 2000 }
    }
    if (input.trim() === '6') {
      return { code: 1, stdout: '', stderr: 'boom', timedOut: false, durationMs: 5 }
    }
    return { code: 0, stdout: 'other', stderr: '', timedOut: false, durationMs: 5 }
  }

  const outcome = await judgeCpp(
    'int main(){}',
    [
      { input: '1', expected: 'other' },      // AC（fake 对 1 返回 other）
      { input: '2', expected: 'wrong' },      // WA
      { input: '3', expected: 'answer 3' },   // AC（行尾有空白）
      { input: '4', expected: 'answer 4\n' }, // AC（期望带换行）
      { input: '5', expected: 'x' },          // TLE
      { input: '6', expected: 'x' },          // RE
    ],
    { compiler: 'g++', std: '-std=c++17', optimization: '-O2', timeLimitMs: 1000, workDir: '' },
    undefined,
    fakeRun,
  )

  assert.equal(outcome.compile?.ok, true)
  assert.deepEqual(outcome.results.map(r => r.verdict), ['AC', 'WA', 'AC', 'AC', 'TLE', 'RE'])
  assert.equal(outcome.summary.total, 6)
  assert.equal(outcome.summary.accepted, 3)
  assert.equal(outcome.summary.firstFailIndex, 2)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.workDir, '') // 临时目录已清理
})

test('judgeCpp：配置 workDir 时保留现场', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'dsh-xinao-test-'))
  const fakeRun = async (command, args, options) => {
    if (args.includes('main.cpp')) return { code: 0, stdout: '', stderr: '', timedOut: false, durationMs: 50 }
    return { code: 0, stdout: options.input ?? '', stderr: '', timedOut: false, durationMs: 5 }
  }
  const outcome = await judgeCpp(
    'int main(){}',
    [{ input: '1\n', expected: '1' }],
    { compiler: 'g++', std: '-std=c++17', optimization: '-O2', timeLimitMs: 1000, workDir },
    undefined,
    fakeRun,
  )
  assert.equal(outcome.ok, true)
  assert.equal(outcome.workDir, workDir)
  await access(join(workDir, 'main.cpp')) // 源文件保留
})

test('judgeCpp：长输出进入规范值前被截断', async () => {
  const big = 'y'.repeat(MAX_VALUE_TEXT * 2)
  const fakeRun = async (command, args) => {
    if (args.includes('main.cpp')) return { code: 0, stdout: '', stderr: '', timedOut: false, durationMs: 50 }
    return { code: 0, stdout: big, stderr: '', timedOut: false, durationMs: 5 }
  }
  const outcome = await judgeCpp(
    'int main(){}',
    [{ input: '', expected: big }],
    { compiler: 'g++', std: '-std=c++17', optimization: '-O2', timeLimitMs: 1000, workDir: '' },
    undefined,
    fakeRun,
  )
  assert.equal(outcome.results[0]?.verdict, 'AC')
  assert.equal(outcome.results[0]?.truncated, true)
  assert.ok((outcome.results[0]?.stdout ?? '').length < MAX_VALUE_TEXT + 200)
})

test('extractFirstError：取第一条 error: 行（教学"一次只指出一处"）', () => {
  const stderr = [
    'main.cpp: In function \'int main()\':',
    'main.cpp:5:9: error: \'cout\' was not declared in this scope',
    '    5 |     cout << 1;',
    '      |     ^~~~',
    'main.cpp:7:1: error: expected \'}\' at end of input',
  ].join('\n')
  assert.equal(extractFirstError(stderr), "main.cpp:5:9: error: 'cout' was not declared in this scope")
})

test('extractFirstError：没有 error 行时退回第一条非空行', () => {
  assert.equal(extractFirstError('\n\nfatal: cannot open source file\nmore\n'), 'fatal: cannot open source file')
  assert.equal(extractFirstError(''), undefined)
})

test('judgeCpp：编译失败时带 firstError', async () => {
  const fakeRun = async () => ({
    code: 1,
    stdout: '',
    stderr: 'main.cpp:3:5: error: expected \';\' before \'}\' token',
    timedOut: false,
    durationMs: 30,
  })
  const outcome = await judgeCpp(
    'int main(){ int a = 1 }',
    [{ input: '', expected: '' }],
    { compiler: 'g++', std: '-std=c++14', optimization: '-O2', timeLimitMs: 1000, workDir: '' },
    undefined,
    fakeRun,
  )
  assert.equal(outcome.ok, false)
  assert.equal(outcome.compile?.ok, false)
  assert.ok(outcome.compile?.firstError?.includes("expected ';'"))
})

test('checkCompiler：注入替身 runner 判断就绪与缺失', async () => {
  const ready = await checkCompiler('g++', undefined, async () => ({
    code: 0,
    stdout: 'g++ (MinGW-W64) 13.2.0\nCopyright (C) 2023',
    stderr: '',
    timedOut: false,
    durationMs: 10,
  }))
  assert.equal(ready.ok, true)
  assert.equal(ready.version, '13.2.0')
  assert.equal(ready.versionMajor, 13)

  const old = await checkCompiler('g++', undefined, async () => ({
    code: 0,
    stdout: 'g++ (GCC) 4.8.5',
    stderr: '',
    timedOut: false,
    durationMs: 10,
  }))
  assert.equal(old.ok, false)
  assert.ok(old.advice?.includes('C++14'))

  const missing = await checkCompiler('g++', undefined, async () => ({
    code: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 0,
    error: 'spawn g++ ENOENT',
  }))
  assert.equal(missing.ok, false)
  assert.ok(missing.message?.includes('未检测到编译器'))
})
