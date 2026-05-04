import type { GitHub } from '@actions/github/lib/utils';
import { minimatch } from 'minimatch';
import type { ChangedFile } from './types';

type Octokit = InstanceType<typeof GitHub>;

/**
 * List the files that changed in the PR. Skips files that were removed from the
 * head ref since they cannot be fetched + audited.
 */
export async function listChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ChangedFile[]> {
  const out: ChangedFile[] = [];
  // The PR-files endpoint paginates at 30/100 per page; iterate so we cover large PRs.
  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })) {
    for (const f of response.data) {
      if (f.status === 'removed') continue;
      out.push({
        filename: f.filename,
        status: f.status,
        // The list-files endpoint reports patch lines, not file size — leave -1 here
        // and let auditor.ts fetch + size-check at content-fetch time.
        size: -1,
      });
    }
  }
  return out;
}

/**
 * Filter changed files by glob. Comma-separated globs all OR together — any match
 * keeps the file.
 */
export function filterByGlob(files: ChangedFile[], glob: string): ChangedFile[] {
  const patterns = glob
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (patterns.length === 0) return [];
  return files.filter((f) => patterns.some((p) => minimatch(f.filename, p, { dot: true })));
}
