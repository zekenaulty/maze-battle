import { mkdir, writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';

export async function persistEvidence(info: TestInfo, name: string, value: unknown) {
  await mkdir(info.outputDir, { recursive: true });
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}
