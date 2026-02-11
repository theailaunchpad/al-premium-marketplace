import { LinearClient } from "@linear/sdk";
import { getLinearApiKey } from "./env.js";

let _client: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!_client) {
    _client = new LinearClient({ apiKey: getLinearApiKey() });
  }
  return _client;
}

export async function resolveTeam(): Promise<{ teamId: string; teamKey: string }> {
  const client = getLinearClient();
  const teamKeyEnv = process.env.LINEAR_TEAM_KEY;

  if (teamKeyEnv) {
    const teams = await client.teams({ filter: { key: { eq: teamKeyEnv } } });
    const team = teams.nodes[0];
    if (!team) throw new Error(`Team with key "${teamKeyEnv}" not found`);
    return { teamId: team.id, teamKey: team.key };
  }

  const teams = await client.teams();
  const team = teams.nodes[0];
  if (!team) throw new Error("No teams found in workspace");
  return { teamId: team.id, teamKey: team.key };
}

export async function getBacklogStateId(teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const workflowStates = await client.workflowStates({
    filter: { team: { id: { eq: teamId } } },
  });
  const backlog = workflowStates.nodes.find(
    (s) => s.name === "Backlog" || s.type === "backlog"
  );
  return backlog?.id;
}

export async function getCanceledStateId(teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const workflowStates = await client.workflowStates({
    filter: { team: { id: { eq: teamId } } },
  });
  const canceled = workflowStates.nodes.find(
    (s) => s.name === "Canceled" || s.type === "cancelled"
  );
  return canceled?.id;
}

export async function getIssueState(issueId: string): Promise<{ name: string; type: string }> {
  const client = getLinearClient();
  const issue = await client.issue(issueId);
  const state = await issue.state;
  if (!state) throw new Error(`No state found for issue ${issueId}`);
  return { name: state.name, type: state.type };
}

export async function getIssueComments(issueId: string): Promise<Array<{ body: string; createdAt: Date }>> {
  const client = getLinearClient();
  const issue = await client.issue(issueId);
  const comments = await issue.comments();
  return comments.nodes.map((c) => ({ body: c.body, createdAt: c.createdAt }));
}
