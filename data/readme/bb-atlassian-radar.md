# RADAR

RADAR is a static site generator for REST API documentation and is an implementation of the current version of the [Open API specification (formerly known as Swagger)](https://github.com/OAI/OpenAPI-Specification). RADAR can be used by any Open API provider. Built on React/Redux, it offers searching, browsing and viewing REST documentation for any product and any version of that product. It is designed with large APIs in mind, where a single scrolling page of endpoints becomes too unwieldy.

Atlassian uses RADAR to generate documentation for the [Bitbucket REST API](https://developer.atlassian.com/bitbucket/api/2/reference/).

The name RADAR is an acronym for **R**est **A**PI **D**ocumentation **A**pplication in **R**eact.

## How to

Before you do anything: `npm install`
This README assumes you are running a *nix machine.

### Test

- Running unit tests: `npm test`

### Develop

- To start the application:
    - `npm start` - You'll need to run 2 servers for development, this command does the following:
        - `npm run develop-webpack` - Webpack dev server - this handles hot reloading the JS
        - `npm run develop-express` - Express dev server - this handles compiling the templates and baking in the test data

    - Go to `http://localhost:8080/docs/bitbucket/latest/` <- This will load the `test-data/bitbucket/latest/swagger.json` file.
- You now have hot reloading of JS assets, and automatic rebundling. All without a reload. Cool, huh?
- You can now make changes to any JS or JSX files (or add more).
  _Note:_ changes to image assets are currently not auto-detected, so if you add or change any, you'll need to run `gulp copy:images`.

_Note:_ `redux-devtools` are installed. You can use `Ctrl+h` to show/hide or `Ctrl+q` to move them. They are useful for time-travel debugging and seeing what's going on in the app state.

### Deploying

We assume you will want to back RADAR with your own server.
The `server/dev-server.js` file gives some insight into what a RADAR server will need to be able to do.
RADAR relies on wildcard routing to handle the file-fetching logic server-side, while keeping the routing for resources client-side.

This package only handles rendering a semi-static front end for displaying your documentation. How you store and/or version your docs is entirely up to you.

### Limitations

- JSON only; RADAR currently only supports JSON specs, YAML is not (yet) supported
- Referencing other files is _not_ supported. The entire spec must be in one file.

## Contributing

Pull requests, issues and comments welcome. For pull requests:

* Add tests for new features and bug fixes
* Follow the existing style
* Separate unrelated changes into multiple pull requests

See the existing [issues](https://bitbucket.org/atlassian/radar/issues?status=new&status=open) for things to start contributing.

For bigger changes, make sure you start a discussion first by creating
an issue and explaining the intended change.

Atlassian requires contributors to sign a Contributor License Agreement,
known as a CLA. This serves as a record stating that the contributor is
entitled to contribute the code/documentation/translation to the project
and is willing to have it used in distributions and derivative works
(or is willing to transfer ownership).

Prior to merging your pull requests, please follow the appropriate
link below to digitally sign the CLA. The Corporate CLA is for those who are
contributing as a member of an organization and the individual CLA is for
those contributing as an individual.

* [Corporate CLA](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=e1c17c66-ca4d-4aab-a953-2c231af4a20b)
* [Individual CLA](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=3f94fbdc-2fbe-46ac-b14c-5d152700ae5d)

## License

Copyright (c) 2016 Atlassian and others.
Apache 2.0 licensed, see [LICENSE.txt](LICENSE.txt) file.

