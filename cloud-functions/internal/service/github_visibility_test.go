package service

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func visibilityTestClient(t *testing.T, graphql func(string) any, rest func(*http.Request) any) *Client {
	t.Helper()
	return &Client{
		tokens: []string{"test-token"},
		httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.Method == http.MethodPost {
				var request struct {
					Query string `json:"query"`
				}
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Fatalf("decode GraphQL request: %v", err)
				}
				return testJSONResponse(http.StatusOK, map[string]any{"data": graphql(request.Query)}), nil
			}
			if rest == nil {
				t.Fatalf("unexpected REST request: %s", r.URL.Path)
			}
			return testJSONResponse(http.StatusOK, rest(r)), nil
		})},
	}
}

func TestGitHubRepositoryVisibility(t *testing.T) {
	for _, method := range []string{"repo", "languages"} {
		for _, visibility := range []string{"public", "private", "missing"} {
			t.Run(method+"/"+visibility, func(t *testing.T) {
				client := visibilityTestClient(t, func(query string) any {
					if !strings.Contains(query, "isPrivate") {
						t.Fatal("repository query must request its visibility")
					}
					if visibility == "missing" {
						return map[string]any{"repository": nil}
					}
					return map[string]any{"repository": map[string]any{
						"name": "example", "nameWithOwner": "alice/example", "isPrivate": visibility == "private",
						"primaryLanguage": map[string]any{"name": "Go"},
						"languages": map[string]any{"totalSize": 100, "edges": []any{
							map[string]any{"size": 100, "node": map[string]any{"name": "Go"}},
						}},
					}}
				}, nil)
				var data any
				var err error
				if method == "repo" {
					data, err = client.FetchRepo(context.Background(), "alice", "example")
				} else {
					data, err = client.FetchRepoLanguages(context.Background(), "alice", "example", 5)
				}
				if visibility != "public" {
					if err == nil || err.Error() != "repository not found" || !reflect.ValueOf(data).IsZero() {
						t.Fatalf("non-public repository must return no data: data=%#v err=%v", data, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("public repository failed: %v", err)
				}
				switch result := data.(type) {
				case RepoData:
					if result.NameWithOwner != "alice/example" || result.PrimaryLang != "Go" {
						t.Fatalf("unexpected public repository: %#v", result)
					}
				case RepoLanguagesData:
					if result.NameWithOwner != "alice/example" || result.TotalSize != 100 || len(result.Languages) != 1 || result.Languages[0].Name != "Go" {
						t.Fatalf("unexpected public repository languages: %#v", result)
					}
				}
			})
		}
	}
}

func TestGitHubGistVisibility(t *testing.T) {
	for _, visibility := range []string{"public", "secret", "unknown", "missing"} {
		t.Run(visibility, func(t *testing.T) {
			client := visibilityTestClient(t, func(query string) any {
				if !strings.Contains(query, "isPublic") {
					t.Fatal("gist query must request its visibility")
				}
				gist := map[string]any{
					"owner": map[string]any{"login": "alice"},
					"files": []any{map[string]any{"name": "example.go", "size": 100, "language": map[string]any{"name": "Go"}}},
				}
				if visibility != "unknown" {
					gist["isPublic"] = visibility == "public"
				}
				if visibility == "missing" {
					gist = nil
				}
				return map[string]any{"viewer": map[string]any{"gist": gist}}
			}, nil)
			data, err := client.FetchGist(context.Background(), "example-id")
			if visibility != "public" {
				if err == nil || err.Error() != "gist not found" || data != (GistData{}) {
					t.Fatalf("non-public gist must return no data: data=%#v err=%v", data, err)
				}
				return
			}
			if err != nil || data.NameWithOwner != "alice/example.go" || data.Language != "Go" {
				t.Fatalf("unexpected public gist: data=%#v err=%v", data, err)
			}
		})
	}
}

// Simulate GitHub returning extra private resources to a privileged token unless
// the connection explicitly limits the query to public resources.
func visibilityCount(query, connection string) int {
	args := regexp.MustCompile(`\b` + connection + `\s*\(([^)]*)\)`).FindStringSubmatch(query)
	if len(args) == 2 && regexp.MustCompile(`\bprivacy\s*:\s*PUBLIC\b`).MatchString(args[1]) {
		return 1
	}
	return 9
}

func TestGitHubTopLanguagesExcludePrivateRepositories(t *testing.T) {
	client := visibilityTestClient(t, func(query string) any {
		nodes := []any{map[string]any{"name": "public", "languages": map[string]any{"edges": []any{
			map[string]any{"size": 100, "node": map[string]any{"name": "Go"}},
		}}}}
		if visibilityCount(query, "repositories") != 1 {
			nodes = append(nodes, map[string]any{"name": "secret", "languages": map[string]any{"edges": []any{
				map[string]any{"size": 900, "node": map[string]any{"name": "PrivateLanguage"}},
			}}})
		}
		return map[string]any{"user": map[string]any{"repositories": map[string]any{"nodes": nodes}}}
	}, nil)
	data, err := client.FetchTopLanguages(context.Background(), "alice", nil, 1, 0)
	if err != nil || len(data) != 1 || data[0].Name != "Go" || data[0].Size != 100 {
		t.Fatalf("private repository languages included: data=%#v err=%v", data, err)
	}
}

func TestGitHubStatsCountOnlyPublicRepositoriesAndCommitSearch(t *testing.T) {
	client := visibilityTestClient(t, func(query string) any {
		return map[string]any{"user": map[string]any{
			"login": "alice",
			"repositories": map[string]any{"totalCount": visibilityCount(query, "repositories"), "nodes": []any{
				map[string]any{"name": "example", "stargazers": map[string]any{"totalCount": 5 * visibilityCount(query, "repositories")}},
			}},
			"repositoriesContributedTo": map[string]any{"totalCount": visibilityCount(query, "repositoriesContributedTo")},
		}}
	}, func(r *http.Request) any {
		if r.URL.Path != "/search/commits" || r.URL.Query().Get("q") != "author:alice is:public" {
			t.Fatalf("commit search must exclude private repositories: %s", r.URL)
		}
		return map[string]any{"total_count": 7}
	})
	data, err := client.FetchStats(context.Background(), StatsQuery{Username: "alice", IncludeAllCommits: true})
	if err != nil || data.Repositories != 1 || data.ContributedTo != 1 || data.TotalStars != 5 || data.TotalCommits != 7 {
		t.Fatalf("private repository counts included: data=%#v err=%v", data, err)
	}
}

func TestGitHubProfileSummaryCountsOnlyPublicResources(t *testing.T) {
	client := visibilityTestClient(t, func(query string) any {
		return map[string]any{"user": map[string]any{
			"login": "alice",
			"gists": map[string]any{"totalCount": visibilityCount(query, "gists")},
			"repositories": map[string]any{"totalCount": visibilityCount(query, "repositories"), "nodes": []any{
				map[string]any{"stargazerCount": 5 * visibilityCount(query, "repositories"), "forkCount": 2 * visibilityCount(query, "repositories")},
			}},
		}}
	}, nil)
	data, err := client.FetchProfileSummary(context.Background(), "alice")
	if err != nil || data.Repositories != 1 || data.Gists != 1 || data.TotalStars != 5 || data.TotalForks != 2 {
		t.Fatalf("private resource counts included: data=%#v err=%v", data, err)
	}
}

func TestGitHubOrganizationCountsOnlyPublicRepositories(t *testing.T) {
	client := visibilityTestClient(t, func(query string) any {
		return map[string]any{"organization": map[string]any{
			"login": "example-org",
			"repositories": map[string]any{"totalCount": visibilityCount(query, "repositories"), "nodes": []any{
				map[string]any{"nameWithOwner": "example-org/public", "stargazerCount": 5 * visibilityCount(query, "repositories"), "forkCount": 2 * visibilityCount(query, "repositories")},
			}},
		}}
	}, func(r *http.Request) any {
		if r.URL.Path != "/orgs/example-org/events" {
			t.Fatalf("unexpected organization request: %s", r.URL)
		}
		return []any{}
	})
	data, err := client.FetchOrganization(context.Background(), "example-org")
	if err != nil || data.Repositories != 1 || data.TotalStars != 5 || data.TotalForks != 2 || data.TopRepository != "example-org/public" {
		t.Fatalf("private organization repositories included: data=%#v err=%v", data, err)
	}
}
