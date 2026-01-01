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
  private processedCommits = new Set<string>();

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
    this.processedCommits.clear();
    this.branchCounter = 0;

    // Phase 1: Ingestion & Topological Map Building
    const rawCommits: GitLogEntry[] = lines.map(line => this.parseLine(line));
    const rawCommitHashes = new Set(rawCommits.map(c => c.hash));

    // Phase 2: Heuristic Lane Assignment
    // We need to determine which "lane" (branch) each commit belongs to.
    // We walk through the commits (which are in reverse topological order roughly, due to --reverse --date-order)
    // Actually, --reverse means oldest first.

    // We need to track how many children a parent has to detect divergence.
    // Since we are streaming from Oldest -> Newest, we might not know if a parent *will* have another child later.
    // However, --date-order keeps parents before children.

    // To handle divergence properly (spawning new branches), we need to know if a parent
    // already has a child assigned to its "main line".
    const parentChildCount = new Map<string, number>();

    // First pass: Populate the commit map and identify roots
    for (const raw of rawCommits) {
      const parents = raw.parents.filter(p => rawCommitHashes.has(p)); // Only keep parents that are in our log
      
      const node: CommitNode = {
        hash: raw.hash,
        parents: raw.parents, // Keep original parents for reference, but we might only link to existing ones
        refs: raw.refs,
        subject: raw.subject,
        assignedBranch: '', // To be determined
        isMerge: parents.length > 1,
        isRoot: parents.length === 0
      };

      this.commits.set(raw.hash, node);
    }

    // Lane Assignment Pass
    // We'll iterate effectively chronologically.
    for (const raw of rawCommits) {
      const node = this.commits.get(raw.hash)!;

      if (node.isRoot) {
        // It's a root (or orphan)
        // If it has a specific branch ref, use it, otherwise generate a name
        node.assignedBranch = this.determineBranchName(node, null);
      } else {
        // It has parents.
        // First parent is the "main" lineage in Git.
        // Check if the first parent is in our known set (it might be missing due to -n limit)
        const firstParentHash = node.parents[0];
        const firstParentNode = this.commits.get(firstParentHash);

        if (!firstParentNode) {
          // Boundary problem: Parent exists in git but not in our log snippet.
          // Treat as root.
          node.isRoot = true;
          node.assignedBranch = this.determineBranchName(node, null);
        } else {
          // We have a parent.
          // Check if this parent has already been "claimed" by another child for its primary lane.
          const existingChildren = parentChildCount.get(firstParentHash) || 0;
          
          if (existingChildren === 0) {
            // This is the first child we've seen for this parent.
            // Inherit the parent's branch.
            node.assignedBranch = firstParentNode.assignedBranch;

            // However, if this commit has a strong Ref (e.g., "main" or "develop"),
            // and the inherited branch is generic, we might want to "rename" the lane?
            // Mermaid doesn't allow renaming lanes.
            // But we can check if the lane name matches the Ref.
            // For now, simpler: Inherit.
            // If the parent was 'main', this is 'main'.

            // Check for explicit Branch Ref override?
            // If this commit is explicitly pointed to by a branch ref that is DIFFERENT
            // from the inherited one, does that mean we switched?
            // In Git, a commit can belong to multiple branches.
            // But for visualization, if I'm on 'main' and I commit, I'm still on 'main'.
            // If I checkout -b 'feat', then commit, the new commit is on 'feat'.
            // The first parent would be the commit from 'main'.
            // So, if I start a new branch, I am the first child of the parent.
            // BUT, if 'main' also continues, there will be ANOTHER child of that parent later.

            // Wait, if I do:
            // A (main)
            // git checkout -b feature
            // B (feature) -> Parent A
            // git checkout main
            // C (main) -> Parent A

            // Both B and C have A as first parent.
            // In the log, A comes first.
            // Then B (timestamp t1)
            // Then C (timestamp t2)

            // When processing B: Parent A has 0 children seen so far.
            // So B inherits "main" from A?
            // NO. B should be "feature".
            // C should be "main".

            // This implies that simply inheriting is risky if the first child is actually the divergent one.
            // But usually, the "main" line is the one that continues the branch name.

            // Heuristic refinement:
            // Look at the Refs of the commit. If it has a branch ref, use that as the assigned branch
            // IF it's different from parent.
            // But wait, "main" pointer moves. "feature" pointer moves.
            // Only the TIP has the ref. Intermediate commits don't.

            // "Deep Research" suggests:
            // "If ChildCount[P] == 0: Inherit P's branch."
            // "If ChildCount[P] > 0: Divergence detected. Start new branch."

            // In the example above:
            // A (main).
            // B (feature). Parent A.
            // C (main). Parent A.

            // If B comes first: B inherits "main".
            // Then C comes: C sees A has count 1. C starts "branch-C".
            // Result: A -> B (main), A -> C (new branch).
            // This looks like Main went into Feature, and Main diverged.
            // Ideally we want A -> C (main), A -> B (feature).

            // This effectively depends on which child is "more main".
            // Since we can't easily know future commits' refs, we stick to the simple heuristic:
            // First come, first served. The first child appearing in log extends the lane.
            // The second child branches off.
            // This is visually acceptable: one line continues straight, others branch off.

            node.assignedBranch = firstParentNode.assignedBranch;
          } else {
            // Divergence.
            // Parent already extended by someone else.
            // We must start a new branch.
            node.assignedBranch = this.determineBranchName(node, firstParentNode.assignedBranch);
          }

          parentChildCount.set(firstParentHash, existingChildren + 1);
        }
      }

      // Override/Refinement based on "Ground Truth" Refs
      // If this commit has a Ref (e.g. "HEAD -> feature/login"),
      // we might want to use that name.
      // But we can't rename the branch if it was already created by a parent.
      // However, if we JUST created a new branch (Divergence or Root), we should try to name it correctly.
      // Or if we inherited a generic name, maybe we can accept the specific name?
      // Mermaid 'branch' command takes a name.

      // Note: We've assigned 'assignedBranch' string. We haven't generated script yet.
      // So we can still change the string if we are the *first* commit on this lane.
      // But 'assignedBranch' might be "main". If we change it to "feature",
      // we must ensure previous commits on "main" aren't affected?
      // No, because we inherited. If we inherited "main", and we decide we are actually "feature",
      // we are saying the PARENT was "feature"? No.

      // If we inherited, we are continuing the lane.
      // If we are "feature" tip, but we are on the "main" lane, it looks like "main" is "feature".
      // That's actually fine.

      // What if we diverged?
      // We assigned a generated name or derived name.
      // If we have a Ref, we should definitely use it for the lane name if this is the start of the lane.

      // Let's rely on determineBranchName to pick the best name when spawning.
    }

    // Phase 3: Transpilation (Generation)
    return this.generateScript(rawCommits);
  }

  private parseLine(line: string): GitLogEntry {
    const parts = line.split('|');
    return {
      hash: parts[0] || '',
      parents: parts[1] ? parts[1].split(' ') : [],
      refs: parts[2] || '',
      subject: parts[3] || ''
    };
  }

  private determineBranchName(node: CommitNode, parentBranchName: string | null): string {
    // 1. Check for explicit Ref (e.g. "HEAD -> main", "origin/feature-1")
    const refs = node.refs.split(',').map(r => r.trim()).filter(r => r.length > 0);

    // Priority: Local branch > Remote branch > Tag
    let bestName = '';

    for (const ref of refs) {
      if (ref.startsWith('HEAD -> ')) {
        bestName = ref.replace('HEAD -> ', '');
        break; // Best match
      }
      if (!ref.startsWith('tag: ') && !ref.includes('/')) {
        // Likely a local branch name
        bestName = ref;
        // Don't break yet, HEAD -> might still be there
      }
      if (ref.includes('/') && !bestName) {
        // Remote branch? e.g. origin/main
        const parts = ref.split('/');
        // exclude origin/HEAD
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

    // 2. If no Ref, and we are branching off, generate a name.
    if (parentBranchName) {
        // We are diverging from parentBranchName.
        // Try to generate a unique name
        this.branchCounter++;
        return `branch-${this.branchCounter}`;
    }

    // 3. If Root and no Ref
    if (node.isRoot) {
        // If it's the very first commit in the log, usually 'main'
        // But if we have multiple roots (orphans), subsequent ones can't be main.
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
    // Mermaid branch names can be strings "name/with/slashes", but to be safe we often sanitize.
    // Modern mermaid handles "name", but let's be safe.
    // Actually, "Deep Research" says: Replace /[^a-zA-Z0-9_]/ with -
    let sanitized = name.replace(/[^a-zA-Z0-9_\-]/g, '-');
    if (/^[0-9]/.test(sanitized)) {
        sanitized = `ref-${sanitized}`;
    }
    return sanitized;
  }

  private sanitizeMessage(msg: string): string {
    return msg.replace(/"/g, "'");
  }

  private generateScript(rawCommits: GitLogEntry[]): string {
    const lines: string[] = [];
    lines.push('%%{init: { \'logLevel\': \'debug\', \'theme\': \'base\', \'gitGraph\': { \'showBranches\': true, \'showCommitLabel\':true, \'mainBranchName\': \'main\'}} }%%');
    lines.push('gitGraph');

    const createdBranches = new Set<string>();
    let currentActiveBranch = ''; // Mermaid starts on 'main' implicitly, but we'll be explicit

    // Actually Mermaid starts with 'main' created.
    // Ideally we want to identify which branch is 'main' in our logic.
    // If our logic determined a branch is named 'main', we should align.

    // We iterate through commits and emit commands.

    for (const raw of rawCommits) {
      const node = this.commits.get(raw.hash)!;
      const targetLane = node.assignedBranch;

      // 1. Handle Context Switching / Branch Creation
      if (node.isRoot) {
         // It's a root.
         // If it's the FIRST root, Mermaid implicitly provides 'main'.
         // If targetLane is 'main', we are good.
         // If targetLane is NOT 'main' (e.g. orphan), we have to be careful.
         // Mermaid doesn't easily support multiple disconnected roots in one graph without visual tricks.
         // Trick: "checkout main" -> "branch orphan" -> "checkout orphan" -> "commit".
         // This draws a line from main start to orphan. Not perfect but works for visualization.

         if (!createdBranches.has(targetLane)) {
             if (targetLane !== 'main') {
                 // Creating a new root-like branch
                 // We need to branch off from somewhere.
                 // If createdBranches is empty, this IS the main branch effectively.
                 if (createdBranches.size === 0) {
                     // This is the first branch.
                     // But Mermaid forces the first branch to be 'main' (or whatever is configured).
                     // We configured 'mainBranchName': 'main'.
                     // If targetLane is 'feature', we will have a mismatch.
                     // We can't rename the implicit start branch.
                     // So we just have to assume the first branch IS main, or alias it.
                     // Let's just create it.

                     // If we are not main, we branch from 'main' (which exists implicitly).
                     lines.push(`   branch ${targetLane}`);
                 } else {
                     // Use the current active branch (or main) to spawn this orphan?
                     // Or just checkout main then branch.
                     lines.push(`   checkout main`);
                     lines.push(`   branch ${targetLane}`);
                 }
             }
             createdBranches.add(targetLane);
         }

         if (currentActiveBranch !== targetLane) {
             lines.push(`   checkout ${targetLane}`);
             currentActiveBranch = targetLane;
         }

      } else {
          // Not a root.
          // 1. Ensure branch exists.
          if (!createdBranches.has(targetLane)) {
              // We need to create it.
              // Where does it come from?
              // From its parent's branch.
              const parentHash = node.parents[0];
              const parentNode = this.commits.get(parentHash); // Should exist if not root

              if (parentNode) {
                  const parentBranch = parentNode.assignedBranch;

                  if (currentActiveBranch !== parentBranch) {
                      lines.push(`   checkout ${parentBranch}`);
                      currentActiveBranch = parentBranch;
                  }

                  lines.push(`   branch ${targetLane}`);
                  createdBranches.add(targetLane);
                  lines.push(`   checkout ${targetLane}`);
                  currentActiveBranch = targetLane;
              } else {
                  // Fallback (Boundary issue handled as root, so shouldn't hit here)
                  lines.push(`   branch ${targetLane}`);
                  createdBranches.add(targetLane);
              }
          }

          // 2. Switch to it
          if (currentActiveBranch !== targetLane) {
              lines.push(`   checkout ${targetLane}`);
              currentActiveBranch = targetLane;
          }
      }

      // 2. Emit Operation (Merge or Commit)
      if (node.isMerge) {
          // Identify source branches (branches being merged INTO current)
          // node.parents[0] is current lane parent (already handled).
          // node.parents[1..n] are sources.

          // Octopus merge handling: Chain merges.
          // We iterate starting from parent 1.
          for (let i = 1; i < node.parents.length; i++) {
              const sourceHash = node.parents[i];
              const sourceNode = this.commits.get(sourceHash);

              if (sourceNode) {
                  const sourceBranch = sourceNode.assignedBranch;

                  // Can only merge if sourceBranch exists
                  if (createdBranches.has(sourceBranch)) {
                      // Don't merge if it's the same branch (shouldn't happen in valid git, but maybe with lane assignment logic)
                      if (sourceBranch !== targetLane) {
                          // Mermaid merge
                          // Use the specific commit ID only on the LAST merge if it's an octopus?
                          // Or create intermediate merges?
                          // Mermaid allows `merge branchname`.
                          // To preserve the specific Hash ID of the merge commit, we should attach it to the LAST merge command.

                          const isLastMerge = (i === node.parents.length - 1);
                          const idAttr = isLastMerge ? ` id: "${node.hash.substring(0,7)}"` : '';
                          // Maybe add tag if present
                          const tagAttr = (isLastMerge && this.getTag(node.refs)) ? ` tag: "${this.getTag(node.refs)}"` : '';

                          lines.push(`   merge ${sourceBranch}${idAttr}${tagAttr}`);
                      }
                  } else {
                       // Source branch unknown (boundary). Treat as regular commit with note?
                       // If this is the only merge source, and it's missing, we fall back to commit.
                       if (node.parents.length === 2) {
                           // Binary merge with unknown source.
                           lines.push(`   commit id: "${node.hash.substring(0,7)}" type: HIGHLIGHT`);
                       }
                  }
              } else {
                  // Parent missing from log.
                   if (node.parents.length === 2) {
                       lines.push(`   commit id: "${node.hash.substring(0,7)}"`);
                   }
              }
          }
      } else {
          // Regular commit
          const id = node.hash.substring(0,7);
          const tag = this.getTag(node.refs);
          const tagStr = tag ? ` tag: "${tag}"` : '';
          // We can add message too? Mermaid doesn't display message easily in gitGraph except as label?
          // Actually no, gitGraph commit doesn't take message. It takes id, tag, type.

          lines.push(`   commit id: "${id}"${tagStr}`);
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
