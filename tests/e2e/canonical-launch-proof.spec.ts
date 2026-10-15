import { test, expect } from './canonical-launch.test';

test('typed service admission projects exactly the compact fixture without duplicated requests', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch');
    const launch = (await c.readLaunch()).value!, attemptId = launch.dispatch!.source.attemptId;
    const raw = c.launchEntryFixture(launch.binding.start, attemptId), before = await c.dump();
    const captured = c.captureLaunchAdmission(raw, launch.binding.start, attemptId);
    return { before, after: await c.dump(), raw, captured, expected: c.launchProofFixture(launch.binding.start, attemptId).admission };
  });
  expect(r.raw.originalRequest.observation.facts).toBeNull();
  expect(r.raw.originalRequest.provider.model).toBeNull(); expect(r.raw.acceptedRequest.provider.model).toBe('offline-model');
  expect(r.captured).toEqual({ admission: r.expected, stopRequested: false, terminal: null });
  expect(Object.keys(r.captured.admission).sort()).toEqual([
    'schema', 'attemptId', 'runId', 'originalRequestHash', 'acceptedRequestHash', 'manifestHash', 'provider', 'admittedAt',
  ].sort());
  expect(r.after).toEqual(r.before);
});

for (const defect of ['original', 'accepted', 'missing-observation', 'dropped-limit', 'changed-provider', 'extra-authority'] as const)
  test(`full admission capture rejects ${defect} instead of trusting compact hashes`, async ({ page }) => {
    const r = await page.evaluate(async defect => {
      const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch');
      const launch = (await c.readLaunch()).value!, id = launch.dispatch!.source.attemptId;
      const raw = c.launchEntryFixture(launch.binding.start, id);
      if (defect === 'original') raw.originalRequest.objective = 'Other authority';
      if (defect === 'accepted') raw.acceptedRequest.objective = 'Other authority';
      if (defect === 'missing-observation') Reflect.deleteProperty(raw.originalRequest, 'observation');
      if (defect === 'dropped-limit') Reflect.deleteProperty(raw.acceptedRequest.limits, 'maxSteps');
      if (defect === 'changed-provider') raw.acceptedRequest.provider.contextWindowTokens++;
      if (defect === 'extra-authority') Reflect.set(raw.acceptedRequest, 'unrecognizedAuthority', true);
      const before = await c.dump(); let error = '';
      try { c.captureLaunchAdmission(raw, launch.binding.start, id); } catch (cause) { error = String(cause); }
      return { error, before, after: await c.dump() };
    }, defect);
    expect(r.error).toMatch(/^Error:/); expect(r.after).toEqual(r.before);
  });

test('launch admission cannot omit the verified-host acknowledgement policy', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch, binding = await c.seed(), before = await c.dump();
    const request = c.command((await c.readCanonicalHead()).head, 'operation.admit', {
      operationId: c.launchGuardId('launch'), binding, terminalBytes: 128 * 1024 });
    return { before, error: await c.executeLaunchCommand(request).catch(String), after: await c.dump() };
  });
  expect(String(r.error)).toContain('verified'); expect(r.after).toEqual(r.before);
});

for (const defect of ['missing', 'attempt', 'run', 'hash', 'provider', 'full-request'] as const)
  test(`announcement rejects ${defect} compact admission without retaining a run`, async ({ page }) => {
    const r = await page.evaluate(async defect => {
      const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch');
      const launch = (await c.readLaunch()).value!, proof = c.launchProofFixture(launch.binding.start, launch.dispatch!.source.attemptId);
      if (defect === 'missing') Reflect.deleteProperty(proof, 'admission');
      if (defect === 'attempt') proof.admission.attemptId = 'foreign';
      if (defect === 'run') proof.admission.runId = 'foreign';
      if (defect === 'hash') Reflect.set(proof.admission, 'acceptedRequestHash', 'bad-hash');
      if (defect === 'provider') proof.admission.provider.maxOutputTokens++;
      if (defect === 'full-request') Reflect.set(proof.admission, 'originalRequest', launch.binding.start);
      const before = await c.dump(), error = await c.transition('announce', 'launch', { dispatch: { ...launch.dispatch!.ref }, ...proof }).catch(String);
      return { before, error, after: await c.dump() };
    }, defect);
    expect(String(r.error)).toMatch(/^Error:/); expect(r.after).toEqual(r.before);
  });
