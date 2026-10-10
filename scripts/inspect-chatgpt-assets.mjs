import fs from 'node:fs';
import path from 'node:path';

// Read installed application resources without changing the application package.
// The archive path is required: an installed application lives in a different place on every
// machine and under a version-stamped directory, so a default here would only ever be stale.
const archive = process.argv[2];
if (!archive) {
  console.error('用法: node scripts/inspect-chatgpt-assets.mjs "<Codex 安装目录>/app/resources/app.asar" [输出目录]');
  process.exit(2);
}
const destination = path.resolve(process.argv[3] || 'outputs/chatgpt-reference-icons/reusable');
const fd = fs.openSync(archive, 'r');
try {
  const prefix = Buffer.alloc(16);
  fs.readSync(fd, prefix, 0, 16, 0);
  const header = Buffer.alloc(prefix.readUInt32LE(12));
  fs.readSync(fd, header, 0, header.length, 16);
  const assets = JSON.parse(header.toString()).files.webview.files.assets.files;
  const dataOffset = 8 + prefix.readUInt32LE(4);
  const category = name => {
    if (/^sidebar-.*-icon-.*\.js$/.test(name)) return 'sidebar-animation';
    if (/^(composer-controls|inline-composer|tooltip-|animated-segmented-toggle|schedule-fields|automation-dialog|automations-page|composer-project-picker-content|composer-work-home-plugins-control|model-and-reasoning-effort-translations)/.test(name)) return 'ui-reference';
    return null;
  };
  fs.mkdirSync(destination, { recursive: true });
  const index = Object.entries(assets).flatMap(([name, entry]) => {
    const group = category(name);
    if (!group || !/\.(js|css)$/.test(name)) return [];
    const data = Buffer.alloc(entry.size);
    fs.readSync(fd, data, 0, data.length, dataOffset + Number(entry.offset));
    fs.writeFileSync(path.join(destination, name), data);
    return [{ name, group, size: entry.size, archivePath: `webview/assets/${name}`, sha256: entry.integrity?.hash }];
  });
  fs.writeFileSync(path.join(destination, 'index.json'), JSON.stringify({ archive, extractedAt: new Date().toISOString(), entries: index }, null, 2));
  console.log(`Saved ${index.length} reference resources to ${destination}`);
} finally {
  fs.closeSync(fd);
}
