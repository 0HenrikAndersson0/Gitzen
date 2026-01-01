export interface GitLogEntry {
  hash: string;
  parents: string[];
  refs: string;
  subject: string;
}

interface CommitNode {
  hash: string;
  parents: string[];
  refs: string;
  subject: string;
  // The branch this commit effectively "lives" on in the Mermaid diagram
  assignedBranch: string;
  // Is this commit a merge?
  isMerge: boolean;
  // Is this commit a root (0 parents) or pseudo-root (parents not in log)?
  isRoot: boolean;
}

interface BranchState {
  name: string;
  lastCommitHash: string;
  parentBranch?: string; // The branch from which this branch diverged
}

export class GitMermaidService {
  private commits: Map<string, CommitNode> = new Map();
  private branchCounter = 0;

  // Map of ParentHash -> List of BranchNames that spawn from this parent
  private divergentChildren: Map<string, string[]> = new Map();
  // Track commit counts to prevent empty-branch merges
  private branchCommitCount: Map<string, number> = new Map();

  /**
   * Converts a raw git log string into a Mermaid gitGraph diagram.
   * Expected format: "%H|%P|%D|%s" (Hash|Parents|RefNames|Subject)
   * Log should be: --date-order --reverse --all
   */
  public convertToMermaid(rawInput: string): string {
    const lines = rawInput.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      return 'gitGraph\n';
    }

    this.commits.clear();
    this.divergentChildren.clear();
    this.branchCommitCount.clear();
    this.branchCounter = 0;

    // Phase 1: Ingestion & Topological Map Building
    const rawCommits: GitLogEntry[] = lines.map(line => this.parseLine(line));
    const rawCommitHashes = new Set(rawCommits.map(c => c.hash));

    // Phase 2: Heuristic Lane Assignment
    const parentChildCount = new Map<string, number>();

    // First pass: Populate the commit map
    for (const raw of rawCommits) {
      const parents = raw.parents.filter(p => rawCommitHashes.has(p));
      const node: CommitNode = {
        hash: raw.hash,
        parents: raw.parents, // Keep full list for logic, but we care about known parents
        refs: raw.refs,
        subject: raw.subject,
        assignedBranch: '',
        isMerge: parents.length > 1,
        isRoot: parents.length === 0
      };
      this.commits.set(raw.hash, node);
    }

    // Lane Assignment Pass
    for (const raw of rawCommits) {
      const node = this.commits.get(raw.hash)!;

      if (node.isRoot) {
        node.assignedBranch = this.determineBranchName(node, null);
      } else {
        const firstParentHash = node.parents[0];
        const firstParentNode = this.commits.get(firstParentHash);

        if (!firstParentNode) {
          // Boundary problem: Treat as root.
          node.isRoot = true;
          node.assignedBranch = this.determineBranchName(node, null);
        } else {
          const existingChildren = parentChildCount.get(firstParentHash) || 0;
          
          if (existingChildren === 0) {
            // Inherit
            node.assignedBranch = firstParentNode.assignedBranch;
          } else {
            // Divergence
            node.assignedBranch = this.determineBranchName(node, firstParentNode.assignedBranch);

            // Record this divergence for Phase 3 (Pre-creation)
            // We want to create 'node.assignedBranch' at 'firstParentHash'
            if (!this.divergentChildren.has(firstParentHash)) {
                this.divergentChildren.set(firstParentHash, []);
            }
            // Avoid duplicates
            if (!this.divergentChildren.get(firstParentHash)!.includes(node.assignedBranch)) {
                this.divergentChildren.get(firstParentHash)!.push(node.assignedBranch);
            }
          }

          parentChildCount.set(firstParentHash, existingChildren + 1);
        }
      }
    }

    // Phase 3: Transpilation (Generation)
    return this.generateScript(rawCommits);
  }

  private parseLine(line: string): GitLogEntry {
    const parts = line.split('|');
    return {
      hash: (parts[0] || '').trim(),
      parents: parts[1] ? parts[1].trim().split(/\s+/).filter(p => p.length > 0) : [],
      refs: (parts[2] || '').trim(),
      subject: (parts[3] || '').trim()
    };
  }

  private determineBranchName(node: CommitNode, parentBranchName: string | null): string {
    const refs = node.refs.split(',').map(r => r.trim()).filter(r => r.length > 0);
    let bestName = '';

    for (const ref of refs) {
      if (ref.startsWith('HEAD -> ')) {
        bestName = ref.replace('HEAD -> ', '');
        break;
      }
      if (!ref.startsWith('tag: ') && !ref.includes('/')) {
        bestName = ref;
      }
      if (ref.includes('/') && !bestName) {
        const parts = ref.split('/');
        if (parts[parts.length-1] !== 'HEAD') {
             bestName = parts[parts.length-1];
        }
      }
    }

    if (bestName) {
      if (bestName === 'master') {
          bestName = 'main';
      }
      return this.sanitizeBranchName(bestName);
    }

    if (parentBranchName) {
        this.branchCounter++;
        return `branch-${this.branchCounter}`;
    }

    if (node.isRoot) {
        if (this.branchCounter === 0) {
            this.branchCounter++;
            return 'main';
        } else {
            this.branchCounter++;
            return `orphan-${this.branchCounter}`;
        }
    }

    return `branch-${node.hash.substring(0,7)}`;
  }

  private sanitizeBranchName(name: string): string {
    let sanitized = name.replace(/[^a-zA-Z0-9_\-]/g, '-');
    if (/^[0-9]/.test(sanitized)) {
        sanitized = `ref-${sanitized}`;
    }
    return sanitized;
  }

  private generateScript(rawCommits: GitLogEntry[]): string {
    const lines: string[] = [];
    lines.push('%%{init: { \'logLevel\': \'debug\', \'theme\': \'base\', \'gitGraph\': { \'showBranches\': true, \'showCommitLabel\':true, \'mainBranchName\': \'main\'}} }%%');
    lines.push('gitGraph');

    const createdBranches = new Set<string>();
    let currentActiveBranch = '';

    for (const raw of rawCommits) {
      const node = this.commits.get(raw.hash)!;
      const targetLane = node.assignedBranch;

      // 1. Context Switching
      if (node.isRoot) {
         if (!createdBranches.has(targetLane)) {
             if (targetLane !== 'main') {
                 if (createdBranches.size === 0) {
                     lines.push(`   branch ${targetLane}`);
                 } else {
                     lines.push(`   checkout main`);
                     lines.push(`   branch ${targetLane}`);
                 }
             }
             createdBranches.add(targetLane);
         }
      } else {
          // Not a root.
          // Branch should have been pre-created by parent!
          // But purely as a safety mechanism, check existence.
          if (!createdBranches.has(targetLane)) {
              // This implies we missed the pre-creation or something odd happened.
              // Fallback: branch from current location (which might be wrong, but prevents crash)
              lines.push(`   branch ${targetLane}`);
              createdBranches.add(targetLane);
          }
      }

      if (currentActiveBranch !== targetLane) {
          lines.push(`   checkout ${targetLane}`);
          currentActiveBranch = targetLane;
      }

      // 2. Emit Commit/Merge
      const id = node.hash.substring(0,7);

      if (node.isMerge) {
          // Octopus/Multi-merge handling
          for (let i = 1; i < node.parents.length; i++) {
              const sourceHash = node.parents[i];
              const sourceNode = this.commits.get(sourceHash);

              if (sourceNode) {
                  const sourceBranch = sourceNode.assignedBranch;
                  if (createdBranches.has(sourceBranch) && sourceBranch !== targetLane) {
                      const isLastMerge = (i === node.parents.length - 1);
                      const idAttr = isLastMerge ? ` id: "${id}"` : '';
                      const tagAttr = (isLastMerge && this.getTag(node.refs)) ? ` tag: "${this.getTag(node.refs)}"` : '';

                      // Safety: If we are merging into a branch that has NO commits yet,
                      // Mermaid can fail with "merge into itself" or other topological errors
                      // if the source is an ancestor/descendant.
                      // We inject a synthetic commit to anchor the branch.
                      const currentCount = this.branchCommitCount.get(targetLane) || 0;
                      if (currentCount === 0) {
                          lines.push(`   commit id: "${targetLane}-start"`);
                          this.branchCommitCount.set(targetLane, 1);
                      }

                      lines.push(`   merge ${sourceBranch}${idAttr}${tagAttr}`);
                  } else if (node.parents.length === 2) {
                       lines.push(`   commit id: "${id}" type: HIGHLIGHT`);
                  }
              } else if (node.parents.length === 2) {
                   lines.push(`   commit id: "${id}"`);
              }
          }
      } else {
          const tag = this.getTag(node.refs);
          const tagStr = tag ? ` tag: "${tag}"` : '';
          lines.push(`   commit id: "${id}"${tagStr}`);
          this.branchCommitCount.set(targetLane, (this.branchCommitCount.get(targetLane) || 0) + 1);
      }

      // 3. Post-Processing: Spawn divergent branches
      // If this commit is a parent to divergent children, create their branches NOW.
      if (this.divergentChildren.has(raw.hash)) {
          const childrenBranches = this.divergentChildren.get(raw.hash)!;
          for (const childBranch of childrenBranches) {
              if (!createdBranches.has(childBranch)) {
                  lines.push(`   branch ${childBranch}`);
                  createdBranches.add(childBranch);
                  // Return to current branch to continue main line processing
                  lines.push(`   checkout ${currentActiveBranch}`);
              }
          }
      }
    }

    return lines.join('\n');
  }

  private getTag(refs: string): string | null {
      const parts = refs.split(',').map(s => s.trim());
      for (const p of parts) {
          if (p.startsWith('tag: ')) {
              return p.replace('tag: ', '');
          }
      }
      return null;
  }
}
