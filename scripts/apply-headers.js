const fs = require('fs');
const path = require('path');

const HEADER = `/*
 * Copyright (C) 2026 Leonardo Cardozo Vargas
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
`;

function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
      continue;
    }

    if (/\.(js|jsx|ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function applyHeader(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('SPDX-License-Identifier')) {
    return false;
  }

  fs.writeFileSync(filePath, HEADER + content, 'utf8');
  return true;
}

function main() {
  const srcDir = path.resolve(process.cwd(), 'src');
  const files = walkDir(srcDir);
  let changed = 0;

  for (const filePath of files) {
    if (applyHeader(filePath)) {
      changed += 1;
      console.log(`Header aplicado: ${filePath}`);
    }
  }

  console.log(`Concluído. Arquivos atualizados: ${changed}`);
}

main();
