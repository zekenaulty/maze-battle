import { PagedOccupancy } from '../../topology/occupancy';
import type { Bucket } from '../../topology/buckets';
import type { Occupancy } from '../../../domain/expedition/topology/types';
import type { CanonicalPages } from '../pages';
import { json, levelKey } from './records';

export async function loadOccupancy(pages: CanonicalPages, level: number, buckets: Bucket[]) {
  const occupancy = new PagedOccupancy(), key = (bucket: Bucket) => `${levelKey(level)}/bucket/${bucket.join(',')}`;
  await occupancy.fetch(async bucket => (await pages.get('world', key(bucket)))?.value as Occupancy[] | undefined, buckets);
  return { occupancy, stage: () => occupancy.stage((bucket, values) => pages.set('world', key(bucket), json(values))) };
}
