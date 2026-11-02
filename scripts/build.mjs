// 将 src/main.js 打包为唯一安装文件；脚本配置和版本号只从 package.json 读取。
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build, transform } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const check = process.argv.includes('--check');
const outputPath = resolve(root, 'asmr-one-plus.user.js');
const fields = { ...pkg.userscript };
const metadata = { name: fields.name, namespace: fields.namespace, version: pkg.version };
delete fields.name;
delete fields.namespace;
Object.assign(metadata, fields);

const header = ['// ==UserScript=='];
for (const [key, values] of Object.entries(metadata)) {
  for (const value of Array.isArray(values) ? values : [values]) {
    if (/[\r\n]/.test(`${key}${value}`)) throw new Error(`Invalid userscript metadata: ${key}`);
    header.push(`// @${key.padEnd(13)}${value}`);
  }
}
header.push('// ==/UserScript==');

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  treeShaking: false,
  minify: false,
  // 带 ! 的块注释是刻意保留到安装文件的维护说明；普通行注释只供源码阅读。
  legalComments: 'inline',
  sourcemap: false,
  write: false,
  define: { __SCRIPT_VERSION__: JSON.stringify(pkg.version) },
});

// 再格式化一次以移除自动插入的模块路径注释，保留人工维护说明。
const { code } = await transform(result.outputFiles[0].text, {
  target: 'es2022',
  charset: 'utf8',
  minify: false,
  legalComments: 'inline',
});
// 用户脚本元数据必须放在文件最前；同时移除打包器的纯函数标记。
const maintenanceNote = '/*! 自动构建文件。维护入口：src/main.js；修改 src/ 后运行 npm run build，请勿直接修改本文件。 */';
const output = `${header.join('\n')}\n\n${maintenanceNote}\n'use strict';\n${code.replaceAll('/* @__PURE__ */ ', '')}`;
new Script(output, { filename: 'asmr-one-plus.user.js' });

if (check) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== output) {
    throw new Error('打包文件与源码不一致，请运行 npm run build。');
  }
  console.log(`构建检查通过：asmr-one-plus.user.js ${pkg.version}`);
} else {
  await writeFile(outputPath, output, 'utf8');
  console.log(`已生成 asmr-one-plus.user.js ${pkg.version}`);
}
