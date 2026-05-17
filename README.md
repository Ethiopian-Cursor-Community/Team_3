# CI Failure Fixer

A programmatic agent that detects failing GitHub Actions runs, reads the logs,
diagnoses the root cause, and opens a PR with a fix using the Cursor Agent SDK.

## The Problem

When CI fails, developers stop what they are doing, dig through logs, figure out
what broke, fix it, and push again. This loop is slow and kills momentum,
especially on active teams.

## The Solution

CI Failure Fixer automates that entire loop. When a GitHub Actions workflow fails,
our agent picks it up, reads the logs, understands what went wrong, and opens a
PR with the fix before you even context-switch.

## How It Works

1. GitHub sends a webhook event when a workflow run fails
2. Our server receives the event and extracts the failure logs
3. The logs are passed to a Cursor SDK agent running in a cloud VM
4. The agent diagnoses the root cause and writes a fix
5. A PR is automatically opened with the changes

## Tech Stack

- Cursor Agent SDK
- TypeScript
- Express
- GitHub Webhooks
- Octokit (GitHub API)

## Setup

1. Clone the repo
   git clone https://github.com/Ethiopian-Cursor-Community/Team_3.git
   cd Team_3

2. Install dependencies
   npm install

3. Add environment variables
   Create a .env file with:
   CURSOR_API_KEY=your_cursor_api_key
   GITHUB_TOKEN=your_github_personal_access_token
   PORT=3000

4. Run the server
   npm run dev

5. Expose your local server using ngrok
   ngrok http 3000

6. Add the ngrok URL as a webhook in your GitHub repo settings
   URL: https://your-ngrok-url/webhook
   Content type: application/json
   Event: Workflow runs

## Demo

Send a test webhook payload:
   curl -X POST http://localhost:3000/webhook
   -H "Content-Type: application/json"
   -d @test.json

## Team

Built at the Ethiopian Cursor Community Hackathon, May 2026