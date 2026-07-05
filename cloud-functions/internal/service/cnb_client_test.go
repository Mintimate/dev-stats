package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func testJSONResponse(status int, value any) *http.Response {
	payload, _ := json.Marshal(value)
	return &http.Response{
		StatusCode: status,
		Status:     http.StatusText(status),
		Header:     http.Header{"Content-Type": {"application/json"}},
		Body:       io.NopCloser(strings.NewReader(string(payload))),
	}
}

func TestCNBFetchStats(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if got := r.Header.Get("Authorization"); got != "" {
			t.Fatalf("public CNB request must not send authorization, got %q", got)
		}
		switch {
		case r.URL.Path == "/users/alice":
			return testJSONResponse(http.StatusOK, cnbUser{Username: "alice", Nickname: "Alice", FollowerCount: 7, PublicRepoCount: 2, StarsCount: 11}), nil
		case r.URL.Path == "/users/alice/repos":
			return testJSONResponse(http.StatusOK, []cnbRepo{{Name: "one", StarCount: 5}, {Name: "two", StarCount: 6}}), nil
		case r.URL.Path == "/users/alice/calendar":
			return testJSONResponse(http.StatusOK, map[string]cnbCalendarDay{
				"20260101": {CommitCount: 2, PRCount: 1, IssuesCount: 1, ValidCRCount: 1},
			}), nil
		default:
			return testJSONResponse(http.StatusNotFound, nil), nil
		}
	})}
	client := &CNBClient{httpClient: httpClient, token: "test-token"}

	data, err := client.FetchStats(context.Background(), StatsQuery{Username: "alice"})
	if err != nil {
		t.Fatalf("FetchStats returned an error: %v", err)
	}
	if data.Platform != "CNB" || data.Name != "Alice" || data.TotalStars != 11 || data.Repositories != 2 {
		t.Fatalf("unexpected profile mapping: %#v", data)
	}
	if data.TotalCommits < 2 || data.TotalPRs < 1 || data.TotalIssues < 1 {
		t.Fatalf("year activity was not aggregated: %#v", data)
	}
}

func TestCNBRepositoryAndLanguageMapping(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Path == "/users/alice/repos":
			return testJSONResponse(http.StatusOK, []cnbRepo{
				{Name: "one", Path: "alice/team/one", Languages: cnbLanguage{Language: "Go", Color: "#00ADD8"}, SecondLanguages: cnbLanguage{Language: "HTML", Color: "#e34c26"}},
				{Name: "two", Languages: cnbLanguage{Language: "Go", Color: "#00ADD8"}},
			}), nil
		case r.URL.Path == "/alice/team/one":
			return testJSONResponse(http.StatusOK, cnbRepo{Name: "one", Path: "alice/team/one", Description: "demo", StarCount: 3, ForkCount: 2, Languages: cnbLanguage{Language: "Go", Color: "#00ADD8"}}), nil
		default:
			return testJSONResponse(http.StatusNotFound, nil), nil
		}
	})}
	client := &CNBClient{httpClient: httpClient, token: "test-token"}

	languages, err := client.FetchTopLanguages(context.Background(), "alice", nil, 1, 0)
	if err != nil {
		t.Fatalf("FetchTopLanguages returned an error: %v", err)
	}
	if len(languages) != 2 || languages[0].Name != "Go" || languages[0].Count != 2 {
		t.Fatalf("unexpected language mapping: %#v", languages)
	}
	repo, err := client.FetchRepo(context.Background(), "alice", "one")
	if err != nil {
		t.Fatalf("FetchRepo returned an error: %v", err)
	}
	if repo.NameWithOwner != "alice/team/one" || repo.PrimaryLang != "Go" || repo.Stars != 3 {
		t.Fatalf("unexpected repository mapping: %#v", repo)
	}
}

func TestCNBErrorsDoNotExposeToken(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return testJSONResponse(http.StatusUnauthorized, nil), nil
	})}
	client := &CNBClient{httpClient: httpClient, token: "very-secret-token"}

	_, err := client.fetchUser(context.Background(), "alice")
	if err == nil || strings.Contains(err.Error(), client.token) {
		t.Fatalf("unexpected safe error: %v", err)
	}
}

func TestCNBLivePublicSource(t *testing.T) {
	if os.Getenv("CNB_LIVE_TEST") != "1" {
		t.Skip("set CNB_LIVE_TEST=1 to run against cnb.cool")
	}
	client := NewCNBClient()
	ctx := context.Background()

	// Test user (Mintimate)
	stats, err := client.FetchStats(ctx, StatsQuery{Username: "Mintimate"})
	if err != nil || stats.Name == "" || stats.TotalCommits == 0 {
		t.Fatalf("live stats failed: data=%#v err=%v", stats, err)
	}
	languages, err := client.FetchTopLanguages(ctx, "Mintimate", nil, 1, 0)
	if err != nil || len(languages) == 0 {
		t.Fatalf("live languages failed: data=%#v err=%v", languages, err)
	}
	repo, err := client.FetchRepo(ctx, "Mintimate", "dev-stats")
	if err != nil || !strings.Contains(repo.NameWithOwner, "/dev-stats") {
		t.Fatalf("live nested repo resolution failed: data=%#v err=%v", repo, err)
	}
	_, days, err := client.FetchContributionCalendar(ctx, "Mintimate")
	if err != nil || len(days) == 0 {
		t.Fatalf("live calendar failed: days=%d err=%v", len(days), err)
	}

	// Test group (Commit)
	groupStats, err := client.FetchStats(ctx, StatsQuery{Username: "Commit"})
	if err != nil || groupStats.Name != "Commit" || groupStats.Repositories != 5 {
		t.Fatalf("live group stats failed: data=%#v err=%v", groupStats, err)
	}
	groupLangs, err := client.FetchTopLanguages(ctx, "Commit", nil, 1, 0)
	if err != nil || len(groupLangs) == 0 {
		t.Fatalf("live group languages failed: data=%#v err=%v", groupLangs, err)
	}
	groupRepo, err := client.FetchRepo(ctx, "Commit", "Backend")
	if err != nil || groupRepo.NameWithOwner != "Commit/Backend" {
		t.Fatalf("live group repo failed: data=%#v err=%v", groupRepo, err)
	}
}
