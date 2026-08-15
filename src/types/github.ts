// ─── GitHub Types ─────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  description: string | null;
}

export interface GitHubFileContents {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string; // base64-encoded
  encoding: "base64";
  html_url: string;
}

export interface GitHubCommitResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    html_url: string;
  };
  commit: {
    sha: string;
    message: string;
    html_url: string;
  };
}

export interface GitHubAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  expiresAt?: string;
}
