import test from 'node:test';
import assert from 'node:assert/strict';
import { currentReleaseNotes } from './release-notes.mjs';

test('publishes only the current curated release, preserving its subsections', () => {
  assert.equal(
    currentReleaseNotes(
      '# OpenClockwork v2.0.0\n\n## Highlights\n\nSolo and Team.\n\n# OpenClockwork v1.4.0\n\nOld notes.\n',
      '2.0.0',
    ),
    '# OpenClockwork v2.0.0\n\n## Highlights\n\nSolo and Team.\n',
  );
});

test('supports a first release with no older notes', () => {
  assert.equal(
    currentReleaseNotes('# OpenClockwork v2.0.0\n\nDetails.', '2.0.0'),
    '# OpenClockwork v2.0.0\n\nDetails.\n',
  );
});

test('rejects wrong versions and empty release sections', () => {
  assert.throws(() =>
    currentReleaseNotes('# OpenClockwork v1.4.0\n\nOld.', '2.0.0'),
  );
  assert.throws(() =>
    currentReleaseNotes(
      '# OpenClockwork v2.0.0\n\n# OpenClockwork v1.4.0\n\nOld.',
      '2.0.0',
    ),
  );
});
