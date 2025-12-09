# Release Process

This project uses a hybrid release workflow:
1. **Local Script**: Handles version bumping, changelog generation, and tagging.
2. **GitHub Actions**: Handles building, publishing to VS Code Marketplace, and creating the GitHub Release.

## Prerequisites

2. **Git**: Must be installed.
3. **VS Code Marketplace Token**: The `VSCE_PAT` secret must be set in the GitHub Repository Secrets.

## How to Release

1.  **Run the Release Script**:
    ```bash
    npm run release
    ```
2.  **Follow the Prompts**:
    *   Enter the new version number (e.g., `1.2.3`).Update re
    *   The script will:
        *   Update `package.json`.
        *   Build a local `.vsix` for verification.
        *   Update `CHANGELOG.md` with commits since the last tag.
        *   Commit these changes.
        *   Create a git tag (e.g., `v1.2.3`).
        *   Push the commit and tag to GitHub.

3.  **Watch CI/CD**:
    *   Pushing the tag triggers the `.github/workflows/release.yml` workflow.
    *   This workflow will:
        *   Build the extension.
        *   Publish to the VS Code Marketplace.
        *   Create a GitHub Release with the `.vsix` attached and release notes populated.

## Troubleshooting

*   **Marketplace Publish Failed**: Check the GitHub Actions logs. Ensure the `VSCE_PAT` secret is valid and has the correct permissions.
*   **Changelog Issues**: If `CHANGELOG.md` looks wrong, you can amend the commit and force push the tag *before* the CI/CD pipeline finishes (or just fix it in the next release).
