# Gitea Helm Chart <!-- omit from toc -->

- [Introduction](#introduction)
- [Update and versioning policy](#update-and-versioning-policy)
- [Dependencies](#dependencies)
  - [HA Dependencies](#ha-dependencies)
  - [Dependency Versioning](#dependency-versioning)
- [Installing](#installing)
- [High Availability](#high-availability)
- [Limit resources](#limit-resources)
- [Configuration](#configuration)
  - [Default Configuration](#default-configuration)
    - [Database defaults](#database-defaults)
    - [Server defaults](#server-defaults)
    - [Metrics defaults](#metrics-defaults)
    - [Rootless Defaults](#rootless-defaults)
    - [OpenShift Compatibility](#openshift-compatibility)
    - [Gateway API](#gateway-api)
    - [Session, Cache and Queue](#session-cache-and-queue)
  - [Single-Pod Configurations](#single-pod-configurations)
  - [Additional app.ini settings](#additional-appini-settings)
    - [User defined environment variables in app.ini](#user-defined-environment-variables-in-appini)
  - [External Database](#external-database)
  - [Ports and external url](#ports-and-external-url)
  - [ClusterIP](#clusterip)
  - [SSH and Ingress](#ssh-and-ingress)
  - [SSH on crio based kubernetes cluster](#ssh-on-crio-based-kubernetes-cluster)
  - [Cache](#cache)
  - [Persistence](#persistence)
  - [Admin User](#admin-user)
  - [LDAP Settings](#ldap-settings)
  - [OAuth2 Settings](#oauth2-settings)
- [Configure commit signing](#configure-commit-signing)
- [Metrics and profiling](#metrics-and-profiling)
  - [Secure Metrics Endpoint](#secure-metrics-endpoint)
- [Pod annotations](#pod-annotations)
  - [Secret checksum annotations](#secret-checksum-annotations)
- [TLS certificate rotation](#tls-certificate-rotation)
- [Themes](#themes)
- [Renovate](#renovate)
- [Parameters](#parameters)
  - [Global](#global)
  - [deployment](#deployment)
  - [Gateway API](#gateway-api-1)
  - [Ingress](#ingress)
  - [Network](#network)
  - [Image](#image)
  - [Security](#security)
  - [Route](#route)
  - [Secrets](#secrets)
  - [Service](#service)
  - [ServiceAccount](#serviceaccount)
  - [Persistence](#persistence-1)
  - [Init](#init)
  - [Gitea](#gitea)
  - [LivenessProbe](#livenessprobe)
  - [ReadinessProbe](#readinessprobe)
  - [StartupProbe](#startupprobe)
  - [valkey](#valkey)
  - [CloudNativePG](#cloudnativepg)
  - [Advanced](#advanced)
- [Contributing](#contributing)
- [Upgrading](#upgrading)

[Gitea](https://gitea.com) is a community managed lightweight code hosting solution written in Go.
It is published under the MIT license.

## Introduction

This helm chart has taken some inspiration from [jfelten's helm chart](https://github.com/jfelten/gitea-helm-chart).
Yet it takes a completely different approach in providing a database and cache with dependencies.
Additionally, this chart allows to provide LDAP and admin user configuration with values.

## Update and versioning policy

The Gitea helm chart versioning does not follow Gitea's versioning.
The latest chart version can be looked up in [https://dl.gitea.com/charts](https://dl.gitea.com/charts) or in the [repository releases](https://gitea.com/gitea/helm-gitea/releases).

The chart aims to follow Gitea's releases closely.
There might be times when the chart is behind the latest Gitea release.
This might be caused by different reasons, most often due to time constraints of the maintainers (remember, all work here is done voluntarily in the spare time of people).
If you're eager to use the latest Gitea version earlier than this chart catches up, then change the tag in `values.yaml` to the latest Gitea version.
Note that besides the exact Gitea version one can also use the `:1` tag to automatically follow the latest Gitea version.
This should be combined with `deployment.gitea.image.pullPolicy: "Always"`.
Important: Using the `:1` will also automatically jump to new minor release (e.g. from 1.13 to 1.14) which may eventually cause incompatibilities if major/breaking changes happened between these versions.
This is due to Gitea not strictly following [semantic versioning](https://semver.org/#summary) as breaking changes do not increase the major version.
I.e., "minor" version bumps are considered "major".
Yet most often no issues will be encountered and the chart maintainers aim to communicate early/upfront if this would be the case.

## Dependencies

Gitea is most performant when run with an external database and cache.
This chart provides those dependencies via sub-charts.
Users can also configure their own external providers via the configuration.

### HA Dependencies

- PostgreSQL ([CloudNativePG](https://cloudnative-pg.io/)), disabled by default
- Valkey ([Official Valkey Helm Chart](https://github.com/valkey-io/valkey-helm)), enabled by default

CloudNativePG is **not** bundled as a sub-chart.
Only the `Cluster` resource is rendered by this chart, the [CloudNativePG operator](https://cloudnative-pg.io/documentation/current/installation_upgrade/) must already be installed cluster-wide.
Because that operator cannot be assumed to be present, `cloudnativePG.enabled` defaults to `false`.
Set it to `true` once the operator is installed, or use an external database instead.

### Dependency Versioning

Updates of sub-charts will be incorporated into the Gitea chart as they are released.
The reasoning behind this is that new users of the chart will start with the most recent sub-chart dependency versions.

**Note** If you want to stay on an older appVersion of a dependency (e.g. PostgreSQL), you need to override the image tag in your `values.yaml` file.
In fact, we recommend to do so right from the start to be independent of major dependency changes as they are released.
There is no need to update to every new PostgreSQL major version - you can happily skip some and do larger updates when you are ready for them.

We recommend to use a rolling tag like `:<majorVersion>-debian-<debian major version>` to incorporate minor and patch updates for the respective major version as they are released.
Alternatively you can also use a versioning helper tool like [renovate](https://github.com/renovatebot/renovate).

Please double-check the image repository and available tags in the sub-chart:

- [CloudNativePG](https://github.com/cloudnative-pg/postgres-containers/pkgs/container/postgresql)
- [Valkey](https://hub.docker.com/r/valkey/valkey/tags)

and look up the image tag which fits your needs on Dockerhub.

## Installing

```sh
helm repo add gitea-charts https://dl.gitea.com/charts/
helm repo update
helm install gitea gitea-charts/gitea
```

Alternatively, the chart can also be installed from Dockerhub (since v9.6.0)

```sh
helm install gitea oci://registry-1.docker.io/giteacharts/gitea
```

To avoid potential Dockerhub rate limits, the chart can also be installed via [docker.gitea.com](https://blog.gitea.com/docker-registry-update/) (since v9.6.0)

```sh
helm install gitea oci://docker.gitea.com/charts/gitea
```

When upgrading, please refer to the [Upgrading](#upgrading) section at the bottom of this document for major and breaking changes.

## High Availability

Since version 9.0.0 this chart supports running Gitea and it's dependencies in HA mode.
Care must be taken for production use as not all implementation details of Gitea core are officially HA-ready yet.

Deploying a HA-ready Gitea instance requires some effort including using HA-ready dependencies.
See the [HA Setup](docs/ha-setup.md) document for more details.

## Limit resources

If the application is deployed with a CPU resource limit, Prometheus may throw a CPU throttling warning for the
application. This has more or less to do with the fact that the application finds the number of CPUs of the host, but
cannot use the available CPU time to perform computing operations.

The application must be informed that despite several CPUs only a part (limit) of the available computing time is
available. As this is a Golang application, this can be implemented using `GOMAXPROCS`. The following example is one way
of defining `GOMAXPROCS` automatically based on the defined CPU limit like `1000m`. Please keep in mind, that the CFS
rate of `100ms` - default on each kubernetes node, is also very important to avoid CPU throttling.

Further information about this topic can be found [under this link](https://kanishk.io/posts/cpu-throttling-in-containerized-go-apps/).

> [!NOTE]
> The environment variable `GOMAXPROCS` is set automatically, when a CPU limit is defined. An explicit configuration is
> not anymore required.
>
> Please note that a CPU limit < `1000m` can also lead to CPU throttling. Please read the linked documentation carefully.

```yaml
deployment:
  env:
    # Will be automatically defined!
    - name: GOMAXPROCS
      valueFrom:
        resourceFieldRef:
          divisor: "1" # Is required for GitDevOps systems like ArgoCD/Flux. Otherwise throw the system a diff error. (k8s-default=1)
          resource: limits.cpu

resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 512Mi
```

## Configuration

Gitea offers lots of configuration options.
This is fully described in the [Gitea Cheat Sheet](https://docs.gitea.com/administration/config-cheat-sheet).

```yaml
gitea:
  config:
    APP_NAME: "Gitea: With a cup of tea."
    repository:
      ROOT: "~/gitea-repositories"
    repository.pull-request:
      WORK_IN_PROGRESS_PREFIXES: "WIP:,[WIP]:"
```

### Default Configuration

This chart will set a few defaults in the Gitea configuration based on the service and ingress settings.
All defaults can be overwritten in `gitea.config`.

INSTALL_LOCK is always set to true, since we want to configure Gitea with this helm chart and everything is taken care of.

_All default settings are made directly in the generated `app.ini`, not in the Values._

#### Database defaults

If a builtIn database is enabled the database configuration is set automatically.
For example, the CloudNativePG `Cluster` will appear in the `app.ini` as:

```ini
[database]
DB_TYPE = postgres
HOST = RELEASE-NAME-postgresql-rw.default.svc.cluster.local:5432
NAME = gitea
USER = gitea
```

`PASSWD` is not part of the generated `app.ini`.
It is injected into the `init-app-ini` init container as the `GITEA__database__PASSWD` environment variable, sourced
from the credentials Secret referenced by `cloudnativePG.credentials`, and merged into the `app.ini` at startup.

#### Server defaults

The server defaults are a bit more complex.
If ingress is `enabled`, the `ROOT_URL`, `DOMAIN` and `SSH_DOMAIN` will be set accordingly.
`HTTP_PORT` always defaults to `3000` as well as `SSH_PORT` to `22`.

```ini
[server]
APP_DATA_PATH = /data
DOMAIN = git.example.com
HTTP_PORT = 3000
PROTOCOL = http
ROOT_URL = http://git.example.com
SSH_DOMAIN = git.example.com
SSH_LISTEN_PORT = 22
SSH_PORT = 22
ENABLE_PPROF = false
```

#### Metrics defaults

The Prometheus `/metrics` endpoint is disabled by default.

```ini
[metrics]
ENABLED = false
```

#### Rootless Defaults

If `.Values.deployment.gitea.image.rootless: true`, then the following will occur. In case you use `.Values.deployment.gitea.image.fullOverride`, check that this works in your image:

- `$HOME` becomes `/data/gitea/git`

  [see deployment.yaml](./templates/deployment.yaml) template inside (init-)container "env" declarations

- `START_SSH_SERVER: true` (Unless explicity overwritten by `gitea.config.server.START_SSH_SERVER`)

  [see \_helpers.tpl](./templates/_helpers.tpl) in `gitea.inline_configuration.defaults.server` definition

- `SSH_LISTEN_PORT: 2222` (Unless explicity overwritten by `gitea.config.server.SSH_LISTEN_PORT`)

  [see \_helpers.tpl](./templates/_helpers.tpl) in `gitea.inline_configuration.defaults.server` definition

- `SSH_LOG_LEVEL` environment variable is not injected into the container

  [see deployment.yaml](./templates/deployment.yaml) template inside container "env" declarations

#### OpenShift Compatibility

When installing on OpenShift, enable the compatibility profile so chart-managed pods render SCC-safe defaults and the Gitea init containers stop forcing `runAsUser: 1000`:

```yaml
openshift:
  enabled: true
```

When enabled, the chart applies `allowPrivilegeEscalation: false`, drops all
Linux capabilities, sets `runAsNonRoot: true` and uses
`seccompProfile.type: RuntimeDefault`.

The deployment keeps the existing vanilla Kubernetes behavior when OpenShift
compatibility is disabled. Auto-detection relies on the
`security.openshift.io/v1/SecurityContextConstraints` API, so set
`openshift.enabled: true` explicitly when rendering outside a live cluster.

The PodSpec `hostUsers` field is independent of the OpenShift profile and is only
rendered when `deployment.hostUsers` is set to a boolean. When left unset, the
field is omitted so the platform default applies.

If you also want to expose Gitea through an OpenShift Route, enable the optional Route resource:

```yaml
route:
  enabled: true
  host: git.apps.example.com
  tls:
    termination: edge
```

When `route.host` is set, the chart uses it for `DOMAIN`, `SSH_DOMAIN`, and `ROOT_URL`. Setting `route.tls.termination` also switches the default `ROOT_URL` scheme to `https`.

#### Gateway API

The chart can also expose Gitea through Gateway API resources (`HTTPRoute`, `TCPRoute`, `BackendTLSPolicy`, and optionally `Gateway`).
See [docs/gateway-api.md](docs/gateway-api.md) for the full guide, including how routes interact with `ROOT_URL`/`DOMAIN` resolution and recommended topologies.

#### Session, Cache and Queue

The session, cache and queue settings are set to use the built-in Valkey Cluster sub-chart dependency.
If Valkey Cluster is disabled, the chart will fall back to the Gitea defaults which use "memory" for `session` and `cache` and "level" for `queue`.

While these will work and even not cause immediate issues after startup, **they are not recommended for production use**.
Reasons being that a single pod will take on all the work for `session` and `cache` tasks in its available memory.
It is likely that the pod will run out of memory or will face substantial memory spikes, depending on the workload.
External tools such as `valkey` or `memcached` handle these workloads much better.

### Single-Pod Configurations

If HA is not needed/desired, the following configurations can be used to deploy a single-pod Gitea instance.

1. For a production-ready single-pod Gitea instance (using the chart dependency `valkey` and a single-instance CloudNativePG `Cluster`):

   <details>

   <summary>values.yml</summary>

   ```yaml
   valkey:
     enabled: true
   cloudnativePG:
     enabled: true
     instances: 1

   persistence:
     enabled: true

   gitea:
     config:
       database:
         DB_TYPE: postgres
       indexer:
         ISSUE_INDEXER_TYPE: bleve
         REPO_INDEXER_ENABLED: true
   ```

   </details>

2. For a minimal DEV installation (using the built-in sqlite DB instead of Postgres):

   This will result in a single-pod Gitea instance _without any dependencies and persistence_.
   **Do not use this configuration for production use**.

   <details>

   <summary>values.yml</summary>

   ```yaml
   valkey:
     enabled: false
   cloudnativePG:
     enabled: false

   persistence:
     enabled: false

   gitea:
     config:
       database:
         DB_TYPE: sqlite3
       session:
         PROVIDER: memory
       cache:
         ADAPTER: memory
       queue:
         TYPE: level
   ```

   </details>

### Additional app.ini settings

> **The [generic](https://docs.gitea.com/administration/config-cheat-sheet#overall-default)
> section cannot be defined that way.**

Some settings inside _app.ini_ (like passwords or whole authentication configurations) must be considered sensitive and therefore should not be passed via plain text inside the _values.yaml_ file.
In times of _GitOps_ the values.yaml could be stored in a Git repository where sensitive data should never be accessible.

The Helm Chart supports this approach and let the user define custom sources like
Kubernetes Secrets to be loaded as environment variables during _app.ini_ creation or update.

```yaml
gitea:
  additionalConfigSources:
    - secret:
        secretName: gitea-app-ini-oauth
    - configMap:
        name: gitea-app-ini-plaintext
```

This would mount the two additional volumes (`oauth` and `some-additionals`) from different sources to the init container where the _app.ini_ gets updated.
All files mounted that way will be read and converted to environment variables and then added to the _app.ini_ using [Gitea config edit-ini](https://docs.gitea.com/administration/config-cheat-sheet#use-environment-variables-to-setup-gitea).

The key of such additional source represents the section inside the _app.ini_.
The value for each key can be multiline ini-like definitions.

In example, the referenced `gitea-app-ini-plaintext` could look like this.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gitea-app-ini-plaintext
data:
  session: |
    PROVIDER=memory
    SAME_SITE=strict
  cron.archive_cleanup: |
    ENABLED=true
```

Or when using a Kubernetes secret, having the same data structure:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitea-security-related-configuration
type: Opaque
stringData:
  security: |
    PASSWORD_COMPLEXITY=off
  session: |
    SAME_SITE=strict
```

#### User defined environment variables in app.ini

Users are able to define their own environment variables, which are loaded into the containers.
We also support to directly interact with the generated _app.ini_.

To inject self defined variables into the _app.ini_ a certain format needs to be honored.
This is described in detail on the [Gitea config edit-ini](https://docs.gitea.com/administration/config-cheat-sheet#use-environment-variables-to-setup-gitea) page.

Prior to Gitea 1.20 and Chart 9.0.0 the helm chart had a custom prefix `ENV_TO_INI`.
After the support for a custom prefix was removed in Gitea core, the prefix was changed to `GITEA`.

For example a database setting needs to have the following format:

```yaml
gitea:
  additionalConfigFromEnvs:
    - name: GITEA__DATABASE__HOST
      value: my.own.host
    - name: GITEA__DATABASE__PASSWD
      valueFrom:
        secretKeyRef:
          name: postgres-secret
          key: password
```

Priority (highest to lowest) for defining app.ini variables:

1. Environment variables prefixed with `GITEA`
1. Additional config sources
1. Values defined in `gitea.config`

### External Database

Any external database listed in [https://docs.gitea.com/installation/database-prep/](https://docs.gitea.com/installation/database-prep/) can be used instead of the built-in PostgreSQL.
In fact, it is **highly recommended** to use an external database to ensure a stable Gitea installation longterm.

If an external database is used, no matter which type, make sure to set `cloudnativePG.enabled` to `false` to disable the use of the built-in PostgreSQL.

```yaml
gitea:
  config:
    database:
      DB_TYPE: mysql
      HOST: <mysql HOST>
      NAME: gitea
      USER: root
      PASSWD: gitea
      SCHEMA: gitea

cloudnativePG:
  enabled: false
```

### Ports and external url

By default port `3000` is used for web traffic and `22` for ssh.
Those can be changed:

```yaml
service:
  http:
    port: 3000
  ssh:
    port: 22
```

This helm chart automatically configures the clone urls to use the correct ports.
You can change these ports by hand using the `gitea.config` dict.
However you should know what you're doing.

### ClusterIP

By default the `clusterIP` will be set to `None`, which is the default for headless services.
However if you want to omit the clusterIP field in the service, use the following values:

```yaml
service:
  http:
    type: ClusterIP
    port: 3000
    clusterIP:
  ssh:
    type: ClusterIP
    port: 22
    clusterIP:
```

### SSH and Ingress

If you're using ingress and want to use SSH, keep in mind, that ingress is not able to forward SSH Ports.
You will need a LoadBalancer like `metallb` and a setting in your ssh service annotations.

```yaml
service:
  ssh:
    annotations:
      metallb.universe.tf/allow-shared-ip: test
```

### SSH on crio based kubernetes cluster

If you use `crio` as container runtime it is not possible to read from a remote repository.
You should get an error message like this:

```bash
$ git clone git@k8s-demo.internal:admin/test.git
Cloning into 'test'...
Connection reset by 192.168.179.217 port 22
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.
```

To solve this problem add the capability `SYS_CHROOT` to the `securityContext`.
More about this issue [under this link](https://gitea.com/gitea/helm-gitea/issues/161).

### Cache

The cache handling is done via `valkey` (via the [official Valkey Helm chart](https://github.com/valkey-io/valkey-helm)) by default.

```yaml
valkey:
  enabled: true
```

### Persistence

Gitea will be deployed as a deployment.
By simply enabling the persistence and setting the storage class according to your cluster everything else will be taken care of.
The following example will create a PVC as a part of the deployment.

Please note, that an empty `storageClass` in the persistence will result in kubernetes using your default storage class.

If you want to use your own storage class define it as follows:

```yaml
persistence:
  enabled: true
  storageClass: myOwnStorageClass
```

If you want to manage your own PVC you can simply pass the PVC name to the chart.

```yaml
persistence:
  enabled: true
  claimName: MyAwesomeGiteaClaim
```

In case that persistence has been disabled it will simply use an empty dir volume.

The CloudNativePG `Cluster` handles the persistence on its own.
You can interact with its storage settings as displayed in the following example:

```yaml
cloudnativePG:
  storage:
    size: 20Gi
    storageClass: myOwnStorageClass
```

### Admin User

This chart enables you to create a default admin user.
It is also possible to update the password for this user by upgrading or redeploying the chart.
It is not possible to delete an admin user after it has been created.
This has to be done in the ui.
You cannot use `admin` as username.

```yaml
secrets:
  admin:
    new:
      username: "MyAwesomeGiteaAdmin"
      password: "AReallyAwesomeGiteaPassword"
      email: "gi@tea.com"
```

You can also use an existing Secret to configure the admin user:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitea-admin-secret
type: Opaque
stringData:
  email: gi@tea.com
  username: MyAwesomeGiteaAdmin
  password: AReallyAwesomeGiteaPassword
```

```yaml
secrets:
  admin:
    existingSecret:
      enabled: true
      secretName: gitea-admin-secret
```

The keys within the existing Secret can be customized via `secrets.admin.existingSecret.emailKey`,
`secrets.admin.existingSecret.passwordKey` and `secrets.admin.existingSecret.usernameKey`.

Whether you use the existing Secret or specify a user name and password, there are three modes for how the admin user password is created or set.

- `keepUpdated` (the default) will set the admin user password, and reset it to the defined value every time the pod is recreated.
- `initialOnlyNoReset` will set the admin user password when creating it, but never try to update the password.
- `initialOnlyRequireReset` will set the admin user password when creating it, never update it, and require that the password be changed at the initial login.

These modes can be set like the following:

```yaml
secrets:
  admin:
    passwordMode: initialOnlyRequireReset
```

Set `secrets.admin.enabled` to `false` to skip the admin user handling entirely.

### LDAP Settings

Like the admin user the LDAP settings can be updated.
All LDAP values from <https://docs.gitea.com/administration/command-line#admin> are available.

Multiple LDAP sources can be configured with additional LDAP list items.

```yaml
gitea:
  ldap:
    - name: MyAwesomeGiteaLdap
      securityProtocol: unencrypted
      host: "127.0.0.1"
      port: "389"
      userSearchBase: ou=Users,dc=example,dc=com
      userFilter: sAMAccountName=%s
      adminFilter: CN=Admin,CN=Group,DC=example,DC=com
      emailAttribute: mail
      bindDn: CN=ldap read,OU=Spezial,DC=example,DC=com
      bindPassword: JustAnotherBindPw
      usernameAttribute: CN
      publicSSHKeyAttribute: publicSSHKey
```

You can also use an existing secret to set the `bindDn` and `bindPassword`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitea-ldap-secret
type: Opaque
stringData:
  bindDn: CN=ldap read,OU=Spezial,DC=example,DC=com
  bindPassword: JustAnotherBindPw
```

```yaml
gitea:
    ldap:
      - existingSecret: gitea-ldap-secret
        ...
```

⚠️ Some options are just flags and therefore don't have any values.
If they are defined in `gitea.ldap` configuration, they will be passed to the Gitea CLI without any value.
Affected options:

- notActive
- skipTlsVerify
- allowDeactivateAll
- synchronizeUsers
- attributesInBind

### OAuth2 Settings

Like the admin user, OAuth2 settings can be updated and disabled but not deleted.
Deleting OAuth2 settings has to be done in the ui.
All OAuth2 values, which are documented [under this link](https://docs.gitea.com/administration/command-line#admin), are
available.

Multiple OAuth2 sources can be configured with additional OAuth list items.

```yaml
gitea:
  oauth:
    - name: "MyAwesomeGiteaOAuth"
      provider: "openidConnect"
      key: "hello"
      secret: "world"
      autoDiscoverUrl: "https://gitea.example.com/.well-known/openid-configuration"
      #useCustomUrls:
      #customAuthUrl:
      #customTokenUrl:
      #customProfileUrl:
      #customEmailUrl:
```

You can also use an existing secret to set the `key` and `secret`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitea-oauth-secret
type: Opaque
stringData:
  key: hello
  secret: world
```

```yaml
gitea:
  oauth:
    - name: "MyAwesomeGiteaOAuth"
      existingSecret: gitea-oauth-secret
        ...
```

## Configure commit signing

When using the rootless image the gpg key folder is not persistent by default.
If you consider using signed commits for internal Gitea activities (e.g. initial commit), you'd need to provide a signing key.
Prior to [PR186](https://gitea.com/gitea/helm-gitea/pulls/186), imported keys had to be re-imported once the container got replaced by another.

The `secrets.gpg` object allows you to configure the prerequisites for commit signing.
By default this section is disabled to maintain backwards compatibility.

```yaml
secrets:
  gpg:
    enabled: false
    new:
      gpgHome: /data/git/.gnupg
```

Regardless of the used container image the `secrets.gpg` object allows to specify a private gpg key.
Either using `secrets.gpg.new.privateKey` to define the key inline, or refer to an existing Secret containing the key data by
using `secrets.gpg.existingSecret`.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: custom-gitea-gpg-key
type: Opaque
stringData:
  gpgHome: /data/git/.gnupg
  privateKey: |-
    -----BEGIN PGP PRIVATE KEY BLOCK-----
    ...
    -----END PGP PRIVATE KEY BLOCK-----
```

```yaml
secrets:
  gpg:
    enabled: true
    existingSecret:
      enabled: true
      secretName: custom-gitea-gpg-key
```

The keys within the existing Secret can be customized via `secrets.gpg.existingSecret.gpgHomeKey` and
`secrets.gpg.existingSecret.privateKeyKey`.

To use the gpg key, Gitea needs to be configured accordingly.
A detailed description can be found in the [official Gitea documentation](https://docs.gitea.com/administration/signing#general-configuration).

## Metrics and profiling

A Prometheus `/metrics` endpoint on the `HTTP_PORT` and `pprof` profiling endpoints on port 6060 can be enabled under `gitea`.
Beware that the metrics endpoint is exposed via the ingress, manage access using ingress annotations for example.

To deploy the `ServiceMonitor`, you first need to ensure that you have deployed `prometheus-operator` and its [CRDs](https://github.com/prometheus-operator/prometheus-operator#customresourcedefinitions).

```yaml
gitea:
  metrics:
    enabled: true
    serviceMonitor:
      enabled: true

  config:
    server:
      ENABLE_PPROF: true
```

### Secure Metrics Endpoint

Metrics endpoint `/metrics` can be secured by using `Bearer` token authentication.

**Note:** Providing non-empty `TOKEN` value will also require authentication for `ServiceMonitor`.

```yaml
gitea:
  metrics:
    token: "secure-token"
    enabled: true
    serviceMonitor:
      enabled: true
```

## Pod annotations

Annotations can be added to the Gitea pod.

```yaml
gitea:
  podAnnotations: {}
```

### Secret checksum annotations

Each Secret of the chart has an `addSHASumAnnotation` option (disabled by default). It adds a
`checksum/<secret>` pod annotation so that a change to the Secret triggers a rolling update of the
Gitea pod.

The SHA sum is computed differently depending on where the Secret comes from:

- **Chart-managed Secrets** (`secrets.<secret>.existingSecret.enabled: false`): the SHA sum is
  computed from the manifest rendered by the chart. The cluster still holds the pre-upgrade state of
  that Secret during rendering, so it cannot be used as the source.
- **User-provided Secrets** (`secrets.<secret>.existingSecret.enabled: true`): the content is unknown
  to the chart, so the Secret is looked up in the cluster via Helm's `lookup` function.

The lookup is the reason why the option is disabled by default:

- The credentials used by Helm need `get` permission on Secrets in the release namespace.
- The lookup returns nothing during client-side rendering, for example with `helm template`, during
  `helm install --dry-run`, or with Argo CD unless the Helm chart is rendered against a live cluster.
  The annotation is still emitted, but its value stays constant and therefore no longer triggers a
  rollout. Keep `secrets.<secret>.addSHASumAnnotation: false` in that case and trigger rollouts by
  other means, for example with stakater's [reloader](https://github.com/stakater/Reloader) as
  described below.

## TLS certificate rotation

If Gitea uses TLS certificates that are mounted as a secret in the container file system, Gitea will not automatically apply them when the TLS certificates are rotated.
Such a rotation can be for example triggered, when the cert-manager issues new TLS certificates before expiring. Further information is described as GitHub
[issue](https://github.com/go-gitea/gitea/issues/27962).

Until the issue is present, a workaround can be applied.
For example stakater's [reloader](https://github.com/stakater/Reloader) controller can be used to trigger a rolling update.
The following annotation must be added to instruct the reloader controller to trigger a rolling update, when the mounted `configMaps` and `secrets` have been changed.

```yaml
deployment:
  annotations:
    reloader.stakater.com/auto: "true"
```

Instead of triggering a rolling update for configMap and secret resources, this action can also be defined for individual items.
For example, when the secret named `gitea-tls` is mounted and the reloader controller should only listen for changes of this secret:

```yaml
deployment:
  annotations:
    secret.reloader.stakater.com/reload: "gitea-tls"
```

## Themes

Custom themes can be added via k8s secrets and referencing them in `values.yaml`.

The [http provider](https://registry.terraform.io/providers/hashicorp/http/latest/docs/data-sources/http) is useful here.

```yaml
deployment:
  gitea:
    volumeMounts:
      - name: gitea-themes
        readOnly: true
        mountPath: "/data/gitea/public/assets/css"
  volumes:
    - name: gitea-themes
      secret:
        secretName: gitea-themes
```

The secret can be created via `terraform`:

```hcl
resource "kubernetes_secret" "gitea-themes" {
  metadata {
    name      = "gitea-themes"
    namespace = "gitea"
  }

  data = {
    "my-theme.css"      = data.http.gitea-theme-light.body
    "my-theme-dark.css" = data.http.gitea-theme-dark.body
    "my-theme-auto.css" = data.http.gitea-theme-auto.body
  }

  type = "Opaque"
}


data "http" "gitea-theme-light" {
  url = "<raw theme url>"

  request_headers = {
    Accept = "application/json"
  }
}

data "http" "gitea-theme-dark" {
  url = "<raw theme url>"

  request_headers = {
    Accept = "application/json"
  }
}

data "http" "gitea-theme-auto" {
  url = "<raw theme url>"

  request_headers = {
    Accept = "application/json"
  }
}
```

or natively via `kubectl`:

```bash
kubectl create secret generic gitea-themes --from-file={{FULL-PATH-TO-CSS}} --namespace gitea
```

## Renovate

To be able to use a digest value which is automatically updated by `Renovate` a [customManager](https://docs.renovatebot.com/modules/manager/regex/) is required.
Here's an examplary `values.yml` definition which makes use of a digest:

```yaml
deployment:
  gitea:
    image:
      repository: gitea/gitea
      tag: 1.20.2
      digest: sha256:6e3b85a36653894d6741d0aefb41dfaac39044e028a42e0a520cc05ebd7bfc3f
```

By default Renovate adds digest after the `tag`.
To comply with the Gitea helm chart definition of the digest parameter, a "customManagers" definition is required:

```json
"customManagers": [
  {
    "customType": "regex",
    "description": "Apply an explicit gitea digest field match",
    "fileMatch": ["values\\.ya?ml"],
    "matchStrings": ["(?<depName>gitea\\/gitea)\\n(?<indentation>\\s+)tag: (?<currentValue>[^@].*?)\\n\\s+digest: (?<currentDigest>sha256:[a-f0-9]+)"],
    "datasourceTemplate": "docker",
    "autoReplaceStringTemplate": "{{depName}}\n{{indentation}}tag: {{newValue}}\n{{indentation}}digest: {{#if newDigest}}{{{newDigest}}}{{else}}{{{currentDigest}}}{{/if}}"
  }
]
```

## Parameters

### Global

| Name                      | Description                                                                | Value |
| ------------------------- | -------------------------------------------------------------------------- | ----- |
| `global.imageRegistry`    | global image registry override.                                            | `""`  |
| `global.imagePullSecrets` | global image pull secrets override; can be extended by `imagePullSecrets`. | `[]`  |
| `global.hostAliases`      | global hostAliases which will be added to the pod's hosts files.           | `[]`  |

### deployment

| Name                                               | Description                                                                                                                                                                                    | Value              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `deployment.enabled`                               | Enable the deployment of Gitea.                                                                                                                                                                | `true`             |
| `deployment.annotations`                           | Annotations for the Gitea deployment to be created.                                                                                                                                            | `{}`               |
| `deployment.labels`                                | Labels for the deployment.                                                                                                                                                                     | `{}`               |
| `deployment.affinity`                              | Affinity for the deployment.                                                                                                                                                                   | `{}`               |
| `deployment.dnsConfig`                             | dnsConfig of the Gitea deployment.                                                                                                                                                             | `{}`               |
| `deployment.gitea.env`                             | Additional environment variables to pass to the Gitea container.                                                                                                                               | `[]`               |
| `deployment.gitea.envFrom`                         | List of environment variables mounted from configMaps or secrets for the Gitea container.                                                                                                      | `[]`               |
| `deployment.gitea.image.registry`                  | image registry, e.g. gcr.io,docker.io.                                                                                                                                                         | `docker.gitea.com` |
| `deployment.gitea.image.repository`                | Image to start for this pod.                                                                                                                                                                   | `gitea`            |
| `deployment.gitea.image.tag`                       | Visit: [Image tag](https://hub.docker.com/r/gitea/gitea/tags?page=1&ordering=last_updated). Defaults to `appVersion` within Chart.yaml.                                                        | `""`               |
| `deployment.gitea.image.digest`                    | Image digest. Allows to pin the given image tag. Useful for having control over mutable tags like `latest`.                                                                                    | `""`               |
| `deployment.gitea.image.pullPolicy`                | Image pull policy.                                                                                                                                                                             | `IfNotPresent`     |
| `deployment.gitea.image.rootless`                  | Wether or not to pull the rootless version of Gitea, only works on Gitea 1.14.x or higher.                                                                                                     | `true`             |
| `deployment.gitea.image.fullOverride`              | Completely overrides the image registry, path/image, tag and digest. **Adjust `deployment.gitea.image.rootless` accordingly and review [Rootless defaults](#rootless-defaults)**.              | `""`               |
| `deployment.gitea.resources`                       | Compute Resources required by Gitea container. Cannot be updated.                                                                                                                              | `nil`              |
| `deployment.gitea.securityContext`                 | Security context of the Gitea container. Used as fallback for the chart-managed init containers.                                                                                               | `{}`               |
| `deployment.gitea.volumeMounts`                    | Additional volume mounts.                                                                                                                                                                      | `[]`               |
| `deployment.hostUsers`                             | Use the host's user namespace. When unset, the field is omitted so the platform default is used.                                                                                               | `nil`              |
| `deployment.initContainers`                        | List of initContainers. The order is important. First init container in the list will be executed first. The link refers to the corresponding init container configuration.                    | `[]`               |
| `deployment.initDirectories.env`                   | Additional environment variables to pass to the init container.                                                                                                                                | `[]`               |
| `deployment.initDirectories.envFrom`               | List of environment variables mounted from configMaps or secrets for the initDirectories container.                                                                                            | `[]`               |
| `deployment.initDirectories.image.registry`        | image registry, e.g. gcr.io,docker.io.                                                                                                                                                         | `docker.gitea.com` |
| `deployment.initDirectories.image.repository`      | Image to start for this pod.                                                                                                                                                                   | `gitea`            |
| `deployment.initDirectories.image.tag`             | Visit: [Image tag](https://hub.docker.com/r/gitea/gitea/tags?page=1&ordering=last_updated). Defaults to `appVersion` within Chart.yaml.                                                        | `""`               |
| `deployment.initDirectories.image.digest`          | Image digest. Allows to pin the given image tag. Useful for having control over mutable tags like `latest`.                                                                                    | `""`               |
| `deployment.initDirectories.image.pullPolicy`      | Image pull policy.                                                                                                                                                                             | `IfNotPresent`     |
| `deployment.initDirectories.image.rootless`        | Wether or not to pull the rootless version of Gitea, only works on Gitea 1.14.x or higher.                                                                                                     | `true`             |
| `deployment.initDirectories.image.fullOverride`    | Completely overrides the image registry, path/image, tag and digest. **Adjust `deployment.initDirectories.image.rootless` accordingly and review [Rootless defaults](#rootless-defaults)**.    | `""`               |
| `deployment.initDirectories.resources`             | Compute Resources required by the initDirectories container. Defaults to `initContainers.resources`. Cannot be updated.                                                                        | `nil`              |
| `deployment.initDirectories.securityContext`       | Security context of the initDirectories container. Defaults to `deployment.gitea.securityContext`.                                                                                             | `{}`               |
| `deployment.initDirectories.volumeMounts`          | Additional volume mounts.                                                                                                                                                                      | `[]`               |
| `deployment.initAppIni.env`                        | Additional environment variables to pass to the init container.                                                                                                                                | `[]`               |
| `deployment.initAppIni.envFrom`                    | List of environment variables mounted from configMaps or secrets for the initAppIni container.                                                                                                 | `[]`               |
| `deployment.initAppIni.image.registry`             | image registry, e.g. gcr.io,docker.io.                                                                                                                                                         | `docker.gitea.com` |
| `deployment.initAppIni.image.repository`           | Image to start for this pod.                                                                                                                                                                   | `gitea`            |
| `deployment.initAppIni.image.tag`                  | Visit: [Image tag](https://hub.docker.com/r/gitea/gitea/tags?page=1&ordering=last_updated). Defaults to `appVersion` within Chart.yaml.                                                        | `""`               |
| `deployment.initAppIni.image.digest`               | Image digest. Allows to pin the given image tag. Useful for having control over mutable tags like `latest`.                                                                                    | `""`               |
| `deployment.initAppIni.image.pullPolicy`           | Image pull policy.                                                                                                                                                                             | `IfNotPresent`     |
| `deployment.initAppIni.image.rootless`             | Wether or not to pull the rootless version of Gitea, only works on Gitea 1.14.x or higher.                                                                                                     | `true`             |
| `deployment.initAppIni.image.fullOverride`         | Completely overrides the image registry, path/image, tag and digest. **Adjust `deployment.initAppIni.image.rootless` accordingly and review [Rootless defaults](#rootless-defaults)**.         | `""`               |
| `deployment.initAppIni.resources`                  | Compute Resources required by the initAppIni container. Defaults to `initContainers.resources`. Cannot be updated.                                                                             | `nil`              |
| `deployment.initAppIni.securityContext`            | Security context of the initAppIni container. Defaults to `deployment.gitea.securityContext`.                                                                                                  | `{}`               |
| `deployment.initAppIni.volumeMounts`               | Additional volume mounts.                                                                                                                                                                      | `[]`               |
| `deployment.initConfigureGPG.env`                  | Additional environment variables to pass to the init container.                                                                                                                                | `[]`               |
| `deployment.initConfigureGPG.envFrom`              | List of environment variables mounted from configMaps or secrets for the initConfigureGPG container.                                                                                           | `[]`               |
| `deployment.initConfigureGPG.image.registry`       | image registry, e.g. gcr.io,docker.io.                                                                                                                                                         | `docker.gitea.com` |
| `deployment.initConfigureGPG.image.repository`     | Image to start for this pod.                                                                                                                                                                   | `gitea`            |
| `deployment.initConfigureGPG.image.tag`            | Visit: [Image tag](https://hub.docker.com/r/gitea/gitea/tags?page=1&ordering=last_updated). Defaults to `appVersion` within Chart.yaml.                                                        | `""`               |
| `deployment.initConfigureGPG.image.digest`         | Image digest. Allows to pin the given image tag. Useful for having control over mutable tags like `latest`.                                                                                    | `""`               |
| `deployment.initConfigureGPG.image.pullPolicy`     | Image pull policy.                                                                                                                                                                             | `IfNotPresent`     |
| `deployment.initConfigureGPG.image.rootless`       | Wether or not to pull the rootless version of Gitea, only works on Gitea 1.14.x or higher.                                                                                                     | `true`             |
| `deployment.initConfigureGPG.image.fullOverride`   | Completely overrides the image registry, path/image, tag and digest. **Adjust `deployment.initConfigureGPG.image.rootless` accordingly and review [Rootless defaults](#rootless-defaults)**.   | `""`               |
| `deployment.initConfigureGPG.resources`            | Compute Resources required by the initConfigureGPG container. Defaults to `initContainers.resources`. Cannot be updated.                                                                       | `nil`              |
| `deployment.initConfigureGPG.securityContext`      | Security context of the initConfigureGPG container. Defaults to `deployment.gitea.securityContext`.                                                                                            | `{}`               |
| `deployment.initConfigureGPG.volumeMounts`         | Additional volume mounts.                                                                                                                                                                      | `[]`               |
| `deployment.initConfigureGitea.env`                | Additional environment variables to pass to the init container.                                                                                                                                | `[]`               |
| `deployment.initConfigureGitea.envFrom`            | List of environment variables mounted from configMaps or secrets for the initConfigureGitea container.                                                                                         | `[]`               |
| `deployment.initConfigureGitea.image.registry`     | image registry, e.g. gcr.io,docker.io.                                                                                                                                                         | `docker.gitea.com` |
| `deployment.initConfigureGitea.image.repository`   | Image to start for this pod.                                                                                                                                                                   | `gitea`            |
| `deployment.initConfigureGitea.image.tag`          | Visit: [Image tag](https://hub.docker.com/r/gitea/gitea/tags?page=1&ordering=last_updated). Defaults to `appVersion` within Chart.yaml.                                                        | `""`               |
| `deployment.initConfigureGitea.image.digest`       | Image digest. Allows to pin the given image tag. Useful for having control over mutable tags like `latest`.                                                                                    | `""`               |
| `deployment.initConfigureGitea.image.pullPolicy`   | Image pull policy.                                                                                                                                                                             | `IfNotPresent`     |
| `deployment.initConfigureGitea.image.rootless`     | Wether or not to pull the rootless version of Gitea, only works on Gitea 1.14.x or higher.                                                                                                     | `true`             |
| `deployment.initConfigureGitea.image.fullOverride` | Completely overrides the image registry, path/image, tag and digest. **Adjust `deployment.initConfigureGitea.image.rootless` accordingly and review [Rootless defaults](#rootless-defaults)**. | `""`               |
| `deployment.initConfigureGitea.resources`          | Compute Resources required by the initConfigureGitea container. Defaults to `initContainers.resources`. Cannot be updated.                                                                     | `nil`              |
| `deployment.initConfigureGitea.securityContext`    | Security context of the initConfigureGitea container. Defaults to `deployment.gitea.securityContext`.                                                                                          | `{}`               |
| `deployment.initConfigureGitea.volumeMounts`       | Additional volume mounts.                                                                                                                                                                      | `[]`               |
| `deployment.nodeSelector`                          | NodeSelector for the deployment.                                                                                                                                                               | `{}`               |
| `deployment.priorityClassName`                     | priorityClassName for the deployment.                                                                                                                                                          | `""`               |
| `deployment.replicas`                              | Number of replicas for the Gitea deployment.                                                                                                                                                   | `1`                |
| `deployment.resources`                             | Resources is the total amount of CPU and Memory resources required by all containers in the pod.                                                                                               | `{}`               |
| `deployment.schedulerName`                         | Use an alternate scheduler, e.g. "stork".                                                                                                                                                      | `""`               |
| `deployment.securityContext`                       | Pod security context. On non-OpenShift clusters the chart defaults `fsGroup` to `1000` when this map is empty.                                                                                 | `{}`               |
| `deployment.strategy.type`                         | Deployment strategy used to replace old pods, either `RollingUpdate` or `Recreate`.                                                                                                            | `RollingUpdate`    |
| `deployment.strategy.rollingUpdate.maxSurge`       | Number or percentage of pods that may be created above the desired replica count. Only used with `RollingUpdate`.                                                                              | `100%`             |
| `deployment.strategy.rollingUpdate.maxUnavailable` | Number or percentage of pods that may be unavailable during the update. Only used with `RollingUpdate`.                                                                                        | `0`                |
| `deployment.terminationGracePeriodSeconds`         | How long to wait until forcefully kill the pod.                                                                                                                                                | `60`               |
| `deployment.tolerations`                           | Tolerations of the Gitea deployment.                                                                                                                                                           | `[]`               |
| `deployment.topologySpreadConstraints`             | TopologySpreadConstraints for the deployment.                                                                                                                                                  | `[]`               |
| `deployment.volumes`                               | Additional volumes to mount into the pods of the Gitea deployment.                                                                                                                             | `[]`               |

### Gateway API

| Name                                                            | Description                                                                                                                                                                | Value   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `gatewayAPI.enabled`                                            | Enable deployment of Gateway API resources.                                                                                                                                | `false` |
| `gatewayAPI.core.backendTLSPolicy.enabled`                      | Render a BackendTLSPolicy resource for encrypted backend traffic.                                                                                                          | `false` |
| `gatewayAPI.core.backendTLSPolicy.annotations`                  | Annotations applied to the BackendTLSPolicy.                                                                                                                               | `{}`    |
| `gatewayAPI.core.backendTLSPolicy.labels`                       | Additional labels applied to the BackendTLSPolicy.                                                                                                                         | `{}`    |
| `gatewayAPI.core.backendTLSPolicy.targetRefs`                   | Target references for the BackendTLSPolicy. Defaults to the HTTP service.                                                                                                  | `[]`    |
| `gatewayAPI.core.backendTLSPolicy.validation`                   | Validation configuration (required when enabled). See `docs/gateway-api.md`.                                                                                               | `{}`    |
| `gatewayAPI.core.backendTLSPolicy.validation.caCertificateRefs` | CA certificate references for the BackendTLSPolicy validation. See `docs/gateway-api.md`.                                                                                  |         |
| `gatewayAPI.core.backendTLSPolicy.validation.hostname`          | Hostname for the BackendTLSPolicy validation. Must be the Common Name (CN) or a Subject Alternative Name (SAN) of the Gitea server certificate. See `docs/gateway-api.md`. |         |
| `gatewayAPI.core.httpRoute.enabled`                             | Render an HTTPRoute resource.                                                                                                                                              | `false` |
| `gatewayAPI.core.httpRoute.annotations`                         | Annotations applied to the HTTPRoute.                                                                                                                                      | `{}`    |
| `gatewayAPI.core.httpRoute.labels`                              | Additional labels applied to the HTTPRoute.                                                                                                                                | `{}`    |
| `gatewayAPI.core.httpRoute.tls`                                 | When true, treat the upstream Gateway as terminating TLS so `ROOT_URL` uses `https`.                                                                                       | `false` |
| `gatewayAPI.core.httpRoute.parentRefs`                          | Parent gateway references (required when enabled).                                                                                                                         | `[]`    |
| `gatewayAPI.core.httpRoute.hostnames`                           | List of hostnames for the HTTPRoute.                                                                                                                                       | `[]`    |
| `gatewayAPI.core.httpRoute.rules`                               | Custom routing rules. Defaults to a PathPrefix `/` rule targeting the HTTP service.                                                                                        | `[]`    |
| `gatewayAPI.core.tcpRoute.enabled`                              | Render a TCPRoute resource (typically for SSH).                                                                                                                            | `false` |
| `gatewayAPI.core.tcpRoute.annotations`                          | Annotations applied to the TCPRoute.                                                                                                                                       | `{}`    |
| `gatewayAPI.core.tcpRoute.labels`                               | Additional labels applied to the TCPRoute.                                                                                                                                 | `{}`    |
| `gatewayAPI.core.tcpRoute.parentRefs`                           | Parent gateway references (required when enabled).                                                                                                                         | `[]`    |
| `gatewayAPI.core.tcpRoute.rules`                                | Custom routing rules. Defaults to a rule targeting the SSH service.                                                                                                        | `[]`    |
| `gatewayAPI.nginx.clientSettingsPolicies.enabled`               | Render a ClientSettingsPolicy (NGINX Gateway Fabric) to raise the client request body limit.                                                                               | `false` |
| `gatewayAPI.nginx.clientSettingsPolicies.annotations`           | Annotations applied to the ClientSettingsPolicy.                                                                                                                           | `{}`    |
| `gatewayAPI.nginx.clientSettingsPolicies.labels`                | Additional labels applied to the ClientSettingsPolicy.                                                                                                                     | `{}`    |
| `gatewayAPI.nginx.clientSettingsPolicies.targetRef`             | Target reference for the ClientSettingsPolicy. Defaults to the chart's HTTPRoute.                                                                                          | `{}`    |
| `gatewayAPI.nginx.clientSettingsPolicies.body`                  | Client body settings (required when enabled), e.g. `maxSize`. See `docs/gateway-api.md`.                                                                                   | `{}`    |

### Ingress

| Name                             | Description                                                                                     | Value             |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| `ingress.enabled`                | Enable ingress.                                                                                 | `false`           |
| `ingress.annotations`            | Additional annotations.                                                                         | `{}`              |
| `ingress.labels`                 | Additional labels.                                                                              | `{}`              |
| `ingress.ingressClassName`       | Name of the IngressClass which backs the Ingress.                                               | `nginx`           |
| `ingress.pathType`               | Ingress Path Type.                                                                              | `Prefix`          |
| `ingress.hosts[0].host`          | Default Ingress host.                                                                           | `git.example.com` |
| `ingress.hosts[0].paths[0].path` | Default Ingress path.                                                                           | `/`               |
| `ingress.tls`                    | Ingress tls settings.                                                                           | `[]`              |
| `namespace`                      | An explicit namespace to deploy Gitea into. Defaults to the release namespace if not specified. | `""`              |

### Network

| Name            | Description                                                              | Value           |
| --------------- | ------------------------------------------------------------------------ | --------------- |
| `clusterDomain` | Domain of the Cluster. Domain is part of internally issued certificates. | `cluster.local` |

### Image

| Name               | Description                          | Value |
| ------------------ | ------------------------------------ | ----- |
| `imagePullSecrets` | Secret to use for pulling the image. | `[]`  |

### Security

| Name                  | Description                                                                                                                          | Value |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `openshift.enabled`   | Enable OpenShift compatibility defaults for chart-managed pods. Defaults to auto-detect based on the SecurityContextConstraints API. | `nil` |
| `podDisruptionBudget` | Pod disruption budget.                                                                                                               | `{}`  |

### Route

| Name                                      | Description                                                                                                    | Value   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| `route.enabled`                           | Enable OpenShift Route.                                                                                        | `false` |
| `route.annotations`                       | Route annotations.                                                                                             | `{}`    |
| `route.host`                              | Route host. When unset, OpenShift may generate one and Gitea URL defaults fall back to ingress/service values. | `""`    |
| `route.path`                              | Route path.                                                                                                    | `""`    |
| `route.wildcardPolicy`                    | Route wildcard policy.                                                                                         | `None`  |
| `route.tls.termination`                   | Route TLS termination type.                                                                                    | `nil`   |
| `route.tls.insecureEdgeTerminationPolicy` | Route insecure edge termination policy.                                                                        | `nil`   |
| `route.tls.key`                           | Route TLS key.                                                                                                 | `nil`   |
| `route.tls.certificate`                   | Route TLS certificate.                                                                                         | `nil`   |
| `route.tls.caCertificate`                 | Route TLS CA certificate.                                                                                      | `nil`   |
| `route.tls.destinationCACertificate`      | Route destination CA certificate.                                                                              | `nil`   |

### Secrets

| Name                                             | Description                                                                                                                                                                                               | Value                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `secrets.admin.enabled`                          | Create and keep the Gitea admin user in sync.                                                                                                                                                             | `true`               |
| `secrets.admin.addSHASumAnnotation`              | Add a pod annotation with the SHA sum of the admin Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation).                | `false`              |
| `secrets.admin.passwordMode`                     | Mode for how to set/update the admin user password. Options are: initialOnlyNoReset, initialOnlyRequireReset, and keepUpdated.                                                                            | `keepUpdated`        |
| `secrets.admin.existingSecret.enabled`           | Use an already existing Secret instead of creating the admin Secret.                                                                                                                                      | `false`              |
| `secrets.admin.existingSecret.secretName`        | Name of the already existing admin Secret.                                                                                                                                                                | `""`                 |
| `secrets.admin.existingSecret.emailKey`          | Key of the email address in the existing admin Secret.                                                                                                                                                    | `email`              |
| `secrets.admin.existingSecret.passwordKey`       | Key of the password in the existing admin Secret.                                                                                                                                                         | `password`           |
| `secrets.admin.existingSecret.usernameKey`       | Key of the username in the existing admin Secret.                                                                                                                                                         | `username`           |
| `secrets.admin.new.annotations`                  | Annotations for the admin Secret.                                                                                                                                                                         | `{}`                 |
| `secrets.admin.new.labels`                       | Labels for the admin Secret.                                                                                                                                                                              | `{}`                 |
| `secrets.admin.new.email`                        | Email of the Gitea admin user.                                                                                                                                                                            | `gitea@local.domain` |
| `secrets.admin.new.password`                     | Password of the Gitea admin user.                                                                                                                                                                         | `r8sA8CPHD9!bt6d`    |
| `secrets.admin.new.username`                     | Username of the Gitea admin user.                                                                                                                                                                         | `gitea_admin`        |
| `secrets.config.enabled`                         | Enable mounting of the config Secret.                                                                                                                                                                     | `true`               |
| `secrets.config.addSHASumAnnotation`             | Add a pod annotation with the SHA sum of the config Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation).               | `false`              |
| `secrets.config.existingSecret.enabled`          | Use an already existing Secret instead of creating the config Secret.                                                                                                                                     | `false`              |
| `secrets.config.existingSecret.secretName`       | Name of the already existing config Secret.                                                                                                                                                               | `""`                 |
| `secrets.config.new.annotations`                 | Annotations for the config Secret.                                                                                                                                                                        | `{}`                 |
| `secrets.config.new.labels`                      | Labels for the config Secret.                                                                                                                                                                             | `{}`                 |
| `secrets.gpg.enabled`                            | Enable mounting of a GPG key to sign Git commits.                                                                                                                                                         | `false`              |
| `secrets.gpg.addSHASumAnnotation`                | Add a pod annotation with the SHA sum of the GPG key Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation).              | `false`              |
| `secrets.gpg.existingSecret.enabled`             | Use an already existing Secret instead of creating the GPG key Secret.                                                                                                                                    | `false`              |
| `secrets.gpg.existingSecret.secretName`          | Name of the already existing GPG key Secret.                                                                                                                                                              | `""`                 |
| `secrets.gpg.existingSecret.gpgHomeKey`          | Key of the GPG home directory in the existing GPG key Secret.                                                                                                                                             | `gpgHome`            |
| `secrets.gpg.existingSecret.privateKeyKey`       | Key of the private key in the existing GPG key Secret.                                                                                                                                                    | `privateKey`         |
| `secrets.gpg.new.annotations`                    | Annotations for the GPG key Secret.                                                                                                                                                                       | `{}`                 |
| `secrets.gpg.new.labels`                         | Labels for the GPG key Secret.                                                                                                                                                                            | `{}`                 |
| `secrets.gpg.new.gpgHome`                        | Path to the GPG home directory.                                                                                                                                                                           | `/data/git/.gnupg`   |
| `secrets.gpg.new.privateKey`                     | Content of the private GPG key in armored format.                                                                                                                                                         | `""`                 |
| `secrets.init.enabled`                           | Enable mounting of the init Secret.                                                                                                                                                                       | `true`               |
| `secrets.init.addSHASumAnnotation`               | Add a pod annotation with the SHA sum of the init Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation).                 | `false`              |
| `secrets.init.existingSecret.enabled`            | Use an already existing Secret instead of creating the init Secret.                                                                                                                                       | `false`              |
| `secrets.init.existingSecret.secretName`         | Name of the already existing init Secret.                                                                                                                                                                 | `""`                 |
| `secrets.init.new.annotations`                   | Annotations for the init Secret.                                                                                                                                                                          | `{}`                 |
| `secrets.init.new.labels`                        | Labels for the init Secret.                                                                                                                                                                               | `{}`                 |
| `secrets.inlineConfig.enabled`                   | Enable mounting of the inline configuration Secret.                                                                                                                                                       | `true`               |
| `secrets.inlineConfig.addSHASumAnnotation`       | Add a pod annotation with the SHA sum of the inline configuration Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation). | `false`              |
| `secrets.inlineConfig.existingSecret.enabled`    | Use an already existing Secret instead of creating the inline configuration Secret.                                                                                                                       | `false`              |
| `secrets.inlineConfig.existingSecret.secretName` | Name of the already existing inline configuration Secret.                                                                                                                                                 | `""`                 |
| `secrets.inlineConfig.new.annotations`           | Annotations for the inline configuration Secret.                                                                                                                                                          | `{}`                 |
| `secrets.inlineConfig.new.labels`                | Labels for the inline configuration Secret.                                                                                                                                                               | `{}`                 |
| `secrets.metrics.enabled`                        | Enable mounting of the metrics Secret.                                                                                                                                                                    | `true`               |
| `secrets.metrics.addSHASumAnnotation`            | Add a pod annotation with the SHA sum of the metrics Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation).              | `false`              |
| `secrets.metrics.existingSecret.enabled`         | Use an already existing Secret instead of creating the metrics Secret.                                                                                                                                    | `false`              |
| `secrets.metrics.existingSecret.secretName`      | Name of the already existing metrics Secret.                                                                                                                                                              | `""`                 |
| `secrets.metrics.new.annotations`                | Annotations for the metrics Secret.                                                                                                                                                                       | `{}`                 |
| `secrets.metrics.new.labels`                     | Labels for the metrics Secret.                                                                                                                                                                            | `{}`                 |

### Service

| Name                                    | Description                                                                                                                                                                                          | Value       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `service.http.type`                     | Kubernetes service type for web traffic.                                                                                                                                                             | `ClusterIP` |
| `service.http.port`                     | Port number for web traffic.                                                                                                                                                                         | `3000`      |
| `service.http.clusterIP`                | ClusterIP setting for http autosetup for deployment is None.                                                                                                                                         | `None`      |
| `service.http.loadBalancerIP`           | LoadBalancer IP setting.                                                                                                                                                                             | `nil`       |
| `service.http.nodePort`                 | NodePort for http service.                                                                                                                                                                           | `nil`       |
| `service.http.externalTrafficPolicy`    | If `service.http.type` is `NodePort` or `LoadBalancer`, set this to `Local` to enable source IP preservation.                                                                                        | `nil`       |
| `service.http.externalIPs`              | External IPs for service.                                                                                                                                                                            | `nil`       |
| `service.http.ipFamilyPolicy`           | HTTP service dual-stack policy.                                                                                                                                                                      | `nil`       |
| `service.http.ipFamilies`               | HTTP service dual-stack familiy selection,for dual-stack parameters see official kubernetes [dual-stack concept documentation](https://kubernetes.io/docs/concepts/services-networking/dual-stack/). | `nil`       |
| `service.http.loadBalancerSourceRanges` | Source range filter for http loadbalancer.                                                                                                                                                           | `[]`        |
| `service.http.annotations`              | HTTP service annotations.                                                                                                                                                                            | `{}`        |
| `service.http.labels`                   | HTTP service additional labels.                                                                                                                                                                      | `{}`        |
| `service.http.loadBalancerClass`        | Loadbalancer class.                                                                                                                                                                                  | `nil`       |
| `service.ssh.type`                      | Kubernetes service type for ssh traffic.                                                                                                                                                             | `ClusterIP` |
| `service.ssh.port`                      | Port number for ssh traffic.                                                                                                                                                                         | `22`        |
| `service.ssh.clusterIP`                 | ClusterIP setting for ssh autosetup for deployment is None.                                                                                                                                          | `None`      |
| `service.ssh.loadBalancerIP`            | LoadBalancer IP setting.                                                                                                                                                                             | `nil`       |
| `service.ssh.nodePort`                  | NodePort for ssh service.                                                                                                                                                                            | `nil`       |
| `service.ssh.externalTrafficPolicy`     | If `service.ssh.type` is `NodePort` or `LoadBalancer`, set this to `Local` to enable source IP preservation.                                                                                         | `nil`       |
| `service.ssh.externalIPs`               | External IPs for service.                                                                                                                                                                            | `nil`       |
| `service.ssh.ipFamilyPolicy`            | SSH service dual-stack policy.                                                                                                                                                                       | `nil`       |
| `service.ssh.ipFamilies`                | SSH service dual-stack familiy selection,for dual-stack parameters see official kubernetes [dual-stack concept documentation](https://kubernetes.io/docs/concepts/services-networking/dual-stack/).  | `nil`       |
| `service.ssh.hostPort`                  | HostPort for ssh service.                                                                                                                                                                            | `nil`       |
| `service.ssh.loadBalancerSourceRanges`  | Source range filter for ssh loadbalancer.                                                                                                                                                            | `[]`        |
| `service.ssh.annotations`               | SSH service annotations.                                                                                                                                                                             | `{}`        |
| `service.ssh.labels`                    | SSH service additional labels.                                                                                                                                                                       | `{}`        |
| `service.ssh.loadBalancerClass`         | Loadbalancer class.                                                                                                                                                                                  | `nil`       |

### ServiceAccount

| Name                                                               | Description                                                | Value   |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ------- |
| `serviceAccount.enabled`                                           | Assign the pod to use the ServiceAccount.                  | `true`  |
| `serviceAccount.existingServiceAccount.enabled`                    | Enable using an existing ServiceAccount.                   | `false` |
| `serviceAccount.existingServiceAccount.existingServiceAccountName` | Name of the existing ServiceAccount to use.                | `""`    |
| `serviceAccount.new.annotations`                                   | Custom annotations for the ServiceAccount.                 | `{}`    |
| `serviceAccount.new.labels`                                        | Custom labels for the ServiceAccount.                      | `{}`    |
| `serviceAccount.new.automountServiceAccountToken`                  | Enable/disable auto mounting of the service account token. | `false` |
| `serviceAccount.new.imagePullSecrets`                              | Image pull secrets, available to the ServiceAccount.       | `[]`    |

### Persistence

| Name                                                                  | Description                                                                 | Value               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------- |
| `persistence.enabled`                                                 | Enable persistent storage.                                                  | `false`             |
| `persistence.existingPersistentVolumeClaim.enabled`                   | Enable using an existing persistent volume claim.                           | `false`             |
| `persistence.existingPersistentVolumeClaim.persistentVolumeClaimName` | Name of the existing persistent volume claim to use.                        | `""`                |
| `persistence.new.annotations.helm.sh/resource-policy`                 | Resource policy for the new persistent volume claim.                        | `keep`              |
| `persistence.new.labels`                                              | Labels for the new persistent volume claim.                                 | `{}`                |
| `persistence.new.accessModes`                                         | AccessMode for the new persistent volume claim.                             | `["ReadWriteOnce"]` |
| `persistence.new.persistentVolumeName`                                | Name of the persistent volume for the new persistent volume claim.          | `""`                |
| `persistence.new.size`                                                | Size for the new persistent volume claim.                                   | `10Gi`              |
| `persistence.new.storageClassName`                                    | Name of the storage class to use for the new persistent volume claim.       | `""`                |
| `persistence.new.subPath`                                             | Subdirectory of the volume to mount at for the new persistent volume claim. | `""`                |
| `extraContainers`                                                     | Additional sidecar containers to run in the pod.                            | `[]`                |

### Init

| Name                                       | Description                                                                           | Value        |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------ |
| `initPreScript`                            | Bash shell script copied verbatim to the start of the init-container.                 | `""`         |
| `initContainersScriptsVolumeMountPath`     | Path to mount the scripts consumed from the Secrets.                                  | `/usr/sbinx` |
| `initContainers.resources.limits`          | initContainers.limits Kubernetes resource limits for init containers.                 | `{}`         |
| `initContainers.resources.requests.cpu`    | initContainers.requests.cpu Kubernetes cpu resource limits for init containers.       | `100m`       |
| `initContainers.resources.requests.memory` | initContainers.requests.memory Kubernetes memory resource limits for init containers. | `128Mi`      |

### Gitea

| Name                                         | Description                                                                                                                                                                     | Value   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `gitea.metrics.enabled`                      | Enable Gitea metrics.                                                                                                                                                           | `false` |
| `gitea.metrics.token`                        | used for `bearer` token authentication on metrics endpoint. If not specified or empty metrics endpoint is public.                                                               | `nil`   |
| `gitea.metrics.serviceMonitor.enabled`       | Enable Gitea metrics service monitor. Requires, that `gitea.metrics.enabled` is also set to true, to enable metrics generally.                                                  | `false` |
| `gitea.metrics.serviceMonitor.interval`      | Interval at which metrics should be scraped. If not specified Prometheus' global scrape interval is used.                                                                       | `""`    |
| `gitea.metrics.serviceMonitor.relabelings`   | RelabelConfigs to apply to samples before scraping.                                                                                                                             | `[]`    |
| `gitea.metrics.serviceMonitor.scheme`        | HTTP scheme to use for scraping. For example `http` or `https`. Default is http.                                                                                                | `""`    |
| `gitea.metrics.serviceMonitor.scrapeTimeout` | Timeout after which the scrape is ended. If not specified, global Prometheus scrape timeout is used.                                                                            | `""`    |
| `gitea.metrics.serviceMonitor.tlsConfig`     | TLS configuration to use when scraping the metric endpoint by Prometheus.                                                                                                       | `{}`    |
| `gitea.ldap`                                 | LDAP configuration.                                                                                                                                                             | `[]`    |
| `gitea.oauth`                                | OAuth configuration.                                                                                                                                                            | `[]`    |
| `gitea.config.server.SSH_PORT`               | SSH port for rootlful Gitea image.                                                                                                                                              | `22`    |
| `gitea.config.server.SSH_LISTEN_PORT`        | SSH port for rootless Gitea image.                                                                                                                                              | `2222`  |
| `gitea.additionalConfigSources`              | Additional configuration from secret or configmap.                                                                                                                              | `[]`    |
| `gitea.additionalConfigFromEnvs`             | Additional configuration sources from environment variables.                                                                                                                    | `[]`    |
| `gitea.extraEnvSourceFile`                   | Source environment variables from a file during init container startup. This is especially useful for reading environment variable files generated by the Vault agent-injector. | `nil`   |
| `gitea.podAnnotations`                       | Annotations for the Gitea pod.                                                                                                                                                  | `{}`    |
| `gitea.ssh.logLevel`                         | Configure OpenSSH's log level. Only available for root-based Gitea image.                                                                                                       | `INFO`  |

### LivenessProbe

| Name                                      | Description                                       | Value  |
| ----------------------------------------- | ------------------------------------------------- | ------ |
| `gitea.livenessProbe.enabled`             | Enable liveness probe.                            | `true` |
| `gitea.livenessProbe.tcpSocket.port`      | Port to probe for liveness.                       | `http` |
| `gitea.livenessProbe.initialDelaySeconds` | Initial delay before liveness probe is initiated. | `200`  |
| `gitea.livenessProbe.timeoutSeconds`      | Timeout for liveness probe.                       | `1`    |
| `gitea.livenessProbe.periodSeconds`       | Period for liveness probe.                        | `10`   |
| `gitea.livenessProbe.successThreshold`    | Success threshold for liveness probe.             | `1`    |
| `gitea.livenessProbe.failureThreshold`    | Failure threshold for liveness probe.             | `10`   |

### ReadinessProbe

| Name                                       | Description                                        | Value  |
| ------------------------------------------ | -------------------------------------------------- | ------ |
| `gitea.readinessProbe.enabled`             | Enable readiness probe.                            | `true` |
| `gitea.readinessProbe.tcpSocket.port`      | Port to probe for readiness.                       | `http` |
| `gitea.readinessProbe.initialDelaySeconds` | Initial delay before readiness probe is initiated. | `5`    |
| `gitea.readinessProbe.timeoutSeconds`      | Timeout for readiness probe.                       | `1`    |
| `gitea.readinessProbe.periodSeconds`       | Period for readiness probe.                        | `10`   |
| `gitea.readinessProbe.successThreshold`    | Success threshold for readiness probe.             | `1`    |
| `gitea.readinessProbe.failureThreshold`    | Failure threshold for readiness probe.             | `3`    |

### StartupProbe

| Name                                     | Description                                      | Value   |
| ---------------------------------------- | ------------------------------------------------ | ------- |
| `gitea.startupProbe.enabled`             | Enable startup probe.                            | `false` |
| `gitea.startupProbe.tcpSocket.port`      | Port to probe for startup.                       | `http`  |
| `gitea.startupProbe.initialDelaySeconds` | Initial delay before startup probe is initiated. | `60`    |
| `gitea.startupProbe.timeoutSeconds`      | Timeout for startup probe.                       | `1`     |
| `gitea.startupProbe.periodSeconds`       | Period for startup probe.                        | `10`    |
| `gitea.startupProbe.successThreshold`    | Success threshold for startup probe.             | `1`     |
| `gitea.startupProbe.failureThreshold`    | Failure threshold for startup probe.             | `10`    |

### CloudNativePG

| Name                                                   | Description                                                                                                                                                                                      | Value                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `cloudnativePG.enabled`                                | Provision a CloudNativePG `Cluster` for Gitea. Requires the CloudNativePG operator to be installed in the cluster.                                                                               | `false`                     |
| `cloudnativePG.annotations`                            | Annotations for the CloudNativePG `Cluster`.                                                                                                                                                     | `{}`                        |
| `cloudnativePG.labels`                                 | Additional labels for the CloudNativePG `Cluster`.                                                                                                                                               | `{}`                        |
| `cloudnativePG.image.registry`                         | Image registry.                                                                                                                                                                                  | `ghcr.io`                   |
| `cloudnativePG.image.repository`                       | Image repository.                                                                                                                                                                                | `cloudnative-pg/postgresql` |
| `cloudnativePG.image.tag`                              | Image tag.                                                                                                                                                                                       | `18.0`                      |
| `cloudnativePG.instances`                              | Number of PostgreSQL instances. Values greater than `1` provision a HA-ready cluster with streaming replication.                                                                                 | `3`                         |
| `cloudnativePG.credentials.addSHASumAnnotation`        | Add a pod annotation with the SHA sum of the credentials Secret to trigger a rollout on change. Further information can be found in the [documentation](./README.md#secret-checksum-annotation). | `false`                     |
| `cloudnativePG.credentials.database`                   | Name of the database to create. CloudNativePG requires it as a literal in the `Cluster`, hence it cannot be sourced from a Secret.                                                               | `gitea`                     |
| `cloudnativePG.credentials.username`                   | Name of the database owner to create. CloudNativePG requires it as a literal in the `Cluster`, hence it cannot be sourced from a Secret.                                                         | `gitea`                     |
| `cloudnativePG.credentials.existingSecret.enabled`     | Use an already existing Secret instead of creating the credentials Secret.                                                                                                                       | `false`                     |
| `cloudnativePG.credentials.existingSecret.secretName`  | Name of the already existing credentials Secret. Must be of type `kubernetes.io/basic-auth` and its `username` must match `cloudnativePG.credentials.username`.                                  | `""`                        |
| `cloudnativePG.credentials.existingSecret.passwordKey` | Key of the password in the existing credentials Secret.                                                                                                                                          | `password`                  |
| `cloudnativePG.credentials.new.annotations`            | Annotations for the credentials Secret.                                                                                                                                                          | `{}`                        |
| `cloudnativePG.credentials.new.labels`                 | Labels for the credentials Secret.                                                                                                                                                               | `{}`                        |
| `cloudnativePG.credentials.new.password`               | Password of the database owner.                                                                                                                                                                  | `gitea`                     |
| `cloudnativePG.postgresql.parameters`                  | Custom PostgreSQL configuration parameters.                                                                                                                                                      | `{}`                        |
| `cloudnativePG.storage.size`                           | Size of the data volume.                                                                                                                                                                         | `10Gi`                      |
| `cloudnativePG.storage.storageClass`                   | Storage class of the data volume. Defaults to the cluster's default storage class.                                                                                                               | `""`                        |
| `cloudnativePG.walStorage.enabled`                     | Store the write-ahead log on a dedicated volume.                                                                                                                                                 | `false`                     |
| `cloudnativePG.walStorage.size`                        | Size of the write-ahead log volume.                                                                                                                                                              | `2Gi`                       |
| `cloudnativePG.walStorage.storageClass`                | Storage class of the write-ahead log volume. Defaults to the cluster's default storage class.                                                                                                    | `""`                        |
| `cloudnativePG.affinity`                               | Affinity for the PostgreSQL pods. CloudNativePG nests `nodeSelector` and `tolerations` below this key as well.                                                                                   | `{}`                        |
| `cloudnativePG.priorityClassName`                      | Priority class name for the PostgreSQL pods.                                                                                                                                                     | `""`                        |
| `cloudnativePG.monitoring.enablePodMonitor`            | Create a `PodMonitor` for the CloudNativePG `Cluster`.                                                                                                                                           | `false`                     |
| `cloudnativePG.resources`                              | Kubernetes resources for the PostgreSQL containers.                                                                                                                                              | `{}`                        |
| `cloudnativePG.topologySpreadConstraints`              | Topology spread constraints for the PostgreSQL pods.                                                                                                                                             | `[]`                        |

### valkey

| Name                                       | Description                                        | Value                      |
| ------------------------------------------ | -------------------------------------------------- | -------------------------- |
| `valkey.enabled`                           | Enable valkey standalone or replicated.            | `false`                    |
| `valkey.image.registry`                    | Image registry.                                    | `docker.io`                |
| `valkey.image.repository`                  | Image repository.                                  | `valkey/valkey`            |
| `valkey.image.tag`                         | Image tag.                                         | `""`                       |
| `valkey.auth.enabled`                      | Enable ACL-based authentication.                   | `true`                     |
| `valkey.auth.aclUsers.default.permissions` | ACL permissions for the default user.              | `~* &* +@all`              |
| `valkey.auth.aclUsers.default.password`    | Password for the default user.                     | `changeme`                 |
| `valkey.service.port`                      | Port of Valkey service.                            | `6379`                     |
| `valkey.dataStorage.enabled`               | Enable persistence using Persistent Volume Claims. | `false`                    |
| `valkey.dataStorage.className`             | Persistent Volume storage class.                   | `""`                       |
| `valkey.dataStorage.requestedSize`         | Persistent Volume size.                            | `8Gi`                      |
| `valkey.replica.enabled`                   | Enable replication.                                | `false`                    |
| `valkey.replica.replicas`                  | Number of Valkey replica instances to deploy.      | `3`                        |
| `valkey.replica.persistence.size`          | Persistent Volume size for replicas.               | `8Gi`                      |
| `valkey.replica.persistence.storageClass`  | Persistent Volume storage class for replicas.      | `""`                       |
| `valkey.metrics.enabled`                   | Enable Prometheus exporter sidecar.                | `false`                    |
| `valkey.metrics.exporter.image.registry`   | Image registry.                                    | `ghcr.io`                  |
| `valkey.metrics.exporter.image.repository` | Image repository.                                  | `oliver006/redis_exporter` |
| `valkey.metrics.exporter.image.tag`        | Image tag.                                         | `""`                       |

### Advanced

| Name               | Description                                          | Value  |
| ------------------ | ---------------------------------------------------- | ------ |
| `checkDeprecation` | Set it to false to skip this basic validation check. | `true` |
| `extraDeploy`      | Array of extra objects to deploy with the release.   | `[]`   |

## Contributing

Expected workflow is: Fork -> Patch -> Push -> Pull Request

See [CONTRIBUTORS GUIDE](CONTRIBUTING.md) for details.

## Upgrading

This section lists major and breaking changes of each Helm Chart version.
Please read them carefully to upgrade successfully, especially the change of the **default database backend**!
If you miss this, blindly upgrading may delete your Postgres instance and you may lose your data!

<details>

<summary>To 13.0.0</summary>

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Breaking changes**
<!-- prettier-ignore-end -->

- All Secrets created by this chart are now configured through the new `secrets` section.
  It exposes `annotations`, `labels`, a checksum-annotation toggle and an `existingSecret` reference for each of the
  `admin`, `config`, `gpg`, `init`, `inlineConfig` and `metrics` Secrets.

- The `gitea.admin` object has been replaced by `secrets.admin`.
  The chart fails to render if `gitea.admin` is still set.
  Migrate as follows:

  | Old                            | New                                                                                  |
  | ------------------------------ | ------------------------------------------------------------------------------------ |
  | `gitea.admin.username`         | `secrets.admin.new.username`                                                         |
  | `gitea.admin.password`         | `secrets.admin.new.password`                                                         |
  | `gitea.admin.email`            | `secrets.admin.new.email`                                                            |
  | `gitea.admin.passwordMode`     | `secrets.admin.passwordMode`                                                         |
  | `gitea.admin.existingSecret`   | `secrets.admin.existingSecret.enabled` and `secrets.admin.existingSecret.secretName` |

  The admin credentials are no longer rendered as plain environment variable values into the Deployment. They are stored
  in a dedicated Secret and consumed via `secretKeyRef` instead. The email address is part of that Secret as well, so
  Secrets referenced via `secrets.admin.existingSecret` now need an `email` key in addition to `username` and
  `password`. All three key names are configurable via `secrets.admin.existingSecret.emailKey`,
  `secrets.admin.existingSecret.passwordKey` and `secrets.admin.existingSecret.usernameKey`.

  Admin user handling was previously skipped implicitly when neither an existing Secret nor a username and password were
  set. It is now controlled explicitly via `secrets.admin.enabled`.

- The top-level `signing` object has been replaced by `secrets.gpg`.
  The chart fails to render if `signing` is still set.
  Migrate as follows:

  | Old                      | New                                                                              |
  | ------------------------ | -------------------------------------------------------------------------------- |
  | `signing.enabled`        | `secrets.gpg.enabled`                                                            |
  | `signing.gpgHome`        | `secrets.gpg.new.gpgHome`                                                        |
  | `signing.privateKey`     | `secrets.gpg.new.privateKey`                                                     |
  | `signing.existingSecret` | `secrets.gpg.existingSecret.enabled` and `secrets.gpg.existingSecret.secretName` |

  The `gpgHome` path is now stored in the GPG key Secret and consumed via `secretKeyRef` instead of being rendered as a
  plain environment variable value.
  Existing Secrets referenced via `secrets.gpg.existingSecret` therefore need a `gpgHome` key in addition to
  `privateKey`. Both key names are configurable via `secrets.gpg.existingSecret.gpgHomeKey` and
  `secrets.gpg.existingSecret.privateKeyKey`.

- Renamed the generated Secrets to make their purpose obvious:
  the config Secret changed from `<fullname>` to `<fullname>-config` and the metrics Secret from
  `<fullname>-metrics-secret` to `<fullname>-metrics`.

- `ingress.className` has been renamed to `ingress.ingressClassName` to match the name of the `spec.ingressClassName`
  field of the Ingress resource it populates. The chart fails to render if `ingress.className` is still set, even when
  it is set to an empty string.

- `extraVolumeMounts` has been removed. Deprecated since 6.0.0, it mounted the same volumes into the init containers
  and into the Gitea container, and it was silently ignored as soon as `extraInitVolumeMounts` or
  `deployment.gitea.volumeMounts` contained a single entry. Split the mounts explicitly: use
  `deployment.<initContainer>.volumeMounts` for the init containers and `deployment.gitea.volumeMounts` for the Gitea
  container. Volumes that are needed in both places have to be listed in both settings.

- `extraInitVolumeMounts` has been removed. It fanned a mount out to the four chart-managed init containers, but never
  reached init containers added through `deployment.initContainers[].container`, despite its name. Configure the mount
  on the init containers that actually need it: `deployment.initDirectories.volumeMounts`,
  `deployment.initAppIni.volumeMounts`, `deployment.initConfigureGPG.volumeMounts` or
  `deployment.initConfigureGitea.volumeMounts`.

</details>

<details>

<summary>To 12.0.0</summary>

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Breaking changes**
<!-- prettier-ignore-end -->

- Outsourced "Actions" related configuration.
  To deploy and use "Actions", please see the new dedicated chart at <https://gitea.com/gitea/helm-actions>.
  It is maintained by a seperate maintainer group and hasn't seen a release yet (at the time of the 12.0 release).
  Feel encouraged to contribute if "Actions" is important to you!

  This change was made to avoid overloading the existing helm chart, which is already quite large in size and configuration options.
  In addition, the existing maintainers team was not actively using "Actions" which slowed down development and community contributions.
  While the new chart is still young (and waiting for contributions! and maintainers), we believe that it is the best way moving forward for both parts.

- Migrated from Redis/Redis-cluster to Valkey/Valkey-cluster charts (#775).
  While marked as breaking, there is no need to migrate data.
  The cache will start to refill automatically.
- Migrated ingress from `networking.k8s.io/v1beta` to `networking.k8s.io/v1`.
  We didn't make any changes to the syntax, so the upgrade should be seamless.

</details>

<details>

<summary>To 11.0.0</summary>

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Breaking changes**
<!-- prettier-ignore-end -->

- Update Gitea to 1.23.x (review the [1.23 release blog post](https://blog.gitea.com/release-of-1.23.0/) for all application breaking changes)
- Update PostgreSQL sub-chart dependencies to appVersion 17.x
- Update Redis sub-chart to version 20.x (appVersion 7.4)
  Although there are no breaking changes in the Redis Chart itself, it updates Redis from `7.2` to `7.4`. We recommend checking the release notes:
  - [Redis Chart release notes (starting with v20.0.0)](https://github.com/bitnami/charts/blob/HEAD/bitnami/redis/CHANGELOG.md#2000-2024-08-09).
  - [Redis 7.4 release notes](https://raw.githubusercontent.com/redis/redis/7.4/00-RELEASENOTES).
- Update Redis Cluster sub-chart to version 11.x (appVersion 7.4)
  Although there are no breaking changes in the Redis Chart itself, it updates Redis from `7.2` to `7.4`. We recommend checking the release notes:
  - [Redis Chart release notes (starting with v11.0.0)](https://github.com/bitnami/charts/blob/HEAD/bitnami/redis-cluster/CHANGELOG.md#1100-2024-08-09).
  - [Redis 7.4 release notes](https://raw.githubusercontent.com/redis/redis/7.4/00-RELEASENOTES).
  </details>

<details>

<summary>To 10.0.0</summary>

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Breaking changes**
<!-- prettier-ignore-end -->

- Update PostgreSQL sub-chart dependencies to appVersion 16.x
- Update to sub-charts versioning approach: Users are encouraged to pin the version tag of the sub-chart dependencies to a major appVersion.
  This avoids issues during chart upgrades and allows to incorporate new sub-chart versions as they are released.
  Please see the new [README section describing the versioning approach for sub-chart versions](#dependency-versioning).

</details>

<details>

<summary>To 9.6.0</summary>

Chart 9.6.0 ships with Gitea 1.21.0.
While there are no breaking changes in the chart, please check the changes of the [1.21 release blog post](https://blog.gitea.com/release-of-1.21.0/).

</details>

<details>

<summary>To 9.0.0</summary>

This chart release comes with many breaking changes while aiming for a HA-ready setup.
Please go through all of them carefully to perform a successful upgrade.
Here's a brief summary again, followed by more detailed migration instructions:

- Switch from `Statefulset` to `Deployment`
- Switch from `Memcached` to `redis-cluster` as the default session and queue provider
- Switch from `postgres` to `postgres-ha` as the default database provider
- A chart-internal PVC bootstrapping logic
  - New `persistence.mount`: whether to mount an existent PVC (even if not creating it)
  - New `persistence.create`: whether to create a new PVC
  - Renamed `persistence.existingClaim` to `persistence.claimName`

While not required, we recommend to start with a RWX PV for new installations.
A RWX volume is required for installation aiming for HA.

If you want to stay with a pre-existing RWO PV, you need to set

- `persistence.mount=true`
- `persistence.create=false`
- `persistence.claimName` to the name of your existing PVC.

If you do not, Gitea will create a new PVC which will in turn create a new PV.
If this happened to you by accident, you can still recover your data by setting using the settings from above in a subsequent run.

If you want to stay with a `memcache` instead of `redis-cluster`, you need to deploy `memcache` manually (e.g. from [bitnami](https://github.com/bitnami/charts/tree/main/bitnami/memcached)) and set

- `cache.HOST = "<memcache connection string>"`
- `cache.ADAPTER = "memcache"`
- `session.PROVIDER = "memcache"`
- `session.PROVIDER_CONFIG = "<memcache connection string>"`
- `queue.TYPE = "memcache"`
- `queue.CONN_STR = "<memcache connection string>"`

The `memcache` connection string has the scheme `memcache://<memcache service name>:<memcache service port>`, e.g. `gitea-memcached.gitea.svc.cluster.local:11211`.
The first item here (`<memcache service name>`) will be different compared to the example if you deploy `memcache` yourself.

The above changes are motivated by the idea to tidy dependencies but also have HA-ready ones at the same time.
The previous `memcache` default was not HA-ready, hence we decided to switch to `redis-cluster` by default.

If you are coming from an existing deployment and [#356](https://gitea.com/gitea/helm-gitea/issues/356) is still open, you need to set the config sections for `cache`, `session` and `queue` explicitly:

```yaml
gitea:
  config:
    session:
      PROVIDER: redis-cluster
      PROVIDER_CONFIG: redis+cluster://:gitea@gitea-valkey-cluster-headless.<namespace>.svc.cluster.local:6379/0?pool_size=100&idle_timeout=180s&

    cache:
      ENABLED: true
      ADAPTER: redis-cluster
      HOST: redis+cluster://:gitea@gitea-valkey-cluster-headless.<namespace>.svc.cluster.local:6379/0?pool_size=100&idle_timeout=180s&

    queue:
      TYPE: redis
      CONN_STR: redis+cluster://:gitea@gitea-valkey-cluster-headless.<namespace>.svc.cluster.local:6379/0?pool_size=100&idle_timeout=180s&
```

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Switch to rootless image by default**
<!-- prettier-ignore-end -->

If you are facing errors like `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED` due to this automatic transition:
Have a look at [this discussion](https://gitea.com/gitea/helm-gitea/issues/487#issue-220660) and either set `deployment.gitea.image.rootless: false` or manually update your `~/.ssh/known_hosts` file(s).

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Transitioning from a RWO to RWX Persistent Volume**
<!-- prettier-ignore-end -->

If you want to switch to a RWX volume and go for HA, you need to

1. Backup the data stored under `/data`
2. Let the chart create a new RWX PV (or do it statically yourself)
3. Restore the backup to the same location in the new PV

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Transitioning from Postgres or Postgres HA to CloudNativePG**
<!-- prettier-ignore-end -->

The `postgresql` and `postgresql-ha` sub-charts have been replaced by a [CloudNativePG](https://cloudnative-pg.io/) `Cluster` resource, configured via `cloudnativePG`.
The CloudNativePG operator is not bundled with this chart and has to be installed cluster-wide beforehand.

There is no in-place migration path: dump the database of the old deployment with `pg_dump`, remove the `postgresql` or `postgresql-ha` values and deploy the chart with `cloudnativePG.enabled=true`.
Afterwards restore the dump into the new cluster.
Alternatively, point the new `Cluster` at the existing data via one of the [CloudNativePG bootstrap methods](https://cloudnative-pg.io/documentation/current/bootstrap/).

For a single-instance database, set `cloudnativePG.instances=1`.

<!-- prettier-ignore-start -->
<!-- markdownlint-disable-next-line -->
**Change of env-to-ini prefix**
<!-- prettier-ignore-end -->

Before this release, the env-to-ini prefix was `ENV_TO_INI__`.
This allowed a clear distinction between user-provided and chart-provided env-to-ini variables.
Due to the removal custom prefix feature in the upstream implementation of env-to-ini, the prefix has been changed to the default `GITEA__`.

If you previously had defined env vars that had the `ENV_TO_INI__` prefix, you need to change them to `GITEA__` in order for them to be picked up by the chart.

</details>

<details>

<summary>To 8.0.0</summary>

### Removal of MariaDB and MySQL DB chart dependencies <!-- omit from toc -->

In this version support for DB chart dependencies of MySQL and MariaDB have been removed to simplify the maintenance of the helm chart.
External MySQL and MariaDB databases are still supported and will be in the future.

### Postgres Update from v11 to v15 <!-- omit from toc -->

This Chart version updates the Postgres chart dependency and subsequently Postgres from v11 to v15.
Please read the [Postgres Release Notes](https://www.postgresql.org/docs/release/) for version-specific changes.
With respect to `values.yaml`, parameters `username`, `database` and `password` have been regrouped under `auth` and slightly renamed.
`persistence` has also been regrouped under the `primary` key.
Please adjust your `values.yaml` accordingly.

**Attention**: The Postgres upgrade is not automatically handled by the chart and must be done by yourself.
See [this comment](https://gitea.com/gitea/helm-gitea/issues/452#issuecomment-740885) for an extensive walkthrough.
We again highly encourage users to use an external (managed) database for production instances.

</details>

<details>

<summary>To 7.0.0</summary>

### Private GPG key configuration for Gitea signing actions <!-- omit from toc -->

Having `signing.enabled=true` now requires to use either `signing.privateKey` or `signing.existingSecret` so that the Chart can automatically prepare the GPG key for Gitea internal signing actions.
See [Configure commit signing](#configure-commit-signing) for details.

</details>

<details>

<summary>To 6.0.0</summary>

### Different volume mounts for init-containers and runtime container <!-- omit from toc -->

**The `extraVolumeMounts` is deprecated** in favor of `extraInitVolumeMounts` and `extraContainerVolumeMounts`.
You can now have different mounts for the initialization phase and Gitea runtime.
The deprecated `extraVolumeMounts` will still be available for the time being and is mounted into every container.
If you want to switch to the new settings and want to mount specific volumes into all containers, you have to configure their mount points within both new settings.

**Combining values from the deprecated setting with values from the new settings is not possible.**

### New `enabled` flag for `startupProbe` <!-- omit from toc -->

Prior to this version the `startupProbe` was just a commented sample within the `values.yaml`.
With the migration to an auto-generated [Parameters](#parameters) section, a new parameter `gitea.startupProbe.enabled` has been introduced set to
`false` by default.

If you are using the `startupProbe` you need to add that new parameter and set it to `true`.
Otherwise, your defined probe won't be considered after the upgrade.

</details>

<details>

<summary>To 5.0.0</summary>

> 💥 The Helm Chart now requires Gitea versions of at least 1.11.0.

### Enable Dependencies <!-- omit from toc -->

The values to enable the dependencies, such as PostgreSQL, Memcached, MySQL and MariaDB have been moved from `gitea.database.builtIn.` to the dependency values.

You can now enable the dependencies as followed:

```yaml
memcached:
  enabled: true

postgresql:
  enabled: true

mysql:
  enabled: false

mariadb:
  enabled: false
```

### App.ini generation <!-- omit from toc -->

The app.ini generation has changed and now uses the `gitea config edit-ini` subcommand introduced in Gitea 1.26.
This change ensures, that the app.ini is now persistent.

### Secret Key generation <!-- omit from toc -->

Gitea secret keys (SECRET_KEY, INTERNAL_TOKEN, JWT_SECRET) are now generated automatically in certain situations:

- New install: By default the secrets are created automatically.
  If you provide secrets via `gitea.config` they will be used instead of automatic generation.
- Existing installs: The secrets won't be deployed, neither via configuration nor via auto generation.
  We explicitly prevent to set new secrets.

> 💡 It would be possible to set new secret keys manually by entering the running container and rewriting the app.ini by hand.
> However, this it is not advisable to do so for existing installations.
> Certain settings like _LDAP_ would not be readable anymore.

### Probes <!-- omit from toc -->

`gitea.customLivenessProbe`, `gitea.customReadinessProbe` and `gitea.customStartupProbe` have been removed.

They are replaced by the settings `gitea.livenessProbe`, `gitea.readinessProbe` and `gitea.startupProbe` which are now fully configurable and used _as-is_ for
a Chart deployment.
If you have customized their values instead of using the `custom` prefixed settings, please ensure that you remove the `enabled` property from each of them.

In case you want to disable one of these probes, let's say the `livenessProbe`, add the following to your values.
The `podAnnotation` is just there to have a bit more context.

```diff
gitea:
+ livenessProbe:
  podAnnotations: {}
```

### Multiple OAuth and LDAP authentication sources <!-- omit from toc -->

With `5.0.0` of this Chart it is now possible to configure Gitea with multiple OAuth and LDAP sources.
As a result, you need to update an existing OAuth/LDAP configuration in your customized `values.yaml` by replacing the object with settings to a list
of settings objects.
See [OAuth2 Settings](#oauth2-settings) and [LDAP Settings](#ldap-settings) section for details.

</details>

<details>

<summary>To 4.0.0</summary>

### Ingress changes <!-- omit from toc -->

To provide a more flexible Ingress configuration we now support not only host settings but also provide configuration for the path and pathType.
So this change changes the hosts from a simple string list, to a list containing a more complex object for more configuration.

```diff
ingress:
  enabled: false
  annotations: {}
    # kubernetes.io/ingress.class: nginx
    # kubernetes.io/tls-acme: "true"
-  hosts:
-    - git.example.com
+  hosts:
+    - host: git.example.com
+      paths:
+        - path: /
+          pathType: Prefix
  tls: []
  #  - secretName: chart-example-tls
  #    hosts:
  #      - git.example.com
```

If you want everything as it was before, you can simply add the following code to all your host entries.

```yaml
paths:
  - path: /
    pathType: Prefix
```

### Dropped kebab-case support <!-- omit from toc -->

In 3.x.x it was possible to provide an ldap configuration via kebab-case, this support has now been dropped and only camel case is supported.
See [LDAP section](#ldap-settings) for more information.

### Dependency update <!-- omit from toc -->

The chart comes with multiple databases and Memcached as dependency, the latest release updated the dependencies.

- Memcached: `4.2.20` -> `5.9.0`
- PostgreSQL: `9.7.2` -> `10.3.17`
- MariaDB: `8.0.0` -> `9.3.6`

If you're using the builtin databases you will most likely redeploy the chart in order to update the database correctly.

### Execution of initPreScript <!-- omit from toc -->

Generally spoken, this might not be a breaking change, but it is worth to be mentioned.

Prior to `4.0.0` only one init container was used to both setup directories and configure Gitea.
As of now the actual Gitea configuration is separated from the other pre-execution.
This also includes the execution of _initPreScript_.
If you have such script, please be aware of this.
Dynamically prepare the Gitea setup during execution by e.g. adding environment variables to the execution context won't work anymore.

### Gitea Version 1.14.X repository ROOT <!-- omit from toc -->

Previously the ROOT folder for the Gitea repositories was located at `/data/git/gitea-repositories`.
In version `1.14` has the path been changed to `/data/gitea-repositories`.

This chart will set the `gitea.config.repository.ROOT` value default to `/data/git/gitea-repositories`.

</details>
