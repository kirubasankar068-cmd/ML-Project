# TODO - Add SECE-24-28 smartbugprioritypredictor-ta-mlops-project into this GitHub repository

## Plan summary
- Clone the external GitHub repository into a temp folder.
- Decide how to integrate it with the current codebase (merge vs. subdirectory vs. submodule).
- Copy/merge files into this repo, or add it as a submodule depending on user preference.
- Ensure no conflicting package managers/lock files break CI.
- Update README (and any docs) to reflect integration.
- Commit and push changes.

## Steps
1. Fetch/clone `https://github.com/SECE-24-28/smartbugprioritypredictor-ta-mlops-project.git` into a temp directory.
2. Inspect the cloned repository’s top-level structure and README.
3. Compare with current repository structure.
4. Draft an integration approach (merge vs submodule vs copy to subfolder) to avoid conflicts.
5. Implement integration in a safe way.
6. Validate build/test commands (at least: backend unit tests and frontend build if possible).
7. Commit with a clear message.
8. Push to GitHub.

