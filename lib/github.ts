/** Minimal GitHub REST helper using a user's OAuth token. */

const API = "https://api.github.com";

/** Subset of the /user/repos payload we render on the dashboard. */
export interface GitHubRepo {
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  default_branch: string;
}

export async function githubApi(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return res.json();
  return res.text();
}
