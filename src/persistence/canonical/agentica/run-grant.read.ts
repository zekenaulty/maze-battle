import type { OperationRead } from './operation.types';
import type { ProtocolRef } from './types';
import { readRunGrantCertificate } from './run-grant.certificate';
import { validateSuccessorGrantEvidence } from './run-grant.evidence';
import type { RunGrant } from './run-grant.types';

export async function loadRunGrant(pages: OperationRead, ref: ProtocolRef): Promise<RunGrant> {
  const grant = await readRunGrantCertificate(pages, ref);
  if (grant.record.value.kind === 'agentica-successor-grant') await validateSuccessorGrantEvidence(pages, grant);
  return grant;
}
