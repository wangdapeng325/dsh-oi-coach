#!/usr/bin/env node
/**
 * 假 ima_api.cjs —— 供 dsh-oi-coach 的 ima 模块测试使用。
 *
 * 契约与官方调用器一致：node fake_ima.cjs "<endpoint>" '<json body>'
 * 成功 stdout 输出 {code:0,msg,data}；失败 stderr 输出 {code,msg} 且退出码 1。
 *
 * 行为由环境变量控制：
 *   FAKE_IMA_MODE = ok | auth | missing-credentials | no-notebooks
 *   FAKE_IMA_STATE = 状态文件路径（记录已创建的笔记，供 list_note/append_doc 用）
 */
'use strict'

const fs = require('fs')

const [, , endpoint, rawBody = '{}'] = process.argv
const body = JSON.parse(rawBody)
const mode = process.env.FAKE_IMA_MODE || 'ok'
const stateFile = process.env.FAKE_IMA_STATE || ''

function readState() {
  if (!stateFile) return { notes: [] }
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return { notes: [] }
  }
}
function writeState(state) {
  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state))
}
function out(payload) {
  process.stdout.write(JSON.stringify(payload))
  process.exit(0)
}
function fail(code, msg) {
  process.stderr.write(JSON.stringify({ code, msg }))
  process.exit(1)
}

if (mode === 'auth') fail(200002, 'skill auth failed')
if (mode === 'missing-credentials') fail(-100, '未找到 IMA 凭证')

if (endpoint === 'openapi/note/v1/list_notebook') {
  const folders = mode === 'no-notebooks'
    ? []
    : [
        // 真实返回：note_number 是字符串，含 create_time/modify_time/parent_folder_id/folder_type
        { folder_id: 'f-archive', name: '信奥教练-学习档案', note_number: '1', parent_folder_id: '', folder_type: 0 },
        { folder_id: 'f-mistakes', name: '信奥教练-错题本', note_number: '0', parent_folder_id: '', folder_type: 0 },
        { folder_id: 'f-plan', name: '信奥教练-学习计划', note_number: '0', parent_folder_id: '', folder_type: 0 },
        { folder_id: 'f-report', name: '信奥教练-学习报告', note_number: '0', parent_folder_id: '', folder_type: 0 },
        { folder_id: 'f-other', name: '随手记', note_number: '9', parent_folder_id: '', folder_type: 0 },
      ]
  out({ code: 0, msg: 'success', data: { note_folder_infos: folders, is_end: true, next_cursor: '' } })
}

if (endpoint === 'openapi/wiki/v1/search_knowledge_base') {
  out({
    code: 0,
    msg: 'success',
    data: {
      // 真实返回字段：kb_id / kb_name / cover_url / member_count / content_count / description
      info_list: [
        {
          kb_id: 'kb-1',
          kb_name: '信奥知识库',
          cover_url: '',
          member_count: '183',
          content_count: '5879',
          description: 'GESP CSP NOIP 信息学奥赛',
        },
        {
          kb_id: 'kb-2',
          kb_name: '算法竞赛资料',
          cover_url: '',
          member_count: '32',
          content_count: '45',
          description: '算法与数据结构',
        },
      ],
      is_end: true,
      next_cursor: '',
    },
  })
}

if (endpoint === 'openapi/wiki/v1/search_knowledge') {
  out({
    code: 0,
    msg: 'success',
    data: {
      // 真实返回字段：media_id / title / parent_folder_id / highlight_content / media_type
      info_list: [
        {
          media_id: 'm-1',
          title: '归并排序求逆序对',
          parent_folder_id: 'folder-x',
          highlight_content: '逆序对可以用归并排序在 O(n log n) 内统计。',
          media_type: 6,
        },
      ],
      is_end: true,
      next_cursor: '',
    },
  })
}

if (endpoint === 'openapi/wiki/v1/get_media_info') {
  out({
    code: 0,
    msg: 'success',
    data: {
      media_type: 11,
      url_info: { url: 'https://example.com/doc.md', headers: { Authorization: 'Bearer x' } },
      notebook_ext_info: { notebook_id: 'n-77' },
    },
  })
}

if (endpoint === 'openapi/note/v1/list_note') {
  // 真实返回字段为 note_book_list（曾误用 note_infos，导致列表解析为空）
  const state = readState()
  const notes = state.notes
    .filter(note => note.folderId === body.folder_id)
    .map(note => ({
      note_id: note.id,
      title: note.title,
      summary: note.content.slice(0, 50),
      note_ext_info: { folder_id: note.folderId },
    }))
  out({ code: 0, msg: 'success', data: { note_book_list: notes, is_end: true } })
}

if (endpoint === 'openapi/note/v1/import_doc') {
  const state = readState()
  const id = `note-${state.notes.length + 1}`
  const content = String(body.content || '')
  // 真实行为：笔记标题 = 正文**第一行**（去掉行首 "# "）
  const title = (content.split('\n')[0] || '').replace(/^#\s*/, '').trim()
  state.notes.push({ id, title, folderId: body.folder_id || '', content })
  writeState(state)
  out({ code: 0, msg: 'success', data: { note_id: id } })
}

if (endpoint === 'openapi/note/v1/append_doc') {
  const state = readState()
  const note = state.notes.find(item => item.id === body.note_id)
  if (note) {
    note.content += body.content
    writeState(state)
  }
  out({ code: 0, msg: 'success', data: { note_id: body.note_id } })
}

fail(-100, `unknown endpoint ${endpoint}`)
