interface GitLogEntry {
    hash: string;
    parents: string[];
    branchName: string;
    message: string;
  }
  
  class GitMermaidService {
    public convertToMermaid(rawInput: string): string {
      const lines = rawInput.trim().split('\n');
      const hashToBranch = new Map<string, string>();
      
      // 1. Pre-process: Map and Sanitize all entries
      const logs: GitLogEntry[] = lines.map(line => {
        const [hash, parents, ref, message] = line.split('|');
        const shortHash = hash.substring(0, 7);
        
        let branchRef = ref.trim();
  
        // Handle multiple refs (take the first one)
        if (branchRef.includes(',')) {
            branchRef = branchRef.split(',')[0].trim();
        }
  
        // Clean up "HEAD ->" pointers
        branchRef = branchRef.replace('HEAD -> ', '');
  
        // Map master/main consistency
        if (!branchRef || branchRef === 'master' || branchRef.includes('master')) {
            branchRef = 'main';
        }
  
        // Final sanitization: Remove special characters Mermaid hates
        const sanitizedBranchName = branchRef.replace(/[^a-zA-Z0-9_]/g, '_');
        const parentsArr = parents ? parents.trim().split(' ').map(p => p.substring(0, 7)) : [];
        
        hashToBranch.set(shortHash, sanitizedBranchName);
  
        return {
          hash: shortHash,
          parents: parentsArr,
          branchName: sanitizedBranchName,
          message: message.trim()
        };
      });
  
  
      let mermaid = 'gitGraph\n';
      const createdBranches = new Set<string>(['main']);
      let currentActiveBranch = 'main';
  
      // 3. Process logs with Safe Branch Navigation
      logs.forEach((entry, index) => {
        // First commit initialization
        if (index === 0) {
          mermaid += `  commit id: "${entry.hash}"\n`;
          return;
        }
  
        // Determine the branch of the first parent
        const firstParentHash = entry.parents[0];
        let parentBranch = hashToBranch.get(firstParentHash) || 'main';
  
        // SAFETY: If the parent branch hasn't been created in Mermaid yet, fall back to main
        if (!createdBranches.has(parentBranch)) {
          parentBranch = 'main';
        }
  
        // Move to parent's branch before performing actions
        if (currentActiveBranch !== parentBranch) {
          mermaid += `  checkout ${parentBranch}\n`;
          currentActiveBranch = parentBranch;
        }
  
        // Handle Branch Creation (branch before checkout)
        if (!createdBranches.has(entry.branchName)) {
          mermaid += `  branch ${entry.branchName}\n`;
          createdBranches.add(entry.branchName);
          currentActiveBranch = entry.branchName;
        }
  
        // Ensure we are on the specific branch for this commit
        if (currentActiveBranch !== entry.branchName) {
          mermaid += `  checkout ${entry.branchName}\n`;
          currentActiveBranch = entry.branchName;
        }
  
        // Handle Merges vs Regular Commits
        if (entry.parents.length > 1) {
          const secondParentHash = entry.parents[1];
          let sourceBranch = hashToBranch.get(secondParentHash);
          
          // Only merge if the source branch exists and is not the current branch
          if (sourceBranch && createdBranches.has(sourceBranch) && sourceBranch !== entry.branchName) {
            mermaid += `  merge ${sourceBranch}\n`;
          } else {
            mermaid += `  commit id: "${entry.hash}" tag: "merge"\n`;
          }
        } else {
          mermaid += `  commit id: "${entry.hash}"\n`;
        }
      });
  
      return mermaid;
    }
  }

  const service = new GitMermaidService();

  const mermaid = service.convertToMermaid(`
cfb49e1a6882bc6a1b55be36c74101fcc5ca2f3e|||second
169511dd306e5ea16f25e82478e69c5b13c9efee|cfb49e1a6882bc6a1b55be36c74101fcc5ca2f3e||Adds start screen and improves lap timing
35e289c38df6be684a2ebdb340164fd5372ab6f4|169511dd306e5ea16f25e82478e69c5b13c9efee||Adds ghost car replay feature
072ed3a044dcd0e9647519f37f9d59fdf16915b5|35e289c38df6be684a2ebdb340164fd5372ab6f4||Enhances UI with consistent accent color and borders
bf27816598c218521e90bdef3ecab69ffd6d7337|072ed3a044dcd0e9647519f37f9d59fdf16915b5||Persists fastest lap data to localStorage
29a2db219b4fff4fa459aeb7d29ecbbdb38b21ff|bf27816598c218521e90bdef3ecab69ffd6d7337||Adds day/night game mode toggle
f79946251ae6822f46cee4b611cf572190c834fd|29a2db219b4fff4fa459aeb7d29ecbbdb38b21ff||Adds quit to menu functionality and instructions toggle
f0f7133e6c42f56e96b5ad8368b9030ad48b0fb1|f79946251ae6822f46cee4b611cf572190c834fd||Refactors night mode rendering for improved visuals
c1ba037fbb1936f62f14ac1fba45e9759d28567a|f0f7133e6c42f56e96b5ad8368b9030ad48b0fb1||Darkens overlay for better visibility
c35a2fb48db93d79fe72a5c0462f929c2018f794|c1ba037fbb1936f62f14ac1fba45e9759d28567a|origin/dev, dev|Improves headlight rendering with cone shape
ef9bc4548a924782e20e6ee3bfa1df42e8607b7d|c35a2fb48db93d79fe72a5c0462f929c2018f794||Added removeMe file
4f1221243aaef628a79565dbe24d2ed069a591e3|c35a2fb48db93d79fe72a5c0462f929c2018f794 ef9bc4548a924782e20e6ee3bfa1df42e8607b7d|HEAD -> master, origin/master, origin/HEAD|Merge branch 'feature/test' into master

`);
  console.log(mermaid);