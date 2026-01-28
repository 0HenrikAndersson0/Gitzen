# Gitzen Help & Documentation

Gitzen is a modern, efficient Git GUI designed to streamline your development workflow. This guide covers key shortcuts, features, and how to perform common tasks.

## Keyboard Shortcuts

Gitzen supports several keyboard shortcuts to enhance your productivity, particularly for managing the layout and visibility of different panels.

| Shortcut | Description |
| :--- | :--- |
| **Ctrl + Arrow Up** | **Maximize Graph:** Hides both the left sidebar (branches/tags) and the bottom panel (commit/log), giving the commit graph the full window space. |
| **Ctrl + Arrow Left** | **Toggle Sidebar:** Shows or hides the left sidebar containing the Branches and Tags panels. |
| **Ctrl + Arrow Down** | **Toggle Bottom Panel:** Shows or hides the bottom panel containing the Commit area and Activity Log. |

## Key Features & Usage

### 1. Repository Management
-   **Clone Repository:** On the welcome screen, use the "Clone Repository" tab to clone a remote repo by URL.
-   **Open Repository:** Use the "Open Repository" tab to open an existing local repository.
-   **Switch/Open New:** Use the dropdown in the top header to switch between recent repositories or open a new one.

### 2. Branching & Merging
-   **Create Branch:** Click the "+" icon next to the "Branches" header in the left sidebar.
-   **Checkout Branch:** Double-click a branch name in the sidebar to check it out.
-   **Delete Branch:** Click the trash icon next to a branch name.
-   **Merge:** Right-click a branch in the sidebar and select "Merge into current".
-   **Rebase:** Right-click a branch/commit to initiate a rebase.

### 3. Committing & Staging
-   **Stage/Unstage:** Click the checkbox next to files in the "Commit" panel (bottom left) to stage or unstage them.
-   **Commit:** Enter a message in the text area and click "Commit" (or `Ctrl+Enter` if focused).
-   **Amend:** (Context menu option on the latest commit).

### 4. Cherry-Picking
-   **Cherry Pick:** Right-click any commit in the graph and select **"Cherry Pick Commit"**.
-   **Conflict Resolution:** If a cherry-pick encounters conflicts, a banner will appear at the top. You can resolve conflicts using the dialog, then click **"Continue"**. If the result is an empty commit (e.g., changes already exist), you can click **"Skip"**.

### 5. Stashing
-   **Stash Changes:** Click the "Stash" button in the top header to stash uncommitted changes.
-   **Apply/Pop:** Manage your stashes from the "Stashes" section in the left sidebar.

### 6. Conflict Resolution
-   **Merge Conflict Dialog:** Automatically appears when conflicts are detected.
-   **Resolve Options:**
    -   **Open Merge Tool:** Opens the file in your configured merge tool.
    -   **Keep/Delete:** For deleted file conflicts, choose to keep the file or accept the deletion.
    -   **Mark Resolved:** Check files and click "Mark as Resolved" once fixed.

## Tips
-   **Auto-Refresh:** The UI updates automatically, but actions like fetching are optimized to happen in the background.
-   **Visual Graph:** The commit graph renders the history topology. Hover over commits to highlight their path.
