import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendDir, '..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/deploy.yml');

async function getDispatchStep() {
  const workflow = await readFile(workflowPath, 'utf8');
  const stepStart = workflow.indexOf('      - name: Request GitOps deployment\n');
  assert.notEqual(stepStart, -1, 'deploy workflow should keep the GitOps request step');

  const step = workflow.slice(stepStart);
  const envStart = step.indexOf('        env:\n');
  const shellStart = step.indexOf('        shell: bash\n', envStart);
  const runStart = step.indexOf('        run: |\n', shellStart);
  assert.notEqual(envStart, -1, 'request step should define its environment');
  assert.notEqual(shellStart, -1, 'request step should select bash');
  assert.notEqual(runStart, -1, 'request step should have a runnable script');

  const envText = step.slice(envStart + '        env:\n'.length, shellStart);
  const stepEnv: Record<string, string> = {};
  for (const line of envText.split('\n').filter(Boolean)) {
    const match = line.match(/^          ([A-Z_]+): \$\{\{ (.+) \}\}$/);
    assert.ok(match, `unexpected request-step environment entry: ${line.trim()}`);
    stepEnv[match[1]] = match[2];
  }

  const scriptLines: string[] = [];
  for (const line of step.slice(runStart + '        run: |\n'.length).split('\n')) {
    if (!line.trim()) {
      scriptLines.push('');
      continue;
    }
    if (!line.startsWith('          ')) break;
    scriptLines.push(line.slice(10));
  }

  return { stepEnv, script: scriptLines.join('\n') };
}

function resolveMockEnvironment(stepEnv: Record<string, string>, token: string) {
  const variables = {
    GH_TOKEN: {
      expression: 'secrets.HOMELAB_GITOPS_DISPATCH_TOKEN',
      value: token,
    },
    IMAGE_SHA: {
      expression: 'github.event.workflow_run.head_sha',
      value: 'a'.repeat(40),
    },
    MONIKEY_RUN_ID: {
      expression: 'github.event.workflow_run.id',
      value: '42531828060',
    },
  };

  for (const [name, expected] of Object.entries(variables)) {
    assert.equal(stepEnv[name], expected.expression, `${name} should map from the expected workflow context`);
  }

  return Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [name, value.value]),
  );
}

async function runWithMockCurl(
  workflowEnv: Record<string, string>,
  run: (context: { env: NodeJS.ProcessEnv; curlData: string; curlUrl: string; summary: string }) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'monikey-dispatch-contract-'));
  const binDir = path.join(tempDir, 'bin');
  const curlPath = path.join(binDir, 'curl');
  const curlData = path.join(tempDir, 'curl-data.json');
  const curlUrl = path.join(tempDir, 'curl-url.txt');
  const curlCalls = path.join(tempDir, 'curl-calls.txt');
  const summary = path.join(tempDir, 'step-summary.txt');

  await mkdir(binDir);
  await writeFile(
    curlPath,
    [
      '#!/bin/sh',
      'set -eu',
      'printf called > "$CURL_CALLS"',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    --data) printf %s "$2" > "$CURL_DATA"; shift 2 ;;',
      '    https://*) printf %s "$1" > "$CURL_URL"; shift ;;',
      '    *) shift ;;',
      '  esac',
      'done',
    ].join('\n'),
  );
  await chmod(curlPath, 0o755);

  try {
    await run({
      env: {
        ...process.env,
        ...workflowEnv,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        CURL_CALLS: curlCalls,
        CURL_DATA: curlData,
        CURL_URL: curlUrl,
        GITHUB_STEP_SUMMARY: summary,
      },
      curlData,
      curlUrl,
      summary,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('configured token dispatches the expected SHA and CI run ID without network access', async () => {
  const { stepEnv, script } = await getDispatchStep();
  const workflowEnv = resolveMockEnvironment(stepEnv, 'mock-token');

  await runWithMockCurl(workflowEnv, async ({ env, curlData, curlUrl }) => {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      env,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(curlUrl, 'utf8'), 'https://api.github.com/repos/Jeysibn/homelab-gitops/dispatches');
    assert.deepEqual(JSON.parse(await readFile(curlData, 'utf8')), {
      event_type: 'monikey-release',
      client_payload: {
        image_sha: 'a'.repeat(40),
        monikey_run_id: '42531828060',
      },
    });
  });
});

test('absent token keeps the intentional successful skip and makes no request', async () => {
  const { stepEnv, script } = await getDispatchStep();
  const workflowEnv = resolveMockEnvironment(stepEnv, '');

  await runWithMockCurl(workflowEnv, async ({ env, summary }) => {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      env,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(summary, 'utf8'), /GitOps dispatch skipped/);
    await assert.rejects(readFile(env.CURL_CALLS as string), { code: 'ENOENT' });
  });
});
