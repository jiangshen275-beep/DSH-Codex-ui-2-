// Host half of "play a sound when the agent has finished answering".
//
// Why a host half at all: the renderer is a Chromium page served over http, so it cannot read a local
// file by absolute path. `file://` is blocked, and the page has no node integration. The bytes therefore
// have to be served by the same origin that serves the app, which is what this route does.
//
// The file is read on every request rather than cached in memory: it is 289 KB, the request happens once
// per finished answer, and reading it fresh means replacing the sound takes effect without a restart.
import { readFileSync, statSync } from 'node:fs';

export const DONE_SOUND_PATH = '/api/dsh-codex-ui/agent-done-sound';

/**
 * Where the sound lives. Overridable so a different clip does not need a code change, but the default is
 * the file the user pointed at: an absolute path outside the plugin on purpose — copying it into the
 * package would add 289 KB of binary to every install for a sound most users will replace.
 */
export const DONE_SOUND_FILE = process.env.DSH_CODEX_UI_DONE_SOUND || 'D:\\lv_0_20261020021248.mp3';

/**
 * The container is MP4, not MPEG audio, despite the `.mp3` extension: the file starts with
 * `ftyp`/`isom` and carries one HEVC video track plus one AAC audio track. Declaring `audio/mpeg` makes
 * Chromium drop it without an error, so the type is sniffed from the container rather than the name.
 */
const contentTypeFor = bytes => {
  if (bytes.length >= 8 && bytes.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return 'application/octet-stream';
};

export function registerAgentDoneSound(ctx) {
  ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
    path: DONE_SOUND_PATH,
    methods: ['GET'],
    // 必须显式声明。宿主用 route.requestBody 选读取方式，缺省会落到 "streaming" 分支，那里会
    // 构造 `new Request(url, { method: 'GET', body: ... })`；Fetch 规范禁止 GET 携带 body，
    // 构造即抛 TypeError，请求在进入 handler 之前就被折成 400，表现为路由"存在但不工作"。
    requestBody: 'buffered',
    fetch() {
      let bytes;
      try {
        const stat = statSync(DONE_SOUND_FILE);
        if (!stat.isFile()) return new Response('not a file', { status: 404 });
        bytes = readFileSync(DONE_SOUND_FILE);
      } catch {
        // A missing or unreadable file is not an error the page should surface: the answer already
        // landed, and a sound that cannot play must not turn into a broken reply. 404 keeps it silent.
        return new Response('sound not found', { status: 404 });
      }
      return new Response(bytes, {
        headers: {
          'content-type': contentTypeFor(bytes),
          'content-length': String(bytes.length),
          // The bytes change only when the file on disk does; revalidating each time would read it twice.
          'cache-control': 'public, max-age=300',
        },
      });
    },
  }));
}
