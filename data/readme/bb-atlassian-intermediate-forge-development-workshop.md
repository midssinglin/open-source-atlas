# Meeting Pipeline

An advanced Forge workshop that helps the value created in a meeting become durable, reviewable work.

People paste meeting notes into a Jira app. The pipeline identifies the work, creates focused Jira tickets, optionally publishes a Confluence plan of record, and leaves agent-routed tickets ready for a person to review and staff.

> The meeting created clarity. This workshop helps that value keep moving.

## Start here

| When | Open this |
|---|---|
| **Before the workshop** | **[Set up your laptop and demo site](docs/SETUP.md)** |
| **When the workshop begins** | **[Lab 0: Give the meeting a front door](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/00-front-door.md)** |
| **When you need a later lab** | Jump to the [workshop labs](#workshop-labs) below |
| **When you are stuck** | Use the [browser checkpoint](#if-you-get-stuck) for your lab |

## Get the workshop files

Open the **[workshop repository](https://go.atlassian.com/forge-intermediate-training-repo)**.

**Git is not required.**

### Option 1: download the repository

1. Download the tested [`main.zip` archive](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/get/main.zip). Sign in to Bitbucket first if prompted.
2. Extract the ZIP.
3. Open the extracted folder in your code editor.

Bitbucket's **Repository actions** menu does not show a download command for every signed-out user. Use the direct archive link instead. If your network blocks it, ask the instructor for the same ZIP.

The download gives you the `main` starter used in the workshop.

### Option 2: clone with Git

If you already use Git, clone the repository:

```bash
git clone https://bitbucket.org/atlassian/intermediate-forge-development-workshop.git
cd intermediate-forge-development-workshop
```

Open the folder in your code editor and stay on `main`. A full clone gives you remote-tracking checkpoint refs after you fetch them.

## Workshop labs

Follow these in order. Checkpoint and recovery links let you compare completed work without switching your local branch.

| Lab | You build | You are done when | Browser checkpoint |
|---|---|---|---|
| **[0 · Front door](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/00-front-door.md)** | Custom UI calls a resolver | Timeline reaches **Queued** and stays there | [`lab-00`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-00/) |
| **[1 · One ticket](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/01-one-ticket.md)** | One synchronous Jira ticket as you | Reporter is you; button waits | [`lab-01`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-01/) |
| **[2 · Accept fast](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/02-accept-fast.md)** | KVS, queue, worker, and `asApp()` | Button returns first; reporter is the app | [`lab-02`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-02/) |
| **[3 · Parse and fan out](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/03-parse-and-fan-out.md)** | Forge LLM splits notes; code writes tickets | Several focused tickets; agent work is labeled | [`lab-03`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-03/) |
| **[4 · Plan of record](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/04-plan-of-record.md)** | Optional Confluence page as the app | Page contains live Jira cards | [`lab-04`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-04/) |
| **[5 · Handoff](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/05-handoff.md)** | Approval or assignment triggers one handoff | Comment says **Agent task triggered** | [`lab-05`](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/lab-05/) |
| **[Good to know](docs/reference/GOOD-TO-KNOW.md)** | Runtime, storage, UI, ARM64, and rollout decisions | Laptops stay closed; this is discussion | N/A |
| **[6 · One Forge worker](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/06-one-worker.md)** | A Forge Rovo agent works a ticket | Research publishes once, as you | [Complete Lab 6 files](docs/labs/06-one-worker.md#complete-lab-6-files) |
| **[7 · Studio](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/main/docs/labs/07-studio.md)** | A published Studio specialist works from Jira | Start work engages it; assignment records ownership where available | No code changes |

## How to use a lab

- **What you are building** gives you the destination.
- **Ideas you need** explains the decisions behind the design.
- **You should be here** shows the exact shape expected before a paste.
- **File:** tells you exactly where a snippet belongs.
- **Already written** means inspect the helper; do not rebuild it.
- **Proof checklist** tells you when it is safe to continue.

The form, **Load sample transcript**, timeline, helpers, and fixtures already exist. Focus on the Forge decisions behind the pipeline.

## If you get stuck

1. Find your lab in the table above.
2. Open its **Browser checkpoint**.
3. Navigate to the file named by the lab step.
4. Compare it with your local file.
5. Copy only the named file or section.

**Never copy a checkpoint's `manifest.yml`.** Lab 0 writes your app id into your local manifest. Replacing it gives you an app you do not own. Use the prepared [manifest snippets](docs/labs/snippets/) instead.

The [`finished` branch](https://bitbucket.org/atlassian/intermediate-forge-development-workshop/src/finished/) is the full answer key. It includes extras the workshop labs do not add.

### If you cloned with Git

Fetch the remote refs once, then inspect checkpoints through `origin/lab-N`:

```bash
git fetch origin
git show origin/lab-03:src/index.js                        # read one file
git checkout origin/lab-03 -- src/                         # take the source from that lab
git checkout origin/lab-03 -- src/ package.json package-lock.json   # Lab 3+ also need @forge/llm
```

To browse a checkpoint in another folder:

```bash
git worktree add --detach ../meeting-pipeline-lab-03 origin/lab-03
git worktree add --detach ../meeting-pipeline-finished origin/finished
```

Do not switch your workshop checkout to a checkpoint after `forge register`.

## What the finished pipeline does

![Meeting Pipeline Jira app](assets/meeting-pipeline-page.png)

```text
PAGE or CHAT
    |
    |  page or chat sends the meeting
    v
SAVE + QUEUE                Click returns. Job id only.
    |
    |  worker runs as the app
    v
SPLIT → N TICKETS           Model splits notes. Optional wiki page.
    |
    v
BOARD                       Humans review.
    |
    |  assign-to-agent + Approved for Agent
    v
ONE COMMENT                 Task started. You pick who runs.
                            Chat this Forge agent, or start
                            a Studio specialist from Jira.
```

The ticket is the job. The pipeline marks work ready; it does not choose the worker.

## Supporting guides

- **[Setup](docs/SETUP.md):** laptop, Forge CLI, compatible demo site, and Jira status
- **[Atlassian MCP in Cursor](docs/reference/MCP.md):** optional verification from one supported client
- **[Manifest snippets](docs/labs/snippets/):** approved YAML additions used by the labs
- **[Command reference](docs/reference/COMMANDS.md):** compact Lab 0 commands after Setup

## After the workshop

```bash
forge uninstall    # choose Jira on the workshop site
forge uninstall    # choose Confluence on the same site
forge install list # confirm no development installation remains
```

Each command removes one product installation. Uninstall both development installations; removing Jira does not remove Confluence. Until you uninstall Jira, the handoff trigger can continue commenting on the developer site. The demo site expires after 90 days. Never point this workshop app at work Jira.
