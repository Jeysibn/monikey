import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendDir, '..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/deploy.yml');

async function readManifestCheck() {
  const workflow = await readFile(workflowPath, 'utf8');
  const stepStart = workflow.indexOf('      - name: Verify both immutable GHCR image tags exist');
  const loopStart = workflow.indexOf('          for image in \\\n', stepStart);
  const loopEnd = workflow.indexOf('          done\n', loopStart);

  assert.notEqual(stepStart, -1, 'deploy workflow should keep its paired-image verification step');
  assert.notEqual(loopStart, -1, 'image verification step should inspect both manifests');
  assert.notEqual(loopEnd, -1, 'image verification loop should be complete');

  return workflow
    .slice(loopStart, loopEnd + '          done\n'.length)
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}

async function withMockDocker(
  failImage: string,
  run: (context: {
    env: NodeJS.ProcessEnv;
    callsPath: string;
    summaryPath: string;
  }) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'monikey-workflow-contract-'));
  const callsPath = path.join(tempDir, 'docker-calls.txt');
  const summaryPath = path.join(tempDir, 'step-summary.txt');
  const dockerPath = path.join(tempDir, 'docker');

  await writeFile(
    dockerPath,
    [
      '#!/bin/sh',
      'set -eu',
      'test "$1" = manifest && test "$2" = inspect',
      'printf "%s\\n" "$3" >> "$DOCKER_CALLS"',
      'if test "$3" = "$FAIL_IMAGE"; then',
      '  echo "manifest unknown" >&2',
      '  exit 1',
      'fi',
    ].join('\n'),
  );
  await chmod(dockerPath, 0o755);

  try {
    return await run({
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH ?? ''}`,
        DOCKER_CALLS: callsPath,
        FAIL_IMAGE: failImage,
        GITHUB_STEP_SUMMARY: summaryPath,
        IMAGE_SHA: 'a'.repeat(40),
      },
      callsPath,
      summaryPath,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('deploy verifies both frontend and API images for the same full SHA', async () => {
  const manifestCheck = await readManifestCheck();

  await withMockDocker('', async ({ env, callsPath }) => {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', manifestCheck], {
      env,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readFile(callsPath, 'utf8')).trim().split('\n'), [
      `ghcr.io/jeysibn/monikey-v2-frontend:sha-${'a'.repeat(40)}`,
      `ghcr.io/jeysibn/monikey-v2-api:sha-${'a'.repeat(40)}`,
    ]);
  });
});

for (const imageName of ['frontend', 'api']) {
  test(`deploy fails closed when the ${imageName} image manifest is missing`, async () => {
    const manifestCheck = await readManifestCheck();
    const missingImage = `ghcr.io/jeysibn/monikey-v2-${imageName}:sha-${'a'.repeat(40)}`;

    await withMockDocker(missingImage, async ({ env, callsPath }) => {
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', manifestCheck], {
        env,
        encoding: 'utf8',
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /manifest unknown/);
      const expectedCalls = imageName === 'frontend' ? 1 : 2;
      assert.equal((await readFile(callsPath, 'utf8')).trim().split('\n').length, expectedCalls);
    });
  });
}

test('dispatch payload serializes the expected event and provenance fields', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const payloadExpression = workflow.match(/payload="\$\(python3 -c '([^']+)'\)"/);

  assert.ok(payloadExpression, 'deploy workflow should construct a JSON dispatch payload');

  const imageSha = 'b'.repeat(40);
  const runId = '42485428695';
  const result = spawnSync('python3', ['-c', payloadExpression[1]], {
    env: { ...process.env, IMAGE_SHA: imageSha, MONIKEY_RUN_ID: runId },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    event_type: 'monikey-release',
    client_payload: {
      image_sha: imageSha,
      monikey_run_id: runId,
    },
  });
});
