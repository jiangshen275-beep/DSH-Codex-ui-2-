import path from 'node:path';
import { realpathSync, lstatSync } from 'node:fs';
const blocked = new Set(['superfast_start','superfast_control','superfast_dispatch','superfast_manage','superfast_report','flash_start','flash_control','flash_run','subagent','subagent_fork','send_message','workflow','create_goal','update_goal','schedule_create']);
const readTools = new Set(['read','read_image','glob','grep','ops_glob','ops_grep','ops_inspect_local_file','web_fetch','web_search','working_directory','load_workspace_dependencies','job_list','list_agents']);
export function canonicalFlashPath(file, cwd) {
  if (typeof file !== 'string' || !file.trim() || file.includes('\0')) throw Error('invalid path');
  const windows = /^[A-Za-z]:[\\/]/.test(file) || file.startsWith('\\\\') || (process.platform === 'win32' && !path.posix.isAbsolute(file));
  const api = windows ? path.win32 : path.posix;
  if (windows && (/^[\\/]{2}[?.]/.test(file) || /:/.test(file.replace(/^[A-Za-z]:/, '')))) throw Error('unsupported Windows path');
  let resolved = api.isAbsolute(file) ? api.normalize(file) : api.resolve(cwd, file);
  // Resolve every existing ancestor, including junctions. A dangling link fails closed.
  if (windows === (process.platform === 'win32')) {
    const suffix = [];
    let ancestor = resolved;
    for (;;) {
      try { lstatSync(ancestor); resolved = api.join(realpathSync(ancestor), ...suffix.reverse()); break; }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        try { lstatSync(ancestor); throw Error('unresolved link'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const parent = api.dirname(ancestor);
        if (parent === ancestor) throw Error('path has no existing ancestor');
        suffix.push(api.basename(ancestor)); ancestor = parent;
      }
    }
  }
  let key = resolved.replaceAll('\\', '/');
  if (windows && key.split('/').some(segment => /[. ]$/.test(segment))) throw Error('ambiguous Windows path');
  key = key.replace(/\/$/, '');
  return windows ? key.toLowerCase() : key;
}
export function flashToolDenial(job, exec) {
  const name = exec.tool?.name ?? exec.name ?? exec.call?.name;
  const args = exec.arguments;
  const summary = job.kind === 'summary' || (!job.kind && job.role === 'C');
  if (summary) return '闪电汇总仅整理回传数据，不调用工具或重复审查';
  if (name === 'flash_report' && job.report) return;
  if (blocked.has(name)) return '闪电通道执行者不得派生任务或代理';
  if (readTools.has(name)) {
    if (name === 'working_directory' && args?.cd !== undefined) return '闪电通道禁止修改共享工作目录';
    return;
  }
  if (!job.branch?.write_paths?.length) return '此闪电Agent只读；仅允许已识别的读取工具';
  if (!args || typeof args !== 'object' || Array.isArray(args)) return '闪电通道缺少可校验的工具参数';
  const parameter = name === 'write' || name === 'edit' ? 'file_path' : name === 'ops_replace' ? 'path' : undefined;
  if (!parameter) return '闪电通道仅允许可校验路径的文件编辑；命令与未知写工具已隔离';
  try {
    if (typeof args[parameter] !== 'string') throw Error('explicit target required');
    const target = canonicalFlashPath(args[parameter], job.cwd ?? process.cwd());
    const absolute = path.resolve(job.cwd ?? process.cwd(), args[parameter]);
    let stat;
    try { stat = lstatSync(absolute); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isFile() && stat.nlink > 1) return '闪电通道不编辑多硬链接文件';
    if (name === 'ops_replace' && (!stat?.isFile() || stat.isSymbolicLink())) return '闪电通道ops_replace仅允许单个已存在普通文件；目录批量替换交回父Agent';
    const owned = job.branch.write_paths.some(file => {
      const root = canonicalFlashPath(file, job.cwd ?? process.cwd());
      return target === root || target.startsWith(root + '/');
    });
    if (!owned) return '目标路径超出本分支write_paths范围';
  } catch { return '闪电通道无法安全解析目标路径'; }
}