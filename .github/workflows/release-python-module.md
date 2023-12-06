# release-python-module
A Github Actions reusable workflow for releasing Python modules to CodeArtifact via Semantic Release. The module is built and published according to configurations in the module's **`pyproject.toml`** file.

The workflow is meant to be manually triggered on the default main branch only, and it will:
* create a new runner
* checkout the build branch
* login to AWS CodeArtifact and save the credentials as env vars
* call the python semantic-release default action to:
  * read the git commit and tag history
  * build and publish the package
  * create a tagged release
  * bump the module version
  * push the changes to git
* destroy runner

To determine if a release is to be made, semantic-release reads the commit history then compares it with the **`pyproject.toml`** for the allowed keywords (tags) and their release type, for instance:
```
[tool.semantic_release.commit_parser_options]
allowed_tags = [
    "build",
    "bugfix",
    "chore",
    "ci",
    "docs",
    "feat",
    "fix",
    "patch",
    "major",
    "minor",
    "perf",
    "style",
    "refactor",
    "test",
]
major_tags = ["major"]
minor_tags = ["feat", "minor"]
patch_tags = ["fix", "perf", "patch", "bugfix"]
```
A release is made if there is at least a commit with an allowed keyword that was made after the last released tag. The kind of release (major, minor, patch) determines the module's version bump:
* major = X.0.0
* minor = 0.X.0
* patch = 0.0.X