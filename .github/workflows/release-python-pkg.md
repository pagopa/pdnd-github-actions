# release-python-pkg
A Github Actions reusable workflow for releasing Python packages.

The workflow is meant to be triggered on push of new tags and it will:
- check tag version format:
    - `vx.x.x` for production
    - `vx.x.x-test`, `vx.x.x-beta`, `vx.x.x-dev` for test
- build the package and push to registry
- notify workflow outcome to Slack