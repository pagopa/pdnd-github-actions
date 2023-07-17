# release-node-ui-dataviz
A Github Actions reusable workflow for releasing NodeJs UI and Dataviz apps.

The workflow is meant to be triggered on push of new tags and it will:
- create new runner
- check tag version format:
    - `vx.x.x` for production
    - `vx.x.x-test`, `vx.x.x-beta`, `vx.x.x-dev` for test
- build the application with npm
- copy builded app to S3 Bucket
- notify workflow outcome to Slack
- destroy runner