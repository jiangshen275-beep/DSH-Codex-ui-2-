import { flashToolDenial } from './flash-policy.js';

// These are known native execution tools, not a blanket allowance for unknown tools.
const executionTools = new Set(['ops_bash', 'pwsh', 'job_output', 'job_kill']);
const extraReadTools = new Set(['skill']);

/**
 * Speed profile for executor jobs only. Native edits still use flashToolDenial's
 * canonical write_paths checks. An empty write_paths branch stays read-only.
 *
 * Shell commands cannot be statically parsed into a reliable file sandbox:
 * write_paths is a branch contract, NOT enforced shell path isolation. Execution
 * relies on the host's inherited sandbox, approval and tool policies. This guard
 * neither sets nor overrides approval/sandbox parameters or parent permissions.
 * A command-validation branch must receive its own declared validation workspace.
 */
export function superfastSpeedToolDenial(job, exec) {
  const name = exec.tool?.name ?? exec.name ?? exec.call?.name;
  if (job.kind === 'summary' || (!job.kind && job.role === 'C')) {
    return flashToolDenial(job, exec);
  }
  if (name === 'superfast_report' && job.report) return;
  if (extraReadTools.has(name)) return;
  if (executionTools.has(name)) {
    const paths = job.branch?.write_paths;
    if (!Array.isArray(paths) || paths.length === 0 || paths.some(p => typeof p !== 'string' || !p.trim())) {
      return '只读超快分支不执行命令或管理命令任务；验证分支须声明独立目录或验证工作区';
    }
    return;
  }
  return flashToolDenial(job, exec);
}