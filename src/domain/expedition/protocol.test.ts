import { describe, expect, it } from 'vitest';
import { commandSignature } from './protocol';

describe('expedition command identity', () => {
  it('ignores property insertion order without ignoring command identity', () => {
    expect(commandSignature({ type: 'move', direction: 'east' })).toBe('move:east');
    expect(commandSignature({ direction: 'east', type: 'move' })).toBe('move:east');
    expect(commandSignature({ type: 'collect' })).toBe('collect');
    expect(commandSignature({ type: 'finish' })).toBe('finish');
  });

  it.each([null, undefined, {}, { type: 'move', direction: 'up' },
    { type: 'collect', target: 'hidden' }, { type: 'finish', hidden: true }])('rejects invalid command %j', command => {
    expect(() => commandSignature(command as never)).toThrow('Invalid command.');
  });
});
