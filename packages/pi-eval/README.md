# pi-eval

A [Pi](https://pi.dev/) extension for running evals on a hardware-limited device.

> **Note:** `pi-dev` is still a prototype. Use at your own risk.

## Installation

> Coming soon!

## Pre-requisites

> TBC

## Usage
First, create an `./evals` folder in the root of your repo. This should be committed to Git to keep track of your project's eval tasks.

Second, add evals by creating one subfolder per **task** (e.g. `./evals/do-something`) to hold your eval docs.

Third, add two files in each subfolder:

1. `./evals/<task name>/TASK.md`: Instructions for task to evaluate. This could be as straightforward as a one-liner prompt (which may not be worth evaluating), or as complicated as a prompt that combines multiple skills skills.
2. `./evals/<task name>/CHECKLIST.md`: A list of things that the agent grader should independently check for. Some examples:
   1. The file `PLAN.md` was created in the root of the repo
   2. New unit tests were written for all newly-added functions.
   3. New functions did not contain duplicated functionality from existing utilities.

Ask Pi to run an eval. Examples:

- `Run an eval for <task name>`
- `Evaluate <task name> for 3 iterations`

`pi-eval` will generate an HTML report with the following metrics:

- Performance:
  - No. of trials
  - No. of correct trials
  - Pass rate (where pass = 100% checklist completion)
  - Average completion rate over trials
- Efficiency: Median and histogram for...
  - No. of input tokens
  - No. of output tokens
  - No. of tool calls
  - No. of turns

## What It Does
When you start an eval, `pi-eval` does the following:

1. Check the repo root to establish whether you have already run trials for the requested task. If so, `pi-eval` will continue with the next trial number in sequence. Otherwise, it will start from trial 1.
2. Read the task's `TASK.md` and `CHECKLIST.md`.
3. Launch an in-memory agent session, passing it the task from `TASK.md`.
4. For each trial:
   1. The orchestrator will create a new branch/folder in the Git worktree for that trial
   2. The task agent will:
      1. Receive the task from `TASK.md` from the orchestrator
      2. Switch to that branch+folder in the Git worktree for that trial
      3. Run the task
      4. Export the logs
   3. The grader agent will:
      1. Receive the task from `TASK.md` and the checklist from `CHECKLIST.md` from the orchestrator
      2. Switch to the branch+folder in the Git worktree for that trial
      3. Analyse the logs to compile quantitative metrics
      4. Grade the task with respect to the checklist by checking the files in the branch
      5. Export the grading result into the main container folder
5. Analyse the grading results from all trials to generate the overall eval result and eval report
6. Clean up the branches/folders in the Git worktree

### Things to Note:
- **Trials run sequentially:** The assumption is that trials will run using a local model with limited memory. Parallel runs will be supported at a later time.